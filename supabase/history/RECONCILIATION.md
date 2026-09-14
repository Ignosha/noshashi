# Schema reconciliation — 2026-09-14

Answers open item 2 in the README: *"The repo cannot rebuild the database from
scratch."*

`20260914_noshashi_schema_baseline.sql` was produced by reading the live
database at project `xiurbiwuwcfowqnpmwki` (Postgres 17.6) through
`pg_catalog` and `information_schema` — not reconstructed from memory, and
not from `db pull`, which needs Docker. It replaces
`supabase/history/20260910_noshashi_schema_baseline.sql`.

## Suggested placement

```
supabase/history/20260914_noshashi_schema_baseline.sql   (new — this file)
supabase/history/20260910_noshashi_schema_baseline.sql   (delete, or mark superseded)
supabase/history/RECONCILIATION.md                       (this document)
```

It is a baseline, not a migration. It must not go in `supabase/migrations/`.

## What was captured

| | |
|---|---|
| Tables | 9 — accounts, entitlements, subscriptions, api_keys, verification_events, api_rate_windows, portfolios, portfolio_wallets, receipts |
| Functions | 7, all with a pinned `search_path` |
| Triggers | 5, including `on_auth_user_created_noshashi` on `auth.users` |
| RLS policies | 14 |
| Indexes | 23, including two partial indexes on `verification_events` |
| Constraints | 9 check, 10 FK, 9 PK, 5 unique |
| Grants | schema, table, column, function and sequence level |
| Comments | 7 column comments |

Migration versions in `supabase_migrations.schema_migrations`, all applied:
`20260820111940`, `20260820121754`, `20260821034423`, `20260828071334`,
`20260910000000` — matching the five the README reports as reconciled.

## Not in the baseline

These have no DDL surface and cannot be captured in a SQL file:

- **PostgREST schema exposure.** `noshashi` is exposed through the API
  settings (the effect of `20260820121754`), which is project config.
- **Auth settings**, including leaked-password protection — see below.
- **The `public` schema.** It still holds `profiles`, `projects`,
  `applications` and `documents` with `subscription_plan` values
  `diy/solo/team/pro` and a permit-application shape. None of it is NOSHASHI,
  nothing in the app references it, and all four tables are empty. Left
  untouched; worth deciding whether to drop it, because it is reachable and
  RLS-enabled, and an empty unowned table set in a production project is a
  thing you have to keep explaining.

## What the 2026-09-10 baseline was missing

Diffed against the repo as cloned. `supabase/history/` held three files —
`20260910_noshashi_schema_baseline.sql`, `20260820_compliance_api.sql` and
`20260828_harden_function_grants.sql`. Taken *together*, they still do not
describe the live database. The 09-10 baseline predates the `api_hardening`
work (`20260910000000`), which was applied by hand through the SQL editor and
never written back.

The 09-10 baseline alone is missing everything the `api_hardening` work added:
`api_rate_windows`, four of the seven functions, the `api_keys_guard` trigger,
`api_keys.expires_at` / `.scopes`, `entitlements.rate_limit_per_second`,
`verification_events.request_id` / `.idempotency_key` / `.receipt`, the
idempotency index, and every column comment.

**But it is not meant to stand alone.**
`supabase/migrations/20260910000000_api_hardening.sql` is committed, carries
real SQL, and supplies all of it — including the column-grant fix
(`revoke update … grant update (name, revoked_at)`), the guard trigger, and
the PUBLIC revokes on all four new functions. Applied in order, baseline then
migration, the repo reaches the live end state. The 09-10 baseline is
incomplete as a snapshot, not wrong as a layer.

### What actually blocks a from-scratch rebuild

Not missing DDL — ordering. `supabase/migrations/` holds four **empty
placeholders** (the August versions, deliberately blank so the CLI can match
filenames) plus `20260910000000_api_hardening.sql`. Against a fresh project,
`db push` therefore runs only `api_hardening`, whose first statement is
`alter table noshashi.api_keys …` on a table that does not exist yet. It
fails on line 30.

The core schema lives only in `supabase/history/`, which the CLI never runs.
So the rebuild path is manual by construction: apply the history baseline by
hand, then push. That is what "cannot rebuild from scratch" actually means
here — and it is why a single self-contained baseline read from the live
database is worth having, since it collapses the two layers into one file
with no ordering to get wrong.

