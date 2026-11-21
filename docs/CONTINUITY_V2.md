# NOSHASHI Continuity — Pre-Sign Gate V1

This first increment introduces a **pure, fail-closed authorization predicate** at
`src/lib/continuity/presign-gate.ts`, with unit tests.

## What it does
- Allows only GO decisions with complete evidence and a verified receipt.
- Requires exact SHA-256 intent, policy and ledger binding.
- Rejects missing decisions, HOLD, NO-GO, malformed bindings and expired decisions.
- Returns stable machine-readable rejection reasons.

## What it does NOT do
- Does not fetch XRPL ledger data or compute hashes.
- Does not verify a cryptographic signature itself. A trusted verifier must
  set `receiptVerified` only after signature, key and receipt-body checks.
- Does not connect to Fireblocks, Ripple Custody or any signer.
- Does not guarantee that the validated ledger remains current.
- Does not block a real-world transaction until every signing path calls it
  and bypass testing has passed.

## Next integration work
1. Define canonical intent serialization and SHA-256 computation.
2. Verify signed receipt and tenant-scoped policy using server-side trusted keys.
3. Bind the decision to the precise custody signing payload and its TTL.
4. Add an enforcement adapter with fail-closed timeout/retry behavior.
5. Test unauthorized paths, mutation after approval, replay, and provider outages.
6. Add issuer/trust-line and funded-depth evidence adapters using existing
   `src/lib/desk` and `src/lib/xrpl` code, without duplicating protocol logic.

Run `npx vitest run src/lib/continuity/presign-gate.test.ts`.
No deploy, billing, signing, or policy activation is part of this change.
