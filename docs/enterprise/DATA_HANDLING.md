# Data handling and evidence

Sources: [data model](../DATA_MODEL.md), [evidence](../EVIDENCE.md), [case storage](../../src/lib/org/cases.ts), [payment review](../../supabase/migrations/20261103193000_payment_review_portal.sql).

| Data | Storage / handling | Assurance limit |
|---|---|---|
| Public XRPL responses | Public-node reads, reports and optional saved cases | A public address does not establish a person's identity; provider reads are not independent consensus verification |
| Account / organization metadata | Supabase Auth and organization tables; user JWT + RLS/service RPC | No production SSO or complete tenant lifecycle assessment established |
| Policies, exceptions and cases | Versioned parameters, actors, audit rows and canonical evidence hashes | Database/application controls, not independent immutable storage |
| Desktop API/model secrets | Native OS keyring via Rust | Native platform persistence and unlocked-session threat testing still required |
| Supabase session | Existing webview/browser storage | Not equivalent to keyring-backed session storage; CSP is mitigation, not elimination of XSS/local-device risk |
| Billing | Stripe-hosted card collection; provider IDs/entitlements in database | No raw card-number handling implemented here; sandbox payment is not revenue |
| Academy progress/certificates | Existing on-device progress storage | Device loss/clearing storage may remove local data; this task does not migrate or erase progress |
| Logs | Minimal operational event IDs/correlation IDs | Do not record passwords, bearer tokens, emails, raw policy inputs or evidence by default |

New case-closure validation is prospective: an approval must be current and scoped to the linked receipt. Existing historical records are not rewritten. Legacy approvals lacking an expiry require a renewed, independently reviewed approval before reuse; preserve the old record as history.

Retention must be defined per data class and customer agreement. Existing webhook/XRPL retention sweeps are specific to their tables, not a universal deletion policy. Append-restricted history may conflict with deletion requests; route such requests to the privacy/security owner for documented legal/contractual review. Do not disable integrity triggers or erase audit history as an ad-hoc cleanup.

Exports are sensitive even when built from public ledger facts because organization annotations can be confidential. Use authorized organization scope, verify the digest before sharing, label stale/historical/synthetic inputs, minimize personal data, and define customer-controlled storage/retention. A downloaded export is outside server revocation controls. Define permitted export roles and retention before a pilot.

No new telemetry service, data transfer, customer-data download or retention change was introduced. No residency or GDPR-compliance certification is asserted. Use [existing legal documents](../legal) only after qualified legal review for the actual customer/jurisdictions.
