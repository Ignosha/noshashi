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
