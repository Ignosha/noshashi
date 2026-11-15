# Incident response — owner-operated runbook

Status: documented procedure, not a tested on-call service or contractual response commitment. The founder assigns an incident commander and security/operations roles before accepting a pilot.

1. Record a minimal incident identifier, UTC detection time, affected service and observed facts. Separate evidence from inference. Keep tokens, customer rows and exploit-sensitive detail in private storage.
2. Triage credential exposure, cross-tenant access, unauthorized approval, incorrect evidence, billing/access mismatch, upstream XRPL outage or release-integrity failure. Preserve logs and hashes without publishing raw data.
3. Propose containment to the owner: disable the affected privileged workflow, revoke a scoped credential/session, halt a job, quarantine an artifact or roll back a release. **Owner approval is required for production changes and live credential rotation.** Avoid bulk deletion or retrying uncertain financial writes.
4. Determine scope using correlation IDs, organization/account authorization history and provider receipts. A 200 response or return page is not proof of successful durable fulfillment. Reconcile Stripe and database state without granting a guessed tier.
5. Remediate in a reviewed branch, run regression and failure-injection tests, restore/reconcile in staging, and obtain explicit production go/no-go approval.
6. Verify negative cases as well as recovery: revoked actors denied, other tenants isolated, historical digests unchanged, no duplicate side effects, alerts delivered to the assigned owner.
7. Communications, disclosure obligations and customer messages require owner/legal approval. Do not invent breach conclusions or promise notification windows that have not been agreed.
8. Write a post-incident review: impact, timeline, root cause, evidence limitations, decisions, recovery measurements, follow-up owner and verification date.

Escalate immediately to the owner when tenant isolation, payment provisioning, signing trust or credentials may be affected. Suggested alert conditions are failed privileged writes, repeated authentication failures, invalid evidence digests, billing reconciliation failures, stale ledger dependencies, backup failure and restore failure. Alert delivery itself must be tested; no instantaneous/24-hour coverage is promised.
