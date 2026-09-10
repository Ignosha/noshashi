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

## Outstanding: the repo cannot rebuild this database from scratch

The four August migrations were authored in the dashboard, so their SQL was
never committed. What is here describes the same end state but is not the
bytes that produced it, and there are no local files matching those four
versions — so `db push` still reports them as missing.

Two things close that gap, in this order:

```bash
# 1. Capture the true remote schema as a local migration.
supabase db pull
```

That writes a new migration reflecting exactly what is live. Review it
against these files; where they disagree, the pull is right.

```bash
# 2. Record the four dashboard migrations as applied, so history reconciles.
supabase migration repair --status applied 20260820111940 20260820121754 20260821034423 20260828071334
```

Note `applied`, **not** `reverted`. This asserts what is already true
rather than discarding it.

Until both are done, deploy new schema with an explicit target:

```bash
supabase db push --include-all
```

which applies only what is in `supabase/migrations/` — currently the single
pending hardening migration — without demanding that remote history match.
