-- Server-side leaked-password enforcement on the free plan.
--
-- Supabase's own "prevent leaked passwords" setting and its password
-- verification hook are paid-plan features. The Custom Access Token hook
-- is not. This migration uses it to enforce, on the server:
--
--   A password can be used to sign in only if that exact password was
--   screened against HaveIBeenPwned by noshashi-password.
--
-- noshashi-password checks the password against the breach database
-- (k-anonymity) and, only if it is clean, calls attest_password, which
-- verifies it against the account's stored bcrypt hash and records a
-- fingerprint of that hash. The hook compares the fingerprint on every
-- password sign-in. A password set any other way — straight through the
-- Auth API, or changed later — has a different hash, so the fingerprint
-- no longer matches and password sign-in is refused until it is screened.
-- A breached password can never be screened.
--
-- Sessions from email links, one-time codes, recovery and token refresh
-- are not affected: they do not present a password. Recovery therefore
-- always works, and is how a person replaces a breached password.
--
-- The hook takes effect only once enabled in the dashboard:
-- Authentication → Hooks → Customize Access Token (JWT) Claims →
-- Postgres, schema noshashi, function password_screen_hook.

create table if not exists noshashi.password_screens (
  account_id   uuid primary key references auth.users(id) on delete cascade,
  fingerprint  text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  screened_at  timestamptz not null default now()
);

comment on table noshashi.password_screens is
  'SHA-256 of the bcrypt hash of a password screened clean against HaveIBeenPwned. Never the password.';

alter table noshashi.password_screens enable row level security;
revoke all on noshashi.password_screens from anon, authenticated;
grant select, insert, update on noshashi.password_screens to service_role;

-- Verify the password against the stored hash and record it as screened.
-- Answers the same whether or not the account exists or the password is
-- right, and takes the same time (one bcrypt either way), so it cannot be
-- used to find accounts or test passwords.
create or replace function noshashi.attest_password(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  stored text;
begin
  select u.id, u.encrypted_password into uid, stored
    from auth.users u
    where lower(u.email) = lower(trim(coalesce(p_email, ''))) and coalesce(u.encrypted_password, '') <> ''
    limit 1;
  if uid is null then
    perform extensions.crypt(coalesce(p_password, ''), extensions.gen_salt('bf', 10));
    return jsonb_build_object('ok', true);
  end if;
  if stored = extensions.crypt(coalesce(p_password, ''), stored) then
    insert into noshashi.password_screens (account_id, fingerprint, screened_at)
      values (uid, encode(sha256(convert_to(stored, 'UTF8')), 'hex'), now())
      on conflict (account_id) do update set fingerprint = excluded.fingerprint, screened_at = excluded.screened_at;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function noshashi.attest_password(text, text) from public, anon, authenticated;
grant execute on function noshashi.attest_password(text, text) to service_role;

-- The Custom Access Token hook.
create or replace function noshashi.password_screen_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid;
  stored text;
  fp text;
begin
  if coalesce(event->>'authentication_method', '') <> 'password' then
    return jsonb_build_object('claims', event->'claims');
  end if;
  uid := (event->>'user_id')::uuid;
  select u.encrypted_password into stored from auth.users u where u.id = uid;
  select s.fingerprint into fp from noshashi.password_screens s where s.account_id = uid;
  if coalesce(stored, '') <> '' and fp = encode(sha256(convert_to(stored, 'UTF8')), 'hex') then
    return jsonb_build_object('claims', event->'claims');
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'PASSWORD_NOT_SCREENED: this password has not been checked against known data breaches.'
  ));
end;
$$;

grant usage on schema noshashi to supabase_auth_admin;
grant execute on function noshashi.password_screen_hook(jsonb) to supabase_auth_admin;
revoke execute on function noshashi.password_screen_hook(jsonb) from public, anon, authenticated;
