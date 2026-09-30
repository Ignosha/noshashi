# Deployment

How each part of NOSHASHI reaches production, and what it needs. Read from
the repository and the live project on 2026-09-30. Secret **names** only;
values live in GitHub, Vercel and Supabase settings, never in the
repository.

| Surface | Source | Deployed by | Where it runs |
|---|---|---|---|
| Desktop app | `src/`, `src-tauri/` | `.github/workflows/release.yml` | Customers' machines; updates from GitHub Releases |
| Website | `site/`, `templates/`, `scripts/build-site.mjs`, `api/` | Vercel, on every push to `main` that touches the site | `www.noshashi.app` (`noshashi.app` redirects), `noshashi.vercel.app` |
| Database | `supabase/migrations/` | Applied in order to Supabase project `xiurbiwuwcfowqnpmwki` (us-east-2, Postgres 17) | Supabase, **Free plan** |
| Edge Functions | `supabase/functions/` | Supabase CLI or the Supabase MCP deploy tool | Supabase |
| Scheduled jobs | Migrations that call `cron.schedule` | pg_cron inside the database | Supabase |

## Desktop app

- **Trigger.** Push a `v*` tag, or run **Release** by hand on `main`
  (input `edition`: `full` or `demo`). A hand run without a tag is tagged
  `v<version>` from `src-tauri/tauri.conf.json`. Any other branch is
  refused, and a version that already has a release gets no new one.
- **Gate.** The `verify` job re-runs `ci.yml` (typecheck, tests, safety
  checks) before any build. A failing gate means no installers.
- **Matrix.** macOS arm64 and x64, Ubuntu 22.04, Windows. Output per
  release: 17 assets (`.dmg` ×2, `.app.tar.gz` ×2 with signatures, `.msi`,
  `.exe`, `.deb`, `.rpm`, `.AppImage`, each with a `.sig`, and
  `latest.json` for the updater).
