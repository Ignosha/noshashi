# Billing integrity follow-up — review only

This draft stacks on the CI-passing security branch/PR #177. It does not deploy, create prices, charge a card, change secrets or manually grant access. Desktop signing is out of scope.

Implemented: durable event receipts, account-scoped 60-second processing leases with fencing tokens, atomic subscription/entitlement/receipt commits, current-provider reconciliation after acquiring the lease, and durable checkout-session deduplication for credit purchases. An expired/replaced worker cannot commit. Storage/lookup failures return retryable errors rather than a successful fulfillment acknowledgement. Paid asynchronous checkout completion follows the same path; an unpaid completion grants nothing.

Repeated same-period metadata events do not refill consumed quota. Cancellation of an older subscription cannot remove a newer current subscription. The effective existing plan is derived from current stored active/trialing subscriptions and the unchanged server-side catalog. Stripe and the database remain eventually consistent: the snapshot is current at provider read time, not a promise of instantaneous change delivery. Existing risk holds remain fail-closed and require owner review to resolve.

The existing renewal/tier-change quota reset policy is retained. This work does not define a new prepaid-credit carryover/refund policy or alter prices, contract terms, seats or the product catalog; those commercial semantics need founder acceptance before rollout. Event/purchase receipt retention must be agreed with the accounting/security owner; no automatic deletion job is introduced.

Public checkout/status and signed-in checkout share test/live/restricted-key classification. Stripe still authenticates each key and enforces its scopes. No live key was retrieved or rotated. In a dedicated sandbox, the owner should provision a restricted key with only the API capabilities actually used: price read; customer creation; Checkout Session creation; billing-portal session creation; subscription read/metadata update; charge read for risk reconciliation. Match Dashboard permissions to those endpoints and validate denied scopes before configuring a production equivalent directly in the server secret store. Never paste a key into Git, chat, client code or public CI logs. Webhook signing secrets remain separate.

Verification on 2026-11-15:

- `npm test`: exit 0, 1,755 passed / 4 live tests skipped.
- `deno check */index.ts` in `supabase/functions`: exit 0.
- Loopback-only actual-handler tests: exit 0, 2 tests / 16 steps (governance and billing).
- Isolated PostgreSQL: six SQL files plus governance and billing multi-connection tests pass. Billing contention is observed; duplicated purchase delivery adds credits once. Tests cover receipt conflicts, lost leases, arithmetic/storage rollback, same-period quota, newer-subscription preservation and cancellation.
- Existing checkout, risk-hold, entitlement parity and key-mode tests retained. The new restricted-key test initially called the request-builder as though it were the handler; the harness was corrected and both targeted/full suites passed.

Limits: plain PostgreSQL still reports the same 13 platform-dependent incomplete migrations; this is not a full Supabase rebuild. Provider and HTTP failures are synthetic fixtures, not a new real-card or production test. No production customer records were read for these tests. Broader capacity/load, actual provider-event destination configuration and owner-approved staging/production rollout remain required.

Deployment order after explicit approval: review/accept #177; rehearse this additive migration against an isolated Supabase staging schema; validate the restricted sandbox key and signed event lifecycle; deploy the migration before the webhook code; verify denial, successful fulfillment, duplicate delivery, cancellation, failure/retry and no tenant escalation. Until the migration is present, new fulfillment RPCs deliberately fail closed. Never roll back by deleting receipt history or replaying purchases to guess account balances.
