# Disaster recovery and business continuity

Last reviewed 2026-09-29. The recovery objectives below are **internal
targets**, not contractual commitments; no SLA is offered today (see
[PROCUREMENT.md](PROCUREMENT.md)).

## What keeps working when something fails

NOSHASHI's core product runs on the operator's machine. The desktop app
reads the XRP Ledger directly from public servers, evaluates the rules and
records receipts locally. It needs the NOSHASHI server only for sign-in,
organization features (shared policies, exceptions, cases, audit log),
billing, monitoring and the Compliance API.

| Failure | Effect | Continues |
|---|---|---|
| Supabase down or paused | No sign-in, no organization features, no Compliance API, no monitoring or webhooks | Desktop reads, verdicts, receipts, re-verification, replay, reports, NOSHX Core |
| One or more public XRPL servers down or throttling | Requests are paced and fail over to another server | Everything, if at least one server answers. Source agreement records how many agreed; fewer than two gives HOLD, never a false GO |
| Vercel down | Website, checkout, contact, public certificate page | The desktop app and the server |
| GitHub down | No new builds or releases | Installed apps; the updater keeps the current version |
| Stripe down | No new purchases | Existing entitlements (stored in Postgres) |

## Recovery objectives (targets)

| Component | RTO | RPO |
|---|---|---|
| Server (Supabase) | 24 hours | 24 hours (nightly backup) |
| Website | 1 hour (redeploy from `main`) | None; generated from the repository |
| Desktop releases | 1 day (re-run the release workflow) | None; built from tags |
| Device data (verdicts, local policies) | Customer's own device backups | Customer's own device backups |

## Server backups

- The Supabase project is on the **Free plan**, which includes no managed
  backups or point-in-time recovery.
- `.github/workflows/db-backup.yml` takes a nightly `pg_dump` of the
  `noshashi`, `public` and `auth` schemas, encrypts it with GPG (AES-256)
  before upload, and keeps it as a 90-day workflow artifact.
- **History.** Every run from 2026-09-10 to 2026-09-30 failed. First the
  `SUPABASE_DB_URL` secret was not a `postgresql://` connection string, so
  `pg_dump` fell back to a local socket. After the secret was corrected
  (2026-09-30), the runner's default `pg_dump` 16 refused the Postgres 17
  server. The workflow now calls `pg_dump` 17 by path, and checks the
  version before dumping. The first successful backup ran on
  2026-09-30 (artifact `db-backup-20260930T130553Z`). The latest run of
  **Database backup** under GitHub Actions shows the current state.
- The secret must be the **Session pooler** connection string from
  Supabase (Connect → Session pooler), with the real password in place of
  `[YOUR-PASSWORD]` and any `@ : / ? # %` in the password percent-encoded.
- Keep `BACKUP_PASSPHRASE` somewhere that survives the loss of this
  repository. A backup you cannot decrypt is not a backup.

### Restore

```bash
gpg --decrypt --output restore.dump noshashi-<stamp>.dump.gpg
pg_restore --dbname="$TARGET_DB_URL" --no-owner --no-privileges restore.dump
```

Then:

1. Point the Edge Functions' secrets at the restored project, or restore into
   the same project.
2. Redeploy the Edge Functions from `supabase/functions`
   (`npm run check:functions` first, then `supabase functions deploy`).
3. Confirm the pg_cron jobs exist (`select jobname from cron.job`); re-apply
   the migrations that schedule them if not.
4. Run `get_advisors` (security and performance) and read the function
   logs.
5. Re-verify a known receipt end to end through the Compliance API.

A restore has **not yet been tested**. Test one into a scratch project as
soon as the first backup succeeds, and record the date here.

### Without a backup

The schema can be rebuilt from `supabase/migrations`, but the data cannot:
organizations, members, shared policies, exceptions, cases, the audit log,
API keys and webhooks would be lost. Customers' device-side verdicts and
receipts would be unaffected.

## Pausing

Free projects pause after seven days without activity, which removes the
project's DNS record so every request from the app fails.
`.github/workflows/supabase-keepalive.yml` reads one row every three days
to prevent this. If the project is paused anyway, restore it from the
Supabase dashboard; data is kept while paused.

## Code and releases

- The repository on GitHub is the source of truth for code, migrations and
  the website. Every clone is a full copy.
- Releases are rebuilt by `release.yml`. The updater private key
  (`TAURI_SIGNING_PRIVATE_KEY`) must have an offline backup: without it,
  installed copies cannot auto-update (see
  [RELEASE_SIGNING.md](RELEASE_SIGNING.md)).

## Moving to a paid plan

Supabase Pro adds daily managed backups (and point-in-time recovery as an
add-on). It is worth doing before the first institutional customer relies on
organization features; the nightly encrypted dump should stay as an
independent copy either way.
