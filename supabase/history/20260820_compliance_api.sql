-- Compliance API support (shipped with supabase/functions/noshashi-verify).
--
-- 1. noshashi.consume_verification_credit — the atomic, concurrency-safe
--    decrement that backs API verifications. A single guarded UPDATE is the
--    whole implementation: Postgres serializes concurrent executions on the
--    row lock, so two parallel calls can never both draw the last credit.
-- 2. verification_events columns used by noshashi-verify and the console
--    usage dashboard. Adds are idempotent so this file is safe to rerun.

create or replace function noshashi.consume_verification_credit(p_account uuid)
returns boolean
language plpgsql
security definer
set search_path = noshashi, public
as $$
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
$$;

-- Tightest posture: nobody executes it as a side effect of other grants.
revoke all on function noshashi.consume_verification_credit(uuid) from public;
grant execute on function noshashi.consume_verification_credit(uuid) to service_role;

-- Audit trail columns the verify function and the console's usage view need.
alter table noshashi.verification_events add column if not exists api_key_id uuid;
alter table noshashi.verification_events add column if not exists subject text;
alter table noshashi.verification_events add column if not exists domain_code text;
alter table noshashi.verification_events add column if not exists amount_xrp numeric;
alter table noshashi.verification_events add column if not exists receipt_digest text;
