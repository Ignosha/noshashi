-- Opt-in, sourced threat sharing. Does not certify allegations or organization security.
begin;
grant usage on schema noshashi to anon,authenticated;
create table noshashi.security_network_participants (
 organization_id uuid primary key references noshashi.organizations(id) on delete cascade,
 verified_by uuid not null references noshashi.accounts(id) on delete restrict,
 source_url text not null check(length(source_url) between 10 and 1000 and source_url ~ '^https://[^[:space:]]+$'),
 review_note text not null check(length(trim(review_note)) between 20 and 1000),
 verified_at timestamptz not null default now(), expires_at timestamptz not null,
 check(expires_at>verified_at and expires_at<=verified_at+interval '90 days')
);
alter table noshashi.security_network_participants enable row level security;
create policy security_participants_read on noshashi.security_network_participants for select to authenticated
 using(noshashi.is_org_member(organization_id) or noshashi.is_support_staff());
revoke all on noshashi.security_network_participants from public,anon,authenticated;
grant select on noshashi.security_network_participants to authenticated;
grant all on noshashi.security_network_participants to service_role;
alter table noshashi.threat_reports add column if not exists source_urls text[] not null default '{}';
alter table noshashi.threat_reports add column if not exists security_reviewed_by uuid references noshashi.accounts(id) on delete set null;
alter table noshashi.threat_reports add column if not exists security_reviewed_at timestamptz;

create table noshashi.security_report_actions (
 id uuid primary key default gen_random_uuid(), report_id uuid not null references noshashi.threat_reports(id) on delete cascade,
 organization_id uuid not null references noshashi.organizations(id) on delete cascade,
 actor uuid not null references noshashi.accounts(id) on delete restrict,
 kind text not null check(kind='withdrawn'), reason text not null check(length(trim(reason)) between 10 and 1000),
 created_at timestamptz not null default now()
);
alter table noshashi.security_report_actions enable row level security;
create policy security_actions_read on noshashi.security_report_actions for select to authenticated
 using(noshashi.is_org_member(organization_id) or noshashi.is_support_staff());
revoke all on noshashi.security_report_actions from public,anon,authenticated;
grant select on noshashi.security_report_actions to authenticated;
grant all on noshashi.security_report_actions to service_role;

