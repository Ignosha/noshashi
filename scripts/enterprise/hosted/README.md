# Hosted staging installation

These files prepare a synthetic-only Supabase staging database. They are not a
production deployment path. Do not change the pinned project reference to a live
project. All hosted operations require the owner's authorization and the provider's
confirmation when requested.

1. Verify the approved project ID/name using `get_project`; inspect its tables,
   migration history and Auth user count before writes.
2. Apply `bootstrap.sql` and insert the verified environment marker in the same
   migration. This requires an initially empty application database. It restricts
   Auth emails and pending email changes to reserved `.invalid` domains, creates a
   private/RLS-protected source-checksum ledger, and seeds an inert callback URL.
3. Apply `network-guard.sql`. Its probe must receive the exact staging-disabled
   error. No request is allowed into the pg_net outbound queue.
4. Build a private source manifest from the reviewed baseline and subsequent SQL
   files. Generate projected migrations using `project_sources.py`. The projection
   verifies each checksum, removes only paired outer transaction controls, and
   appends job deactivation, network-guard installation and a source-ledger insert.
   The whole submitted script uses one implicit transaction. Application schema,
   RLS, policy thresholds and authorization logic are retained from the sources.
5. Apply the projected files in order through `apply_migration`, checking the
   staging identity before each call. Read `noshashi_staging.applied_sources` before
   resuming an interrupted operation. A matching checksum means do not submit it
   again; a changed checksum requires review.
6. Confirm no active NOSHASHI schedules, no outbound requests, and both guards
   before inserting any fixture accounts or exposing the application schema.
7. Only then seed synthetic users and test tier boundaries, tenant isolation,
   evidence, policies, recovery and a bounded workload. Do not copy production
   users, sessions, keys, Stripe configuration or customer records.

Hosted Supabase does not allow a trigger on `cron.job` under this application's
role. This installer uses the supported `cron.alter_job(..., active := false)` API
inside each migration transaction. The staging owner can manually change jobs, so
verify inactive state at each maintenance checkpoint. The guard on pg_net's queue
is reinstalled in the same transaction after source migrations recreate pg_net.

The email trigger restricts recipients; it does not claim to reconfigure the hosted
Auth SMTP transport. No sender or Stripe webhook function is deployed by this
installer. Actual application dispatch functions require separately reviewed staging
configuration and must not receive live billing/email secrets.

## Provider confirmation failures

When Supabase returns `expired`, first reconcile the source ledger and migration
history. Only reopen the exact request when the provider explicitly directs it,
within a bounded retry. Repeated expiry is a provider-confirmation blocker. Stop
hosted writes and preserve the checkpoint; do not change tools or remove statements
to evade confirmation. Ask the owner to resolve the Supabase approval interaction.

## Local checks

`python3 scripts/enterprise/hosted/test_projection.py` checks SQL string/comment and
dollar-quote preservation, outer transaction handling, source checksums, and suffix
ordering. No credentials are required. This check does not prove hosted completion.
