# Hosted staging setup — partial checkpoint, 2026-11-16

The owner authorized a separate Free-plan staging project, then authorized synthetic
setup and testing. The unrelated staging project was paused with explicit approval
in order to free a project slot. Production was not modified.

## Verified hosted state

- The dedicated staging project is healthy on PostgreSQL 17.11.
- Five of the 42 reviewed source files are committed, including the baseline and
  organization/role tables. The source ledger holds their SHA-256 checksums.
- Active NOSHASHI jobs: 0. Pending outbound database requests: 0.
- The pg_net outbound guard and reserved-email guard are installed and enabled.
- Auth users: 0. No production data or credentials were copied.
- The next source is `20260921000500_audit_api_key_lifecycle.sql`.

The pending source did not commit after repeated Supabase migration confirmations
expired. Further hosted writes are paused pending resolution of that confirmation
interaction. This is not a SQL test failure or an automatic-approval rejection.
Do not replay committed source files or route DDL through another interface to avoid
provider confirmation.

## Code and local checks

The staging projection preserves the reviewed application SQL while ensuring job
activation and guard recreation complete within its transaction. A private source
manifest records original and projected checksums. The approved staging reference is pinned in the generator as a fail-closed target
guard; it is not a credential. Provisioning state, manifests and generated SQL remain
in the private workspace artifact directory.

Four Python unit tests pass for the projection's handling of quoted transaction
words, nested comments, transaction-pair rejection, checksum validation and ordering.
The integration branch contains the pending security, billing and recovery work from
PRs #177–#180. Review their dependencies and rerun combined checks before rollout.

## Not completed

Remaining schema installation, synthetic users, hosted tier/API checks, hosted
recovery and hosted load tests have not completed. Earlier isolated CI recovery tests
remain separate evidence for that environment. No new enterprise production-readiness
claim is made here. Desktop signing is excluded.

The private runtime checkpoint is authoritative only for this setup record; Supabase
project metadata and the database's source ledger must be read again before resuming.
See `scripts/enterprise/hosted/README.md` for the ordered setup and recovery rules.
