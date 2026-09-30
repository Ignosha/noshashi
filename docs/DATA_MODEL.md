# Data model

Last reviewed 2026-09-29 against the live database (Supabase project
`xiurbiwuwcfowqnpmwki`, schema `noshashi`, Postgres 17) and the app's local
store. It covers what is stored, where, who can read it, and how long it is
kept.

## Where data lives

| Place | What | Protection |
|---|---|---|
| **The operator's device** | Recorded verdicts and receipts (up to 10,000 entries), local policies and versions, local cases, AI use record (digests and sizes, not text; up to 2,000 rows), settings | `tauri-plugin-store` file `noshashi.settings.json` in the app's data folder; OS account protection only (not separately encrypted) |
| **OS keychain** | Hosted-model API keys the operator adds | Read only by Rust (`model_request`); the web view never receives them |
| **Supabase Postgres** | Accounts, organizations and roles, shared policies, exceptions, cases, audit log, API keys (hashed), webhooks, monitoring, support tickets | TLS; row-level security on every table; managed encryption at rest |
| **XRP Ledger** | The facts being judged | Public; read-only; never written by NOSHASHI |
| **Stripe** | Payment details and subscriptions | NOSHASHI stores the Stripe customer and subscription ids and the resulting entitlement, never card data |

## Server tables (`noshashi` schema)

Every table has row-level security enabled. Tables with no policies (marked
*service only*) can be read and written only by service-role code (Edge
Functions and security-definer functions); a client key sees nothing.

### Identity and organizations

| Table | Holds | Access |
|---|---|---|
| `accounts` | One row per signed-in user (linked to `auth.users`) | The user |
| `organizations` | Name, slug. The billing and evidence boundary | Members |
| `organization_members` | (organization, account, role, invited_by) | Members; changes by owner/admin through functions |
| `password_screens` | SHA-256 of the bcrypt hash of a password screened clean, never the password | Service only |

Roles (`noshashi.member_role`): `owner`, `admin`, `compliance`, `reviewer`
(activates and decides what someone else wrote or requested; drafts
nothing), `risk`, `analyst`, `auditor` (internal read-only, including the
audit log), `viewer`, `api`, `regulator` (time-limited read-only examiner
seat).

### Governance

| Table | Holds | Notes |
|---|---|---|
| `org_policies` | Versioned institutional policies: params, canonical hash, status `draft → pending → active → archived`, author, activator | Only drafts change. Activation is server-side and four-eyes (author ≠ activator, enforced by constraint and trigger) |
| `policy_exceptions` | An exception against a receipt digest: reason, requester, decider, status, `expires_at` | Requester ≠ decider (constraint). Approvals carry an expiry (1–365 days) |
| `policy_exception_notes` | Notes and evidence requests on an exception | Append-only through functions |
| `org_cases`, `org_case_events` | Shared investigations; events are a hash chain (`hash = SHA-256(body)`, body includes `seq` and `prev`) | Append-only log |
| `audit_log` | actor, action, entity, previous and new state, request id, time | **Append-only**: UPDATE, DELETE and TRUNCATE revoked from every role and refused by a trigger |

### Compliance API and integrations

| Table | Holds |
|---|---|
| `api_keys` | Key hash, prefix, organization, tier, lifecycle; the secret is shown once and never stored |
| `api_rate_windows` | Per-key rate-limit windows (service only) |
| `verification_events`, `receipts` | Server-side verification results |
| `org_webhooks`, `webhook_deliveries` | Endpoints (with per-endpoint signing secret) and signed delivery attempts |
| `org_embeds`, `org_embed_usage` | Embeddable screening widget and its usage |
| `org_export_schemas` | Custom export shapes |
| `entitlements`, `subscriptions` | What an organization has paid for, written only by the verified Stripe webhook |

### Monitoring and threat data

| Table | Holds |
|---|---|
| `xrpl_watches`, `xrpl_events` | Watched accounts and deposit addresses; events read from the ledger |
| `sanctioned_addresses`, `sanctions_refreshes` | XRP addresses from the OFAC SDN list, refreshed daily |
| `phishing_scans`, `phishing_sightings`, `threat_reports` | Dust-with-link lures and a shared scam registry |
| `ledger_credentials`, `ledger_domains`, `ledger_registry_sweeps` | Directory of XLS-70 credentials and permissioned domains read from mainnet (service only) |
| `protection_programs`, `protection_liabilities`, `protection_attestations` | Customer asset protection: reserves, liabilities Merkle root, attestations |
| `alerts`, `portfolios`, `portfolio_wallets` | User alerts and saved wallets |

### Support

`support_tickets`, `support_messages`, `support_notifications` (service
only), `support_staff`, `support_staff_invites` (owner-managed in SQL only).

## Personal data

| Data | Where | Why |
|---|---|---|
| Email address | `auth.users`, `accounts` | Sign-in, organization membership, support replies |
| Password | Supabase Auth (bcrypt) | Sign-in. NOSHASHI's screen stores only a hash of the hash |
| TOTP secret | Supabase Auth | Second factor |
| IP address, sign-in events | Supabase Auth audit trail; and, for members of an organization, `audit_log` rows `member.signed_in` (IP, client identifier cut to 200 characters, assurance level) | Security; the organization's record of who accessed it |
| Support conversations | `support_*` | Support |
| XRPL addresses the operator enters | Device store; server only when shared into an organization (cases, watches, exceptions) | The analysis itself |

XRPL addresses are public identifiers; an institution may still treat its
own client addresses as confidential, which is why they stay on the device
unless someone shares them into the organization.

The published Privacy Policy (<https://www.noshashi.app/legal/>) is the
binding statement; this table describes the implementation behind it.

## Retention

| Data | Kept |
|---|---|
| Device verdicts | Newest 10,000 entries per device; older ones drop off |
| AI use record | Newest 2,000 rows per device |
| `xrpl_events`, phishing data | Swept daily by `noshashi-xrpl-retention` / `noshashi-phishing-retention`; Strategic plans set their own event retention |
| `audit_log`, `org_case_events` | Kept; cannot be edited or deleted by any role. Deleting an account blanks its name on these rows (ON DELETE SET NULL); sign-in rows keep their IP and client |
| Accounts | Until deletion is requested |

## Backups

Nightly encrypted `pg_dump` of the `noshashi`, `public` and `auth` schemas
by `.github/workflows/db-backup.yml`. See
[DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) for its current state.
