# Payment Review developer portal

The browser portal at `/developers/portal/`, authenticated Edge Function
`noshashi-payment-review` and Node CLI share the existing payment verifier.
This is an implementation awaiting backend migration, function deployment and
configuration verification; a source change is not a production launch.

Public issuer, delivered-payment and book-health routes remain open. Accounts
are required for private batch workflows, saved runs, keys and usage. Free,
Pro and Institutional return the same complete evidence; their new processing
allowances are 25 / 5,000 / 100,000 rows per UTC calendar month. This allowance
is separate from existing Compliance API credits. No usage overage is billed.
Existing software plan names, prices and billing identifiers are unchanged.
The founder-led service pilot remains a proposal requiring agreed scope and price.

## Boundaries

- Reuses Supabase Auth, password screening and enrolled TOTP. No new auth system.
- Browser requests use the authenticated account JWT; keys have only
  `payment_review` scope, expire after 90 days and are terminally revocable.
- Account ownership is derived server-side, never from request-body account IDs.
- New storage tables have RLS enabled and no anon/authenticated table grants.
  Only the Edge Function service role can call quota/billing RPCs.
- A transaction appears only once per input batch. This service checks a supplied
  list; it does not allocate payments across runs or book a settlement. The
  existing single-payment booking endpoint remains separate.
- The existing exact-decimal verifier supplies rule version, source observations,
  ledger, findings and canonical receipt hashes. No new digital-signature claim.
- Two public-node readings remain trusted data sources, not independent ledger
  consensus verification. The transport is bounded at 6 seconds per source, one
  attempt, four concurrent rows, 25 maximum rows.
- Atomic reservations bind an account/request ID to the canonical invoice payload.
  Replays use the saved reading and no extra quota. Changed scope returns 409;
  processing reservations return 202. Node failures/not-found rows are credited
  back. A storage failure does not turn a result into a pass.
- A crashed worker may leave a processing reservation. It is held rather than
  automatically duplicated. An operator must reconcile that run before explicitly
  releasing capacity; it is not automatically retried with another ID.
- JSON/CSV exports retain full evidence; spreadsheet formula prefixes are escaped.
- There are no browser analytics, private outreach data or email-sending paths.

## Billing and rollout

1. Apply `supabase/migrations/20261103193000_payment_review_portal.sql` first.
2. Deploy the existing Stripe webhook update, then `noshashi-payment-review`.
   The review function requires `--no-verify-jwt` because it validates Supabase
   JWTs or hashed scoped keys itself. CORS preflight is unauthenticated.
3. Existing project secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` (prefer restricted),
   `STRIPE_WEBHOOK_SECRET`. Optional `NOSHASHI_SITE_URL`,
   `STRIPE_PRO_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID` select same-mode prices.
   Never copy secret values into the repository or browser configuration.
4. Build `npm run site:build`. Vercel installs the locked Node dependencies
   before building the portal and public pages. Add the portal recovery callback
   to Supabase Auth's permitted redirect URLs. Verify confirmation/reset email
   templates and the existing account-provisioning hook in the intended environment.
5. Stripe Checkout sells only existing Pro. Server-side price checks require
   USD $749/month or $7,490/year. Contract tiers retain contact-sales routing.
   Repeated checkout creation is reserved in Postgres and uses Stripe idempotency.
   Existing active/pending subscriptions route to the hosted Customer Portal.
6. Subscribe the existing verified webhook to `checkout.session.completed`,
   `customer.subscription.created`, `.updated`, `.deleted`, `invoice.paid`,
   `invoice.payment_failed`, `charge.dispute.created`, `charge.refunded`,
   `radar.early_fraud_warning.created`. The existing evidence-report flow also
   uses `checkout.session.async_payment_succeeded`; preserve its subscriptions.
   Review consumes active, unexpired database entitlements and subscription state,
   never a checkout-return URL. Invoice events reconcile the current subscription.
   Refund/dispute/fraud events resolve the Stripe customer through the charge
   graph and persist an account-wide Payment Review paid-capacity hold. Duplicate
   events do not clear holds; an operator reviews and resolves them separately.
7. Configure the Stripe Customer Portal, validate an isolated Stripe sandbox with
   matching test-mode prices, and exercise renewals, cancellation, failed payments,
   duplicate/out-of-order events and risk holds before opening live checkout.
   Existing account access was authorized for revenue reading only; this work
   does not mutate live Stripe settings or create live products/customers.
8. Tax: review applicable registrations before enabling Stripe Tax. Automatic
   tax is not enabled here and is not represented as collecting tax.

## Verification

```sh
npm run build
npm run site:portal
npx tsc --noEmit
npm test -- tests/payment-review.test.js tests/payment-review-billing.test.js src/lib/desk/__tests__/payment-hosted.test.ts
cd supabase/functions && deno check noshashi-payment-review/index.ts noshashi-stripe-webhook/index.ts
```

Use the existing local Postgres SQL runner for the migration regression test.
Alternatively install PGlite in a temporary development directory and run
`PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node scripts/test-payment-review-db.mjs`.
This creates only an in-memory PostgreSQL instance; no production credentials.
Browser smoke screenshots use explicitly mocked account and ledger fixtures;
they do not establish that production auth, billing or backend deployment works.

## Local validation on 3 November 2026

- Desktop production build and signed-in portal/site builds passed.
- TypeScript and Deno checks for both changed Edge Functions passed.
- 199 relevant regression tests passed; one existing test was skipped.
- In-memory PostgreSQL migration tests passed, including quota reservation,
  scope-conflict detection, idempotent finalization, failed/expired billing,
  refund holds, checkout deduplication and the active-key cap.
- 19 browser checks passed at desktop and mobile sizes using a recorded ledger
  fixture and mocked account/billing endpoints. Full JSON exported by the browser
  was verified by the CLI. Screenshots explicitly label those mocks.
- Production signup/email callbacks, Stripe sandbox/live checkout and deployed
  migration/function behavior have not been verified. Rollout steps above remain.
