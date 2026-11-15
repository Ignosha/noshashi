# Implementation and integration plan

This branch preserves the Ledger Desk design, public pages, course content, native application behavior, authentication provider, live prices and infrastructure. It does not merge/deploy its hardening changes.

Implemented for review:

1. Shared explicit-bearer session/MFA checks for privileged policy and exception decisions; enrolled MFA must be satisfied before storage access. Unknown assurance fails closed.
2. Byte/time-bounded sensitive request parsing, provider-call timeouts, no automatic mutation retries, no-store responses, server-generated policy correlation IDs and generic/redacted error events.
3. Bounded public password-screening input/provider calls; no raw provider error output.
4. Recovered deployed billing portal/static return source. The portal receives the same privileged session controls and bounded/error-checked storage/provider behavior. Static return content is byte-for-byte unchanged. The generated reference now includes both real functions.
5. Additive review-only case exception binding migration: prospective closure requires a current approval for the linked receipt and matching explicit case scope where present. No historical record or existing approved decision is rewritten. Legacy approvals without expiry require renewed review before reuse.
6. Real PostgreSQL governance/evidence tests: tenant isolation, direct-RPC denial, self/viewer/outsider approval denial, replay, altered evidence, expired/unsupported approval refusal, immutable-history restrictions, audit-failure rollback and a two-connection approval race with observed row-lock contention.
7. Actual Edge-handler/Supabase-SDK integration with a synthetic loopback Auth/RPC provider. This is not a production Auth or database test; SQL exercises the storage boundary separately.
8. Focused current-tree secret scanning, CI safety checks, a synthetic compute benchmark and the enterprise evidence/runbook/pilot/release-gate register.

Integration order: review and stage this security/evidence branch first. Billing fulfillment improvements, native release assurance and recovery-workflow repairs are independent follow-on drafts or explicitly stacked where shared code is required. Do not blindly merge all branches together. Recheck the exact final head and test results before approval.

Required reviewers: security/backend engineer for session and HTTP boundaries; database/governance owner for exception semantics and rollback; product/founder for legacy-approval renewal behavior; operations/release owner for readiness/backup/device gaps. These are required roles, not a claim that independent reviewers have signed off.

Deployment plan after explicit approval: back up schema/function source privately, rehearse the additive migration and affected functions in staging, confirm real enrolled/non-enrolled MFA and tenant denial, verify existing evidence digests and current approval semantics, then obtain exact production approval. No secret rotation, billing-price change, account-tier grant or desktop release is needed for this branch. Do not roll back by rewriting historical approvals; roll back code under an owner-approved plan and retain truthful audit history.
