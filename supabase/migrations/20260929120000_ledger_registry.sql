-- Ledger registry: every PermissionedDomain (XLS-80) and Credential (XLS-70)
-- object on XRPL mainnet, read by sweeping the validated ledger's state.
--
-- A full sweep is ~10,000 ledger_data pages per object type (2,048 objects a
-- page, type-filtered, binary). noshashi-ledger-registry reads pages for a
-- bounded time on each call, keeps the marker here, and continues on the next
-- call; pg_cron calls it every minute (a lease stops two calls overlapping). Each sweep is pinned to one
-- validated ledger, and when it completes, rows it did not see are marked
-- removed rather than deleted, so a directory row can say when it went away.
--
-- Everything stored is public ledger state. The tables are read through the
-- function's public routes; no client reads them directly.

create table if not exists noshashi.ledger_registry_sweeps (
  kind                 text primary key check (kind in ('permissioned_domain', 'credential')),
  ledger_index         bigint,
  marker               text,
  started_at           timestamptz,
  pages                integer not null default 0,
  objects_found        integer not null default 0,
  last_run_at          timestamptz,
  last_error           text,
  last_complete_at     timestamptz,
  last_complete_ledger bigint,
  last_complete_pages  integer
);

insert into noshashi.ledger_registry_sweeps (kind) values ('permissioned_domain'), ('credential')
on conflict (kind) do nothing;

create table if not exists noshashi.ledger_domains (
  domain_id            text primary key check (domain_id ~ '^[0-9A-F]{64}$'),
  owner                text not null check (owner ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  sequence             bigint,
  accepted_credentials jsonb not null default '[]'::jsonb,
  previous_txn_id      text,
  previous_txn_ledger  bigint,
  seen_ledger          bigint not null,
  first_seen_at        timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  removed_at           timestamptz
);
create index if not exists ledger_domains_owner_idx on noshashi.ledger_domains (owner);

create table if not exists noshashi.ledger_credentials (
  credential_id        text primary key check (credential_id ~ '^[0-9A-F]{64}$'),
  subject              text not null check (subject ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  issuer               text not null check (issuer ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  credential_type_hex  text not null check (credential_type_hex ~ '^[0-9A-F]{2,128}$'),
  credential_type      text,
  accepted             boolean not null,
  expiration           bigint,
  uri                  text,
  previous_txn_id      text,
  previous_txn_ledger  bigint,
  seen_ledger          bigint not null,
  first_seen_at        timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  removed_at           timestamptz
);
create index if not exists ledger_credentials_issuer_idx on noshashi.ledger_credentials (issuer);
create index if not exists ledger_credentials_subject_idx on noshashi.ledger_credentials (subject);

alter table noshashi.ledger_registry_sweeps enable row level security;
alter table noshashi.ledger_domains enable row level security;
alter table noshashi.ledger_credentials enable row level security;
revoke all on noshashi.ledger_registry_sweeps, noshashi.ledger_domains, noshashi.ledger_credentials from anon, authenticated;

-- Rows a completed sweep did not see are gone from the ledger.
create or replace function noshashi.ledger_registry_close_sweep(p_kind text, p_ledger bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_kind = 'permissioned_domain' then
    update noshashi.ledger_domains set removed_at = now()
     where seen_ledger < p_ledger and removed_at is null;
  elsif p_kind = 'credential' then
    update noshashi.ledger_credentials set removed_at = now()
     where seen_ledger < p_ledger and removed_at is null;
  else
    raise exception 'unknown kind %', p_kind;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function noshashi.ledger_registry_close_sweep(text, bigint) from public, anon, authenticated;

-- Issuers of credentials, with what they have issued: the credential
-- registry's directory. Counts only rows still on ledger.
create or replace function noshashi.ledger_credential_issuers(p_now bigint)
returns table (
  issuer text,
  credential_type text,
  credential_type_hex text,
  total bigint,
  accepted bigint,
  pending bigint,
  expired bigint,
  domains bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.issuer,
         max(c.credential_type),
         c.credential_type_hex,
         count(*),
         count(*) filter (where c.accepted and (c.expiration is null or c.expiration > p_now)),
         count(*) filter (where not c.accepted and (c.expiration is null or c.expiration > p_now)),
         count(*) filter (where c.expiration is not null and c.expiration <= p_now),
         (select count(*) from noshashi.ledger_domains d
           where d.removed_at is null
             and d.accepted_credentials @> jsonb_build_array(jsonb_build_object('issuer', c.issuer, 'typeHex', c.credential_type_hex)))
    from noshashi.ledger_credentials c
   where c.removed_at is null
   group by c.issuer, c.credential_type_hex
   order by count(*) desc
   limit 2000;
$$;
revoke execute on function noshashi.ledger_credential_issuers(bigint) from public, anon, authenticated;

create or replace function noshashi.ledger_registry_kick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  token text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'noshashi_functions_url';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'noshashi_xrpl_watch_token';
  if base is null or token is null then return null; end if;
  return net.http_post(
    url := base || '/noshashi-ledger-registry/sweep',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    timeout_milliseconds := 150000);
end;
$$;
revoke execute on function noshashi.ledger_registry_kick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'noshashi-ledger-registry';
select cron.schedule('noshashi-ledger-registry', '* * * * *', 'select noshashi.ledger_registry_kick()');

-- The registry function reads and writes these with the service role only.
grant select, insert, update on noshashi.ledger_registry_sweeps, noshashi.ledger_domains, noshashi.ledger_credentials to service_role;
grant execute on function noshashi.ledger_registry_close_sweep(text, bigint) to service_role;
grant execute on function noshashi.ledger_credential_issuers(bigint) to service_role;
