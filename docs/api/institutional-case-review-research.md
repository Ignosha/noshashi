# NOSHASHI Institutional Case Review — research composition

Status: local read-only research code, not a deployed or enterprise-approved service.

## What works
The function `reviewInstitutionalCase(input, { lookup })` in `scripts/institutional-case-review.mjs` connects three existing research components:
1. Read-only XRPL Transaction Autopsy with two RPC provider corroboration.
2. Deterministic Approval Drift comparison of customer-supplied policy/control snapshots.
3. Unsigned, SHA-256 tamper-detectable Evidence Receipt of the corroborated transaction report.

This is the first cohesive prototype of the buyer value hypothesis: an investigator can review what the ledger confirms, what changed since approval, and export a local integrity digest for the ledger outcome.

**Critical distinction:** The control snapshots are supplied by the caller and NOT authenticated, attested, sourced from validated XRPL ledger objects, or tied to a real institution's approval system. The receipt covers the transaction report ONLY, not the control snapshots or review decision. Even if no drift is detected, the composite case verdict is ALWAYS HOLD and authorizationGranted is ALWAYS false. A report of SUCCESS is an on-chain outcome, not permission to make another payment.

## Safety boundaries
- Requires validated, two-source transaction result before issuing a digest receipt.
- Rejects mismatched transaction hashes and a current ledger snapshot older than the validated transaction.
- Rejects a current snapshot with the same ledger index but conflicting ledger hash.
- Missing/conflicting upstream evidence returns HOLD without a receipt.
- All network calls are delegated to the read-only Autopsy lookup; no signing, transaction submission, private key, custody access, real policy activation or user approval.
- A caller-supplied snapshot cannot establish issuer solvency, AML status, legal rights, or whether the ledger actually contained the supplied control states.

## Run tests
```sh
node --test scripts/autopsy-gateway.test.mjs scripts/approval-drift.test.mjs scripts/evidence-receipt.test.mjs scripts/institutional-case-review.test.mjs
```

## What must be built before a real institutional pilot
- Validated-ledger source adapters for issuer freeze, trust line authorization, destination tag rules, and historical snapshots at specific ledger indices.
- Customer-controlled authenticated approval snapshot, actor role and immutable policy version.
- Binding to intent/amount/asset, freshness/expiry, audit log and four-eyes authorization.
- A genuine review UI showing evidence provenance, unknowns and policy changes.
- Signed receipt including transaction, policy/approval context and evidence provenance with independent verification.
- Enterprise security, privacy, tenant isolation, support, and independent audit.

**Product positioning:** A prospective institution should pay only if this complete workflow measurably reduces exception review effort and creates defensible operational evidence. The current prototype is not that completed commercial product.
