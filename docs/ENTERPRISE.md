# Enterprise guide

For the person setting NOSHASHI up inside an institution, and for the
person approving it. Everything here is read from the code as of
2026-09-30. Where the price list promises something the code does not do
yet, this guide says so. [PROCUREMENT.md](PROCUREMENT.md) has the
IMPLEMENTED / PARTIAL / PLANNED view for a vendor-risk review.

## What the paid organization tiers add

The tiers and their entitlement flags are defined once in
`src/lib/billing/catalog.ts`. The Stripe webhook grants the same flags
(`entitlement-parity.test.ts`), and the server checks them with
`noshashi.org_has_feature`.

| Tier | Monthly | Purchase | In short |
|---|---|---|---|
| Institutional | $4,000 ($40,000 a year) | Contact sales; Stripe price exists | Organization with unlimited seats, shared policies and exceptions under four-eyes control, append-only audit log, Compliance API keys and webhooks, examiner seats, white-label |
| Enterprise | $10,000 ($100,000 a year) | Contract, invoiced per deal (no Stripe price) | Everything in Institutional, plus deposit and withdrawal screening, forensic trace and cluster mapping, the embeddable screening widget, market surveillance, customer protection |
| Strategic Infrastructure | $20,850 ($208,500 a year) | Contract, invoiced per deal (no Stripe price) | Everything in Enterprise, plus XRPL event feeds, custom export schemas and retention, Security Guardian alerts, phishing feed |

### Promised but not built

These appear in the price list or the entitlement flags. None of them is
backed by code today. Do not sign a contract that relies on them without
the work below.

| Item | Where it is promised | What exists | What it would take |
|---|---|---|---|
| 99.9% uptime SLA with service credits | Institutional features, pricing page | Nothing. No MSA has been signed. The server runs on the Supabase **Free** plan with nightly backups and no point-in-time recovery ([DISASTER_RECOVERY.md](DISASTER_RECOVERY.md)) | Supabase Pro (daily managed backups, PITR add-on), status monitoring with alerting, and an on-call arrangement, before an SLA is signed |
| SSO (SAML / OIDC) | `sso` flag on Institutional and above | Nothing reads the flag. Sign-in is email and password with TOTP | Supabase SSO (a paid Supabase feature) and an organization-to-identity-provider mapping |
| Dedicated environment | Enterprise features | Nothing reads the `dedicated_environment` flag. Every customer uses the shared project | A separate Supabase project per contract, provisioned by hand from `supabase/migrations` and `supabase/functions` (see [DEPLOYMENT.md](DEPLOYMENT.md)), and an app build pointing at it |

## Setting up an organization

1. **Every person needs their own NOSHASHI account.** Accounts are never
   shared, and NOSHASHI never asks for anyone's XRPL keys.
2. **Create the organization** in the app (POLICY tab, CREATE ORGANIZATION beside GOVERNED BY). Its
   creator becomes the owner.
3. **Add members** (POLICY › MEMBERS). An owner or admin enters each
   person's account email and a role. The server refuses unknown emails,
   refuses to demote the last owner, and never adds a regulator this way.
4. **Grant examiner seats** (POLICY › MEMBERS › REGULATOR SEATS) for 7, 30,
   90 or 180 days. The seat ends on its date without anyone acting, and
   every visit the examiner makes is recorded.
5. **Set the brand** (owner or admin): display name and accent colour on
   the console header and on exported reports.
6. **Write the first policy.** Draft, simulate it against past verdicts,
   submit it, and have a **different** person activate it. From then on,
   every verdict the organization records carries that policy version's
   hash.

## Roles

Enforced by the database: row-level security, and security-definer
functions that re-check the role in the same transaction as the change.
The app only hides buttons the server would refuse.

| Role | Draft, simulate, submit | Activate (not own) | Request exception | Decide exception (not own) | Members | Audit log | Examiner seats |
|---|---|---|---|---|---|---|---|
| owner | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| compliance | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| reviewer | — | ✓ | — | ✓ | — | ✓ | — |
| risk | ✓ | — | ✓ | — | — | ✓ | — |
| analyst | ✓ | — | ✓ | — | — | — | — |
| auditor | — | — | — | — | — | ✓ | — |
| viewer | — | — | — | — | — | — | — |
| regulator (seat) | — | — | — | — | — | ✓ | — |

- **reviewer** is the second pair of eyes: it can only approve work
  someone else did, so the four-eyes rule holds by construction.
- **auditor** is an internal read-only seat. Unlike the regulator seat, it
  is not time-limited and needs no plan feature.
- The generated role table in the in-app docs (`src/lib/docs/reference.ts`)
  is built from the same permission functions, so it cannot drift from the
  app.

## Controls an examiner will ask about

| Control | How it works | Where |
|---|---|---|
| Four-eyes on policy | Author ≠ activator, enforced by constraint and trigger | `noshashi.org_policies`, `activate_org_policy` |
| Four-eyes on exceptions | Requester ≠ decider; every approval expires (1–365 days) | `noshashi.policy_exceptions`, `decide_policy_exception` |
| Append-only audit log | UPDATE, DELETE and TRUNCATE revoked from every role, and refused by a trigger | `noshashi.audit_log` |
| Sign-in record | Every new session is written to the organization's audit log (time, IP, client, one or two factors). Recording can fail but can never block a sign-in | Trigger `noshashi_record_sign_in` on `auth.sessions`; POLICY › GOVERNANCE AUDIT TRAIL › SIGN-INS |
| Evidence | Each verdict has a SHA-256 receipt over canonical JSON, the ledger index read, and the policy hash. It can be re-verified and replayed at its ledger | [EVIDENCE.md](EVIDENCE.md) |
| AI boundary | The assistant explains and cites; the deterministic engine decides | [AI_GOVERNANCE.md](AI_GOVERNANCE.md) |

## Integrating

- **Compliance API**: base URL
  `https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-verify`,
  Bearer `nsh_live_…` key issued in the app (shown once, stored as a
  SHA-256 digest). Quick start, errors and idempotency are in
  [API.md](API.md) §11.
- **Webhooks**: HMAC-SHA256 with a per-endpoint secret and a timestamp;
  verification code in [API.md](API.md) §8.
- **Event feeds** (Strategic): watched accounts read every minute, signed
  webhooks, JSON and NDJSON history.

## Support and change

- Releases: signed updater manifests and SHA-256 checksums on every
  GitHub release; the app checks for updates and verifies the signature
  before installing. Desktop code signing (Apple, Windows) is on hold.
- Incidents: [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).
- Recovery: [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).
- Deployment of each surface: [DEPLOYMENT.md](DEPLOYMENT.md).
