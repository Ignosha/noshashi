# Enterprise release gate

Engineering decision: 2026-11-15. No percentage score. Code completion, a successful build or a sandbox payment is not certification or enterprise production acceptance.

Outcomes: **GO** means every required gate for the stated scope is verified; **CONDITIONAL GO** means a precisely bounded evaluation with named, explicitly accepted limitations; **NO-GO** means a critical required control or verification remains unresolved.

| Gate | Current outcome | Evidence / acceptance requirement |
|---|---|---|
| Source/change control | CONDITIONAL GO | Main/PR history identified; hardening changes isolated in draft PRs. Owner review required before merge/deploy. |
| Privileged authentication | NO-GO | Draft enrolled-MFA/timeout tests pass; real provider policy/revocation and deployment acceptance still needed. |
| Authorization / tenant boundaries | CONDITIONAL GO | Scoped SQL/HTTP denial tests; complete deployed boundary and exports review remains open. |
| Policy/evidence integrity | NO-GO | Current/scoped approval patch and tamper/replay/concurrency/rollback checks must be approved, staged and accepted. |
| Billing correctness | NO-GO | Hosted sandbox happy path verified; failure/replay/lifecycle validation and rollout remain separately reviewed. |
| XRPL data correctness | CONDITIONAL GO | Recorded-data parity and failure states; live network reliability and operational coverage still require validation. |
| Reliability / performance | NO-GO | Local deterministic compute measurement is not deployed API/fleet load, startup or SLA evidence. |
| Desktop signing / notarization | NO-GO for enterprise desktop distribution | Actual signed/notarized artifact, updater validation and Gatekeeper evidence required. |
| Supported hardware | NO-GO for untested devices | Physical Intel Monterey and other promised platforms must be tested. |
| Backup/recovery | NO-GO | Latest backup successful; latest restore stopped at client setup. Successful isolated recovery and measured objectives required. |
| Operational ownership | NO-GO | Named support/security escalation owner, tested alerts and incident/rollback drill required. |
| Documentation/legal | CONDITIONAL GO | Truthful engineering/security/pilot documents prepared; customer-specific legal and data acceptance pending. |
| Pilot customer acceptance | NO-GO | No institution has accepted this scope, criteria or limitations through this work. |

**Paid pilot launch decision: NO-GO today.** A CONDITIONAL GO may be issued only by the owner for a named, read-only, narrowly scoped evaluation after all scope-critical controls are verified and its limitations/terms/support/data rules are accepted. The proposed $5,000 package is planning, not a billable product activation.

**Unrestricted enterprise production decision: NO-GO.** Critical security, full tenant-isolation assurance, required release integrity and operational recovery cannot be assumed. No certification, audit completion, SLA or legal compliance guarantee is claimed.

Release acceptance record must identify exact code/artifact versions, applied migrations, environment, approvers, test evidence, failed/skipped checks, accepted limitations and rollback plan. Reject approval if any critical requirement is UNKNOWN or merely present in UI/docs. Keep production credentials, customer records and exploit-sensitive evidence out of public PRs and logs.
