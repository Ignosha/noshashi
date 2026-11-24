# NOSHASHI LABS — release and paid-pilot go/no-go register

**Decision: HOLD for production and paid pilots.** PR #209 remains unmerged. The [enterprise readiness report](enterprise-readiness-continuation.md) records the local evidence at `7669b60` and identifies the remaining founder decisions.

## Evidence available for review

- Historical GitHub CI at `8c8ad7e` passed verify, SQL, and Continuity. The native Intel macOS job was skipped at that revision. The compile-only Apple Silicon and Intel jobs at `7669b60` still need runner results.
- Two public XRPL providers corroborated pinned AccountRoot and RippleState fixtures. The fixtures establish provider agreement for those records. Local tests checked receipt and control attestations with an ephemeral key. Managed signing remains open.
- Disposable Auth and PostgreSQL tests exercised MFA, tenant isolation, four-eyes controls, and recovery. The application builds, JavaScript suites, SQL suites, and frozen Edge Function type checks passed locally.
- The read-only payment control review returns HOLD. Transfer authorization is outside its scope.
- Proposed tiers and fees are documented separately from the existing catalog. [Premium packaging proposal](premium-institutional-packaging-proposal.md)

## Release blockers and acceptance evidence

| Priority | Gate | Current evidence | Pass condition |
| --- | --- | --- | --- |
| P0 | Live RippleState compatibility | Both providers corroborated pinned mainnet fixtures, including issuer freeze, issuer deep freeze, and trust-line authorization | Verify the controls and asset types required by the pilot. Record provider disagreement and outage behavior. |
| P0 | Evidence integrity | Local verification of detached attestations and pinned ledger identity | Establish key custody, key rotation, and independent evidence assurance for the approved pilot. |
| P0 | Access control and tenant isolation | Disposable Auth, PostgREST, and database tests | Verify hosted onboarding, session recovery, role revocation, entitlement enforcement, and cross-tenant denial with dedicated test accounts. |
| P0 | Four-eyes and policy enforcement | Local decision, replay, role-revocation, MFA, and audit tests | Repeat the flow in the authorized hosted pilot and verify audit retention, identity binding, and actor separation. |
| P0 | Data protection and secrets | Hosted controls remain open | Inventory secrets and verify rotation, logging redaction, retention, deletion, encryption, and incident procedures. |
| P0 | Deployment and rollback | Disposable PostgreSQL dump and restore passed | Rehearse the migration, rollback, and health checks for the approved staging environment. Obtain release signoff. |
| P0 | Customer-facing claims | Premium tiers remain proposed | Agree on specific deliverables, evidence limits, and acceptance criteria before contracting. |
| P1 | Monitoring and SLAs | Hosted availability and recovery remain open | Define and measure SLOs, alerts, on-call coverage, outage communication, and recovery. |
| P1 | macOS desktop distribution | Compile-only jobs configured locally | Verify native builds at the approved revision and signed installer launch, browser handoff, update, and recovery on both supported architectures. |
| P1 | Performance and resilience | Loopback backpressure and disposable database recovery tested | Measure representative hosted load, shared quotas, provider outage behavior, and cost. |
| P1 | Security assessment | Local security regressions passed | Complete dependency and license review, independent security assessment, remediation, and retest. |

## Pilot authorization

Founder approval is required before contacting prospective collaborators, sharing partner data, agreeing to paid pilot terms, or activating billing. The [read-only integration profiles](../api/read-only-integration-profiles.md) can inform an approved evaluation. Scope acceptance criteria, fees, and data handling before onboarding.

Customer-facing statements should describe the tested read-only workflow and its evidence limits. Certification, consensus, fraud prevention, and enterprise SLA claims require independent support. Live funds and production signing authority are outside the proposed pilot scope.

## Immediate owner decisions

1. Authorize updating PR #209 for the native macOS validation checks.
2. Designate an isolated hosted pilot environment and authorize its test scope.
3. Approve access to test Macs and signing resources for installer validation.
4. Approve the proposed pilot scope, customer data boundary, fees, and any outreach.

Repository publication, deployment, merge, billing activation, public pricing, production credentials, and external outreach each require explicit approval.
