# Enterprise assurance register

Engineering audit and draft hardening, 2026-11-15. This is not certification, a penetration-test report, a contract or a production release approval. The Ledger Desk interface and live billing configuration are preserved.

| Document | Purpose |
|---|---|
| [Implementation summary](IMPLEMENTATION_SUMMARY.md) | Exact changes, integration order and required reviewers |
| [Readiness baseline](READINESS_BASELINE.md) | Evidence-linked capability inventory and PR history |
| [Security overview](SECURITY_OVERVIEW.md) | Real boundaries and assurance limits |
| [Access control](ACCESS_CONTROL.md) | Roles, service boundaries and offboarding |
| [Data handling](DATA_HANDLING.md) | Data classes, evidence, retention and deletion |
| [Threat model](THREAT_MODEL.md) | Assets, trust boundaries and residual threats |
| [Security findings](SECURITY_FINDINGS.md) | Sanitized severity/remediation register |
| [Incident response](INCIDENT_RESPONSE.md) | Ownership, containment and recovery |
| [Backup and recovery](BACKUP_RECOVERY.md) | Current workflow evidence and restore gates |
| [Security questionnaire](SECURITY_QUESTIONNAIRE.md) | Evidence-based procurement answers and SOC 2 gaps |
| [Identity plan](IDENTITY_PLAN.md) | OIDC-first integration requirements; no working SSO claim |
| [Pilot evaluation](PILOT_EVALUATION.md) | Proposed $5,000 evaluation scope and acceptance template |
| [Desktop report](DESKTOP_RELEASE_REPORT.md) | Published/build/signing/hardware distinctions |
| [Compute baseline](PERFORMANCE_BASELINE.md) | Reproducible synthetic policy/liquidity/export measurements |
| [Test evidence](TEST_EVIDENCE.md) | Executed checks, failures, skips and limits |
| [Known limitations](KNOWN_LIMITATIONS.md) | Role, next action, verification and dependencies |
| [Release gate](RELEASE_GATE.md) | Independent pilot and production decisions |

PR #176 is the only change merged/deployed under the owner's explicit instruction in this task. New enterprise hardening remains in draft review branches. No customer contact, live-price change, credential rotation or installer release is authorized by this register.
