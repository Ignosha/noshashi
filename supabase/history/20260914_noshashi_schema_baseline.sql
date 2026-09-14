-- NOSHASHI — schema baseline for the `noshashi` schema
--
-- Project: xiurbiwuwcfowqnpmwki  ·  Postgres 17.6
-- Captured: 2026-09-14, by introspecting the live database directly
--           (pg_catalog / information_schema), not from memory.
--
-- This supersedes supabase/history/20260910_noshashi_schema_baseline.sql,
-- which was written as a reconstruction after the fact. Every statement
-- below was read back off the running database, so applying this file to an
-- empty Postgres reproduces the live `noshashi` schema.
--
-- Migration versions present in supabase_migrations.schema_migrations at
-- capture time, all applied on the remote:
--
--   20260820111940  noshashi_core_schema
--   20260820121754  noshashi_expose_schema_to_api
--   20260821034423  noshashi_compliance_api
--   20260828071334  harden_function_grants_and_search_path
--   20260910000000  api_hardening
--
-- WHAT THIS FILE IS NOT
--
-- It is a baseline, not a migration. Do not place it in supabase/migrations/.
-- It is the answer to "what is actually in the database", so that the repo can
-- rebuild from scratch and so any future `db pull` has something to diff
-- against. The four August versions remain empty placeholders in
-- supabase/migrations/ so `db push` does not replay dashboard changes.
--
-- NOT CAPTURED HERE (they do not live in this schema):
--   · PostgREST schema exposure — `noshashi` is exposed via the API settings
--     (Supabase config, migration 20260820121754), not via DDL.
--   · Auth settings, including leaked-password protection, which has no CLI
--     or SQL surface at all.
--   · The `public` schema, which still holds profiles/projects/applications/
--     documents from an unrelated earlier project and is untouched by NOSHASHI.

begin;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create schema if not exists noshashi;

grant usage on schema noshashi to authenticated;
grant usage on schema noshashi to service_role;

-- `anon` is granted nothing, anywhere in this schema, and that is deliberate:
-- the only unauthenticated surface is the Edge Function, which authenticates
-- with the service role after checking an API key hash itself.

-- ---------------------------------------------------------------------------
-- Functions
--
-- Every function pins search_path. A SECURITY DEFINER function without a
-- pinned search_path is resolvable by whoever controls the caller's path;
-- migration 20260828071334 set these and they are reproduced verbatim.
-- ---------------------------------------------------------------------------

