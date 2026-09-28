-- Customer Asset Protection, the shared scam registry, the phishing link
-- feed, and the plan features of the institutional security tools.
--
-- 1. Customer Asset Protection (proof_of_reserves: Institutional and up;
--    customer_protection: Enterprise and up; protection_monitoring:
--    Strategic). An institution names the accounts that hold its
--    customers' XRP, and optionally a protection fund with a per-customer
--    limit. It publishes the root of a Merkle sum tree over its customer
--    balances, built on its own machine: only a hash, a total and a count
--    reach NOSHASHI, never a customer or a balance. Every day the
--    noshashi-xrpl-watch function reads the named accounts from a
--    validated ledger and records an attestation, hash-chained to the one
--    before. It is verification, not insurance: nothing here guarantees a
--    deposit or pays a claim, and the public page says so.
--
-- 2. Scam registry (lookup: everyone; submit: threat_registry,
--    Institutional and up). An organization reports an address with the
--    transactions that show it. NOSHASHI staff review each report, and a
--    reviewer can never confirm a report they submitted. Only confirmed
--    reports are ever shown to anyone outside the reporting organization,
--    and then only as counts, categories and dates, never who reported.
--
-- 3. Phishing link feed (lookup: everyone; full feed: phishing_feed,
--    Strategic). Every minute the database reads one validated ledger from
--    a public XRPL server and keeps every domain named in a memo of a
--    micro-payment (under 0.01 XRP, or any token amount): the way wallet
--    drainers advertise. A domain is "listed" once it has been sent to at
--    least five different accounts, which ordinary payments with a memo do
--    not do. Nothing is added by hand.
--
-- Other new features, carried by the plans the Stripe webhook writes
-- (noshashi-stripe-webhook TIER_FEATURES): withdrawal_screening and
-- market_surveillance (Enterprise and up). The emergency kit, drainer
-- patterns and exchange attribution run in the app for everyone.

-- ── 0. Plans ─────────────────────────────────────────────────────────

update noshashi.entitlements set features = array_append(features, 'proof_of_reserves')
 where tier in ('institution', 'enterprise', 'strategic') and not ('proof_of_reserves' = any(features));
update noshashi.entitlements set features = array_append(features, 'threat_registry')
 where tier in ('institution', 'enterprise', 'strategic') and not ('threat_registry' = any(features));
update noshashi.entitlements set features = array_append(features, 'customer_protection')
 where tier in ('enterprise', 'strategic') and not ('customer_protection' = any(features));
update noshashi.entitlements set features = array_append(features, 'withdrawal_screening')
 where tier in ('enterprise', 'strategic') and not ('withdrawal_screening' = any(features));
update noshashi.entitlements set features = array_append(features, 'market_surveillance')
 where tier in ('enterprise', 'strategic') and not ('market_surveillance' = any(features));
update noshashi.entitlements set features = array_append(features, 'protection_monitoring')
 where tier = 'strategic' and not ('protection_monitoring' = any(features));
update noshashi.entitlements set features = array_append(features, 'phishing_feed')
 where tier = 'strategic' and not ('phishing_feed' = any(features));

create or replace function noshashi.webhook_event_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'policy_activated', 'policy_exception', 'exception_decided',
    'exception_evidence_requested', 'exception_evidence_added',
    'investigation_created', 'investigation_resolved', 'receipt_created',
    'custom_alert', 'xrpl_event', 'deposit_screened', 'security_alert',
    'protection_attested', 'protection_alert'
  ]::text[];
$$;

-- ── 1. Customer Asset Protection ────────────────────────────────────