### Unrelated: the 08-28 file is about the `public` schema

`20260828_harden_function_grants.sql` touches `public.rls_auto_enable()` and
`public.handle_updated_at()`. It carries the leaked-password note the README
cites, but it contains nothing about the `noshashi` schema.

## Findings — grants and policies disagree in three places

A table grant and an RLS policy have to agree for a path to work: the grant
decides whether the statement is allowed at all, the policy decides which
rows. Three places have one without the other. **Nothing here was changed** —
these are production security objects and the fix is a decision, not a
cleanup.

### 1. `accounts` — UPDATE policy with no UPDATE grant *(functional bug)*

`accounts_update_own` permits an account holder to update their own row, but
`authenticated` holds only `SELECT` on `noshashi.accounts`, and no
column-level UPDATE grant. The policy is unreachable: **a user cannot edit
their own `display_name` or `organization`.** The `accounts_touch` trigger
that maintains `updated_at` on that table never fires from a user action
either.

Either the grant is missing or the policy is vestigial. If the intent is the
obvious one:

```sql
grant update (display_name, organization) on noshashi.accounts to authenticated;
```

Column-scoped, so `id`, `email` and `created_at` stay out of reach — the same
shape already used on `api_keys`.

### 2. `alerts` — INSERT grant with no INSERT policy

`authenticated` holds `INSERT` on `noshashi.alerts`, but the only policies are
`alerts_select_own` and `alerts_update_own`. Every user insert is refused by
RLS. Alerts appear to be generated server-side, which makes the grant the
mistake rather than the missing policy:

```sql
revoke insert on noshashi.alerts from authenticated;
```

### 3. `receipts` — UPDATE grant with no UPDATE policy

Same shape: `authenticated` holds `UPDATE` on `noshashi.receipts` with no
UPDATE policy, so it is refused. Here the grant is the one to drop and it
matters more than in the alerts case — a receipt is an immutable record of an
adjudication, and a writable one would undercut the claim the product is sold
on:

```sql
revoke update on noshashi.receipts from authenticated;
```

### 4. `verification_events_id_seq` — unusable sequence privileges

`authenticated` holds `USAGE, SELECT` on the sequence but no `INSERT` on the
table, so it cannot reach it. Harmless, and it comes from the schema's default
privileges rather than a deliberate grant. Reproduced in the baseline so the
file matches the database. Revoking it is optional tidying.

## Not defects

- **`api_rate_windows` has RLS enabled and no policy.** The Supabase linter
  reports `rls_enabled_no_policy` (INFO). It is correct posture: the table has
  no authenticated reader, and only `api_rate_take()` and `api_rate_sweep()`,
  both SECURITY DEFINER, touch it. Enabled-with-no-policy denies everything,
  which is the intent.
- **`verification_events.subject`** is still present and still carries its
  deprecation comment. Nothing writes it. Dropping it is a one-line migration
  once no reader references it.

## The other two open items

**Leaked-password protection is still off.** Confirmed against the live
project — the security advisor reports
`auth_leaked_password_protection` at WARN. The README is right that there is
no CLI field for it; there is no SQL or API surface either, so it cannot be
done from here. It is a dashboard toggle and it changes an account-wide auth
setting, so it needs a person:

> Authentication → Sign In / Providers → Password settings →
> "Prevent use of leaked passwords"

**Annual Stripe prices do not exist.** Untouched. Creating prices is a change
in the Stripe account, and the pricing page already quotes $7,490 and $40,000
against `annualPriceId: null` in `src/lib/billing/catalog.ts` — so the numbers
are published and unbuyable until someone creates them in Stripe and pastes
the ids in.

## Verification status

Every statement in the baseline was read back from the live catalog and
checked against it field by field. It has **not** been executed against an
empty database — doing that needs either Docker or a throwaway project, and
neither was available here. Before trusting it as the rebuild path, run it
once against a scratch Postgres and diff the result:

```bash
psql "$SCRATCH_DB" -v ON_ERROR_STOP=1 -f supabase/history/20260914_noshashi_schema_baseline.sql
```

It is wrapped in `begin/commit`, so a failure anywhere leaves nothing behind.
