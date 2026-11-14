# Cloud Terminal — Issue #169, Phase 1

## Baseline audit and implementation plan

Base: main `1235081` (PR #168). Existing production surfaces include the static Ledger Desk website, public issuer/payment/depth handlers behind `api/tools.js`, and a separate React/Tauri desktop application. The previous readiness review and public-read verification are documented in `docs/ledger-desk-readiness-v2.md`. Source implementation is not a claim of current runtime health.

- **DEPLOYED / previously verified:** issuer controls, delivered-payment comparisons, funded-depth snapshots, read-only public browser tools, release evidence and the four-stage product story.
- **LOCAL in this branch:** the new `/terminal/` page and a narrowly allowlisted terminal API. No existing desktop screen, auth rule, price, entitlement or production credential is changed.
- **IMPLEMENTED BUT UNTESTED here:** hosted account onboarding/TOTP/organization approvals and physical desktop installation. Supabase clients are not required for this public terminal.
- **PLANNED / excluded:** customer-data ingestion, shared cases, private workspaces, payment collection, SSO, enterprise security guarantees, hosted monitoring and signing. Tauri filesystem/Keychain/native-window APIs are excluded from this browser entry point.
- **Conflicts avoided:** desktop redesign PRs #160–164 and unrelated Mac work #152/#156 are not modified. Existing `site/assets/accent.css`, serif/Inter/monospace fonts, graphite/paper tokens and shared shell remain the design authority.

Plan: add a static route/build module, isolated CSS/browser controller and pure response model; route exactly two read-only operations through the existing tools function; reuse classic-address checksum validation and fixed XRPL RPC fallback endpoints; add bounded per-instance throttling/concurrency/cache controls, provenance/partial-state handling and truthful local exports; verify with unit/abuse tests and local browser smoke. Add navigation below the existing Platform destination to avoid changing the desktop UI or crowding the header. Disable automatic Vercel Git deployments for this review branch.

## Scope and evidence contract

Issuer input accepts a classic XRPL account and a three-character alphanumeric or 40-hex issued currency identifier. Currency is context: issuer AccountRoot flags do not establish that the currency has supply or redemption rights. No holder walk or identity inference is performed. Missing fields remain partial/unknown, never false/zero.

Payment input accepts exactly one 64-hex transaction hash. Only `tx` is requested; only `meta.delivered_amount` establishes delivered value. Submitted/unvalidated, failed, non-payment and unavailable-delivery states stay distinct. No invoice matching or legal settlement is implied.

Each result names XRPL Mainnet, the responding fixed endpoint(s), requested subject, ledger index, retrieval time and selected source evidence. An issuer header read checks the age of the selected validated ledger. Old validated transactions can remain valid historical evidence; retrieval age and transaction age are different. Copy/export requires a complete validated result, matching request, fresh retrieval and a verified SHA-256 response digest. A hash is not a signature, independent consensus proof or solvency/security/compliance certification.

## Commercial and release boundaries

Phase 1 supports a free 15–20 minute guided discovery demo. An optional $5,000 / 30-day proof-of-value pilot is a separately contracted founder proposal, not payment gating or a promised outcome. The page links the existing institutional contact route; no billing integration or customer-data form is added.

No merge, deploy, publication or outreach is authorized. Independent explorer cross-check and security/abuse review remain release gates, even after local tests pass. Rate limits are warm-instance controls, not a distributed WAF: public-launch review must consider deployment-wide protection and provider budgets without claiming these local limits are globally enforced.

## Implementation and operating limits

`/terminal/` is built by `scripts/build-terminal.mjs`; `/api/terminal` rewrites to the existing tools function (no extra serverless function). Browser assets are isolated from desktop code. The two API operations are `account_info` plus its pinned ledger header, or `tx`. Public examples fill inputs without sending requests. All reads require a deliberate submission.

The API rejects unknown/duplicate parameters, invalid classic-address checksums, malformed currencies and transaction hashes. It never accepts RPC methods, endpoint URLs, files, keys or ledger submissions. Each warm instance limits callers to six requests/minute, upstream investigations to 30/minute and concurrent investigations to two. Fixed-node retries are bounded to three endpoints with 1.8-second attempt timeouts (up to six attempts for an issuer investigation). Complete results have a bounded 100-entry, 30-second memory cache. Cache hits still consume the caller allowance. No scheduled job or paid service is introduced; idle usage is zero. Hosting costs depend on request volume and existing plan; these controls do not establish a deployment-wide cost ceiling.

Evidence uses only selected public fields. There is no application database persistence, localStorage, account attachment or transaction submission. Public providers and hosting infrastructure can observe requests and retain platform logs. Source evidence is not an independently verified consensus proof. Client SHA-256 checking detects response corruption; a party able to alter both the record and digest can replace both. It is not an authenticity mechanism.

The browser disables exports for missing, unvalidated, stale or digest-mismatched results. Retrieval freshness expires after three minutes; issuer ledger freshness also expires five minutes after its close time. Editing inputs, a new read or a late response cannot reuse previous evidence. Historical payment age alone does not invalidate a validated historical transaction. Currency context on an issuer account does not prove that currency was issued or has supply, liquidity, reserves or redemption rights.

## Executed validation — November 14, 2026

- Full Vitest suite: **130 files passed, one skipped; 1,667 tests passed, four skipped**. Targeted terminal/function-count checks: **18 passed**.
- `npm run build`: passed. Existing chunk-size/module-format warnings remain; desktop source and native code are unchanged.
- Static site build, website NOSHX build and Academy web builds: passed. Generated navigation/index assets accompany the branch. Existing Rollup annotation and dynamic/static import warnings remain.
- Local browser checks cover dark/paper themes at desktop/tablet/mobile widths, no automatic ledger calls, overflow, exact JSON download/digest, input invalidation, partial/unvalidated/stale/429/404/504/503/corrupt-evidence states, late-response cancellation, payment display, fixed explorer links, visible keyboard focus, freshness expiry, no-JavaScript fallback and uncaught errors. Synthetic error scenarios are explicitly labeled fixtures and do not prove provider availability.
- Real public-node reads through the local API and browser returned issuer evidence at ledger **108316232** and a validated payment at ledger **107585451**. These are point-in-time observations, not continuous availability guarantees.
- Independent [XRPL Explorer transaction view](https://livenet.xrpl.org/transactions/33C313E12DD8B2CFDB98ABC6298D4EFD0F3BC8EF283C057A026DA6170E7939AD) agreed on transaction hash, success result, ledger, sender and destination. Its displayed SOLO amount is rounded; raw delivered-amount precision was not independently checked in that view.

Browser screenshots: [desktop](screenshots/cloud-terminal-desktop.png), [mobile](screenshots/cloud-terminal-mobile.png). These show the local unqueried terminal, not a deployed page. Local live evidence and test logs are retained separately as review artifacts; no prospect/customer records are included.

## Manual review and release checklist

Completed locally: submit public issuer/payment examples, inspect actual provenance and explorer destination, inspect desktop layout, verify mobile width, keyboard navigation and local export. Automated controlled fixtures cover provider/error branches which cannot safely be forced against real public nodes.

Before release, a reviewer must independently inspect issuer flags and raw delivered metadata against source evidence; review input/response boundaries, rate-limit/IP trust, platform log retention and abuse exposure; establish appropriate deployment-wide protection/provider budget; and approve the product limitations. Full assistive-technology testing, independent penetration testing and enterprise certification are **not performed**. No credentials need to be added for this public-node implementation. Provider availability, service terms and sustained throughput remain external dependencies.

Branch automatic Vercel Git deployment is disabled. Opening this PR does not merge, deploy or make the terminal available to customers. Existing production website and desktop builds remain in place. No authentication infrastructure, billing behavior, prices, outreach records or release assets are modified by this work.
