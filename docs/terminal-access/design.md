# Cloud Terminal account access — audit and design

Base: Cloud Terminal PR #170 (`6a77c2a`), independent stacked branch. Existing production website, native builds, billing prices and live infrastructure remain unchanged.

## Repository evidence

The canonical catalog uses operator=Free, desk=Pro, institution=Institutional, then enterprise/strategic. Pro is self-service; Institutional and higher are contact-sales. Supabase Auth already provides password screening, email codes and TOTP. Existing billing mirrors live Stripe lifecycle/invoice events into `noshashi.entitlements` and `subscriptions`, and verified refund/dispute/fraud events create unresolved billing holds. Those protected server records, not browser metadata or a checkout return URL, must authorize access.

The public terminal currently offers issuer/payment reads and hash-bearing JSON. Existing public tools remain free. The new protected features are an account's private evidence archive (Pro+) and organization-scoped shared evidence (Institutional+ with membership, explicit contract assignment and write-role checks). No SSO, SLA, certification, key handling or execution feature is invented.

## Boundaries

- Reuse the existing Supabase Auth provider and public project configuration in a bundled browser account window, including MFA. No service-role or Stripe key enters the browser.
- New Edge function validates the actual session remotely, enforces MFA, resolves fresh access through server-only SQL and rechecks authorization inside every storage operation. Browser tier flags only affect presentation.
- Pro requires a current paid subscription and unexpired matching entitlement with no unresolved billing hold. Trials/incomplete/past-due/unpaid/expired records do not create paid access.
- Higher tiers require an explicit, signed, approved, currently paid contract assignment for that account and selected scope. An assigned organization contract includes personal Pro features; shared evidence still requires the exact licensed organization. Organization membership alone never grants a paid seat. Contract assignments are service-role-only; no self-upgrade endpoint, founder-email exception or local override is added.
- Paid case storage contains newly retrieved public XRPL evidence, not uploaded client reports, confidential documents or signing material. Source/hash validation happens server-side. Private rows and RPCs are inaccessible directly to anonymous/authenticated database roles.
- Same-account/organization scopes are checked on each operation. Account/scope changes clear private UI and abort/ignore outstanding responses. Saved records are historical evidence, not current/live assertions.
- Billing/contract provisioning, migration, Edge deployment and production publishing remain owner-controlled. Missing backend configuration fails closed while the public demo remains usable.

## Validation

Test guest/Free/Pro/Institutional boundaries, forged tier/account inputs, expired and failed billing, contract expiry/revocation, missing membership and viewer restrictions, direct database access, MFA refusal, account-switch races and stale responses. Use local fixtures/scratch databases; do not charge, provision real access or mutate production credentials.
