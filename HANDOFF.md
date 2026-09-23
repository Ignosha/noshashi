# Handoff — NOSHASHI master directive

Updated 2026-09-23 · branch `claude/feature-pricing-recommendation-dp8xke` · PR #12 open, main merged in

## Where this is

Phase 1 is done — `docs/AUDIT.md` is a gap map, not a rebuild plan, because the product
was already largely built. Its §3 is the live scoreboard for gaps G1–G5 and is kept
current. Three defects found along the way were the product publishing claims that were
not true (a false allegation on the public certificate page, a false clearance in the
desktop app, a fabricated Travel Rule finding) — fixed and merged in #11. The schema for
organizations, roles and an append-only audit log is **applied to production**.

## Verified

Every line below was executed on `3382015`, not inferred:

- `npx tsc --noEmit` 0 errors · `npx vitest run` **504 tests, 25 files, all passing**
- `npm run check:functions` (deno, 3 edge functions), `npm run check:bloom`
  (generated-SVG drift guard), `npm run build`, `node scripts/build-site.mjs` — all exit 0
- `npm audit` — was 0 on `3382015`; **130 since main was merged in** (7 critical),
  almost all from dependencies main added (`@reown/appkit`, `@walletconnect/*`,
  `@metamask/sdk`, `electron` 31). Not fixed here: removing or upgrading them is
  a product decision (the Tauri app does not use Electron)
- `cd src-tauri && cargo check --locked` + `cargo clippy -- -D warnings` — exit 0 (needs
  `libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev`)
- Nav overflow: 6 pages clean 320–1250px, swept in 10px steps; Vite 7 dev server
  boots (299ms) and serves HTTP 200 with React refresh
- Migrations applied to prod, verified against the live catalogue: 3 tables,
  `organization_id` nullable on all 6 re-parented tables, rows untouched, 0 SECURITY
  DEFINER functions without a pinned `search_path`
- Audit triggers, 6 behavioural tests on a throwaway Postgres 16: `authenticated`
  cannot write `audit_log` directly yet its key creation still records a row; no key
  hash logged; `last_used_at` churn adds nothing; revocation and membership
  add/change/remove recorded; migration idempotent

## Open

**Do first — needs your hands (edge-function access was denied to the agent):**

```bash
supabase functions deploy noshashi-stripe-webhook noshashi-verify --project-ref xiurbiwuwcfowqnpmwki
```

Until then, an Enterprise/Strategic subscription still receives the *free* tier's
features and a 2/sec API limit. The database side (tier constraint) is already live.

Also: `scripts/build-legal-page.mjs` is stale against the committed `site/legal/`
(Google Fonts, old blue palette) — do not run it until it is brought up to date.
Strategic's `event_feeds` / `custom_schemas` and Enterprise's
`dedicated_environment` are contract services with no code behind them; the copy
now says so rather than promising gRPC or exactly-once delivery.

In priority order.

1. **§18 per-check five-state result.** `PolicyCheck.passed` is a boolean hashed by
   `digestOf` in all three runtimes. Converting it changes the digest contract a third
   time and touches every check construction and consumer. Own PR.
2. **Organization bootstrap.** Nothing creates an org or its first member, and no writer
   populates `organization_id`; until then audit rows carry a null org, which the read
   policy hides from everyone but `service_role`. Must be server-side — the roster
   policies cannot authorise the first row.
3. **Settlement policy versioning.** `receiptDigest`'s body is frozen, so a version
   cannot go inside it — needs a second versioned digest beside it, or a
   `policy_version` carried next to the receipt. Contract change.
4. **Smoke-test the live verify endpoint.** Impossible from the sandbox
   (`supabase.co` egress-blocked). Expect `""` and `"authority/check"` from
   `curl -s https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-verify | jq .verbs`
5. **Dependency audit** — see Verified: 130 findings from main's wallet SDKs and
   Electron. Decide whether the Electron shell (`main.js`, `preload.js`) and the
   wallet SDKs stay; if not, removing them clears most of it.
6. Pre-existing: `api_rate_windows` has RLS on with no policy (INFO); Supabase Auth
   leaked-password protection is off (WARN).

## Rejected

Dead ends already paid for. Do not re-derive these.

- **A WATCH verdict.** Nothing in the codebase produces a signal separating it from
  HOLD. A verdict no evaluation can return is a control that does nothing (§83). It
  arrives with historical monitoring, which supplies the trend it would rest on.
- **A counterparty confidence enum** (VERIFIED/ATTRIBUTED/PROBABLE/…), which the audit
  predicted for G3. Wrong: NOSHASHI attributes nothing by design, so the enum would
  have had no producer. The real defect was a fabricated Travel Rule finding.
- **An application-level audit helper.** Impossible: keys are created client-side as
  `authenticated`, which has no INSERT on `audit_log`, deliberately. Hence triggers.
- **A phone hero height floor** of `max(440px, 64svh)`. Measured: it put 130px of
  nothing under the CTA. The phone hero stays content-driven.
- **`npm audit fix` without `--force`.** Cannot resolve the Vite CVEs at all.
- **A live price ribbon as the hero centrepiece.** DESIGN.md bans "decorative data",
  and a chart in the hero breaks the bound the starfield exception is granted under.
  The decorative bloom was granted instead, as a documented second exception.

## Resume with

```bash
git fetch origin && git checkout claude/feature-pricing-recommendation-dp8xke
npm install
node .claude/skills/ponytail/scripts/trail.mjs     # reconcile before trusting this file
npx tsc --noEmit && npx vitest run && npm run build
```
