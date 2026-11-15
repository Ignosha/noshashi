# NOSHASHI checkout verification — 2026-11-15

**Result: hosted Stripe sandbox payment and entitlement lifecycle passed. No real money was charged. Production settings and paid access were not modified.**

## Executed flow

- Disposable, confirmed local Auth user signed in through real GoTrue; no manually fabricated user session.
- Original NOSHASHI checkout, webhook and terminal handlers ran on loopback against PostgreSQL 16 and PostgREST, using the repository schema baseline and the actual payment-review, terminal and membership-expiry migrations. Minimal Auth role/schema configuration and the existing membership expiry column were supplied by the test harness.
- Edge entry points were copied with local listening ports. The production gateway and production database were not part of this test.
- An isolated official claimable Stripe sandbox supplied a restricted `rkcs_test_` credential and a test-only USD 749/month recurring price. All Stripe payment resources verified `livemode: false`.
- Authenticated checkout creation succeeded. Repeating the same request returned the same hosted URL.
- Stripe-hosted Checkout was completed in Chromium using Stripe's documented 4242 test card. Optional Link enrollment was disabled. Final provider status: `complete`, `paid`, USD 749.00.
- Genuine Stripe CLI-forwarded signed `checkout.session.completed`, `customer.subscription.created`, and `invoice.paid` events returned HTTP 200. The subscription became active in the local database. No manual paid grant was inserted.
- Terminal access changed from Free to Pro (`desk`, source `subscription`). Personal archive GET changed from HTTP 403 to HTTP 200. Team archive remained HTTP 403 even for an organization owner without an Institutional contract.
- Compiled NOSHASHI portal displayed **Pro / 0 OF 5,000 RECORDS**, with the 25-row batch limit.
- The test subscription was canceled through Stripe. Its genuine signed deletion event returned access to Free; personal archive again returned HTTP 403. No sandbox renewal remains.
- Unsigned webhook requests returned HTTP 400.

## Discovered fix

The checkout credential guard rejected Stripe's valid restricted claimable-sandbox key prefix. A separate branch adds explicit `rkcs_test_` recognition while retaining test/live Price checks. Unknown prefixes, publishable keys, live claimable keys, and surrounding whitespace remain rejected. No live price or secret changed.

## Automated verification

54 tests passed across payment-review-key-mode, payment-review-billing, payment-review, and terminal-access. Deno check of billing.ts passed. Portal build passed. git diff --check passed. Existing Vite CommonJS/native-loader warnings remain.

## Limits and setup notes

This verifies a sandbox hosted payment with a local instance of the production business handlers, not an actual production charge or a production signed-in account. Linux headless Chromium was tested; no Safari, Windows, physical Mac, mobile, or real-card/SCA testing was performed. Annual checkout, tax registration, refunds, disputes, portal subscription editing, and live renewals were not exercised. The minimal local portal omitted unrelated assets/fonts and reported local asset 404s; the account and billing UI rendered. Early hosted-browser attempts stalled while frame automation was being corrected; success was accepted only after Stripe reported paid and signed events changed access.

Production price IDs, keys, authorization rules, billing logic and deployments were untouched. Tax configuration and registration were not changed or validated by this test. Do not interpret the sandbox payment as revenue.

Screenshots: checkout-ready.png, portal-after-payment.png. Detailed JSON and private logs are stored outside Git. Private credentials, sessions and checkout URLs must not be committed or shared publicly.
