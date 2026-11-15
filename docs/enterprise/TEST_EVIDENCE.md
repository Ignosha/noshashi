# Executed verification — 2026-11-15

Environment: Linux x64; Node v24.19.0; Chromium 154.0.8037.57; disposable PostgreSQL 16 container without network; repository npm dependencies and scoped Deno toolchain. This is not physical macOS/Windows validation or an independent security assessment.

| Exact command / flow | Exit / actual result | Scope and limitations |
|---|---|---|
| `npm test` | 0; 1,744 passed, 4 skipped, 138 files (137 pass / 1 live-only skip) | Deterministic existing/new unit and local HTTP tests. Live production governance tests remain skipped. |
| `tsc --noEmit` | 0 | Main app TypeScript |
| `tsc -p academy --noEmit` | 0 | Academy TypeScript |
| `tsc -p noshrepair --noEmit` | 0 | Support console TypeScript |
| From `supabase/functions`: `deno check */index.ts` | 0 | All 15 source Edge entry points, including recovered billing sources |
| From `supabase/functions`: `deno test --allow-env --allow-net=127.0.0.1 _tests/governance-http.test.ts` | 0; 1 integration test / 11 steps | Actual handlers and SDK; synthetic Auth/RPC fixture, loopback network only. MFA/session, body bounds, forged body identity, provider failure and hash/membership order checks. |
| `scripts/test-sql.sh postgresql://postgres:enterprise-qa@localhost:5432/postgres` with a local Docker `psql` wrapper | 0; five SQL test files and one multi-connection concurrency script passed | Real RLS/RPC/trigger execution in throwaway PostgreSQL. Production is never targeted. |
| `python3 -m unittest discover -s tests/enterprise -p 'test_*.py'` | 0; 3 tests | Focused scanner rule/redaction behavior, synthetic tokens only |
| `python3 scripts/enterprise/secret_scan.py` | 0; zero current-tree findings | Prints only filenames/lines/categories. Not history/native binary/provider-secret scanning. |
| `node scripts/enterprise/benchmark.mjs output.json` | 0 | Synthetic local compute only; [aggregate measurements](PERFORMANCE_BASELINE.md) |
| `npm run build` | 0 | Desktop web frontend build; **not** a Tauri/native installer build |
| `npm run site:build` | 0 | Local website generation; network release snapshot fallback was observed and generated public-page changes were discarded, not published |
| `npm run check:academy-web` | 0 | Browser course/workstation regeneration check; 77 atomic cache assets, no saved-progress schema change |
| `npm run site:academy` and `npm run site:noshx` | 0 | Rebuilt again after the API-reference update; committed bundles remain unchanged |
| `APP_URL=http://127.0.0.1:4358 SHOTS_DIR=... node scripts/verify-readiness-v2.mjs` | 0; five grouped browser checks | Eight pages at desktop/mobile widths, metadata/table overflow, explicit news states, stale liquidity, pricing controls and native form validation. Synthetic feeds; no form or billing submission. |
| `APP_URL=http://127.0.0.1:4358 CHROMIUM_PATH=/usr/bin/chromium SHOTS_DIR=... node scripts/academy/design-smoke.cjs` | 0; 14 checks | Lessons/resume, accessibility controls, captions/transcripts, labs/teach-back, node-outage fallback, spaced recall, practice/exam, certificates, phone keyboard/overflow and storage recovery |
| `bash -n scripts/test-sql.sh tests/sql/governance-concurrency.test.sh` | 0 | Shell syntax |
| `deno fmt --check` on new shared/request/test files; `git diff --check` | 0 | Formatting/whitespace; repository has no general ESLint script |

## Database-test boundaries

The existing plain-PostgreSQL harness reports **13 migration files incomplete/skipped** because platform extensions/roles/objects are unavailable. It can retain partial setup from older migration files; this is not a complete atomic Supabase rebuild. Required core governance, expiry, reviewer, case-binding, terminal and payment-review migrations used by the asserted tests applied successfully. Platform cron, network/Vault delivery, complete restore and full deployed schema parity are **not verified**. Run full staging Supabase migrations before approval.

New negative cases cover another organization's policies/exceptions/audit/case evidence, direct service-only RPC access, requester self-approval, viewer/outsider approval, mismatched hash, stale/unsupported exception use, changed historical evidence, duplicate decisions/events and audit-storage failure rollback. The concurrency test requires an observed database row-lock wait across two sessions, exactly one accepted decision and one decision audit event; it does not count two serial requests as concurrency.

## Failed attempts and corrections

- Initial unprivileged full-suite attempt exited 1: child-process/loopback `EPERM` caused eight failures and six asynchronous errors. The same suite was rerun with required local execution permissions; no test was deleted.
- Initial isolated database initialization failed from workspace exhaustion (`ENOSPC`). Completed checkout-only containers/images and regenerable npm download cache were removed; source/user artifacts were preserved. SQL tests then ran.
- Initial Deno invocation from the repository root exited 1 on dependency resolution. Correct scoped-directory commands passed. A misspelled one-off path and a temporary fixture path placement were corrected before execution.
- The new concurrency harness initially failed to observe contention. Its stdin execution and first-lock barrier were corrected; final execution proves an actual lock wait.
- The first final suite found the generated API inventory missing the two recovered functions. `UPDATE_DOCS=1 vitest run src/lib/docs/__tests__/reference.test.ts` regenerated only that inventory; all tests were retained and rerun.
- Academy smoke initially exited 1 because Playwright's downloaded browser was absent. Rerunning against installed Chromium passed; no new browser download was required.

Existing warnings remain: Vite/native-config CommonJS migration notices, Rollup annotation/dynamic-import warnings and a large frontend chunk warning. No baseline advisory severity was hidden: `npm audit --omit=dev --json` returned zero production dependency advisories. Native Rust dependencies were not scanned in this environment.

## Not executed / remaining external checks

No live signed-in production governance mutation, real-card checkout, tax/refund/dispute lifecycle, complete fleet/load test, independent penetration test, native Cargo/Tauri build, Developer ID/notarization verification, physical Intel Monterey test or actual customer-backup restore was performed. No new customer account, price, subscription, paid grant, production secret or customer communication was created by this hardening work.

## Approved prior change

PR #176 was explicitly approved, merged at `62a7e63`, and its payment-review function deployed as version 2 with gateway JWT verification enabled. Only that function version changed; OPTIONS returned 204 and missing/forged JWT requests returned 401. Vercel reported successful deployment. The new enterprise draft changes are not deployed.
