# Architecture

Last reviewed 2026-09-29 against `main` (1.0.17). Paths are the source of
truth; this page says how they fit together.

## One sentence

A desktop app reads validated XRPL state from several public servers, runs a
deterministic rule set and the institution's policy over it, and records a
verdict with a SHA-256 receipt; a Supabase back end holds what an
organization shares (policies, exceptions, cases, audit log, API keys,
webhooks), and a static website with a few Vercel functions sells and
documents it.

## Components

```
                ┌──────────────── Desktop app (Tauri 2) ────────────────┐
 XRPL public    │ src/lib/xrpl/link.ts   paced WebSocket reads           │
 servers  ◄─────┤ src/lib/net/agreement.ts  same ledger, several nodes   │
 (mainnet)      │ src/lib/policy.ts      rules → verdict → receipt       │
                │ src/lib/desk/*         liquidity, risk, replay, report │
                │ src/lib/noshx, agent   assistant (explains, cites)     │
                │ src-tauri/ (Rust)      store, keychain, model proxy,   │
                │                        file export, updater            │
                └──────────────┬─────────────────────────────────────────┘
                               │ HTTPS + user JWT
                ┌──────────────▼───── Supabase (schema noshashi) ────────┐
                │ Postgres + RLS · 9 Edge Functions · pg_cron · pg_net   │
                └──────────────┬─────────────────────────────────────────┘
                               │
                ┌──────────────▼───── Website (Vercel) ──────────────────┐
                │ site/ (generated) · api/*.js (checkout, contact,       │
                │ support chat, public certificate, market/news feeds)   │
                └────────────────────────────────────────────────────────┘
```

| Layer | Where | Responsibility |
|---|---|---|
| UI | `src/components`, `src/App.tsx` | Scenes (screens), Executive and Analyst modes, the Decision Card |
| XRPL access | `src/lib/xrpl/link.ts`, `pacer.ts`, `client.ts` | One WebSocket per session with failover across public nodes; at most four requests in flight; throttled replies cool down and retry; reads pinned to validated ledgers (enforced by `src/lib/trust/__tests__/boundary.test.ts`) |
| Source agreement | `src/lib/net/agreement.ts`, `src/lib/net/sync.ts` | Ask every public node for the ledger hash and account state at one validated index before a verdict is recorded |
| Deterministic engine | `src/lib/policy.ts`, `src/lib/desk/institutional.ts`, `src/lib/desk/rules.ts` | Pure functions: facts in, rule results and verdict out. See [POLICY_ENGINE.md](POLICY_ENGINE.md) |
| Liquidity | `src/lib/desk/book.ts`, `liquidity.ts`, `amm.ts`, `stress.ts` | Quoted vs fillable depth, exit simulation, AMM pools, stress schedules |
| Evidence | `src/lib/desk/ledger.ts`, `evidence.ts`, `replay.ts`, `report.ts` | Receipts, re-verification, replay, institutional report. See [EVIDENCE.md](EVIDENCE.md) |
| Organizations | `src/lib/org/*`, `supabase/migrations`, `supabase/functions` | Roles, four-eyes policies and exceptions, shared cases, audit log. See [DATA_MODEL.md](DATA_MODEL.md) |
| AI | `src/lib/noshx` (NOSHX Core, tools, citations), `src/lib/agent` (hosted/local models, governance) | Explains and cites; never decides. See [AI_GOVERNANCE.md](AI_GOVERNANCE.md) |
| Rust shell | `src-tauri/src` | Local store, OS keychain for model keys, hosted-model proxy (keys never reach the web view), sandboxed file export, updater |
| Server-side verification | `supabase/functions/noshashi-verify`, `api/_lib/authority.js` | The same rules as the app, held equal by parity tests, for the Compliance API and the public certificate page |
| Website | `scripts/build-site.mjs` → `site/`, `templates/`, `api/` | Generated from the code's own facts (`npm run site:build`) |

## Edge Functions

`noshashi-verify` (Compliance API), `noshashi-policy-activate` and
`noshashi-exception-decide` (four-eyes transitions), `noshashi-password`
(breach screening), `noshashi-checkout` and `noshashi-stripe-webhook`
(billing), `noshashi-support-notify`, `noshashi-xrpl-watch` (deposit and
account monitoring), `noshashi-ledger-registry` (credential and domain
directory). Shared code is in `supabase/functions/_shared`.

## Scheduled work (pg_cron)

| Job | Schedule | What |
|---|---|---|
| `noshashi-xrpl-watch` | every minute | Read watched accounts and deposit addresses |
| `noshashi-webhook-tick` | every minute | Deliver signed webhooks, with retries |
| `noshashi-ledger-registry` | every minute | Refresh the credential/domain directory from mainnet |
| `noshashi-phishing-scan` | every minute | Scan for dust-with-link lures |
| `noshashi-sanctions-fetch` / `-load` | daily 05:07 / 05:22 UTC | Refresh OFAC-listed XRP addresses |
| `noshashi-protection-attest` | daily 06:17 UTC | Protection-fund attestation |
| `noshashi-xrpl-retention`, `noshashi-phishing-retention` | daily | Retention sweeps |
| `noshashi-api-rate-sweep` | every 15 minutes | Expire rate-limit windows |

The database reaches XRPL through `pg_net` from SQL.

## Design rules that hold everywhere

1. **Read-only.** No code path signs or submits a transaction; no wallet or
   key-pair library is imported (tested).
2. **Validated state only.** Every read names a validated ledger (tested).
3. **Deterministic decisions.** The verdict comes from pure functions; the
   AI is outside that path.
4. **Frozen receipt bytes.** `receiptCanonical` never changes shape, so
   every receipt ever issued keeps verifying.
5. **Server-authoritative permissions.** Roles, entitlements and four-eyes
   are enforced in Postgres and Edge Functions, never only in the client.
6. **Real data in tests.** Fixtures are recorded mainnet replies.

## Build and release

CI (`.github/workflows/ci.yml`): type check, unit and invariant tests, Deno
check of the Edge Functions, website-bundle drift check, Rust compile.
Release (`release.yml`): macOS arm64/x64, Windows MSI/NSIS, Linux
deb/rpm/AppImage, updater signatures and `latest.json`. See
[RELEASE_SIGNING.md](RELEASE_SIGNING.md).
