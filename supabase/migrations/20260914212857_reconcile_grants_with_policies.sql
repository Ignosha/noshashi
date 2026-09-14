-- Reconcile table grants with the RLS policies beside them.
--
-- APPLIED to project xiurbiwuwcfowqnpmwki on 2026-09-14 and recorded in
-- supabase_migrations.schema_migrations as version 20260914212857. Unlike
-- the four August placeholders, this file carries its real SQL: it was
-- applied from these exact statements, so the bytes are the ones that ran.
--
-- A grant decides whether a statement is allowed at all; a policy decides
-- which rows it touches. Both have to agree or the path does not work.
-- Three places had one without the other, found by reading the live
-- catalogue rather than the repo — see supabase/history/RECONCILIATION.md.

-- 1. accounts: accounts_update_own has existed since the core schema, but
--    `authenticated` held only SELECT, so the policy was unreachable and a
--    user could not edit their own profile. The accounts_touch trigger that
--    maintains updated_at never fired from a user action either.
--
--    Column-scoped, matching the shape already used on api_keys: id, email
--    and created_at stay out of reach, because RLS cannot restrict columns
--    and a table-level grant would hand over all six.
grant update (display_name, organization) on noshashi.accounts to authenticated;

-- 2. alerts: INSERT was granted with no INSERT policy, so RLS refused every
--    attempt. Alerts are generated server-side under the service role, so
--    the grant is the mistake rather than the policy being missing. Removing
--    it changes no behaviour; it removes a stated intention that was false.
revoke insert on noshashi.alerts from authenticated;

-- 3. receipts: UPDATE was granted with no UPDATE policy, the same dead path.
--    A receipt is an immutable record of an adjudication. Leaving a writable
--    grant on it contradicts the claim the product is sold on, even while
--    RLS happens to be the thing refusing it — a reviewer reads the grant,
--    not the policy that saves it.
revoke update on noshashi.receipts from authenticated;
