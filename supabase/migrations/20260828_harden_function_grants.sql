-- Security hardening ahead of launch.
--
-- Both items were raised by the Supabase database linter. Neither was
-- exploitable; both were cheap to close. Applied to project
-- xiurbiwuwcfowqnpmwki on 2026-08-28.
--
-- Recorded here because the two functions this touches were created through
-- the dashboard rather than a migration, so the repo had no record of them
-- and no way to reproduce this database from source.

-- 1. rls_auto_enable() backs the `ensure_rls` event trigger, which turns row
--    level security on for every table created in `public`. The linter
--    reported that anon and authenticated hold EXECUTE on it.
--
--    That grant is NOT exploitable. Postgres refuses to invoke a function
--    returning `event_trigger` directly — verified against this database:
--
--        ERROR: 0A000: trigger functions can only be called as triggers
--
--    Event triggers fire through the trigger mechanism as the trigger owner,
--    not through EXECUTE grants, so revoking is behaviour-preserving. That
--    was confirmed after applying: creating a table in `public` still comes
--    up with relrowsecurity = true.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 2. handle_updated_at() is a SECURITY INVOKER trigger function that had no
--    pinned search_path. The exposure is much smaller than on a DEFINER
--    function — it runs as the caller, not as the owner — but an unqualified
--    name is still resolved through whatever search_path the caller brings.
--    The body touches only NEW and now(), both pg_catalog, so pinning is
--    behaviour-preserving.
alter function public.handle_updated_at() set search_path = pg_catalog;

-- Still outstanding after this migration, and NOT fixable from SQL:
--   Leaked password protection is disabled. It is a dashboard setting —
--   Authentication → Policies → "Check for leaked passwords" — and it
--   screens new passwords against HaveIBeenPwned. Worth enabling before
--   taking real customer signups.
