-- Cloud Terminal: private evidence, separate from public XRPL tools.
-- No rows grant access by default. Only the service role provisions paid contracts.
begin;
create table noshashi.terminal_contract_access (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references noshashi.accounts(id) on delete cascade,
 organization_id uuid references noshashi.organizations(id) on delete cascade,
 tier text not null check(tier in ('institution','enterprise','strategic')),
 approval_reference text not null check(length(trim(approval_reference)) between 1 and 160),
 approved_by uuid not null references auth.users(id),
 signed_at timestamptz,
 valid_from timestamptz not null,
 valid_until timestamptz not null,
 paid_through timestamptz,
 stripe_customer_id text,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 check(valid_until>valid_from)
);
create index terminal_contract_account_idx on noshashi.terminal_contract_access(account_id,organization_id);
create table noshashi.terminal_cases (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references noshashi.accounts(id) on delete cascade,
 organization_id uuid references noshashi.organizations(id) on delete cascade,
 request_id uuid not null,
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
 report jsonb not null check(jsonb_typeof(report)='object' and octet_length(report::text)<=65536),
 digest text not null check(digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 unique(account_id,request_id)
);
create index terminal_cases_org_idx on noshashi.terminal_cases(organization_id,created_at desc);
create index terminal_cases_account_idx on noshashi.terminal_cases(account_id,created_at desc);
alter table noshashi.terminal_contract_access enable row level security;
alter table noshashi.terminal_cases enable row level security;
revoke all on noshashi.terminal_contract_access,noshashi.terminal_cases from public,anon,authenticated;
grant select,insert,update,delete on noshashi.terminal_contract_access,noshashi.terminal_cases to service_role;

create table noshashi.terminal_read_attempts (
 account_id uuid not null references noshashi.accounts(id) on delete cascade,
 attempted_at timestamptz not null default now()
);
create index terminal_read_attempt_idx on noshashi.terminal_read_attempts(account_id,attempted_at);
alter table noshashi.terminal_read_attempts enable row level security;
revoke all on noshashi.terminal_read_attempts from public,anon,authenticated;
grant select,insert,delete on noshashi.terminal_read_attempts to service_role;

create function noshashi.terminal_access(p_account uuid,p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,noshashi as $$
declare plan text:='operator'; source_kind text:='free'; expires timestamptz; member_role text; c noshashi.terminal_contract_access;
begin
 if not exists(select 1 from noshashi.accounts where id=p_account) then raise exception 'not_authenticated' using errcode='28000'; end if;
 if p_org is not null then
  select role::text into member_role from noshashi.organization_members where account_id=p_account and organization_id=p_org;
  if not found then raise exception 'scope_forbidden' using errcode='42501'; end if;
 end if;
 -- Self-service Pro. Account metadata and client-selected tiers are never consulted.
 select 'desk',least(e.valid_until,s.current_period_end) into plan,expires
 from noshashi.entitlements e join noshashi.subscriptions s on s.account_id=e.account_id and s.tier=e.tier
 where e.account_id=p_account and e.tier='desk' and e.valid_until>now()
 and s.status='active' and s.current_period_end>now()
 and not exists(select 1 from noshashi.payment_review_billing_holds h where h.stripe_customer_id=s.stripe_customer_id and h.resolved_at is null)
 order by s.current_period_end desc limit 1;
 if found then source_kind:='subscription';else plan:='operator';expires:=null;end if;
 -- Assigned paid contracts include personal Pro features; shared access requires the exact organization.
 select * into c from noshashi.terminal_contract_access a
 where a.account_id=p_account and (a.organization_id is not distinct from p_org or (p_org is null and a.organization_id is not null and exists(select 1 from noshashi.organization_members m where m.account_id=p_account and m.organization_id=a.organization_id)))
 and a.revoked_at is null and a.signed_at is not null and a.signed_at<=now()
 and a.valid_from<=now() and a.valid_until>now() and a.paid_through>now()
 and not exists(select 1 from noshashi.payment_review_billing_holds h where h.stripe_customer_id=a.stripe_customer_id and h.resolved_at is null)
 order by case a.tier when 'strategic' then 4 when 'enterprise' then 3 else 2 end desc limit 1;
 if found then plan:=c.tier;source_kind:='contract';expires:=least(c.valid_until,c.paid_through);end if;
 return jsonb_build_object('account_id',p_account,'tier',plan,'source',source_kind,'valid_until',expires,'organization_id',p_org,'role',member_role);
end;
$$;
revoke all on function noshashi.terminal_access(uuid,uuid) from public,anon,authenticated;
grant execute on function noshashi.terminal_access(uuid,uuid) to service_role;

create function noshashi.terminal_workspace(p_account uuid,p_action text,p_org uuid default null,p_case uuid default null,p_request uuid default null,p_hash text default null,p_report jsonb default null,p_digest text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,noshashi as $$
declare access_record jsonb; tier text; member_role text; r noshashi.terminal_cases; total integer;
begin
 access_record:=noshashi.terminal_access(p_account,p_org);tier:=access_record->>'tier';member_role:=access_record->>'role';
 if p_action='access' then return access_record;end if;
 if tier='operator' or (p_org is not null and tier not in ('institution','enterprise','strategic')) then raise exception 'tier_required' using errcode='42501';end if;
 if p_action='list' then
  return coalesce((select jsonb_agg(item) from (select jsonb_build_object('id',c.id,'created_at',c.created_at,'mode',c.report->>'mode','subject',c.report->'subject') as item from noshashi.terminal_cases c where
   (p_org is null and c.organization_id is null and c.account_id=p_account) or (p_org is not null and c.organization_id=p_org)
   order by c.created_at desc,c.id desc limit 30) rows),'[]'::jsonb);
 end if;
 if p_action in ('get','delete') then
  select * into r from noshashi.terminal_cases c where c.id=p_case and
   ((p_org is null and c.organization_id is null and c.account_id=p_account) or (p_org is not null and c.organization_id=p_org));
  if not found then raise exception 'case_not_found' using errcode='P0002';end if;
  if p_action='delete' then
   if p_org is not null and member_role not in ('owner','admin') then raise exception 'role_forbidden' using errcode='42501';end if;
   delete from noshashi.terminal_cases where id=r.id;return jsonb_build_object('deleted',true);
  end if;
  return jsonb_build_object('id',r.id,'created_at',r.created_at,'historical',true,'report',r.report,'sha256',r.digest);
 end if;
 if p_action not in ('lookup','save') then raise exception 'invalid_action' using errcode='22023';end if;
 if p_org is not null and member_role not in ('owner','admin','analyst','compliance','risk') then raise exception 'role_forbidden' using errcode='42501';end if;
 if p_request is null or p_hash is null then raise exception 'invalid_request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_account::text,0));
 select * into r from noshashi.terminal_cases where account_id=p_account and request_id=p_request;
 if found then
  if r.input_hash<>p_hash or r.organization_id is distinct from p_org then raise exception 'idempotency_conflict' using errcode='23505';end if;
  return jsonb_build_object('id',r.id,'created_at',r.created_at,'replayed',true);
 end if;
 if p_action='lookup' then
  if (select count(*) from noshashi.terminal_read_attempts where account_id=p_account and attempted_at>now()-interval '1 minute')>=6 then raise exception 'rate_limit' using errcode='54000';end if;
  delete from noshashi.terminal_read_attempts where account_id=p_account and attempted_at<now()-interval '1 day';
  insert into noshashi.terminal_read_attempts(account_id) values(p_account);
  return null;
 end if;
 if p_org is not null then perform pg_advisory_xact_lock(hashtextextended(p_org::text,1));end if;
 if p_report is null or p_digest is null or p_report->>'schema' is distinct from 'noshashi.cloud-terminal.v1' or p_report->>'network' is distinct from 'XRPL Mainnet' or p_report->>'status' is distinct from 'VERIFIED' or p_report->>'validated' is distinct from 'true' or p_report->>'retrieved_at' is null or (p_report->>'retrieved_at')::timestamptz<now()-interval '3 minutes' or (p_report->>'retrieved_at')::timestamptz>now()+interval '1 minute' then raise exception 'invalid_evidence' using errcode='22023';end if;
 if (select count(*) from noshashi.terminal_cases where account_id=p_account and created_at>now()-interval '1 minute')>=6 then raise exception 'rate_limit' using errcode='54000';end if;
 select count(*) into total from noshashi.terminal_cases where (p_org is null and organization_id is null and account_id=p_account) or (p_org is not null and organization_id=p_org);
 if total>=(case when p_org is null then 100 else 500 end) then raise exception 'archive_limit' using errcode='54000';end if;
 insert into noshashi.terminal_cases(account_id,organization_id,request_id,input_hash,report,digest) values(p_account,p_org,p_request,p_hash,p_report,p_digest) returning * into r;
 return jsonb_build_object('id',r.id,'created_at',r.created_at,'replayed',false);
end;
$$;
revoke all on function noshashi.terminal_workspace(uuid,text,uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function noshashi.terminal_workspace(uuid,text,uuid,uuid,uuid,text,jsonb,text) to service_role;
commit;