create or replace function noshashi.touch_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function noshashi.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into noshashi.accounts (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;

  insert into noshashi.entitlements (account_id, tier, seats, features, verification_quota)
  values (new.id, 'operator', 1, array['console','gate','agent','export'], 0)
  on conflict (account_id) do nothing;

  return new;
end;
$function$;

create or replace function noshashi.api_keys_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  -- Terminal revocation. Checked in a trigger rather than left to the
  -- column grant because the grant permits writing revoked_at at all —
  -- it has to, so the owner can revoke — and therefore also permits
  -- writing null back into it.
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'api key revocation is irreversible (key %)', old.id
      using errcode = 'check_violation';
  end if;

  -- Identity and trust columns are immutable through this path. The
  -- service role bypasses RLS but not triggers, so these are pinned for
  -- every writer; the Edge Function only ever writes last_used_at.
  if new.id <> old.id
     or new.account_id <> old.account_id
     or new.key_hash <> old.key_hash
     or new.prefix <> old.prefix
     or new.created_at <> old.created_at then
    raise exception 'api key identity columns are immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

create or replace function noshashi.consume_verification_credit(p_account uuid)
returns boolean
language plpgsql
security definer
set search_path to 'noshashi', 'public'
as $function$
declare
  v_quota integer;
begin
  update noshashi.entitlements
  set verification_quota = verification_quota - 1
  where account_id = p_account
    and verification_quota >= 1
  returning verification_quota into v_quota;

  -- found is true exactly when an eligible row was updated: a missing row
  -- or a zero balance both read as "no credit available".
  return found;
end;
$function$;

create or replace function noshashi.refund_verification_credit(p_account uuid)
returns boolean
language plpgsql
security definer
set search_path to 'noshashi', 'pg_catalog'
as $function$
begin
  update noshashi.entitlements
  set verification_quota = verification_quota + 1
  where account_id = p_account;
  return found;
end;
$function$;

create or replace function noshashi.api_rate_take(
  p_key uuid,
  p_window_seconds integer,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'noshashi', 'pg_catalog'
as $function$
declare
  v_start timestamptz;
  v_hits  integer;
begin
  -- Floor now() to the window boundary so every instance agrees on which
  -- window a request belongs to without coordinating.
  v_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into noshashi.api_rate_windows (api_key_id, window_seconds, window_start, hits)
  values (p_key, p_window_seconds, v_start, 1)
  on conflict (api_key_id, window_seconds, window_start)
    do update set hits = noshashi.api_rate_windows.hits + 1
  returning hits into v_hits;

  return jsonb_build_object(
    'allowed',   v_hits <= p_limit,
    'limit',     p_limit,
    'remaining', greatest(0, p_limit - v_hits),
    'reset_at',  v_start + make_interval(secs => p_window_seconds)
  );
end;
$function$;

create or replace function noshashi.api_rate_sweep()
returns integer
language plpgsql
security definer
set search_path to 'noshashi', 'pg_catalog'
as $function$
declare
  v_deleted integer;
begin
  delete from noshashi.api_rate_windows
  where window_start < clock_timestamp() - interval '1 hour';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

-- Function EXECUTE, granted narrowly. PUBLIC holds no EXECUTE on any of
-- these — 20260828071334 revoked the default. The three trigger functions
-- are callable by the owner only; they are reached through the trigger,
-- which does not consult EXECUTE.

revoke all on function noshashi.touch_updated_at()                    from public;
revoke all on function noshashi.handle_new_user()                     from public;
revoke all on function noshashi.api_keys_guard()                      from public;
revoke all on function noshashi.consume_verification_credit(uuid)     from public;
revoke all on function noshashi.refund_verification_credit(uuid)      from public;
revoke all on function noshashi.api_rate_take(uuid, integer, integer) from public;
revoke all on function noshashi.api_rate_sweep()                      from public;

grant execute on function noshashi.consume_verification_credit(uuid)     to service_role;
grant execute on function noshashi.refund_verification_credit(uuid)      to service_role;
grant execute on function noshashi.api_rate_take(uuid, integer, integer) to service_role;
grant execute on function noshashi.api_rate_sweep()                      to service_role;

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------

create table if not exists noshashi.accounts (
  id            uuid        primary key references auth.users (id) on delete cascade,
  email         text        not null,
  display_name  text,
  organization  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table noshashi.accounts enable row level security;

create policy accounts_select_own on noshashi.accounts
  for select to authenticated
  using ((select auth.uid()) = id);

create policy accounts_update_own on noshashi.accounts
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select on noshashi.accounts to authenticated;
grant all    on noshashi.accounts to service_role;

create trigger accounts_touch
  before update on noshashi.accounts
  for each row execute function noshashi.touch_updated_at();

-- ---------------------------------------------------------------------------
-- entitlements
--
-- Written only by the Stripe webhook under the service role. `tier` is the
-- identifier, not the display name: operator/desk/institution are Free/Pro/
-- Institutional to a customer. Renaming one of these values is a migration
-- plus two deploys landing together — see src/lib/billing/catalog.ts.
-- ---------------------------------------------------------------------------

create table if not exists noshashi.entitlements (
  account_id             uuid        primary key references noshashi.accounts (id) on delete cascade,
  tier                   text        not null default 'operator'
                                     check (tier in ('operator', 'desk', 'institution')),
  seats                  integer     not null default 1,
  features               text[]      not null default '{}'::text[],
  verification_quota     integer     not null default 0,
  valid_until            timestamptz,
  updated_at             timestamptz not null default now(),
  rate_limit_per_second  integer     check (
                           rate_limit_per_second is null
                           or (rate_limit_per_second >= 1 and rate_limit_per_second <= 5000)
                         )
);

comment on column noshashi.entitlements.rate_limit_per_second is
  'Negotiated burst limit for this account. Null = published tier ceiling. Set per contract.';

alter table noshashi.entitlements enable row level security;

create policy entitlements_select_own on noshashi.entitlements
  for select to authenticated
  using ((select auth.uid()) = account_id);

grant select on noshashi.entitlements to authenticated;
grant all    on noshashi.entitlements to service_role;

create trigger entitlements_touch
  before update on noshashi.entitlements
  for each row execute function noshashi.touch_updated_at();

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------

create table if not exists noshashi.subscriptions (
  id                      uuid        primary key default gen_random_uuid(),
  account_id              uuid        not null references noshashi.accounts (id) on delete cascade,
  stripe_customer_id      text,
  stripe_subscription_id  text        unique,
  price_id                text,
  tier                    text        not null default 'operator'
                                      check (tier in ('operator', 'desk', 'institution')),
  status                  text        not null default 'incomplete',
  seats                   integer     not null default 1 check (seats > 0),
  current_period_end      timestamptz,
  cancel_at_period_end    boolean     not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists subscriptions_account_idx
  on noshashi.subscriptions using btree (account_id);

alter table noshashi.subscriptions enable row level security;

create policy subscriptions_select_own on noshashi.subscriptions
  for select to authenticated
  using ((select auth.uid()) = account_id);

grant select on noshashi.subscriptions to authenticated;
grant all    on noshashi.subscriptions to service_role;

create trigger subscriptions_touch
  before update on noshashi.subscriptions
  for each row execute function noshashi.touch_updated_at();

-- ---------------------------------------------------------------------------
-- api_keys
--
-- The plaintext key is never stored. `key_hash` is the lookup column and is
-- unique; `prefix` exists only so a human can tell two keys apart in a list.
-- ---------------------------------------------------------------------------

create table if not exists noshashi.api_keys (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        not null references noshashi.accounts (id) on delete cascade,
  name          text        not null,
  prefix        text        not null,
  key_hash      text        not null unique,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  scopes        text[]      not null default '{verify}'::text[]
);

comment on column noshashi.api_keys.expires_at is
  'Hard expiry. Null means no expiry. Enforced by noshashi-verify, not by RLS.';
comment on column noshashi.api_keys.scopes is
  'Granted scopes. noshashi-verify requires ''verify''. Service-role writable only.';

create index if not exists api_keys_account_idx
  on noshashi.api_keys using btree (account_id);

alter table noshashi.api_keys enable row level security;

create policy api_keys_select_own on noshashi.api_keys
  for select to authenticated
  using ((select auth.uid()) = account_id);

create policy api_keys_insert_own on noshashi.api_keys
  for insert to authenticated
  with check ((select auth.uid()) = account_id);

create policy api_keys_update_own on noshashi.api_keys
  for update to authenticated
  using ((select auth.uid()) = account_id)
  with check ((select auth.uid()) = account_id);

-- No table-level UPDATE for authenticated. An owner may rename a key and
-- may revoke it; nothing else on the row is theirs to touch, and `scopes`
-- in particular must not be self-granted. The column list is the boundary
-- and api_keys_guard() is what makes revocation terminal.
grant select, insert on noshashi.api_keys to authenticated;
grant update (name, revoked_at) on noshashi.api_keys to authenticated;
grant all on noshashi.api_keys to service_role;

create trigger api_keys_guard
  before update on noshashi.api_keys
  for each row execute function noshashi.api_keys_guard();

-- ---------------------------------------------------------------------------
-- verification_events
--
-- The billing and audit log for the Compliance API. `receipt` holds the
-- response body as served so an idempotent retry replays bytes rather than
-- re-adjudicating against a ledger that has since moved.
-- ---------------------------------------------------------------------------

create table if not exists noshashi.verification_events (
  id               bigserial     primary key,
  account_id       uuid          not null references noshashi.accounts (id) on delete cascade,
  api_key_id       uuid          references noshashi.api_keys (id) on delete set null,
  domain_code      text          not null,
  verdict          text          not null check (verdict in ('go', 'hold', 'no-go')),
  receipt_digest   text          not null,
  subject_address  text,
  amount_xrp       numeric(20,6),
  latency_ms       integer,
  billed           boolean       not null default false,
  created_at       timestamptz   not null default now(),
  subject          text,
  request_id       uuid,
  idempotency_key  text,
  receipt          jsonb
);

comment on column noshashi.verification_events.subject is
  'DEPRECATED — duplicate of subject_address, backfilled 2026-09-10. No longer written. Drop once no reader references it.';
comment on column noshashi.verification_events.request_id is
  'Correlation id echoed to the caller as X-Request-Id. Lets a caller and an examiner name the same adjudication.';
comment on column noshashi.verification_events.idempotency_key is
  'Caller-supplied Idempotency-Key. A repeat replays the stored receipt instead of charging a second credit.';
comment on column noshashi.verification_events.receipt is
  'The full response body as served. Needed to replay a retry byte-for-byte rather than re-adjudicating against a ledger that has since moved.';

create index if not exists verification_events_account_time_idx
  on noshashi.verification_events using btree (account_id, created_at desc);

-- Partial, so a null key costs nothing and two accounts may reuse a string.
create unique index if not exists verification_events_idempotency_idx
  on noshashi.verification_events using btree (account_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists verification_events_unbilled_idx
  on noshashi.verification_events using btree (account_id)
  where billed = false;

alter table noshashi.verification_events enable row level security;

create policy verification_events_select_own on noshashi.verification_events
  for select to authenticated
  using ((select auth.uid()) = account_id);

-- Read-only to the account. Rows are written by the Edge Function under the
-- service role; a caller that could insert here could invent a receipt.
grant select on noshashi.verification_events to authenticated;
grant all    on noshashi.verification_events to service_role;

-- Sequence privileges as they stand on the remote. `authenticated` holds
-- usage it cannot reach — the table grants it no INSERT — because these came
-- from the schema's default privileges rather than from an explicit grant.
-- Reproduced so the baseline matches the database; see RECONCILIATION.md.
grant usage, select on sequence noshashi.verification_events_id_seq to authenticated;
grant usage, select on sequence noshashi.verification_events_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- api_rate_windows
--
-- Fixed-window counters, one row per (key, window size, window start).
-- RLS is enabled with no policy on purpose: this table has no authenticated
-- reader. Only api_rate_take() and api_rate_sweep(), both SECURITY DEFINER,
-- touch it. The Supabase linter reports this as rls_enabled_no_policy (INFO)
-- — that is the intended posture, not an oversight.
-- ---------------------------------------------------------------------------

create table if not exists noshashi.api_rate_windows (
  api_key_id      uuid        not null references noshashi.api_keys (id) on delete cascade,
  window_seconds  integer     not null,
  window_start    timestamptz not null,
  hits            integer     not null default 0,
  primary key (api_key_id, window_seconds, window_start)
);

create index if not exists api_rate_windows_sweep_idx
  on noshashi.api_rate_windows using btree (window_start);

alter table noshashi.api_rate_windows enable row level security;

grant all on noshashi.api_rate_windows to service_role;

-- ---------------------------------------------------------------------------
-- portfolios · portfolio_wallets
-- ---------------------------------------------------------------------------

create table if not exists noshashi.portfolios (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references noshashi.accounts (id) on delete cascade,
  name        text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists portfolios_account_idx
  on noshashi.portfolios using btree (account_id);

alter table noshashi.portfolios enable row level security;

create policy portfolios_all_own on noshashi.portfolios
  for all to authenticated
  using ((select auth.uid()) = account_id)
  with check ((select auth.uid()) = account_id);

grant select, insert, update, delete on noshashi.portfolios to authenticated;
grant all on noshashi.portfolios to service_role;

create table if not exists noshashi.portfolio_wallets (
  id            uuid        primary key default gen_random_uuid(),
  portfolio_id  uuid        not null references noshashi.portfolios (id) on delete cascade,
  address       text        not null,
  label         text,
  created_at    timestamptz not null default now(),
  unique (portfolio_id, address)
);

alter table noshashi.portfolio_wallets enable row level security;

-- Ownership is reached through the parent portfolio, so the check is an
-- EXISTS rather than a column comparison.
create policy portfolio_wallets_all_own on noshashi.portfolio_wallets
  for all to authenticated
  using (
    exists (
      select 1 from noshashi.portfolios p
      where p.id = portfolio_wallets.portfolio_id
        and p.account_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from noshashi.portfolios p
      where p.id = portfolio_wallets.portfolio_id
        and p.account_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on noshashi.portfolio_wallets to authenticated;
grant all on noshashi.portfolio_wallets to service_role;

-- ---------------------------------------------------------------------------
-- alerts
-- ---------------------------------------------------------------------------

create table if not exists noshashi.alerts (
  id               uuid        primary key default gen_random_uuid(),
  account_id       uuid        not null references noshashi.accounts (id) on delete cascade,
  kind             text        not null check (
                     kind in ('policy_drift', 'credential_expiry', 'domain_governance', 'reserve')
                   ),
  severity         text        not null default 'info'
                               check (severity in ('info', 'warn', 'critical')),
  title            text        not null,
  body             text,
  subject_address  text,
  domain_code      text,
  acknowledged_at  timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists alerts_account_time_idx
  on noshashi.alerts using btree (account_id, created_at desc);

alter table noshashi.alerts enable row level security;

create policy alerts_select_own on noshashi.alerts
  for select to authenticated
  using ((select auth.uid()) = account_id);

-- Acknowledging an alert is the update this permits.
create policy alerts_update_own on noshashi.alerts
  for update to authenticated
  using ((select auth.uid()) = account_id)
  with check ((select auth.uid()) = account_id);

grant select, insert, update on noshashi.alerts to authenticated;
grant all on noshashi.alerts to service_role;

-- ---------------------------------------------------------------------------
-- receipts
--
-- `digest` is unique: a receipt digest is the identity of an adjudication,
-- and two rows sharing one would mean the policy engine stopped being
-- deterministic.
-- ---------------------------------------------------------------------------

create table if not exists noshashi.receipts (
  id                uuid          primary key default gen_random_uuid(),
  account_id        uuid          not null references noshashi.accounts (id) on delete cascade,
  digest            text          not null unique,
  verdict           text          not null check (verdict in ('go', 'hold', 'no-go')),
  domain_code       text          not null,
  subject_address   text,
  amount_xrp        numeric(20,6),
  anchored_tx_hash  text,
  anchored_ledger   integer,
  created_at        timestamptz   not null default now()
);

create index if not exists receipts_account_time_idx
  on noshashi.receipts using btree (account_id, created_at desc);

alter table noshashi.receipts enable row level security;

create policy receipts_select_own on noshashi.receipts
  for select to authenticated
  using ((select auth.uid()) = account_id);

create policy receipts_insert_own on noshashi.receipts
  for insert to authenticated
  with check ((select auth.uid()) = account_id);

grant select, insert, update on noshashi.receipts to authenticated;
grant all on noshashi.receipts to service_role;

-- ---------------------------------------------------------------------------
-- auth hook
--
-- Fires on auth.users insert and seeds the account plus a free-tier
-- entitlement. Both inserts are ON CONFLICT DO NOTHING so a replayed signup
-- is not an error.
-- ---------------------------------------------------------------------------

drop trigger if exists on_auth_user_created_noshashi on auth.users;

create trigger on_auth_user_created_noshashi
  after insert on auth.users
  for each row execute function noshashi.handle_new_user();

commit;
