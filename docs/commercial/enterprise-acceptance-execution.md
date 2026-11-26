# Enterprise acceptance execution register

Status: HOLD. This is a test plan, not evidence of passing tests. No production access or deployment is authorized by this document.

## Preconditions
- Record exact commit SHA, environment identifier, owner, authorization, test window and rollback owner.
- Use an isolated non-production environment, synthetic tenant data and dedicated test identities. Never record credentials, tokens, recovery codes or private keys.
- Capture timestamped redacted evidence for each test. Mark PASS, FAIL, BLOCKED or NOT RUN; absence of evidence is not PASS.

| ID | Acceptance exercise | Required evidence |
| --- | --- | --- |
| AUTH-01 | Create two synthetic tenants; attempt cross-tenant reads and writes using each role, including direct API requests | Denials and unchanged target records |
| AUTH-02 | Exercise MFA, recovery, session expiration and role revocation | Unauthorized requests denied; audit actor matches authenticated identity |
| GOV-01 | Attempt self-approval, replay, stale policy and concurrent approval | No unauthorized approval; distinct actors and immutable policy reference |
| SIGN-01 | Use approved non-production managed signing key; verify valid receipt and reject tampered receipt, wrong key and revoked key under documented verification policy | Public verification evidence, key ID and rotation/revocation record; no private material |
| DATA-01 | Exercise redaction, retention, deletion and secret rotation with synthetic data | Redacted logs, deletion evidence, documented backup retention and rotation |
| OPS-01 | Rehearse backup restore and application rollback in isolated staging | Measured recovery time and data loss, integrity checks, rollback decision |
| OPS-02 | Simulate RPC outage/disagreement and representative load | UNKNOWN/HOLD on incomplete evidence, bounded resource use, measured latency and errors |
| MAC-01 | Compile Continuity and Ledger Desk on native Intel and ARM runners | Successful jobs at exact SHA, executable architecture and deployment target |
| MAC-02 | Verify signed/notarized installer launch, auth handoff, update and recovery on approved physical Macs including supported Monterey configuration | Device OS/architecture, signature/notarization checks and observed behavior |
| SEC-01 | Review dependency findings and conduct authorized independent security assessment | Findings, remediation, retest and signed risk acceptance |
| PILOT-01 | Review read-only workflow, evidence limitations, deliverables, data handling and acceptance with authorized customer | Approved scope and acceptance record; no production signing or live funds |

## Evidence record template
For every ID record: commit SHA; environment; tester; UTC time; expected result; actual result; redacted evidence link; status; defect reference; retest date; reviewer.

## Release decision
All applicable gates in [production readiness register](production-readiness-go-no-go.md) must be satisfied with reviewed evidence before changing HOLD. Native compilation alone does not establish physical compatibility or distribution readiness. Local security tests do not establish hosted security. An independent assessment cannot be replaced by self-attestation. No merge, deployment, billing, customer contact or production credentials without explicit approval.
