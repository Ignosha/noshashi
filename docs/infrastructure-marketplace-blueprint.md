# NOSHASHI Infrastructure & API Marketplace — implementation blueprint

Status: proposal, not shipped. XRP Ledger first; multichain adapters require separate validation. No custody, signing, production GO, or live enforcement implied.

## Product surfaces
1. **Continuity Desk:** institutional preflight, incident reconstruction, policy drift review, evidence receipts, case management.
2. **NOSHASHI API Cloud:** versioned read-only APIs with reproducible evidence provenance, deterministic error codes, SDKs, sandbox and usage metrics.
3. **NOSHASHI Marketplace:** curated first-party API catalog, interactive docs, test credentials, pricing/quotas, organization billing, operational status, upgrade to private deployments.
4. **Assurance Engine:** canonical transaction intent, validated ledger snapshots, policy versions, evidence provenance, deterministic rules, tamper-evident audit history.
5. **Adapters:** XRPL mainnet first; other chains must declare capability coverage and unsupported states explicitly.

## Candidate first-party APIs (ideas; market differentiation unverified)
| API | Input -> output | Defensible utility | Fail-closed boundary |
|---|---|---|---|
| Transaction Autopsy | network + tx hash -> validated outcome, known error codes, evidence links, confidence | investigation time reduction | unknown outcome never labeled successful |
| Destination Preflight | intent + destination -> destination tag, account state, reserve and issuer restrictions | catch predictable operational errors | missing/stale ledger -> UNKNOWN/HOLD |
| Approval Drift | immutable approval snapshot + current state -> material differences, re-review flag | catches approval-to-execution changes | no automated authorization |
| Evidence Receipt | intent digest + evidence refs + policy version -> canonical signed receipt (future) | independent reproducibility | do not claim verified signing until implemented |
| Stablecoin Route Readiness | asset + route + size -> declared issuer/redemption/settlement constraints | institution-specific operational readiness | off-chain facts must have dated sources |
| Incident Timeline | tx hash + supplied internal events -> ordered timeline with provenance | cross-system investigation | customer events remain unverified until authenticated |
| Asset Control Surface | issuer + asset -> freeze, authorization, transfer constraints | XRPL-specific issuer control visibility | never infer legal or counterparty trust from on-chain flags |
| Policy Simulation | synthetic intent + draft policy -> HOLD/NO-GO with reason codes | test policy before rollout | isolated sandbox; never activates policy |

## API contracts and security non-negotiables
- Versioned /v1 endpoints, JSON Schema/OpenAPI, explicit network and ledger index, source timestamps, source confidence, request ID, stable machine-readable reason codes.
- Output states: VERIFIED_FACT, INFERRED, UNKNOWN, NOT_SUPPORTED; distinguish NO-GO from HOLD.
- No raw private keys or seed phrases; authentication with scoped API keys or OAuth, organization tenancy, per-key quotas, rotation, audit logging, abuse detection, data minimization.
- Never accept a client-supplied “validated” flag as trusted evidence. Pin ledger reads and verify identity and provenance.
- Reproducible receipts need canonicalization, independent verification, key rotation and replay resistance before sale as cryptographic assurance.
- Webhooks: signed payloads, timestamp tolerance, idempotency keys, retries and dead-letter handling.
- Data retention and regional controls must be designed before collecting institutional personal or confidential data.
- Market listings must not imply certification, regulatory approval, loss prevention guarantees or complete coverage.

## Marketplace layout — existing Ledger Desk visual language
- /developers: documentation and quickstart.
- /marketplace: catalog with filters (XRPL, evidence, policy, operations, experimental).
- /marketplace/[slug]: example request/response, source limitations, latency/SLA disclosure, version, pricing and status.
- /console: organization, keys, sandbox, quota, request logs, billing, support.
- /enterprise: security posture, deployment options, procurement, design-partner application.
- Clear badge per offering: CONCEPT, SANDBOX, BETA, PRODUCTION. No fictional customer testimonials or usage counters.

## Packaging and illustrative pricing experiments (not validated)
- Developer sandbox: free, strict quota, synthetic or public read-only data.
- Team: $99–$499/month per organization for limited production usage and support.
- Growth: $999–$2,999/month for higher quotas, event workflows and support.
- Enterprise: $50k–$250k+/year only with validated integrations, security, SLA and procurement support.
- Usage metering should measure billable requests, deduplicate retries and support hard spend limits. Billing disabled until explicit approval.

## Delivery phases and acceptance criteria
**P0 — research and contracts:** interview 5–10 operations/compliance teams; benchmark competitors and existing provider-native tools; select one painful workflow; define OpenAPI schema and realistic examples. Gate: evidence of buyer demand, not novelty claims.
**P1 — read-only Autopsy API:** validated XRPL transaction lookup, normalized outcomes, missing-data states, evidence citations, deterministic tests for failed/pending/unknown transactions. No billing or deployment. Gate: fixture-based and independent-source verification.
**P2 — Marketplace preview:** static catalog, accurate status labels, interactive examples using fixtures, SDK starter snippets, accessibility/mobile tests. No real keys or misleading live availability.
**P3 — tenant infrastructure:** auth, keys, quotas, rate limits, request logs, threat model, security tests, monitoring, incident runbook.
**P4 — drift and receipts:** policy snapshot diff, evidence receipts with independent verification, expiry/replay controls and integration tests.
**P5 — paid pilots:** design-partner agreements, bounded data processing, support, procurement, measured reduction in manual review time. Only then evaluate billing and enterprise SLAs.
**P6 — additional chains:** adapter compatibility matrix and explicit chain-specific semantics; no parity claims without tests.

## Metrics
- Median investigation time saved; percent of incidents with independently reproducible evidence.
- False-positive HOLD/NO-GO rate; unknown/unsupported rate; ledger freshness and API uptime.
- Time to first successful sandbox call; sandbox-to-pilot conversion; paid retention; gross margin after infrastructure and support.

## Existing code and constraints
Continuity is currently a read-only XRPL prototype with conservative HOLD/NO-GO and a compiled Intel macOS scaffold; it is not a custody-integrated enforcement layer. Reuse proven code carefully, isolate shared logic behind typed interfaces, and do not weaken fail-closed behavior. No automatic merge, production deployment, billing, or release.
