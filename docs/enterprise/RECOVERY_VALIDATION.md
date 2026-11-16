# Recovery tooling validation — 2026-11-15

## Evidence and scope

The existing monthly database restore workflow failed at PostgreSQL-client installation
(run 41473316627, 2026-11-02), before backup recovery. The backup workflow subsequently
succeeded (run 43712747035, 2026-11-15). Backup creation does not prove recovery.

This change removes the host PGDG installation dependency and uses PostgreSQL 17 tools
already present in the disposable target container. It retains the existing monthly and
manual triggers. No actual customer backup or production credential was accessed during
this implementation; the production restore workflow was not dispatched.

The strict restore entry point requires a labelled, network-isolated container, creates
a fresh database, retains ACLs and RLS, and fails on the first restore error. Passphrases
use a file descriptor, temporary files have private permissions and are cleaned on exit,
and raw database errors and data are withheld from public logs. No live database access
is needed for comparison. This replaces the former live row-count comparison; it verifies
snapshot objects, not parity with a changing live database. Ordinary role stubs do not
recreate Supabase platform services. Unsupported extensions or roles therefore block the
check rather than producing a misleading pass.

## Executed local checks

- `bash -n scripts/enterprise/*.sh` — exit 0.
- `NOSHASHI_TEST_PG_MAJOR=16 bash scripts/enterprise/test-encrypted-restore.sh noshashi-recovery-qa`
  — exit 0 against an isolated PostgreSQL 16 container with synthetic data only.
- Encrypted dump/decrypt/restore; wrong passphrase and altered ciphertext rejected.
- Recovered row counts and SHA-256 payload hashes, constraints and SQL function checked.
- Recovered grants deny writes; tenant RLS prevents cross-tenant reads.
- Invalid archive rejected. The exact workflow restore script also passes using synthetic
  application/auth schemas, without production services or customer records.

CI runs the same fixture against PostgreSQL 17; consult the PR checks for actual results.
No local macOS, Windows, desktop signing or physical-device validation is claimed.

## Owner rollout and unresolved work

1. Review and merge this draft independently of billing changes. No runtime deployment
   is included; merging activates the workflow changes on their existing schedule.
2. An operations owner must approve an actual encrypted-backup recovery run in an
   appropriately private environment and verify Supabase extensions, auth/storage,
   application authorization, representative reads and evidence exports end to end.
3. Keep raw restore diagnostics private. Missing extensions need a compatible recovery
   environment; do not ignore restore errors or strip grants to obtain a green result.
4. Measure actual backup age, recovery time and acceptable data loss, then approve RPO/RTO.
   This synthetic test establishes no production recovery objective or guarantee.
5. For a failed check, preserve the encrypted source artifact and last working production
   database; fix the target and rerun. Never restore over production as a test.

Unrestricted enterprise production readiness remains unverified. This change supplies
repeatable recovery evidence, not certification or proof of real disaster recovery.
