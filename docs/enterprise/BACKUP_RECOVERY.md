# Backup and recovery

Source procedures: [existing disaster recovery](../DISASTER_RECOVERY.md), [backup workflow](../../.github/workflows/db-backup.yml), [restore workflow](../../.github/workflows/db-restore-test.yml).

Verified metadata on 2026-11-15:

- Latest database backup run: [successful 2026-11-15](https://github.com/Ignosha/noshashi/actions/runs/43712747035).
- Latest restore-test run: [failed 2026-11-02](https://github.com/Ignosha/noshashi/actions/runs/41473316627). Job metadata shows failure at **Install Postgres 17 client**; download, decrypt/restore and comparison steps were skipped. This is a recovery-verification blocker, not evidence of corrupted backups.
- No customer backup or plaintext database dump was downloaded during this audit. A successful workflow status is not independent proof of decryptability or complete application recovery.

Owner-approved recovery drill:

1. Confirm backup encryption ownership, separately recoverable passphrase, expiry/retention and access permissions. Do not publish dump contents or passphrases.
2. Create a disposable isolated target matching the source PostgreSQL major version; prevent cron/webhooks/mail/customer integrations from running.
3. Decrypt only inside the approved private environment. Restore schema, ownership/grants and required platform dependencies under a reviewed plan. Plain PostgreSQL extension failures must be recorded, not treated as a complete Supabase restore.
4. Compare structural integrity and scoped checks privately: expected tables/indexes/RLS/RPCs, Auth/provider configuration, approved fixture counts/digests and account/tier boundaries. Do not print real rows in public Actions logs.
5. Exercise read-only evidence, tenant denial, policy/exception four-eyes, new login and billing reconciliation using dedicated test records. Never connect a restored system to live billing or notification endpoints by default.
6. Measure actual recovery time/data loss against the chosen backup timestamp. Existing RTO/RPO values remain proposed targets until demonstrated and accepted.
7. Record owner acceptance, failed steps and remediation. Delete plaintext scratch data according to the approved plan and verify cleanup.

Database backups do not automatically recover hosted Auth settings, secret vaults, signing keys, DNS, Vercel/Cloudflare configuration, Stripe event destinations or desktop-local records. Inventory and protect those separately. A restore-setup repair can be prepared as a draft, but this task does not authorize a live restore or production failover.