- **Secrets.** `TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (updater signatures; required).
  Apple signing and notarisation (`APPLE_CERTIFICATE`,
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
  `APPLE_PASSWORD`, `APPLE_TEAM_ID`) are wired but used only when present.
  Code signing is on hold, so they are not set. See
  [RELEASE_SIGNING.md](RELEASE_SIGNING.md).
- **Version.** `package.json` is the source. The lockfile, Tauri config,
  `Cargo.toml`, `Cargo.lock` and the first `CHANGELOG.md` heading must
  match; `src/lib/__tests__/version-sync.test.ts` fails the build
  otherwise.
- **Build-time configuration.** `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY` (public by design; the database is
  protected by row-level security, not by hiding this key),
  `VITE_NOSHASHI_EDITION`.

### Release checklist

1. Bump the version in all six places and add the changelog section.
2. Regenerate generated files: `UPDATE_DOCS=1 npx vitest run src/lib/docs`,
   `npm run site:build` (keep only the intended changes),
   `UPDATE_NOSHX_DATASET=1 npx vitest run src/lib/noshx`,
   `npm run site:noshx`.
3. `npx vitest run`, `npx tsc --noEmit`, `npm run build`,
   `npm run check:functions`, and after committing,
   `npm run check:noshx-web`.
4. Merge to `main`, run **Release** with `edition: full`, and confirm all
   17 assets are attached.

## Website

- `vercel.json`: build `node scripts/build-site.mjs`, output `site/`, no
  install step. `scripts/vercel-ignore-build.sh` skips builds for commits
  that touch only the app, CI or Supabase (the Hobby plan allows 100
  deployments a day, skipped ones included).
- `refresh-site.yml` redeploys at 06:00, 12:00 and 18:00 UTC through the
  `VERCEL_DEPLOY_HOOK_URL` secret, so pages built from live data stay
  current.
- The legal page is generated: `node scripts/build-legal-page.mjs` renders
  `site/legal/index.html` from `src/lib/legal.ts`. Edit the TypeScript,
  never the HTML.
- **Functions** (`api/`) read: `PUBLIC_SITE_URL`, `STRIPE_SECRET_KEY`,
  `STRIPE_PRO_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`,
  `STRIPE_ALLOW_PROMOTION_CODES`, `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`,
  `CONTACT_FROM`, `CONTACT_TO`, `CONTACT_WEBHOOK_URL`, `GITHUB_TOKEN`,
  `SUPPORT_LLM_BASE_URL`, `SUPPORT_LLM_MODEL`, `SUPPORT_LLM_API_KEY`,
  `ANTHROPIC_API_KEY`. The support-chat model keys are optional.

## Database

- Migrations are timestamped and applied in order. The live project's
  migration history should match `supabase/migrations/`; compare the two
  before applying anything.
- A migration that adds an enum value must be on its own, because the new
  value cannot be used in the transaction that adds it (see
  `20260930120000` / `20260930120100`).
- Anything that runs inside Supabase Auth's own transactions (such as the
  `auth.sessions` sign-in trigger) must never raise. It swallows its own
  errors so that a failure leaves an event unrecorded, not a person locked
  out.
- After every schema change, run the Supabase security and performance
  advisors.
- **Backups**: nightly encrypted `pg_dump` (`db-backup.yml`, 04:40 UTC,
  secrets `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`), a monthly restore test
  (`db-restore-test.yml`), and a keep-alive read every three days
  (`supabase-keepalive.yml`) so the Free project is not paused. See
  [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).

## Edge Functions

| Function | JWT verified by the gateway | In repository | Purpose |
|---|---|---|---|
| `noshashi-verify` | no (own `nsh_live_` key auth) | yes | Compliance API |
| `noshashi-checkout` | yes | yes | Stripe checkout for signed-in users |
| `noshashi-stripe-webhook` | no (Stripe signature) | yes | Entitlements from Stripe events |
| `noshashi-policy-activate` | yes | yes | Four-eyes policy activation |
| `noshashi-exception-decide` | yes | yes | Exception decisions |
| `noshashi-password` | no (the caller has no session yet; answers reveal nothing about accounts) | yes | Password breach screening before sign-in; the Custom Access Token hook admits only screened passwords |
| `noshashi-support-notify` | yes | yes | Support ticket email |
| `noshashi-xrpl-watch` | no (public routes by design; feed routes need an `nsh_live_` key; the cron sweep needs a token checked in the database) | yes | Event feeds, Guardian alerts, sanctions/threat/phishing lists, screening widget |
| `noshashi-ledger-registry` | no (the sweep needs a token checked in the database) | yes | Domain and credential registry sweep |
| `noshashi-portal` | yes | **no** | Stripe billing portal |
| `noshashi-return` | no | **no** | Checkout return page |

`noshashi-portal` and `noshashi-return` are deployed but their source is
not in the repository. Recover it with `supabase functions download`
before changing either.

- **Deploy**: `npm run check:functions` (Deno type-check), then
  `supabase functions deploy <name>`, keeping the gateway JWT setting from
  the table.
- **Secrets** read: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (provided by Supabase), `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_ALLOW_PROMOTION_CODES`,
  `RESEND_API_KEY`, `SUPPORT_INBOX`, `SUPPORT_FROM`, `NOSHASHI_SITE_URL`.

## Scheduled jobs (pg_cron)

| Job | Schedule (UTC) |
|---|---|
| `noshashi-xrpl-watch` | every minute |
| `noshashi-ledger-registry` | every minute |
| `noshashi-webhook-tick` | every minute |
| `noshashi-phishing-scan` | every minute |
| `noshashi-api-rate-sweep` | every 15 minutes |
| `noshashi-xrpl-retention` | 03:17 daily |
| `noshashi-phishing-retention` | 03:41 daily |
| `noshashi-sanctions-fetch` | 05:07 daily |
| `noshashi-sanctions-load` | 05:22 daily |
| `noshashi-protection-attest` | 06:17 daily |

After a restore into a new project, check `select jobname from cron.job`
against this list.

## A dedicated environment

Enterprise contracts list one; none has been provisioned. It would be a
second Supabase project built from this repository: apply every migration,
deploy every function in the table (after recovering the two missing
sources), set the secrets above, re-create the cron jobs, and ship an app
build whose `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` point at
it. Nothing in the code switches environments at runtime.
