-- Two authenticated organization accounts reviewing an exact unsigned proposal.
-- A review record is NOT a signing credential, enforced hold or transfer authorization.
begin;
create table noshashi.treasury_reviews (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references noshashi.organizations(id),
 requested_by uuid not null references noshashi.accounts(id),request_key uuid not null,
 proposal_text text not null check(octet_length(proposal_text) between 20 and 8192),proposal jsonb not null,
 proposal_hash text not null check(proposal_hash=encode(sha256(convert_to(proposal_text,'UTF8')),'hex')),
 policy jsonb not null,evidence jsonb not null check(octet_length(evidence::text)<=65536),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 reviewed_by uuid references noshashi.accounts(id),review_note text,reviewed_at timestamptz,
 requested_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes',
 unique(organization_id,requested_by,request_key),check(reviewed_by is null or reviewed_by<>requested_by),
 check(proposal=proposal_text::jsonb),check(expires_at>requested_at and expires_at<=requested_at+interval '15 minutes')
);
alter table noshashi.treasury_reviews enable row level security;
create policy treasury_review_read on noshashi.treasury_reviews for select to authenticated using(noshashi.is_org_member(organization_id) and coalesce(auth.jwt()->>'aal','')='aal2');
revoke all on noshashi.treasury_reviews from public,anon,authenticated;
grant select on noshashi.treasury_reviews to authenticated;
grant all on noshashi.treasury_reviews to service_role;
create index treasury_reviews_org_time on noshashi.treasury_reviews(organization_id,requested_at desc);
create function noshashi.treasury_request_review(p_org uuid,p_key uuid,p_proposal text,p_policy jsonb,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();p jsonb;r noshashi.treasury_reviews;h text;begin
 if me is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not noshashi.has_org_role(p_org,array['owner','admin','compliance','risk','analyst']::noshashi.member_role[]) then return jsonb_build_object('ok',false,'code','ROLE_AND_MFA_REQUIRED');end if;
 if not noshashi.org_has_feature(p_org,'withdrawal_screening') then return jsonb_build_object('ok',false,'code','FEATURE_NOT_IN_PLAN');end if;
 if p_key is null or octet_length(coalesce(p_proposal,'')) not between 20 and 8192 then return jsonb_build_object('ok',false,'code','INVALID_PROPOSAL');end if;
 begin p:=p_proposal::jsonb;exception when others then return jsonb_build_object('ok',false,'code','INVALID_JSON');end;
 if jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('TransactionType','Account','Destination','DestinationTag','Amount','Fee','Sequence','LastLedgerSequence','Flags'))
 or coalesce(p->>'TransactionType','')<>'Payment' or coalesce(p->>'Account','')!~'^r[1-9A-HJ-NP-Za-km-z]{24,34}$' or coalesce(p->>'Destination','')!~'^r[1-9A-HJ-NP-Za-km-z]{24,34}$' or p->>'Account'=p->>'Destination'
 or jsonb_typeof(p->'Amount')<>'string' or coalesce(p->>'Amount','')!~'^[1-9][0-9]{0,17}$' or jsonb_typeof(p->'Fee')<>'string' or coalesce(p->>'Fee','')!~'^[1-9][0-9]{0,17}$'
 or jsonb_typeof(p->'Sequence')<>'number' or jsonb_typeof(p->'LastLedgerSequence')<>'number' or coalesce(p->>'Sequence','')!~'^[1-9][0-9]{0,9}$' or coalesce(p->>'LastLedgerSequence','')!~'^[1-9][0-9]{0,9}$'
 then return jsonb_build_object('ok',false,'code','UNSIGNED_DIRECT_XRP_ONLY');end if;
 if (p->>'Amount')::numeric>100000000000000000 or (p->>'Fee')::numeric>100000000000000000 or (p->>'Sequence')::numeric>4294967295 or (p->>'LastLedgerSequence')::numeric>4294967295
 or p?'DestinationTag' and (coalesce(p->>'DestinationTag','')!~'^[0-9]{1,10}$') or p?'Flags' and coalesce(p->>'Flags','') not in ('0','2147483648') then return jsonb_build_object('ok',false,'code','INVALID_FIELDS');end if;
 if p?'DestinationTag' and (p->>'DestinationTag')::numeric>4294967295 then return jsonb_build_object('ok',false,'code','INVALID_TAG');end if;
 if coalesce(p_evidence->>'schema','')<>'noshashi-treasury-preflight-v1' or p_evidence->'proposal' is distinct from p or p_evidence->'policy' is distinct from p_policy or p_evidence->>'source' is distinct from p->>'Account' then return jsonb_build_object('ok',false,'code','MATCHING_EVIDENCE_REQUIRED');end if;
 if jsonb_typeof(p_policy)<>'object' or jsonb_typeof(p_evidence)<>'object' or p_policy is null or p_evidence is null or octet_length(p_policy::text)>32768 or octet_length(p_evidence::text)>65536 then return jsonb_build_object('ok',false,'code','EVIDENCE_REQUIRED');end if;
 -- Client evidence is retained for reviewer inspection, never treated as server-verified ledger evidence.
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,7171));h:=encode(sha256(convert_to(p_proposal,'UTF8')),'hex');
 select * into r from noshashi.treasury_reviews where organization_id=p_org and requested_by=me and request_key=p_key;
 if found then if r.proposal_hash<>h or r.policy<>p_policy or r.evidence<>p_evidence then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;return jsonb_build_object('ok',true,'id',r.id,'proposalHash',r.proposal_hash,'expiresAt',r.expires_at);end if;
 if(select count(*) from noshashi.treasury_reviews where organization_id=p_org and requested_at>now()-interval '1 day')>=50 then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
 insert into noshashi.treasury_reviews(organization_id,requested_by,request_key,proposal_text,proposal,proposal_hash,policy,evidence)values(p_org,me,p_key,p_proposal,p,h,p_policy,p_evidence)returning * into r;
 insert into noshashi.audit_log(organization_id,actor_account_id,action,entity_type,entity_id,new_state)values(p_org,me,'treasury.review_requested','treasury_review',r.id::text,jsonb_build_object('proposal_hash',h,'expires_at',r.expires_at));
 return jsonb_build_object('ok',true,'id',r.id,'proposalHash',h,'expiresAt',r.expires_at);
