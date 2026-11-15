# Security findings — sanitized engineering register

Evidence date: 2026-11-15. Severity expresses potential impact, not a CVSS score or proof of exploitation. No exploitation of production or customer data was attempted. Detailed runtime snapshots remain private. All new fixes below await owner review/deployment.

| ID | Severity | Finding / evidence | Remediation and residual risk |
|---|---|---|---|
| AUTH-01 | High | Privileged session assurance was inconsistent across policy/exception and billing-portal paths | Shared explicit-token Auth/MFA checks, fail-closed unknown assurance, bounded requests, sanitized failures; unit and loopback HTTP tests. Mandatory enrollment and provider revocation still unverified. |
| EVID-01 | High | Case exception reuse needed stronger validity and evidence scoping | Review-only migration binds new closures to current receipt-scoped approval; SQL checks cover invalid approvals, historical mutation and replay. Legacy approvals need renewed review. Existing history unchanged. |
| BILL-01 | High | Some fulfillment storage errors were not checked; credit fulfillment needed durable replay protection | Separate billing-integrity workstream. Do not call happy-path sandbox success a failure/replay test. Lifecycle ordering still needs independent reconciliation validation. |
| REL-01 | High | Enterprise native release integrity is not established by conditional signing configuration | Verify actual Developer ID, notarization, architecture and updater signatures; no production certification claim. Physical Intel/Monterey testing required. |
| REC-01 | High | Latest restore workflow failed before restoration | 2026-11-02 run failed during Postgres client setup; no customer backup corruption inferred. Repair setup and run an owner-approved restore drill. |
| SRC-01 | Medium | Two deployed billing-related functions were absent from version control | Private read-only snapshots inspected; `noshashi-portal` and static `noshashi-return` source restored for review. No secret values embedded by the focused scan. Production parity requires approval. |
| LOG-01 | Medium | Sensitive-path errors could expose provider details or unnecessary identity data | Draft generic structured error events and server trace IDs. Review remaining runtime logs/retention; no broad claim of complete logging coverage. |
| ABUSE-01 | Medium | Some public rate limiting is process-local | Existing bounded work/quota controls retained. Distributed abuse/load validation needs infrastructure-owner review. |
| ID-01 | Medium | Enterprise identity/offboarding assurance remains incomplete | OIDC-first design only; organization-wide enrollment, provider/session revocation and break-glass drills remain required. |

No independent penetration-test or certification conclusion is implied. P0 exit is **not satisfied** while high-impact controls remain unapproved or unverified. See [release gate](RELEASE_GATE.md).
