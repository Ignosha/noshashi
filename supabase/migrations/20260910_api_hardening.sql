-- API hardening for institutional sale.
--
-- Five things an institutional security review asks for that the schema did
-- not yet provide. Each is listed with the exposure it closes, because a
-- reviewer will ask why the control exists and "the linter said so" is not
-- an answer.
--
--   1. Key revocation was reversible. api_keys_update_own granted UPDATE on
--      every column, so the owner's own browser session could set
--      revoked_at back to null and resurrect a key that had been retired
--      after a leak. Revocation has to be terminal or it is not revocation.
--   2. Keys never expired. A key issued once was valid forever; there was
--      no way to hand a counterparty or an auditor time-boxed access.
--   3. Rate limiting lived in a per-instance Map inside the Edge Function,
--      keyed on a client-supplied header. It reset on every cold start and
--      did not aggregate across instances, so the published per-second
--      limit was not actually enforceable.
--   4. A verification burned a credit before the ledger read. When the
--      ledger read failed the caller was charged for a 502 and the credit
--      had to be returned by hand.
--   5. Retries were not idempotent. A caller retrying a timed-out request
--      paid twice for one adjudication and wrote two audit rows for one
--      decision, which is the thing an examiner notices.

/* ------------------------------------------------------------------ */
/* 1. Key lifecycle: revocation is terminal, metadata is not client-  */
/*    writable.                                                        */
/* ------------------------------------------------------------------ */

alter table noshashi.api_keys add column if not exists expires_at timestamptz;
alter table noshashi.api_keys
  add column if not exists scopes text[] not null default '{verify}'::text[];

comment on column noshashi.api_keys.expires_at is
  'Hard expiry. Null means no expiry. Enforced by noshashi-verify, not by RLS.';
comment on column noshashi.api_keys.scopes is
  'Granted scopes. noshashi-verify requires ''verify''. Service-role writable only.';

-- RLS cannot restrict columns; column grants can. The owner may rename a
-- key and revoke it. Everything that decides whether a key is trusted —
-- its hash, its scopes, its expiry, its owner — is service-role only.
revoke update on noshashi.api_keys from authenticated;
grant update (name, revoked_at) on noshashi.api_keys to authenticated;

create or replace function noshashi.api_keys_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
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
$$;

drop trigger if exists api_keys_guard on noshashi.api_keys;
create trigger api_keys_guard
  before update on noshashi.api_keys
  for each row execute function noshashi.api_keys_guard();

revoke all on function noshashi.api_keys_guard() from public, anon, authenticated;

/* ------------------------------------------------------------------ */
/* 2. Rate limiting that survives a cold start.                        */
/* ------------------------------------------------------------------ */

-- A fixed window per (key, window length). Two rows per key describe both
-- published limits at once: a one-second window for the burst rate and a
-- sixty-second window for the sustained rate.
create table if not exists noshashi.api_rate_windows (
  api_key_id     uuid        not null references noshashi.api_keys(id) on delete cascade,
  window_seconds integer     not null,
  window_start   timestamptz not null,
  hits           integer     not null default 0,
  primary key (api_key_id, window_seconds, window_start)
);

alter table noshashi.api_rate_windows enable row level security;
-- No policy and no grant to `authenticated`: the counters are not the
-- caller's business, and RLS with zero policies denies by default.
grant all on noshashi.api_rate_windows to service_role;

create index if not exists api_rate_windows_sweep_idx
  on noshashi.api_rate_windows (window_start);

-- "Institutional: custom rate limit" has to be a number somewhere. Null
-- means "use the published ceiling for the tier"; a value here is the
-- negotiated burst rate for this contract. Service-role writable only —
-- `authenticated` holds SELECT on entitlements and nothing more, so a
-- customer cannot raise their own limit.
alter table noshashi.entitlements
  add column if not exists rate_limit_per_second integer
  check (rate_limit_per_second is null or rate_limit_per_second between 1 and 5000);

comment on column noshashi.entitlements.rate_limit_per_second is
  'Negotiated burst limit for this account. Null = published tier ceiling. Set per contract.';