create function noshashi.security_verify_participant(p_org uuid,p_source text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=(select auth.uid());begin
 if me is null or not noshashi.is_support_staff() or coalesce(auth.jwt()->>'aal','')<>'aal2' then return jsonb_build_object('ok',false,'code','STAFF_MFA_REQUIRED');end if;
 if noshashi.is_org_member(p_org) then return jsonb_build_object('ok',false,'code','INDEPENDENT_REVIEW_REQUIRED');end if;
 if not exists(select 1 from noshashi.organizations where id=p_org) then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
 if length(coalesce(p_source,'')) not between 10 and 1000 or p_source !~ '^https://[^[:space:]]+$' or length(trim(coalesce(p_note,''))) not between 20 and 1000 then return jsonb_build_object('ok',false,'code','INVALID_REVIEW');end if;
 insert into noshashi.security_network_participants(organization_id,verified_by,source_url,review_note,verified_at,expires_at)
 values(p_org,me,p_source,trim(p_note),now(),now()+interval '90 days') on conflict(organization_id) do update set verified_by=me,source_url=excluded.source_url,review_note=excluded.review_note,verified_at=excluded.verified_at,expires_at=excluded.expires_at;
 insert into noshashi.audit_log(organization_id,actor_account_id,action,entity_type,entity_id,new_state)
 values(p_org,me,'security.participant_reviewed','organization',p_org::text,jsonb_build_object('source_url',p_source,'expires_at',now()+interval '90 days'));
 return jsonb_build_object('ok',true,'expiresAt',now()+interval '90 days');
end $$;

create function noshashi.security_network_status(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare expiry timestamptz;begin
 if auth.uid() is null or not noshashi.is_org_member(p_org) then return jsonb_build_object('ok',false,'code','NOT_ALLOWED');end if;
 select expires_at into expiry from noshashi.security_network_participants where organization_id=p_org;
 return jsonb_build_object('ok',true,'participantVerified',coalesce(expiry>now(),false),'expiresAt',expiry,'filingEntitled',noshashi.org_has_feature(p_org,'threat_registry'));
end $$;

create function noshashi.security_share_threat(p_org uuid,p_address text,p_category text,p_evidence text[],p_note text,p_sources text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; urls text[];begin
 if auth.uid() is null or not noshashi.has_org_role(p_org,array['owner','admin','compliance','analyst','risk']::noshashi.member_role[]) then return jsonb_build_object('ok',false,'code','NOT_ALLOWED');end if;
 if not exists(select 1 from noshashi.security_network_participants where organization_id=p_org and expires_at>now()) then return jsonb_build_object('ok',false,'code','PARTICIPANT_REVIEW_REQUIRED');end if;
 if cardinality(coalesce(p_sources,'{}')) not between 1 and 5 or exists(select 1 from unnest(p_sources) u where u is null or length(u)>1000 or u !~ '^https://[^[:space:]]+$') then return jsonb_build_object('ok',false,'code','PUBLIC_SOURCES_REQUIRED');end if;
 if coalesce(p_note,'') ~* '-----BEGIN [A-Z ]*PRIVATE KEY-----|\m(sEd[1-9A-HJ-NP-Za-km-z]{20,40}|s[1-9A-HJ-NP-Za-km-z]{24,34})\M' then return jsonb_build_object('ok',false,'code','REMOVE_SECRETS');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,4187));
 select array_agg(distinct u) into urls from unnest(p_sources) u;
 r:=noshashi.submit_threat_report(p_org,p_address,p_category,p_evidence,p_note);
 if coalesce((r->>'ok')::boolean,false) then update noshashi.threat_reports set source_urls=urls where id=(r->>'id')::uuid;end if;
 return r;
end $$;

create function noshashi.security_withdraw_threat(p_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r noshashi.threat_reports;me uuid:=(select auth.uid());begin
 select * into r from noshashi.threat_reports where id=p_id for update;
 if me is null or r.id is null or not (noshashi.has_org_role(r.organization_id,array['owner','admin','compliance']::noshashi.member_role[]) or noshashi.is_support_staff() and coalesce(auth.jwt()->>'aal','')='aal2') then return jsonb_build_object('ok',false,'code','NOT_ALLOWED');end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 1000 then return jsonb_build_object('ok',false,'code','REASON_REQUIRED');end if;
 if r.status='rejected' then return jsonb_build_object('ok',false,'code','ALREADY_WITHDRAWN');end if;
 insert into noshashi.security_report_actions(report_id,organization_id,actor,kind,reason) values(r.id,r.organization_id,me,'withdrawn',trim(p_reason));
 update noshashi.threat_reports set status='rejected' where id=r.id;
 insert into noshashi.audit_log(organization_id,actor_account_id,action,entity_type,entity_id,new_state)
 values(r.organization_id,me,'security.report_withdrawn','threat_report',r.id::text,jsonb_build_object('reason',trim(p_reason)));
 return jsonb_build_object('ok',true);
end $$;

create function noshashi.security_network_lookup(p_addresses text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if cardinality(coalesce(p_addresses,'{}')) not between 1 and 50 or exists(select 1 from unnest(p_addresses) a where a is null or a !~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$') then return jsonb_build_object('ok',false,'code','INVALID_ADDRESSES');end if;
 return jsonb_build_object('ok',true,'evaluatedAt',now(),'reports',coalesce((
 select jsonb_agg(x.record order by x.reviewed_at desc) from (
 select t.reviewed_at,jsonb_build_object('id',t.id,'address',t.address,'category',t.category,'evidence',t.evidence_tx,'sources',t.source_urls,'reviewedAt',t.reviewed_at,'expiresAt',least(t.reviewed_at+interval '90 days',v.expires_at),'confidence','staff_reviewed_indicator') record
 from noshashi.threat_reports t join noshashi.security_network_participants v on v.organization_id=t.organization_id
 where t.address=any(p_addresses) and t.status='confirmed' and t.reviewed_by is not null and t.reviewed_by<>t.submitted_by and t.security_reviewed_by=t.reviewed_by and t.security_reviewed_at=t.reviewed_at and t.reviewed_at>now()-interval '90 days' and v.expires_at>now() and cardinality(t.source_urls)>0
 order by t.reviewed_at desc limit 100
 ) x),'[]'::jsonb),'limit',100,'limitation','Reviewed reports are indicators, not findings of illegality or automated blocking instructions. Participant identities, private notes and staff accounts are not public.');
end $$;

create function noshashi.security_review_threat(p_id uuid,p_decision text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 if auth.uid() is null or not noshashi.is_support_staff() or coalesce(auth.jwt()->>'aal','')<>'aal2' then return jsonb_build_object('ok',false,'code','STAFF_MFA_REQUIRED');end if;
 if exists(select 1 from noshashi.threat_reports where id=p_id and noshashi.is_org_member(organization_id)) then return jsonb_build_object('ok',false,'code','INDEPENDENT_REVIEW_REQUIRED');end if;
 r:=noshashi.review_threat_report(p_id,p_decision,p_note);
 if coalesce((r->>'ok')::boolean,false) then update noshashi.threat_reports set security_reviewed_by=auth.uid(),security_reviewed_at=reviewed_at where id=p_id;end if;
 return r;
end $$;

create function noshashi.security_network_review_queue()
returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not noshashi.is_support_staff() or coalesce(auth.jwt()->>'aal','')<>'aal2' then return jsonb_build_object('ok',false,'code','STAFF_MFA_REQUIRED');end if;
 return jsonb_build_object('ok',true,'reports',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,address,category,evidence_tx,source_urls,note,organization_id,submitted_by,created_at from noshashi.threat_reports where status='pending' and cardinality(source_urls)>0 order by created_at limit 50) r),'[]'::jsonb));
end $$;
revoke all on function noshashi.security_verify_participant(uuid,text,text),noshashi.security_network_status(uuid),noshashi.security_share_threat(uuid,text,text,text[],text,text[]),noshashi.security_withdraw_threat(uuid,text),noshashi.security_network_review_queue(),noshashi.security_review_threat(uuid,text,text) from public,anon;
grant execute on function noshashi.security_verify_participant(uuid,text,text),noshashi.security_network_status(uuid),noshashi.security_share_threat(uuid,text,text,text[],text,text[]),noshashi.security_withdraw_threat(uuid,text),noshashi.security_network_review_queue(),noshashi.security_review_threat(uuid,text,text) to authenticated;
revoke all on function noshashi.security_network_lookup(text[]) from public;
grant execute on function noshashi.security_network_lookup(text[]) to anon,authenticated;
commit;
