# Full platform validation and recovery rehearsal

This draft extends #179's synthetic PostgreSQL recovery check. It does not merge,
deploy, rotate secrets, change paid entitlements, access customer backups or perform
production load tests. Desktop signing is excluded.

## What the gate checks

`bash scripts/enterprise/test-platform.sh` creates a new temporary project using the
pinned official Supabase CLI 2.58.5. It starts real database, Auth and PostgREST services
on a dedicated Docker subnet with scoped firewall rules blocking new outbound connections. Repository environment files are not copied. No
owner credentials are required. Namespace collisions are refused before cleanup is armed.
Scheduled jobs are disabled before repository SQL is applied; runtime egress blocking
also prevents the stored production URLs in historical migrations from reaching a service.

The September 14 introspected baseline and every subsequent repository migration must
apply successfully. No failed migration is classified as an extension skip in this gate.
Existing transactional SQL tests run against this database and again following recovery.

The HTTP check uses real local Auth-issued JWTs and PostgREST:

- Two synthetic users, each owning a different organization.
- Own-tenant visibility and cross-tenant read/write isolation.
- Anonymous and invalid-token refusal.
- Refusal of a service-only terminal RPC by a signed-in ordinary user.
- Password sign-in and refresh-token refusal after logout. Access JWT expiry is separate;
  this test does not claim every existing access JWT is immediately invalid after logout.
- 240 bounded read requests with eight workers and response-content checks. Reports p50,
  p95, p99, throughput and errors. Two user identities are used, not eight distinct users.

The recovery rehearsal stops Auth/PostgREST writers, dumps the synthetic database,
encrypts the dump, removes the plaintext, decrypts it, removes the application schema,
and restores the full archive with grants retained and first-error failure. It compares
per-table counts and content digests for application/auth data before restarting services
and repeating the HTTP and SQL checks. No dump or raw service logs are uploaded. Only
aggregate synthetic benchmark JSON is retained for seven days.

## Running and failure handling

Requirements: a disposable Linux GitHub runner, Docker with sufficient disk for the Supabase images,
passwordless sudo for scoped iptables rules, the pinned CLI, Python 3 and GnuPG. CI is `.github/workflows/enterprise-platform-validation.yml` and runs
on relevant pull requests or manual invocation. It does not use repository secrets.
An existing stack in the reserved namespace causes refusal; do not remove someone else's
containers to make it run. The parent cleanup removes only its disposable stack, network and scoped firewall rules.
The original internal Docker network prevented CLI loopback health checks; the dedicated
subnet now allows those established connections while denying new runtime egress. An actual
outbound TCP probe must fail before repository migrations run.

A schema error fails the gate with the migration name. It must be investigated rather
than marked as a platform skip. Raw startup logs and local generated keys remain temporary
and are deleted. Production signing keys, billing and customer data never belong here.

## What remains outside this test

- Actual encrypted customer-backup recovery, including artifact selection, backup age,
  production extension versions, global-role reconstruction and hosted platform settings.
- Hosted identity-provider configuration, MFA enrollment/recovery and enabled password hooks.
- Production web/Edge deployment behavior, provider credentials and release rollout.
- Sustained capacity on the intended customer environment, large organizations, long-lived
  sessions, real XRPL upstream latency, geographic networks and independent security review.
- Physical desktop/hardware validation and desktop signing.

Synthetic success is evidence for the tested setup, not enterprise certification. No RPO,
RTO, uptime or production capacity target is promised by these measurements. An operations
owner must approve a private real-backup rehearsal against a compatible nonproduction
Supabase target and accept recovery results before lifting the corresponding release gate.
