-- Did the hardening migration actually apply?
--
-- Run this in the Supabase SQL editor after
-- 20260910000000_api_hardening.sql. It asserts nothing and changes
-- nothing -- it just lists every object that migration is supposed to
-- create and says whether it is there.
--
-- Every row should read PRESENT. Any MISSING row is a control the
-- Edge Function depends on, and noshashi-verify will fail at runtime
-- without it -- so check this BEFORE deploying the function.

with expected(kind, object, present) as (

  -- Columns the function reads on every request.
  select 'column', 'entitlements.rate_limit_per_second', exists (
    select 1 from information_schema.columns
    where table_schema = 'noshashi' and table_name = 'entitlements'
      and column_name = 'rate_limit_per_second')
  union all
  select 'column', 'api_keys.expires_at', exists (
    select 1 from information_schema.columns
    where table_schema = 'noshashi' and table_name = 'api_keys'
      and column_name = 'expires_at')
  union all
  select 'column', 'api_keys.scopes', exists (
    select 1 from information_schema.columns
    where table_schema = 'noshashi' and table_name = 'api_keys'
      and column_name = 'scopes')
  union all
  select 'column', 'verification_events.request_id', exists (
    select 1 from information_schema.columns
    where table_schema = 'noshashi' and table_name = 'verification_events'
      and column_name = 'request_id')
  union all
  select 'column', 'verification_events.idempotency_key', exists (
    select 1 from information_schema.columns
    where table_schema = 'noshashi' and table_name = 'verification_events'
      and column_name = 'idempotency_key')
  union all
  -- The stored response body. Without it an idempotent retry has
  -- nothing to replay and would re-adjudicate against a moved ledger.
  select 'column', 'verification_events.receipt', exists (
    select 1 from information_schema.columns
    where table_schema = 'noshashi' and table_name = 'verification_events'
      and column_name = 'receipt')

  -- The durable rate limiter.
  union all
  select 'table', 'noshashi.api_rate_windows', exists (
    select 1 from information_schema.tables
    where table_schema = 'noshashi' and table_name = 'api_rate_windows')
  union all
  select 'function', 'noshashi.api_rate_take', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'noshashi' and p.proname = 'api_rate_take')
  union all
  select 'function', 'noshashi.api_rate_sweep', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'noshashi' and p.proname = 'api_rate_sweep')

  -- Credit refunds on 502 / 503.
  union all
  select 'function', 'noshashi.refund_verification_credit', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'noshashi' and p.proname = 'refund_verification_credit')

  -- Terminal revocation.
  union all
  select 'function', 'noshashi.api_keys_guard', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'noshashi' and p.proname = 'api_keys_guard')
  union all
  select 'trigger', 'api_keys_guard on api_keys', exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'noshashi' and c.relname = 'api_keys'
      and t.tgname = 'api_keys_guard' and not t.tgisinternal)

  -- Idempotency, scoped per account.
  union all
  select 'index', 'verification_events_idempotency_idx', exists (
    select 1 from pg_indexes
    where schemaname = 'noshashi'
      and indexname = 'verification_events_idempotency_idx')
)
select
  kind,
  object,
  case when present then 'PRESENT' else 'MISSING' end as status
from expected
order by (case when present then 1 else 0 end), kind, object;


-- Separately: the column grant that makes revocation terminal.
--
-- `authenticated` must hold UPDATE on exactly `name` and `revoked_at` and
-- nothing else. If it still holds UPDATE on key_hash, scopes or
-- expires_at, the migration's revoke did not take, and a customer's own
-- session can still edit what decides whether their key is trusted.
select
  column_name,
  privilege_type
from information_schema.column_privileges
where table_schema = 'noshashi'
  and table_name = 'api_keys'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE'
order by column_name;
-- Expected: exactly two rows -- name, revoked_at.
