# Remaining limitations and ownership

All new hardening is draft-only. A passing fixture test is not proof of complete production readiness.

| Unfinished item | Responsible role | Next action / verification | Blocking dependency |
|---|---|---|---|
| Deploy reviewed governance/evidence fixes | Founder + security/database engineer | Approve exact PR/migration, stage, run real Auth/RLS denial and rollback checks | Explicit production approval; staging snapshot |
| Billing failure/replay/lifecycle assurance | Billing engineer + founder | Review fulfillment patch, test retries/out-of-order/refund/dispute reconciliation in sandbox | Dedicated sandbox and approved rollout plan; no live price changes |
| Full production authorization catalog | Security engineer | Audit every table/RPC/export/support route and provider revocation | Non-production tenant fixtures and reviewed infrastructure access |
| Mandatory enterprise MFA / reauthentication | Identity owner | Agree enrollment/freshness/offboarding and run actual provider E2E | Owner policy and staging identity setup |
| OIDC/SAML / SCIM | Identity engineer | OIDC-first design and test IdP; SAML only if required | Buyer requirements and approved provider configuration |
| Native compile/device/security validation | Desktop engineer + QA | Build exact commit and test signed artifacts/keyring/IPC/export on real devices | Rust/platform toolchains, actual Macs/Windows/Linux |
| Signing and notarization | Release owner | Configure approved credentials privately; verify actual artifacts | Apple Developer ID, owner secret setup, notarization service |
| Backup restore | Operations owner | Repair client setup and run isolated restore/application drill | Approved scratch environment and private backup/passphrase access |
| Production performance / concurrency | Performance engineer | Load isolated deployed API, organization queries, ingestion, exports and desktop startup; record p50/p95/p99/error/resource data | Realistic workload and staging capacity; local compute is not a fleet baseline |
| Observability / on-call | Operations owner | Test redacted alert delivery, escalation and incident drill | Approved alert route and named operational owner |
| Secret history/native dependencies | Security engineer | Add full history/provider scanning and Rust advisory/license review | Approved tooling/toolchains; focused current-tree scan is narrower |
| Retention / deletion / legal terms | Founder + legal/privacy | Agree data classes, retention, export/deletion and pilot terms | Qualified legal review and buyer jurisdictions |
| Independent assessment / SOC 2 | Founder + assessor | Scope assessment and operational evidence period | Qualified assessor and separate owner approval/budget |
| Customer pilot acceptance | Founder + evaluator | Sign off scope, success criteria, support, limitations and data handling | Customer agreement and release gates |

No production secret was rotated, no real subscription/price was modified, no customer was contacted and no release was published by the hardening work. PR #176's separately approved deployment is recorded independently.
