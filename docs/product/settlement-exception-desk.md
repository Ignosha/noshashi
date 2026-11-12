# Settlement Exception Desk — evaluation scope

Status: implemented for local review; not deployed. The browser desk is an evaluation tool, not an enterprise service commitment.

## Product and commercial hypothesis

Reconcile what an invoice expects with what an XRPL payment actually delivered, then give an operations reviewer a short exception worklist and exportable evidence. The potential value is reduced reconciliation effort and clearer exception handling. Demand, saved time, willingness to pay and uniqueness are UNVERIFIED; no claim that this is the first such product.

Proposed pilot, subject to founder and customer agreement: one workflow, a mutually agreed non-sensitive sample, explicit acceptance criteria, a baseline manual review measurement and a final findings report. Suggested commercial experiments: $3,000–$8,000 fixed pilot; $1,500–$5,000 monthly only after recurring scope, reliability, support and operating costs are established. These are hypotheses, not approved catalog prices, offers or contract terms. No billing changes are included.

Measure exception detection against independently labeled samples, unresolved/error rates, repeat-credit warnings, reviewer time per payment and whether evidence answers the customer's reconciliation questions. Agree targets before the pilot; do not promise fraud prevention, recovered funds, compliance or an ROI figure.

## Implemented first phase

- `/settlement-desk/`: public read-only browser evaluation, mainnet only.
- POST `/api/settlement-check`: exact invoice/delivered comparison. No Amount/DeliverMax fallback. Both v1 and v2 transaction envelopes supported.
- Native XRP drops or issued currency plus exact issuer; bounded decimal arithmetic without floating-point loss.
- Validated ledger, successful Payment, destination/tag, raw asset identity and exact amount checks. A partial-payment flag requires attention even if the final amount matches.
- MATCHED, EXCEPTION or UNRESOLVED findings; unavailable evidence never passes.
- Up to 25 checks in page memory; explicit reviewer notes and review states, duplicate transaction warning across the session. No automatic crediting or approval.
- Downloadable JSON with responding node, observation time, ledger index, source evidence, rules version, SHA-256 receipt and separate local reviewer annotations.

## Evidence and trust boundary

The server reuses the existing allowlisted XRPL HTTP nodes with bounded failover, four seconds per node (at most three). A read is an observation from a public node, not independent consensus verification. A validated transaction is not proof of commercial authorization or legal settlement. The receipt hashes the UTF-8 bytes of JSON.stringify(report excluding receipt and limitation), preserving property order. Exported `ledger_report` contains that object; remove its receipt and limitation before recalculating. It is not signed or independently timestamped. Anyone can modify data and recompute an unsigned hash.

The node receives only the public transaction hash. Invoice expectations pass through NOSHASHI's API, without application persistence or application content logging. Platform request/security logs follow the deployment operator's configuration; do not send confidential invoice references. No wallet secrets, signatures, credentials or arbitrary upstream URL are accepted.

Server input capped at 4 KiB, classic addresses checksum-checked, hash/tag/decimal/asset validated. POST responses are no-store. A per-warm-instance limit permits ten checks/minute/caller; this is not a global usage or DDoS guarantee. Before a paid service, add platform/global quotas and usage observability.

## Explicit limitations and next phases

The queue disappears on refresh or tab close. Download first. No team authentication, four-eyes authorization, immutable audit store, monitored wallets, polling/scheduler, source-of-funds, sanctions screening, identity inference, Travel Rule determination, settlement finality opinion, derivatives monitoring, fund recovery or payment reversal is included. MPT delivery is unsupported and unresolved. One transaction may pay multiple invoices; this evaluation flags reuse but does not perform allocations. Exact matching has no FX, fee or tolerance reconciliation. Historical delivery gaps remain unresolved.

Next reviewable phases: authenticated tenant-scoped shared cases and RBAC; payment allocation and approved tolerance rules; idempotent ingestion/import and reconciliation; notification delivery with budgets/health; issuer configuration changes; reliable liquidity snapshots; agreed integration and support. Do not market these as working features.

## Release and manual setup

No new runtime keys, services, database migrations or paid dependencies. Consolidated `api/tools.js` stays within existing function count. Build through `npm run site:build`; local preview `PORT=4337 node scripts/dev-site.mjs`. The standalone page builder can generate the desk for isolated review. Founder approval is required before deployment, publication of pricing or external pilot communications.

Costs have not been benchmarked: static hosting plus one POST and one to three public-node reads per check. No LLM, scheduled job or paid data API is used. At 1,000 checks, expect 1,000 API requests and 1,000–3,000 upstream reads, excluding static assets. Dollar cost depends on actual provider plan, execution duration and upstream terms. Do not assume free production capacity or quote an SLA.

## Verification record — 2026-11-12

- Targeted Vitest: 65 passed across six files (new settlement comparison/API tests plus authority source/cache, delivered amounts and function-count regressions). Includes archived public partial-payment evidence and explicitly synthetic edge-case fixtures.
- `npm run build`: passed. Existing Vite warning: an application bundle exceeds 700 kB; existing module-format warnings also remain. No claim of desktop signing/notarization or physical device testing.
- `npm run site:build`: passed. Unrelated generated timestamps/feed refreshes were excluded from the change.
- Chromium at 1440 px and 390 px: queue submission, duplicate prevention/warnings, filters, issued fields, review changes and JSON download passed; no JavaScript errors or horizontal mobile overflow. Browser results use a mocked ledger response and screenshots identify synthetic evidence.
- Local API live probe for an archived public transaction: HTTP 503 UNRESOLVED. The configured nodes did not supply evidence during this test; live success is not verified. A successful live node check from the deployment environment remains required before launch. No production change was made.
- Reproduce browser flow with `node scripts/settlement-desk-smoke.mjs http://localhost:4337`; set `SETTLEMENT_SMOKE_DIR` and optionally `CHROMIUM_PATH` for local paths. No real invoice or private customer data belongs in test artifacts.

## Evaluation-kit update — 2026-11-12

The earlier local live-probe failure is resolved for this environment. Curl could reach the public node through the managed proxy, while the Node process did not use it. Restarting local preview with Node 24 `NODE_USE_ENV_PROXY=1` restored the existing RPC implementation without changing production URLs or disabling TLS validation.

A real mainnet `tx` read of `33C313E12DD8B2CFDB98ABC6298D4EFD0F3BC8EF283C057A026DA6170E7939AD` returned HTTP 200, validated ledger 107585451, MATCHED against the public archive's exact delivered amount. Observation: 2026-11-12T19:55:31.839Z from https://xrplcluster.com. The receipt digest was independently recomputed. A browser live check of a deliberately higher synthetic expectation correctly returned UNDERPAYMENT. This does not assert an actual underpaid invoice.

The local branch adds `/settlement-desk/evaluate/`, labeled source-backed teaching examples, an explicit handoff to live checking and a local downloadable feedback worksheet. It also fixes a real mobile issue where the site's generic sticky `header` style caused the page hero to intercept clicks on the form. Site navigation remains sticky; page heroes are static.

The automated checks now include 67 passing targeted tests and a Chromium flow covering all cases, retained reviewer assessments, local feedback download without a POST, mobile overflow and the explicit real-node request. These checks do not establish a production SLA or validate all XRPL transaction types. See `evaluation/README.md` for the session protocol and reproducible walkthrough production.
