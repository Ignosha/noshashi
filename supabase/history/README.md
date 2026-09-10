# Applied schema history

These files are a **record of changes already live** on project
`xiurbiwuwcfowqnpmwki`. They are not pending migrations and are
deliberately outside `supabase/migrations/` so the CLI does not try to
apply them.

## Why they were moved here

`supabase db push` compares the remote `supabase_migrations.schema_migrations`
table against local filenames. It failed with:

```
Remote migration versions not found in local migrations directory.
```

Three reasons, all of them true at once:

1. **Version format.** The CLI parses the leading digits of a filename as
   the migration version and expects 14 of them
   (`YYYYMMDDHHMMSS`). These files were hand-named with 8
   (`20260820_…`), so `20260820` could never match the remote
   `20260820111940`. No local file matched any remote row.

2. **A duplicate version.** `20260910_api_hardening.sql` and
   `20260910_noshashi_schema_baseline.sql` both parsed as version
   `20260910`. Ordering between them was undefined, and by filename the
   hardening migration sorted *first* — so it would have tried to
   `ALTER` tables before the file that creates them had run.

3. **The baseline never ran.** Remote history holds four versions, all
   dated August: `20260820111940`, `20260820121754`, `20260821034423`,
   `20260828071334`. The baseline file is dated 10 September and its own
   header records that the schema was built through the dashboard. It is
   a *reconstruction* of live schema written after the fact, not a
   migration that was ever executed.

## Why `migration repair --status reverted` was not the fix

The CLI suggests it, and here it would have been actively harmful. Marking
those four versions reverted deletes the only record that the real August
migrations were applied. The next `db push` would then replay
`20260910_noshashi_schema_baseline.sql` against a live database — which
opens with `drop policy if exists` on all fourteen RLS policies and
recreates them, in order to "create" tables that already exist and hold
customer rows. A reconciliation problem in a metadata table is not worth
rewriting production access control to solve.

## How the four remote versions were reconciled

Moving these files out was necessary but not sufficient. `db push` still
failed, and so did the repair the CLI suggests:

```
glob supabase/migrations/20260820111940_*.sql: file does not exist
```

`supabase migration repair` and `supabase db push` both resolve a remote
version by globbing for a **local file** whose name starts with it. With no
such file, neither command can proceed — repair cannot mark the version,
and push cannot decide whether it is accounted for.

`db push --include-all` does not help. It changes which *local* migrations
are considered, not whether remote history has to match; the failure is
identical.

So `supabase/migrations/` now carries an empty placeholder for each of the
four versions:

```
20260820111940_remote_dashboard_change.sql
20260820121754_remote_dashboard_change.sql
20260821034423_remote_dashboard_change.sql
20260828071334_remote_dashboard_change.sql
```

They are inert on purpose. Each version is already in remote history, so
the file's contents will never execute against this project. Put schema in
one and it runs only on a *fresh* database — out of order relative to the
real history, which is worse than not having it.

With those present, remote history and local filenames agree, and `db push`
has exactly one migration left to apply:
`20260910000000_api_hardening.sql`.

## Resolved: history now reconciles

`supabase migration list` reports `local == remote` for all five versions,
so plain `supabase db push` works — no `--include-all`, no repair:

```
20260820111940  20260820121754  20260821034423  20260828071334  20260910000000
```

`20260910000000_api_hardening.sql` was applied by hand through the SQL
editor and then recorded with
`supabase migration repair --status applied 20260910000000`, which is why
it appears on both sides despite never having been run by the CLI.

## Do not run `supabase config push` on this project

Not yet, and not without checking the diff first.

`config pull --force` was run here while looking for the leaked-password
setting. It reported six `remote_only` values it **refused to write
locally**, each marked `would_invalidate`:

| Setting | Remote | Local after pull |
|---|---|---|
| `auth.email.smtp.enabled` | `true` | absent |
| `auth.email.smtp.host` | `smtp.resend.com` | absent |
| `auth.email.smtp.admin_email` | `team@noshashi.app` | absent |
| `auth.email.smtp.user` | `resend` | absent |
| `auth.email.smtp.port` | `465` | absent |
| `auth.sms.twilio.enabled` | `true` | `false` |

They were skipped because the corresponding secrets — `smtp.pass` and
`twilio.account_sid` — are not declared locally, and the CLI will not
write a credential block it cannot complete. That is the right call on
the way in. On the way *out* it is a trap: a `config push` from that
state would send the local values, and local says SMTP is absent and
Twilio is off. **Auth emails through Resend and SMS through Twilio would
stop.**

`supabase/config.toml` was therefore deleted rather than committed. It
could not do the job it was pulled for (see below) and leaving it in the
tree only invites someone to push it. Regenerate it when needed:

```bash
supabase init && supabase config pull --force
supabase config diff        # read this before ever pushing
```

Before any future `config push`, declare `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`
and the SMTP password in the environment so those blocks round-trip
completely.

## Leaked-password protection is not settable from the CLI

`config.toml` has no field for it. The pulled config exposes
`minimum_password_length`, `password_requirements` and
`secure_password_change`, and nothing matching `hibp`, `leaked`, `pwned`
or `breach`. So `config push` cannot enable it even in principle.

It is a dashboard toggle:

**Authentication → Sign In / Providers → Password settings → "Prevent use
of leaked passwords"**

https://supabase.com/dashboard/project/xiurbiwuwcfowqnpmwki/auth/providers

Screens new and changed passwords against HaveIBeenPwned. Flagged as
outstanding in `20260828_harden_function_grants.sql` and still open.

## Still outstanding: the repo cannot rebuild this database from scratch

The placeholders reconcile the history table; they do not restore the lost
SQL. The four August migrations were authored in the dashboard and never
committed, so their exact bytes are gone. The files in this directory
describe the same end state, but they are documentation — not the
statements that produced it.

To close that properly:

```bash
supabase db pull
```

That writes a new migration reflecting exactly what is live. Review it
against the files here; where they disagree, the pull is right. Only after
that can this repository stand up an equivalent database on its own.