create table if not exists noshashi.protection_programs (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references noshashi.organizations(id) on delete cascade,
  slug                text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  name                text not null check (length(trim(name)) between 2 and 120),
  reserve_addresses   text[] not null check (cardinality(reserve_addresses) between 1 and 50),
  fund_addresses      text[] not null default '{}' check (cardinality(fund_addresses) <= 20),
  coverage_limit_xrp  numeric(20, 6) not null default 0 check (coverage_limit_xrp >= 0),
  public              boolean not null default false,
  created_by          uuid references noshashi.accounts(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists protection_programs_org_idx on noshashi.protection_programs (organization_id);
create index if not exists protection_programs_created_by_idx on noshashi.protection_programs (created_by);

-- Published liabilities roots. Rows are never changed: the latest is current.
create table if not exists noshashi.protection_liabilities (
  id            bigint generated always as identity primary key,
  program_id    uuid not null references noshashi.protection_programs(id) on delete cascade,
  root          text not null check (root ~ '^[0-9a-f]{64}$'),
  total_xrp     numeric(24, 6) not null check (total_xrp >= 0),
  customers     integer not null check (customers >= 1),
  as_of         timestamptz not null,
  published_by  uuid references noshashi.accounts(id) on delete set null,
  published_at  timestamptz not null default now()
);
create index if not exists protection_liabilities_program_idx on noshashi.protection_liabilities (program_id, id desc);
create index if not exists protection_liabilities_published_by_idx on noshashi.protection_liabilities (published_by);

-- Attestations, append-only and hash-chained: digest is the SHA-256 of the
-- canonical report, and previous_digest the digest of the attestation before.
create table if not exists noshashi.protection_attestations (
  id               bigint generated always as identity primary key,
  program_id       uuid not null references noshashi.protection_programs(id) on delete cascade,
  liabilities_id   bigint references noshashi.protection_liabilities(id) on delete set null,
  attested_at      timestamptz not null default now(),
  ledger_index     bigint not null check (ledger_index > 0),
  status           text not null check (status in ('fully_backed', 'partially_backed', 'under_backed', 'unproven')),
  coverage_ratio   numeric,
  report           jsonb not null,
  digest           text not null check (digest ~ '^[0-9A-F]{64}$'),
  previous_digest  text check (previous_digest ~ '^[0-9A-F]{64}$')
);
create index if not exists protection_attestations_program_idx on noshashi.protection_attestations (program_id, id desc);
create index if not exists protection_attestations_liabilities_idx on noshashi.protection_attestations (liabilities_id);

alter table noshashi.protection_programs enable row level security;
alter table noshashi.protection_liabilities enable row level security;
alter table noshashi.protection_attestations enable row level security;

drop policy if exists protection_programs_read on noshashi.protection_programs;
create policy protection_programs_read on noshashi.protection_programs for select to authenticated
  using (noshashi.is_org_member(organization_id));
drop policy if exists protection_liabilities_read on noshashi.protection_liabilities;
create policy protection_liabilities_read on noshashi.protection_liabilities for select to authenticated
  using (exists (select 1 from noshashi.protection_programs p where p.id = program_id and noshashi.is_org_member(p.organization_id)));
drop policy if exists protection_attestations_read on noshashi.protection_attestations;
create policy protection_attestations_read on noshashi.protection_attestations for select to authenticated
  using (exists (select 1 from noshashi.protection_programs p where p.id = program_id and noshashi.is_org_member(p.organization_id)));

revoke all on noshashi.protection_programs, noshashi.protection_liabilities, noshashi.protection_attestations from anon, authenticated;
grant select on noshashi.protection_programs, noshashi.protection_liabilities, noshashi.protection_attestations to authenticated;
grant select, insert on noshashi.protection_programs, noshashi.protection_liabilities, noshashi.protection_attestations to service_role;
grant update on noshashi.protection_programs to service_role;

create or replace function noshashi.valid_xrpl_addresses(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(a ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'), true) from unnest(p) a;
$$;

/**
 * Create or change a protection program. Proof of reserves needs
 * proof_of_reserves; a protection fund or a public page needs
 * customer_protection. Owners, admins and compliance officers only.
 */
create or replace function noshashi.save_protection_program(
  p_org uuid, p_id uuid, p_slug text, p_name text, p_reserves text[], p_fund text[], p_limit_xrp numeric, p_public boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  pid uuid := p_id;
  reserves text[];
  fund text[];
  prior noshashi.protection_programs;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin','compliance']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if not noshashi.org_has_feature(p_org, 'proof_of_reserves') then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN');
  end if;
  select coalesce(array_agg(distinct trim(a)), '{}') into reserves from unnest(coalesce(p_reserves, '{}')) a where trim(a) <> '';
  select coalesce(array_agg(distinct trim(a)), '{}') into fund from unnest(coalesce(p_fund, '{}')) a where trim(a) <> '';
  if cardinality(reserves) not between 1 and 50 or cardinality(fund) > 20
     or not noshashi.valid_xrpl_addresses(reserves) or not noshashi.valid_xrpl_addresses(fund) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ADDRESSES');
  end if;
  if reserves && fund then return jsonb_build_object('ok', false, 'code', 'FUND_OVERLAPS_RESERVES'); end if;
  if (cardinality(fund) > 0 or coalesce(p_public, false)) and not noshashi.org_has_feature(p_org, 'customer_protection') then
    return jsonb_build_object('ok', false, 'code', 'FUND_NOT_IN_PLAN');
  end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then return jsonb_build_object('ok', false, 'code', 'INVALID_SLUG'); end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120 then return jsonb_build_object('ok', false, 'code', 'INVALID_NAME'); end if;
  if p_limit_xrp is null or p_limit_xrp < 0 or p_limit_xrp > 100000000000 then return jsonb_build_object('ok', false, 'code', 'INVALID_LIMIT'); end if;
  if exists (select 1 from noshashi.protection_programs where slug = p_slug and id is distinct from pid) then
    return jsonb_build_object('ok', false, 'code', 'SLUG_TAKEN');
  end if;

  if pid is null then
    if (select count(*) from noshashi.protection_programs where organization_id = p_org) >= 10 then
      return jsonb_build_object('ok', false, 'code', 'TOO_MANY_PROGRAMS');
    end if;
    insert into noshashi.protection_programs (organization_id, slug, name, reserve_addresses, fund_addresses, coverage_limit_xrp, public, created_by)
    values (p_org, p_slug, trim(p_name), reserves, fund, p_limit_xrp, coalesce(p_public, false), me)
    returning id into pid;
    insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values (p_org, me, 'protection.created', 'protection_program', pid::text,
            jsonb_build_object('slug', p_slug, 'name', trim(p_name), 'reserves', reserves, 'fund', fund, 'limit_xrp', p_limit_xrp, 'public', coalesce(p_public, false)));
  else
    select * into prior from noshashi.protection_programs where id = pid and organization_id = p_org for update;
    if prior.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
    update noshashi.protection_programs
       set slug = p_slug, name = trim(p_name), reserve_addresses = reserves, fund_addresses = fund,
           coverage_limit_xrp = p_limit_xrp, public = coalesce(p_public, false), updated_at = now()
     where id = pid;
    insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state, new_state)
    values (p_org, me, 'protection.updated', 'protection_program', pid::text,
            jsonb_build_object('slug', prior.slug, 'name', prior.name, 'reserves', prior.reserve_addresses, 'fund', prior.fund_addresses, 'limit_xrp', prior.coverage_limit_xrp, 'public', prior.public),
            jsonb_build_object('slug', p_slug, 'name', trim(p_name), 'reserves', reserves, 'fund', fund, 'limit_xrp', p_limit_xrp, 'public', coalesce(p_public, false)));
  end if;
  return jsonb_build_object('ok', true, 'id', pid);
end;
$$;

/** Publish the root of the Merkle sum tree over customer balances. */
create or replace function noshashi.publish_protection_liabilities(p_program uuid, p_root text, p_total_xrp numeric, p_customers integer, p_as_of timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  prog noshashi.protection_programs;
  lid bigint;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select * into prog from noshashi.protection_programs where id = p_program;
  if prog.id is null or not noshashi.has_org_role(prog.organization_id, array['owner','admin','compliance']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if not noshashi.org_has_feature(prog.organization_id, 'proof_of_reserves') then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN');
  end if;
  if coalesce(p_root, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'INVALID_ROOT'); end if;
  if p_total_xrp is null or p_total_xrp < 0 or p_customers is null or p_customers < 1 then return jsonb_build_object('ok', false, 'code', 'INVALID_TOTAL'); end if;
  if p_as_of is null or p_as_of > now() + interval '5 minutes' or p_as_of < now() - interval '35 days' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AS_OF');
  end if;
  insert into noshashi.protection_liabilities (program_id, root, total_xrp, customers, as_of, published_by)
  values (p_program, p_root, p_total_xrp, p_customers, p_as_of, me)
  returning id into lid;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
  values (prog.organization_id, me, 'protection.liabilities_published', 'protection_program', p_program::text,
          jsonb_build_object('root', p_root, 'total_xrp', p_total_xrp, 'customers', p_customers, 'as_of', p_as_of));
  return jsonb_build_object('ok', true, 'id', lid);
end;
$$;

revoke execute on function noshashi.save_protection_program(uuid, uuid, text, text, text[], text[], numeric, boolean) from public, anon;
revoke execute on function noshashi.publish_protection_liabilities(uuid, text, numeric, integer, timestamptz) from public, anon;
grant execute on function noshashi.save_protection_program(uuid, uuid, text, text, text[], text[], numeric, boolean) to authenticated;
grant execute on function noshashi.publish_protection_liabilities(uuid, text, numeric, integer, timestamptz) to authenticated;

-- An attestation tells the organization's webhooks; with protection_monitoring,
-- a status below fully backed, or a fall from the one before, is also an alert.
create or replace function noshashi.webhook_from_protection_attestation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prog noshashi.protection_programs;
  before text;
  payload jsonb;
  rank constant jsonb := '{"fully_backed": 3, "partially_backed": 2, "under_backed": 1, "unproven": 0}';
begin
  select * into prog from noshashi.protection_programs where id = new.program_id;
  select a.status into before from noshashi.protection_attestations a
   where a.program_id = new.program_id and a.id < new.id order by a.id desc limit 1;
  payload := jsonb_build_object('program_id', prog.id, 'slug', prog.slug, 'attestation_id', new.id, 'ledger_index', new.ledger_index,
                                'status', new.status, 'previous_status', before, 'coverage_ratio', new.coverage_ratio, 'digest', new.digest);
  perform noshashi.webhook_emit(prog.organization_id, 'protection_attested', payload);
  if noshashi.org_has_feature(prog.organization_id, 'protection_monitoring')
     and (new.status <> 'fully_backed' or (before is not null and (rank->>new.status)::int < (rank->>before)::int)) then
    perform noshashi.webhook_emit(prog.organization_id, 'protection_alert', payload || jsonb_build_object(
      'reason', case new.status
        when 'under_backed' then 'Reserves cover less than 90% of published customer balances.'
        when 'partially_backed' then 'Reserves cover less than all of published customer balances.'
        when 'unproven' then 'No liabilities are published, so coverage cannot be shown.'
        else 'The status fell from the attestation before.' end));
  end if;
  return new;
end;
$$;

revoke execute on function noshashi.webhook_from_protection_attestation() from public, anon, authenticated;
drop trigger if exists protection_attestation_webhook on noshashi.protection_attestations;
create trigger protection_attestation_webhook after insert on noshashi.protection_attestations
  for each row execute function noshashi.webhook_from_protection_attestation();

-- Daily attestation of every program, through the watcher's own token.
create or replace function noshashi.protection_attest_kick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  token text;
begin
  if not exists (select 1 from noshashi.protection_programs) then return null; end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'noshashi_functions_url';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'noshashi_xrpl_watch_token';
  if base is null or token is null then return null; end if;
  return net.http_post(
    url := base || '/noshashi-xrpl-watch/protection-tick',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    timeout_milliseconds := 120000);
end;
$$;

revoke execute on function noshashi.protection_attest_kick() from public, anon, authenticated;

-- ── 2. Scam registry ────────────────────────────────────────────────

create table if not exists noshashi.threat_reports (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references noshashi.organizations(id) on delete cascade,
  submitted_by     uuid not null references noshashi.accounts(id) on delete restrict,
  address          text not null check (address ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  category         text not null check (category in ('phishing', 'drainer', 'scam_token', 'impersonation', 'fraud', 'ransomware', 'mixer', 'other')),
  evidence_tx      text[] not null check (cardinality(evidence_tx) between 1 and 20),
  note             text not null check (length(trim(note)) between 10 and 2000),
  status           text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reviewed_by      uuid references noshashi.accounts(id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz not null default now(),
  check (reviewed_by is null or reviewed_by <> submitted_by)
);
create unique index if not exists threat_reports_open_idx on noshashi.threat_reports (organization_id, address, category) where status <> 'rejected';
create index if not exists threat_reports_address_idx on noshashi.threat_reports (address) where status = 'confirmed';
create index if not exists threat_reports_submitted_by_idx on noshashi.threat_reports (submitted_by);
create index if not exists threat_reports_reviewed_by_idx on noshashi.threat_reports (reviewed_by);
create index if not exists threat_reports_pending_idx on noshashi.threat_reports (created_at) where status = 'pending';

alter table noshashi.threat_reports enable row level security;
drop policy if exists threat_reports_read on noshashi.threat_reports;
create policy threat_reports_read on noshashi.threat_reports for select to authenticated
  using (noshashi.is_org_member(organization_id) or noshashi.is_support_staff());
revoke all on noshashi.threat_reports from anon, authenticated;
grant select on noshashi.threat_reports to authenticated;
grant select on noshashi.threat_reports to service_role;

create or replace function noshashi.submit_threat_report(p_org uuid, p_address text, p_category text, p_evidence text[], p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  evidence text[];
  rid uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin','compliance','analyst','risk']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if not noshashi.org_has_feature(p_org, 'threat_registry') then return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN'); end if;
  if coalesce(p_address, '') !~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$' then return jsonb_build_object('ok', false, 'code', 'INVALID_ADDRESS'); end if;
  if coalesce(p_category, '') not in ('phishing', 'drainer', 'scam_token', 'impersonation', 'fraud', 'ransomware', 'mixer', 'other') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CATEGORY');
  end if;
  select coalesce(array_agg(distinct upper(trim(h))), '{}') into evidence from unnest(coalesce(p_evidence, '{}')) h where trim(h) <> '';
  if cardinality(evidence) not between 1 and 20 or exists (select 1 from unnest(evidence) h where h !~ '^[0-9A-F]{64}$') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
  end if;
  if length(trim(coalesce(p_note, ''))) not between 10 and 2000 then return jsonb_build_object('ok', false, 'code', 'INVALID_NOTE'); end if;
  if exists (select 1 from noshashi.threat_reports where organization_id = p_org and address = p_address and category = p_category and status <> 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_REPORTED');
  end if;
  if (select count(*) from noshashi.threat_reports where organization_id = p_org and created_at > now() - interval '1 day') >= 50 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;
  insert into noshashi.threat_reports (organization_id, submitted_by, address, category, evidence_tx, note)
  values (p_org, me, p_address, p_category, evidence, trim(p_note))
  returning id into rid;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
  values (p_org, me, 'threat.reported', 'threat_report', rid::text,
          jsonb_build_object('address', p_address, 'category', p_category, 'evidence_tx', evidence));
  return jsonb_build_object('ok', true, 'id', rid);
end;
$$;

-- NOSHASHI staff review. The submitter can never review their own report.
create or replace function noshashi.review_threat_report(p_id uuid, p_decision text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  r noshashi.threat_reports;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.is_support_staff() then return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS'); end if;
  if p_decision not in ('confirmed', 'rejected') then return jsonb_build_object('ok', false, 'code', 'INVALID_DECISION'); end if;
  if length(trim(coalesce(p_note, ''))) not between 5 and 2000 then return jsonb_build_object('ok', false, 'code', 'INVALID_NOTE'); end if;
  select * into r from noshashi.threat_reports where id = p_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'code', 'ALREADY_REVIEWED'); end if;
  if r.submitted_by = me then return jsonb_build_object('ok', false, 'code', 'SELF_REVIEW'); end if;
  update noshashi.threat_reports set status = p_decision, reviewed_by = me, reviewed_at = now(), review_note = trim(p_note) where id = p_id;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state, new_state)
  values (r.organization_id, me, 'threat.' || p_decision, 'threat_report', p_id::text,
          jsonb_build_object('status', r.status), jsonb_build_object('status', p_decision, 'note', trim(p_note)));
  return jsonb_build_object('ok', true);
end;
$$;

/** Confirmed reports for up to 200 addresses: counts, categories and dates, never who reported. */
create or replace function noshashi.threat_lookup(p_addresses text[])
returns table (address text, reports integer, categories text[], first_confirmed timestamptz, evidence_tx text[])
language sql
stable
security definer
set search_path = ''
as $$
  select t.address, count(distinct t.organization_id)::integer, array_agg(distinct t.category order by t.category),
         min(t.reviewed_at), (array_agg(distinct e))[1:20]
    from noshashi.threat_reports t, unnest(t.evidence_tx) e
   where t.status = 'confirmed' and t.address = any(p_addresses[1:200])
   group by t.address;
$$;

revoke execute on function noshashi.submit_threat_report(uuid, text, text, text[], text) from public, anon;
revoke execute on function noshashi.review_threat_report(uuid, text, text) from public, anon;
revoke execute on function noshashi.threat_lookup(text[]) from public, anon;
grant execute on function noshashi.submit_threat_report(uuid, text, text, text[], text) to authenticated;
grant execute on function noshashi.review_threat_report(uuid, text, text) to authenticated;
grant execute on function noshashi.threat_lookup(text[]) to authenticated, service_role;

-- ── 3. Phishing link feed ───────────────────────────────────────────

create table if not exists noshashi.phishing_scans (
  id            bigint generated always as identity primary key,
  request_id    bigint not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'fetching' check (status in ('fetching', 'ok', 'failed')),
  ledger_index  bigint,
  transactions  integer,
  sightings     integer,
  error         text
);
create index if not exists phishing_scans_fetching_idx on noshashi.phishing_scans (id) where status = 'fetching';

-- One row per domain per transaction: the evidence behind every listing.
create table if not exists noshashi.phishing_sightings (
  domain        text not null check (domain ~ '^[a-z0-9.-]{4,253}$'),
  tx_hash       text not null check (tx_hash ~ '^[0-9A-F]{64}$'),
  sender        text not null,
  recipient     text,
  ledger_index  bigint not null,
  memo          text not null,
  seen_at       timestamptz not null default now(),
  primary key (domain, tx_hash)
);
create index if not exists phishing_sightings_seen_idx on noshashi.phishing_sightings (seen_at);

alter table noshashi.phishing_scans enable row level security;
alter table noshashi.phishing_sightings enable row level security;
drop policy if exists phishing_scans_read on noshashi.phishing_scans;
create policy phishing_scans_read on noshashi.phishing_scans for select to authenticated using (true);
drop policy if exists phishing_sightings_read on noshashi.phishing_sightings;
create policy phishing_sightings_read on noshashi.phishing_sightings for select to authenticated using (true);
revoke all on noshashi.phishing_scans, noshashi.phishing_sightings from anon, authenticated;
grant select on noshashi.phishing_scans, noshashi.phishing_sightings to authenticated, service_role;

/** A memo's bytes as text, or null when they are not UTF-8. */
create or replace function noshashi.memo_text(p_hex text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_hex is null or p_hex !~ '^([0-9A-Fa-f]{2})+$' or length(p_hex) > 2048 then return null; end if;
  return convert_from(decode(p_hex, 'hex'), 'UTF8');
exception when others then
  return null;
end;
$$;

/** Domains a memo names, lower-cased, with any scheme, path and trailing dot removed. */
create or replace function noshashi.memo_domains(p_text text)
returns setof text
language sql
immutable
set search_path = ''
as $$
  select distinct lower(m[1])
    from regexp_matches(coalesce(p_text, ''), '(?:https?://)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?![a-z0-9-])', 'gi') m
   where length(m[1]) between 4 and 253;
$$;

-- Micro-payments whose memos name a domain, from one ledger reply.
create or replace function noshashi.phishing_sightings_from(p_ledger jsonb)
returns table (domain text, tx_hash text, sender text, recipient text, ledger_index bigint, memo text)
language sql
immutable
set search_path = ''
as $$
  with txs as (
    select t from jsonb_array_elements(coalesce(p_ledger->'transactions', '[]'::jsonb)) t
     where t->>'TransactionType' = 'Payment'
       and coalesce(t->'metaData'->>'TransactionResult', t->'meta'->>'TransactionResult') = 'tesSUCCESS'
  ),
  small as (
    select t, coalesce(t->'metaData'->'delivered_amount', t->'meta'->'delivered_amount') d from txs
  ),
  memos as (
    select t, noshashi.memo_text(m->'Memo'->>'MemoData') txt
      from small, jsonb_array_elements(coalesce(t->'Memos', '[]'::jsonb)) m
     where jsonb_typeof(d) = 'object' or (jsonb_typeof(d) = 'string' and d #>> '{}' ~ '^\d{1,4}$')
  )
  select dom, upper(t->>'hash'), t->>'Account', t->>'Destination', (p_ledger->>'ledger_index')::bigint, left(txt, 300)
    from memos, noshashi.memo_domains(txt) dom
   where txt is not null;
$$;

create or replace function noshashi.phishing_scan_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  resp record;
  ledger jsonb;
  n integer;
  finished integer := 0;
begin
  for s in select * from noshashi.phishing_scans where status = 'fetching' order by id for update skip locked loop
    select status_code, content, error_msg, timed_out into resp from net._http_response where id = s.request_id;
    if resp is null then
      if s.started_at < now() - interval '5 minutes' then
        update noshashi.phishing_scans set status = 'failed', finished_at = now(), error = 'no reply' where id = s.id;
      end if;
      continue;
    end if;
    begin
      ledger := (resp.content::jsonb)->'result'->'ledger';
    exception when others then
      ledger := null;
    end;
    if resp.status_code is distinct from 200 or ledger is null or jsonb_typeof(ledger->'transactions') is distinct from 'array' then
      update noshashi.phishing_scans set status = 'failed', finished_at = now(),
             error = left(format('%s %s', coalesce(resp.status_code::text, 'no status'), coalesce(resp.error_msg, '')), 300)
       where id = s.id;
      continue;
    end if;
    insert into noshashi.phishing_sightings (domain, tx_hash, sender, recipient, ledger_index, memo)
      select f.domain, f.tx_hash, f.sender, f.recipient, f.ledger_index, f.memo from noshashi.phishing_sightings_from(ledger) f
      where f.tx_hash ~ '^[0-9A-F]{64}$' and f.domain ~ '^[a-z0-9.-]{4,253}$'
    on conflict do nothing;
    get diagnostics n = row_count;
    update noshashi.phishing_scans set status = 'ok', finished_at = now(), ledger_index = (ledger->>'ledger_index')::bigint,
           transactions = jsonb_array_length(ledger->'transactions'), sightings = n
     where id = s.id;
    finished := finished + 1;
  end loop;

  insert into noshashi.phishing_scans (request_id)
  values (net.http_post('https://s2.ripple.com:51234/',
            jsonb_build_object('method', 'ledger', 'params', jsonb_build_array(jsonb_build_object('ledger_index', 'validated', 'transactions', true, 'expand', true))),
            timeout_milliseconds := 30000));
  return jsonb_build_object('finished', finished);
end;
$$;

-- Evidence is kept 90 days, scan records 7.
create or replace function noshashi.phishing_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from noshashi.phishing_sightings where seen_at < now() - interval '90 days';
  get diagnostics n = row_count;
  delete from noshashi.phishing_scans where started_at < now() - interval '7 days';
  return n;
end;
$$;

/**
 * Domains seen in micro-payment memos, with the numbers behind them. A
 * domain is listed once it reached at least five different accounts.
 * p_domain narrows to one domain (and its subdomains); p_listed_only to listings.
 */
create or replace function noshashi.phishing_domains(p_domain text default null, p_listed_only boolean default true, p_limit integer default 100)
returns table (domain text, listed boolean, recipients integer, senders integer, sightings integer, first_seen timestamptz, last_seen timestamptz,
               sample_memo text, sample_tx text)
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select s.domain, count(distinct s.recipient)::integer recipients, count(distinct s.sender)::integer senders, count(*)::integer sightings,
           min(s.seen_at) first_seen, max(s.seen_at) last_seen,
           (array_agg(s.memo order by s.seen_at desc))[1] sample_memo, (array_agg(s.tx_hash order by s.seen_at desc))[1] sample_tx
      from noshashi.phishing_sightings s
     where p_domain is null or s.domain = lower(p_domain) or s.domain like '%.' || lower(p_domain)
     group by s.domain
  )
  select a.domain, a.recipients >= 5, a.recipients, a.senders, a.sightings, a.first_seen, a.last_seen, a.sample_memo, a.sample_tx
    from agg a
   where not p_listed_only or a.recipients >= 5
   order by a.recipients desc, a.last_seen desc
   limit least(greatest(coalesce(p_limit, 100), 1), 1000);
$$;

revoke execute on function noshashi.memo_text(text) from public, anon;
revoke execute on function noshashi.memo_domains(text) from public, anon;
revoke execute on function noshashi.phishing_sightings_from(jsonb) from public, anon, authenticated;
revoke execute on function noshashi.phishing_scan_tick() from public, anon, authenticated;
revoke execute on function noshashi.phishing_retention() from public, anon, authenticated;
revoke execute on function noshashi.phishing_domains(text, boolean, integer) from public, anon;
grant execute on function noshashi.phishing_domains(text, boolean, integer) to authenticated, service_role;

select cron.unschedule(jobid) from cron.job where jobname in ('noshashi-phishing-scan', 'noshashi-phishing-retention', 'noshashi-protection-attest');
select cron.schedule('noshashi-phishing-scan', '* * * * *', 'select noshashi.phishing_scan_tick()');
select cron.schedule('noshashi-phishing-retention', '41 3 * * *', 'select noshashi.phishing_retention()');
select cron.schedule('noshashi-protection-attest', '17 6 * * *', 'select noshashi.protection_attest_kick()');
