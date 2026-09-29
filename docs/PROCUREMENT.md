# Procurement and institutional readiness

For a procurement, vendor-risk or information-security reviewer. Each line
is marked:

- **IMPLEMENTED**: exists today, in the product or its published documents.
- **PARTIAL**: exists in part; the gap is stated.
- **PLANNED**: does not exist yet. Nothing marked PLANNED should be relied on.

Last reviewed 2026-09-29 against the code and the published legal pages
(<https://www.noshashi.app/legal/>).

## Legal and commercial

| Item | Status | Detail |
|---|---|---|
| Terms of Service | IMPLEMENTED | Published: Terms of Use (`/legal/`, "TERMS OF USE"). |
| Privacy Policy | IMPLEMENTED | Published (`/legal/`, "PRIVACY POLICY"). |
| Data Processing Agreement | PARTIAL | Published data-processing terms and subprocessor list ("DATA PROCESSING & SUBPROCESSORS"); standard contractual clauses referenced for EEA/UK/CH transfers. A countersigned, negotiable DPA is PLANNED. |
| Subprocessors | IMPLEMENTED | Supabase (database, auth, functions; US region), Stripe (payments), Vercel (website). Hosted AI providers only when a customer configures one with their own key. |
| SLA | PLANNED | No contractual uptime or response SLA is offered today. |
| Contracting (order forms, MSA) | PLANNED | Self-serve checkout today; enterprise paper on request is not yet standardised. |
| Billing, renewal, refunds | IMPLEMENTED | Published billing terms; cancellation from the Stripe billing portal. |
| Regulatory disclosures | IMPLEMENTED | Published ("REGULATORY DISCLOSURES"). NOSHASHI does not provide legal advice and does not replace a compliance function. |

## Security

| Item | Status | Detail |
|---|---|---|
| Security documentation | IMPLEMENTED | `SECURITY.md`, `docs/SECURITY_THREAT_MODEL.md`. |
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
| Role-based access | IMPLEMENTED | Organization roles: owner, admin, compliance, risk, analyst, viewer, API, regulator (read-only examiner seat). Enforced in the database. |
| Distinct reviewer and auditor roles | PARTIAL | Exception decisions require owner, admin or compliance; the regulator seat is read-only. A named "reviewer" and "auditor" role is not separate yet. |
| Four-eyes controls | IMPLEMENTED | Policy author cannot activate; exception requester cannot decide. Enforced by database constraints and triggers. |
| Audit log | IMPLEMENTED | Append-only (`noshashi.audit_log`, UPDATE/DELETE refused); policy, exception, membership, API-key, branding and export events. |
| Login events in the audit log | PARTIAL | Recorded by Supabase Auth's own audit trail, not mirrored into the organization audit log. |

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
| Incident response | PARTIAL | Responsibilities and contact in `SECURITY.md`; a written incident-response runbook (`docs/INCIDENT_RESPONSE.md`) is PLANNED. |
| Business continuity / disaster recovery | PARTIAL | Managed Postgres backups by Supabase; the desktop app keeps working read-only against XRPL without the server. A written DR plan with RTO/RPO is PLANNED. |
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
