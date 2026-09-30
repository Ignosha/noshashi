# Procurement and institutional readiness

For a procurement, vendor-risk or information-security reviewer. Each line
is marked:

- **IMPLEMENTED**: exists today, in the product or its published documents.
- **PARTIAL**: exists in part; the gap is stated.
- **PLANNED**: does not exist yet. Nothing marked PLANNED should be relied on.

Last reviewed 2026-09-30 against the code and the published legal pages
(<https://www.noshashi.app/legal/>).

## Legal and commercial

| Item | Status | Detail |
|---|---|---|
| Terms of Service | IMPLEMENTED | Published: Terms of Use (`/legal/`, "TERMS OF USE"). |
| Privacy Policy | IMPLEMENTED | Published (`/legal/`, "PRIVACY POLICY"). |
| Data Processing Agreement | PARTIAL | Published data-processing terms and subprocessor list ("DATA PROCESSING & SUBPROCESSORS"); standard contractual clauses referenced for EEA/UK/CH transfers. A countersigned, negotiable DPA is PLANNED. |
| Subprocessors | IMPLEMENTED | Supabase (database, auth, functions; US region), Stripe (payments), Vercel (website). Hosted AI providers only when a customer configures one with their own key. |
| SLA | PLANNED | The price list names a 99.9% uptime SLA for Institutional and above, "set in the MSA". No MSA has been signed, and today's hosting (Supabase Free plan, nightly backups only) could not back that figure. See `docs/ENTERPRISE.md` for what would need to change first. |
| Contracting (order forms, MSA) | PLANNED | Self-serve checkout today; enterprise paper on request is not yet standardised. |
| Billing, renewal, refunds | IMPLEMENTED | Published billing terms; cancellation from the Stripe billing portal. |
| Regulatory disclosures | IMPLEMENTED | Published ("REGULATORY DISCLOSURES"). NOSHASHI does not provide legal advice and does not replace a compliance function. |

## Security

| Item | Status | Detail |
|---|---|---|
| Security documentation | IMPLEMENTED | `SECURITY.md`, `docs/SECURITY_THREAT_MODEL.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/AI_GOVERNANCE.md`, `docs/DEPLOYMENT.md`, `docs/ENTERPRISE.md`. |
| Certifications (SOC 2, ISO 27001) | PLANNED | None held. |
| Penetration test | PLANNED | None performed. |
| Encryption in transit | IMPLEMENTED | TLS to Supabase, XRPL servers, Stripe and the website. |
| Encryption at rest (server) | IMPLEMENTED | Provided by Supabase's managed Postgres. |
| Encryption at rest (desktop store) | PARTIAL | Relies on the operating system account; the app's local store is not separately encrypted. Secrets (API keys) are in the OS keychain. |
| Code signing of desktop builds | PLANNED | Needs the owner's Apple Developer ID and Windows certificate; SHA-256 checksums and updater signatures are published today. |
| Dependency vulnerability scanning | PARTIAL | `npm audit` run at review time (0 production vulnerabilities); not yet an automated CI gate. |
| Signed webhooks | IMPLEMENTED | HMAC-SHA256 with per-endpoint secret and timestamp. |
| Payment webhook verification | IMPLEMENTED | Stripe signature verified with a timing-safe compare. |

## Identity and access

| Item | Status | Detail |
|---|---|---|
| Authentication | IMPLEMENTED | Email and password with breach screening; TOTP second factor. |
| SSO (SAML / OIDC) | PLANNED | Not implemented. |
| Role-based access | IMPLEMENTED | Organization roles: owner, admin, compliance, reviewer, risk, analyst, auditor, viewer, API, regulator (time-limited read-only examiner seat). Enforced in the database. |
| Distinct reviewer and auditor roles | IMPLEMENTED | `reviewer` activates policies and decides exceptions that someone else wrote or requested, and cannot draft, request or administer. `auditor` is an internal read-only seat that also reads the audit log and changes nothing. Both enforced in the database (migrations `20260930120000`, `20260930120100`). |
| Four-eyes controls | IMPLEMENTED | Policy author cannot activate; exception requester cannot decide. Enforced by database constraints and triggers. |
| Audit log | IMPLEMENTED | Append-only (`noshashi.audit_log`, UPDATE/DELETE refused); policy, exception, membership, API-key, branding and export events. |
| Login events in the audit log | IMPLEMENTED | Every new sign-in session is written to each of the person's organizations' audit logs as `member.signed_in` (time, IP address, client, whether a second factor was used), by a database trigger that can never block the sign-in. Shown under POLICY › GOVERNANCE AUDIT TRAIL › SIGN-INS. Token refreshes are not recorded as sign-ins. Recording began 2026-09-30. |

## Data

| Item | Status | Detail |
|---|---|---|
| Data retention | PARTIAL | Published retention section in the Privacy Policy; configurable retention for Strategic plans; no automated per-organization purge policy UI for all tiers. |
| Data deletion | PARTIAL | Account deletion on request; self-serve deletion of all organization data is not yet a button. |
| Data export | IMPLEMENTED | Audit-trail CSV with SHA-256 manifest; per-decision institutional report; signed verdict export; bulk export on Strategic. |
| Data residency | PARTIAL | United States only. |
| AI data handling | IMPLEMENTED | Default assistant (NOSHX Core) runs locally with no model provider. A hosted model receives only the question and the ledger readings needed to answer, and only if the customer configures one with their own key. |

## Operations

| Item | Status | Detail |
|---|---|---|
| Incident response | IMPLEMENTED | Written runbook: roles, severity levels, containment per scenario (including key and credential rotation), evidence preservation, customer and breach notification, post-incident review (`docs/INCIDENT_RESPONSE.md`). Contact in `SECURITY.md`. |
| Business continuity / disaster recovery | PARTIAL | Written plan with target RTO/RPO and restore steps (`docs/DISASTER_RECOVERY.md`); the desktop app keeps working against XRPL without the server. Nightly encrypted `pg_dump` (AES-256, 90-day retention) running since 2026-09-30; automated monthly restore test, first passed 2026-09-30. Gap: the database is on Supabase's Free plan (no managed backups or point-in-time recovery, so up to a day of data at risk), and a full recovery into a new project has not been rehearsed. |
| Support | IMPLEMENTED | In-app support tickets with staff inbox; email contact. No contractual response time. |
| Status page | IMPLEMENTED | <https://www.noshashi.app/status/>. |
| Versioning and change log | IMPLEMENTED | Semantic versions; `CHANGELOG.md`; release notes on the website; signed auto-update. |
| Change management | PARTIAL | Every change lands through a pull request with CI (type check, tests, function checks, Rust compile); no customer-facing change-freeze or advance-notice policy yet. |

## Product and API

| Item | Status | Detail |
|---|---|---|
| API documentation | IMPLEMENTED | `docs/API.md` and `/docs/api/` on the website. |
| API authentication, rate limits, structured errors, request IDs | IMPLEMENTED | Per-key authentication, durable tier-aware rate limits, structured error bodies with request IDs. |
| Webhooks | IMPLEMENTED | Signed organization event webhooks. |
| Deterministic decisions and evidence | IMPLEMENTED | GO / HOLD / NO-GO from versioned rules; SHA-256 receipts; replay at the recorded ledger; independent verification instructions. |
| Source agreement before GO | IMPLEMENTED | Several public XRPL servers must agree on the ledger and the account state. |