end $$;
create function noshashi.treasury_decide_review(p_id uuid,p_hash text,p_decision text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();r noshashi.treasury_reviews;begin
 if me is null or coalesce(auth.jwt()->>'aal','')<>'aal2' then return jsonb_build_object('ok',false,'code','MFA_REQUIRED');end if;
 select * into r from noshashi.treasury_reviews where id=p_id for update;
 if r.id is null or not noshashi.has_org_role(r.organization_id,array['owner','admin','compliance','reviewer']::noshashi.member_role[]) then return jsonb_build_object('ok',false,'code','NOT_ALLOWED');end if;
 if not noshashi.org_has_feature(r.organization_id,'withdrawal_screening') then return jsonb_build_object('ok',false,'code','FEATURE_NOT_IN_PLAN');end if;
 if r.requested_by=me then return jsonb_build_object('ok',false,'code','DIFFERENT_REVIEWER_REQUIRED');end if;
 if r.status<>'pending' or r.expires_at<=now() then return jsonb_build_object('ok',false,'code','NOT_PENDING_OR_EXPIRED');end if;
 if coalesce(p_note,'') ~* '-----BEGIN [A-Z ]*PRIVATE KEY-----|\m(sEd[1-9A-HJ-NP-Za-km-z]{20,40}|s[1-9A-HJ-NP-Za-km-z]{24,34})\M' then return jsonb_build_object('ok',false,'code','REMOVE_SECRETS');end if;
 if p_hash is distinct from r.proposal_hash or p_decision not in ('approved','rejected') or p_decision is null or length(trim(coalesce(p_note,''))) not between 10 and 2000 then return jsonb_build_object('ok',false,'code','EXACT_REVIEW_REQUIRED');end if;
 update noshashi.treasury_reviews set status=p_decision,reviewed_by=me,reviewed_at=now(),review_note=trim(p_note) where id=p_id;
 insert into noshashi.audit_log(organization_id,actor_account_id,action,entity_type,entity_id,new_state)values(r.organization_id,me,'treasury.review_'||p_decision,'treasury_review',r.id::text,jsonb_build_object('proposal_hash',r.proposal_hash,'expires_at',r.expires_at));
 return jsonb_build_object('ok',true,'id',r.id,'status',p_decision,'expiresAt',r.expires_at,'scope','review_record_only');
end $$;
create function noshashi.treasury_cancel_review(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$declare r noshashi.treasury_reviews;begin
 select * into r from noshashi.treasury_reviews where id=p_id for update;
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not noshashi.is_org_member(r.organization_id) or not(auth.uid()=r.requested_by or noshashi.has_org_role(r.organization_id,array['owner','admin','compliance']::noshashi.member_role[])) then return jsonb_build_object('ok',false,'code','NOT_ALLOWED');end if;
 if r.status not in ('pending','approved') then return jsonb_build_object('ok',false,'code','ALREADY_FINAL');end if;
 update noshashi.treasury_reviews set status='cancelled' where id=p_id;
 insert into noshashi.audit_log(organization_id,actor_account_id,action,entity_type,entity_id)values(r.organization_id,auth.uid(),'treasury.review_cancelled','treasury_review',r.id::text);
 return jsonb_build_object('ok',true,'scope','review_record_only');end $$;
create function noshashi.treasury_list_reviews(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not noshashi.is_org_member(p_org) then return jsonb_build_object('ok',false,'code','NOT_ALLOWED');end if;
 return jsonb_build_object('ok',true,'records',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('effective_status',case when r.status in ('pending','approved') and r.expires_at<=now() then 'expired' else r.status end))from(select * from noshashi.treasury_reviews where organization_id=p_org order by requested_at desc limit 100)r),'[]'::jsonb),'scope','review_record_only');end $$;
revoke all on function noshashi.treasury_request_review(uuid,uuid,text,jsonb,jsonb),noshashi.treasury_decide_review(uuid,text,text,text),noshashi.treasury_cancel_review(uuid),noshashi.treasury_list_reviews(uuid) from public,anon;
grant execute on function noshashi.treasury_request_review(uuid,uuid,text,jsonb,jsonb),noshashi.treasury_decide_review(uuid,text,text,text),noshashi.treasury_cancel_review(uuid),noshashi.treasury_list_reviews(uuid) to authenticated;
commit;