/**
 * Take one token from a fixed window. Returns the decision plus the
 * headers the caller needs to back off politely.
 *
 * The whole limiter is one INSERT ... ON CONFLICT DO UPDATE. Postgres
 * serialises concurrent executions on the row, so the count is exact
 * under parallel load — which the in-memory Map it replaces was not,
 * across instances or across a cold start.
 */
create or replace function noshashi.api_rate_take(
  p_key            uuid,
  p_window_seconds integer,
  p_limit          integer
)
returns jsonb
language plpgsql
security definer
set search_path = noshashi, pg_catalog
as $$
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
$$;

revoke all on function noshashi.api_rate_take(uuid, integer, integer) from public, anon, authenticated;
grant execute on function noshashi.api_rate_take(uuid, integer, integer) to service_role;

/** Housekeeping: drop windows that can no longer be current. */
create or replace function noshashi.api_rate_sweep()
returns integer
language plpgsql
security definer
set search_path = noshashi, pg_catalog
as $$
declare
  v_deleted integer;
begin
  delete from noshashi.api_rate_windows
  where window_start < clock_timestamp() - interval '1 hour';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function noshashi.api_rate_sweep() from public, anon, authenticated;
grant execute on function noshashi.api_rate_sweep() to service_role;

/* ------------------------------------------------------------------ */
/* 3. Credits: a failed verification does not cost one.                */
/* ------------------------------------------------------------------ */

/**
 * Return a credit consumed by a verification that never produced a
 * verdict. Bounded by the same row lock as the decrement, so a refund
 * racing a spend cannot double-count.
 *
 * Deliberately NOT idempotent by itself — it is called exactly once, on
 * the failure path of the request that spent the credit, and the Edge
 * Function is the only holder of that fact.
 */
create or replace function noshashi.refund_verification_credit(p_account uuid)
returns boolean
language plpgsql
security definer
set search_path = noshashi, pg_catalog
as $$
begin
  update noshashi.entitlements
  set verification_quota = verification_quota + 1
  where account_id = p_account;
  return found;
end;
$$;

revoke all on function noshashi.refund_verification_credit(uuid) from public, anon, authenticated;
grant execute on function noshashi.refund_verification_credit(uuid) to service_role;

/* ------------------------------------------------------------------ */
/* 4. Idempotent retries, and a correlation id on every audit row.     */
/* ------------------------------------------------------------------ */

alter table noshashi.verification_events add column if not exists request_id uuid;
alter table noshashi.verification_events add column if not exists idempotency_key text;
alter table noshashi.verification_events add column if not exists receipt jsonb;

comment on column noshashi.verification_events.request_id is
  'Correlation id echoed to the caller as X-Request-Id. Lets a caller and an examiner name the same adjudication.';
comment on column noshashi.verification_events.idempotency_key is
  'Caller-supplied Idempotency-Key. A repeat replays the stored receipt instead of charging a second credit.';
comment on column noshashi.verification_events.receipt is
  'The full response body as served. Needed to replay a retry byte-for-byte rather than re-adjudicating against a ledger that has since moved.';

-- Scoped to the account: two customers may legitimately choose the same
-- key, and one must not be able to probe or collide with the other's.
create unique index if not exists verification_events_idempotency_idx
  on noshashi.verification_events (account_id, idempotency_key)
  where idempotency_key is not null;

/* ------------------------------------------------------------------ */
/* 5. One subject column, not two.                                     */
/* ------------------------------------------------------------------ */

-- 20260820_compliance_api.sql added `subject` with an `add column if not
-- exists`, not knowing the baseline already carried `subject_address`.
-- Both then existed and noshashi-verify wrote only the newer one, so the
-- column the baseline documents as canonical was empty on every row the
-- API produced. Backfill, then keep writing the canonical one.
update noshashi.verification_events
set subject_address = subject
where subject_address is null
  and subject is not null;

comment on column noshashi.verification_events.subject is
  'DEPRECATED — duplicate of subject_address, backfilled 2026-09-10. No longer written. Drop once no reader references it.';
