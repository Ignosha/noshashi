# Security overview

Scope: reviewed source and isolated tests on 2026-11-15. Operational assurances require separate production verification. See [baseline](READINESS_BASELINE.md) and [test evidence](TEST_EVIDENCE.md).

The React/Tauri workstation reads public XRPL information. A generated website and public Vercel API provide research/demonstrations. Supabase Auth identifies signed-in users; PostgreSQL RLS, service-only RPCs and transactional guards protect organizational state. Stripe is the billing source of truth. AI explanations do not authorize a financial or policy action.

Existing controls include validated-ledger reads, provider-agreement checks, bounded readers, deterministic policy/hash logic, role-scoped organization data, four-eyes policy/exception transitions, restrictive desktop CSP, OS keyring storage for API/model secrets, and signed updater support. Their presence does not verify every deployed workflow.

Draft improvements add enrolled-MFA enforcement to privileged policy/exception and billing-portal requests; bounded sensitive request bodies/timeouts; no-store error responses and server trace identifiers; application error redaction; current, receipt-scoped exception reuse; SQL tenant/tamper/replay/concurrency tests; and a focused current-tree credential scan. These controls are **not deployed by this project** until separately approved.

SHA-256 receipts detect changes to canonical bytes. They are not digital signatures, independent consensus verification, reserve proof, legal-rights evidence or a compliance certificate. Audit tables restrict application roles and reject mutations with triggers; database administrators can change schema and controls. No independently immutable/WORM archive is established.

No independent penetration test, SOC 2 report, ISO certification, uptime SLA, production SSO or dedicated customer environment is established. Production readiness remains NO-GO pending [release gates](RELEASE_GATE.md).

Secrets stay in the platform's server-side secret configuration or native keyring. No production credential values were requested, exported, changed or committed in this work. Private runtime source snapshots were read for audit without secret-value retrieval. Focused pattern scanning is not proof that all secret types or repository history are clean.
