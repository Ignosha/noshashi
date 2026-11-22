# Approval Drift — Research Prototype
Status: offline deterministic evaluator only; no hosted endpoint, authenticated approver, customer policy integration or signing authority.

Source: scripts/approval-drift.mjs
Tests: scripts/approval-drift.test.mjs
CI: Node integration test gate in .github/workflows/ci.yml

## Purpose
Compare two customer-provided XRPL evidence snapshots for the SAME proposed transaction and destination, with pinned ledger index/hash and a customer-provided policy version. Detect material changes in issuer global freeze, trust-line frozen/authorized state, destination tag requirements and policy version.

## Response semantics
- HOLD / MATERIAL_APPROVAL_DRIFT: material policy or issuer/trust-line control changed
- HOLD / APPROVAL_DRIFT_REVIEW_REQUIRED: destination tag requirement changed
- HOLD / CONTROL_EVIDENCE_UNKNOWN: any watched field is unknown, even if other fields changed
- HOLD / INTENT_IDENTITY_MISMATCH: transaction hash or destination differs
- HOLD / LEDGER_REGRESSION or LEDGER_HASH_CONFLICT: inconsistent ledger evidence
- HOLD / EVIDENCE_SCHEMA_INVALID: incomplete or unexpected data
- UNCHANGED / EXTERNAL_APPROVAL_REQUIRED: no watched change detected; **still no signing or approval authorization**

Both snapshots must have been independently sourced and validated by the caller. The evaluator does not verify actual XRP Ledger consensus or ledger provenance. It cannot establish whether a policy is approved, an issuer is trustworthy, a user is authorized, or a payment will settle. Current schema is intentionally narrow and omits partial-payment semantics, owner reserves, issuer trust-line limits, multi-step policy logic, timestamp/expiry, four-eyes approval and off-chain attestations.

## Example integration
```js
import { evaluateApprovalDrift } from "./scripts/approval-drift.mjs";
const decision = evaluateApprovalDrift(approvedSnapshot, latestSnapshot);
if (decision.verdict === "HOLD") {
  // Stop and require an institution-controlled human review.
}
```

## Required before enterprise release
Cryptographically verifiable or independently corroborated pinned ledger sources; authenticated immutable approval intent and policy snapshot; evidence freshness/expiry; trusted clock; independent authorization policy; actor/role access control; replay protection; tenant isolation; audit retention; customer case-level UX; threat modeling; adversarial and integration tests. This research function is NOT a replacement for those controls.

## Differentiation to test
The value hypothesis is showing *why* an institutional approval must be reconsidered when ledger or policy conditions change. This is not proven unique and is not sold or priced as a live API.
