# Terminal paid access: review and rollout

**Not deployed.** Stacked on Cloud Terminal PR #170. Public tools and desktop billing/authentication remain unchanged. Owner approval is needed before applying migrations or deploying the Edge function/site.

## What a learner/customer sees

Open `/terminal/` → Account (or type `account`). Reuse your existing NOSHASHI email/password, email code and enrolled authenticator. Create-account and billing links lead to the existing developer portal. Never type passwords or tokens into the CLI.

| Account access | Public issuer/payment research | Personal historical evidence archive | Organization archive |
| --- | --- | --- | --- |
| Signed out / Free | Yes | Locked | Locked |
| Active paid Pro | Yes | Yes | Locked |
| Assigned active paid Institutional+ contract | Yes | Yes | Exact licensed organization only |

An institution's membership does not automatically license every member. Each signed-in user needs their own paid contract assignment. Organization writers: owner/admin/analyst/compliance/risk. Viewer and other roles read only; only owner/admin delete shared cases. No SSO, institutional policy engine, SLA or other enterprise feature is added or claimed here. This milestone gates the new archives, not every legacy public route or desktop capability.

## Sources of authority

- Existing Supabase Auth verifies the session and MFA remotely for every private request. No new authentication provider or password store.
- Pro requires a matching **active** Stripe subscription mirror and unexpired entitlement/current period, with no unresolved billing hold. Trials do not qualify. Cancellation at period end retains paid access until that date.
- Higher tiers require a service-role-provisioned `terminal_contract_access` row with verified account, approved contract reference, approving owner identity, signed date, valid interval and paid-through date. An organization assignment requires current membership and includes personal Pro access. Shared actions require the exact selected organization.
- Provision only after an authenticated owner verifies the executed contract/payment and account identity. Use existing owner operations, never an email request or browser metadata. Revoke/shorten paid-through when contract/payment changes. If paid through Stripe, record the verified customer ID so existing refund/dispute holds block access. Offline contract payment reconciliation remains an owner task.
- Stripe webhooks, not a checkout success URL, maintain subscription access. Access is as current as those verified webhook records; delayed/missing events need reconciliation. This change does not create products, prices, trials, checkout endpoints, billing discounts or charges. Existing Stripe Tax/registration configuration is unchanged; review it before altering sales/checkout setup.

## Owner-controlled staging sequence

1. Review PR #170 and this stacked access PR. Keep branch auto-deployment disabled (`vercel.json`).
2. Run existing typecheck/tests and `deno check` in `supabase/functions`. Run `scripts/test-sql.sh` against a **local disposable** Postgres server; the migration/test files are additive. No production data is needed.
3. In an owner-approved staging Supabase project, apply prerequisites and `20261114150000_terminal_account_access.sql`, then deploy `noshashi-terminal`. It needs existing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Keep JWT verification enabled; the function also validates with `auth.getUser`. Never place service credentials in a Vite variable or browser.
4. Confirm schema `noshashi` is exposed for service-role RPCs (already used by existing private tools). Anonymous/authenticated roles must have **no** direct table or RPC privileges for these new resources. Refresh schema cache if required.
5. Build the account bundle with staging public Supabase configuration, then `npm run site:build`. Preserve the approved release catalog during restricted/offline builds; the existing site generator refreshes release metadata and can otherwise emit unavailable states. No new Vercel function slot is required.
6. Use staging test accounts and Stripe **test** fixtures to exercise password/OTP/TOTP, active/expired Pro, cancellation, refunds/holds, contract expiry/revocation, organization assignment, read-only roles and removal of membership. Check two tabs, account switching and late requests. No real OTP, charge or contract grant was exercised by local fixture tests.
7. Only after owner acceptance publish backend and site together. Missing backend/migration errors keep paid actions locked while public tools remain usable. No manual access has been granted to the founder or anyone else by this PR.

## Data, usage and recovery

Cases contain a fresh server-fetched public XRPL report, retrieval timestamp, sources and limitations. The browser cannot upload a fabricated report. The server only calls fixed read-only mainnet methods/endpoints; incomplete/unvalidated/stale issuer results cannot be saved. Records are historical, not monitoring or independent consensus proofs. SHA-256 uses recursively key-sorted JSON (array order retained), **not a digital signature**. JSONB may reorder keys without changing that canonical digest.

Both failed and successful new save attempts consume the six-per-account/minute public-node budget, enforced in SQL before the read. Two bounded node attempts; 12 seconds per endpoint; body size caps. Idempotency keys return an existing case without another node read; uncertain client saves retain the request key in memory until a successful save or input/scope/account change. A page reload loses that in-memory key; check the archive before repeating an uncertain save after reload. Writes recheck entitlement inside the final SQL transaction. Personal archives cap at 100, shared at 500, with latest 30 listed. These are beta protection limits, not new billing promises. Old attempt rows are pruned per active account on the next attempt; operational maintenance may delete older rows for inactive accounts.

No attachments, confidential customer notes, wallet keys or payment credentials are accepted. Treat public transaction identifiers as potentially sensitive links to activity. Platform/provider request logging follows existing infrastructure; this is not a zero-logging claim. Unpaid accounts lose archive access; owner-assisted data retrieval/deletion remains available through the existing contact process. Do not delete case tables to roll back the UI. Disable the new function/roll back the site while preserving stored cases and contract records, then reconcile any uncertain save with its request key.

## Verification scope

See `validation.md`. Local browser fixtures prove UI transitions; isolated database tests prove SQL authorization; Deno verifies runtime imports/types. Production/staging provider configuration, real Stripe event delivery, real-account sign-in and live node availability require the owner-controlled staging check. Physical Mac/Windows/Safari were not tested for this browser-only feature.
