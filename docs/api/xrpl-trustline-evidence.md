# Pinned RippleState trust-line evidence (research)

`scripts/xrpl-trustline-evidence.mjs` provides an offline, fail-closed parser and two-provider comparator for XRPL `RippleState` ledger objects.

- Request must identify **issuer**, **holder**, **currency**, and a specific **validated ledger hash**.
- Requires the returned `RippleState` LowLimit and HighLimit issuer accounts and currencies to match the requested pair. It interprets **issuer-side** flags based on which account is the low or high party.
- `lsfLowFreeze` / `lsfHighFreeze` and `lsfLowAuth` / `lsfHighAuth` are side-specific. Holder-side flags must not be mistaken for issuer controls.
- Missing, unvalidated, contradictory or wrong-ledger responses remain **UNKNOWN**. Two agreeing RPC observations are **not independent cryptographic authentication**.
- The authorization flag being unset does **not** by itself mean a payment is prohibited: `lsfRequireAuth` on the issuer's AccountRoot must be checked separately before drawing an authorization-policy conclusion.
- The issuer's global freeze is a separate AccountRoot control; both checks must be considered. This parser does not check NoRipple, DeepFreeze, trust-line existence, asset transfer restrictions, transaction authorization, or signatures.

**Read-only RPC adapter implemented:** `scripts/xrpl-trustline-lookup.mjs` sends pinned `ledger_entry` requests to two fixed HTTPS providers, caps response size and time, rejects untrusted server overrides, and returns UNKNOWN when the providers fail or disagree. This adapter has mocked tests, **not a confirmed live RippleState integration test**. Production integration remains blocked.

Run: `node --test scripts/xrpl-trustline-evidence.test.mjs scripts/xrpl-trustline-lookup.test.mjs scripts/case-ledger-controls.test.mjs`.

`lookupPinnedPaymentControls` now optionally accepts a currency and queries the destination-holder trust line with the explicit issuer; the composed read-only Case Review flags differences against supplied control claims. Missing trust-line evidence remains UNKNOWN and all case verdicts remain HOLD. This does not determine payment eligibility without issuer RequireAuth, global freeze, transfer restrictions, asset identity and authenticated institutional approval.

This is not a production preflight or evidence of institutional approval.

## Issuer RequireAuth interpretation

The pinned AccountRoot parser also observes `lsfRequireAuth` (0x00040000). The payment-controls composition exposes `issuerRequireAuth` and `issuerAuthorizationConditionMet`: the latter is only true when the issuer's RequireAuth flag is **known false**, or RequireAuth is **known true** and the issuer-side RippleState authorization bit is set. Missing issuer policy evidence leaves the condition UNKNOWN and prevents full corroboration. This field is **not** a transfer approval or authorization to release funds. Case Review flags active issuer freeze, trust-line freeze, and unmet issuer authorization condition but always remains HOLD.

**Live validation still required:** confirm provider-specific response fields, ledger-hash provenance and the correctness of the ledger_entry API parameters against current XRPL nodes; mocked test success is not proof of live interoperability. Verify whether an independently authenticated ledger header can be established before presenting any observation as cryptographically proven.
