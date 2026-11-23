# NOSHASHI LABS — release and paid-pilot go/no-go register

**Status:** NOT PRODUCTION READY. This is an evidence register, not a certification or marketing claim. Last updated 2026-11-23. The draft PR remains unmerged.

## Verified from branch CI and source review

- GitHub CI for commit `8c8ad7e` completed successfully: verify, SQL, and Continuity jobs. Intel macOS native build was skipped on this branch. A green workflow does not prove production readiness.
- Pinned XRPL AccountRoot live diagnostic has produced two corroborating public-RPC observations in CI. This is not independent cryptographic consensus verification.
- Pinned RippleState trust-line parser, fixed-provider adapter, fail-closed case composition and mocked regression tests exist. No successful live trust-line fixture has been demonstrated.
- Payment control review remains read-only and returns HOLD; it does not authorize transfers.
- Premium pricing in `docs/commercial/premium-institutional-packaging-proposal.md` is a proposal, not published pricing or validated demand.

## Release blockers and acceptance evidence

| Priority | Gate | Current evidence | Pass condition |
| --- | --- | --- | --- |
| P0 | Live RippleState compatibility | Mocked tests and opt-in diagnostic only | Capture known valid mainnet issuer/holder/currency and validated hash; both fixed RPC providers return compatible pinned observations; preserve sanitized diagnostics and reproducible test |
| P0 | Evidence integrity | Two RPC agreement; no independently authenticated ledger proof | Clearly state evidence assurance level; verify provenance, identity, ledger index/hash, missing and disagreement handling, and threat model |
| P0 | Access control and tenant isolation | Not audited in this register | Threat-model and test every API, DB RLS, role boundary, service credential and cross-tenant access |
| P0 | Four-eyes and policy enforcement | Not audited in this register | Independent actor separation, deny-by-default permissions, approval replay/race tests, tamper-resistant history, negative cases |
| P0 | Data protection and secrets | Not audited in this register | Secrets inventory and rotation, logging redaction, retention/deletion, encryption, incident procedures |
| P0 | Production deployment and rollback | Not verified in this register | Staging deployment, migration dry run, rollback rehearsal, health checks, owner signoff |
| P0 | Customer-facing claims | Premium tiers are proposed | Contractually scoped deliverables, accurate limitations, no unsupported security certification or live fraud prevention promises |
| P1 | Monitoring and SLAs | Not verified | Defined SLOs, alerts, on-call coverage, outage communication, measured recovery |
| P1 | macOS desktop distribution | Intel native CI skipped on this branch | Native target tests, signing/notarization where required, clean install/upgrade/uninstall and physical device validation |
| P1 | Performance and resilience | Not verified | Load/soak tests, rate limits, provider outage and retry behavior, cost envelope |
| P1 | Security assessment | Not verified | Dependency/license review, independent penetration test, remediation and retest |

## Outreach readiness: permitted vs prohibited

**May begin today:** honest discovery calls and invitations to evaluate a *scoped read-only pilot*, explicitly describing that production-readiness validation is in progress. Obtain consent and agree on acceptance criteria before a paid contract.

**Do not claim yet:** production-ready compliance controls, guaranteed fraud prevention, certified security, independently authenticated ledger consensus, or contractual enterprise SLAs. Do not accept live customer funds or production signing authority on the strength of mocked tests.

## Immediate owner decisions

1. Identify a real publicly verifiable RippleState fixture, preserving its source and historical ledger hash; run `node scripts/xrpl-trustline-live-diagnostic.mjs` with all four required environment variables in a controlled environment.
2. Decide the first narrow institutional pilot workflow and customer data-handling boundary.
3. Review whether outreach should describe a design-partner pilot rather than a production subscription.
4. Assign named owners to P0 gates and require documented evidence for every status change.

**No automatic merge, deploy, billing activation, or public pricing publication is authorized by this register.**
