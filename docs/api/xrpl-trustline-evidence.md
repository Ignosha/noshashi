# Pinned RippleState trust-line evidence (research)

`scripts/xrpl-trustline-evidence.mjs` provides an offline, fail-closed parser and two-provider comparator for XRPL `RippleState` ledger objects.

- Request must identify **issuer**, **holder**, **currency**, and a specific **validated ledger hash**.
- Requires the returned `RippleState` LowLimit and HighLimit issuer accounts and currencies to match the requested pair. It interprets **issuer-side** flags based on which account is the low or high party.
- RippleState freeze and authorization flags are side-specific. The issuer authorization bits are `lsfLowAuth` (`0x00040000`) and `lsfHighAuth` (`0x00080000`). The owner reserve bits `0x00010000` and `0x00020000` have no authorization meaning. [XRPL RippleState flags](https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/ripplestate#ripplestate-flags)
- Missing, unvalidated, contradictory or wrong-ledger responses remain **UNKNOWN**. Two agreeing RPC observations are **not independent cryptographic authentication**.
- The authorization flag being unset does **not** by itself mean a payment is prohibited: `lsfRequireAuth` on the issuer's AccountRoot must be checked separately before drawing an authorization-policy conclusion.
- The issuer's global freeze is a separate AccountRoot control. The RippleState parser reports each party's deep-freeze flag. NoRipple, asset transfer eligibility, and signatures are outside its scope.

`scripts/xrpl-trustline-lookup.mjs` sends pinned `ledger_entry` requests to two fixed HTTPS providers, caps response size and time, and returns UNKNOWN when the providers fail or disagree. Mocked tests cover both issuer orientations and authorization set and clear. Public fixture coverage is documented below.

Run: `node --test scripts/xrpl-trustline-evidence.test.mjs scripts/xrpl-trustline-lookup.test.mjs scripts/case-ledger-controls.test.mjs`.

`lookupPinnedPaymentControls` now optionally accepts a currency and queries the destination-holder trust line with the explicit issuer; the composed read-only Case Review flags differences against supplied control claims. Missing trust-line evidence remains UNKNOWN and all case verdicts remain HOLD. This does not determine payment eligibility without issuer RequireAuth, global freeze, transfer restrictions, asset identity and authenticated institutional approval.

This is not a production preflight or evidence of institutional approval.

## Issuer RequireAuth interpretation

The pinned AccountRoot parser also observes `lsfRequireAuth` (0x00040000). The payment-controls composition exposes `issuerRequireAuth` and `issuerAuthorizationConditionMet`: the latter is only true when the issuer's RequireAuth flag is **known false**, or RequireAuth is **known true** and the issuer-side RippleState authorization bit is set. Missing issuer policy evidence leaves the condition UNKNOWN and prevents full corroboration. This field is **not** a transfer approval or authorization to release funds. Case Review flags active issuer freeze, trust-line freeze, and unmet issuer authorization condition but always remains HOLD.

Independent ledger-header authentication and live coverage for issuer authorization set remain open.

## Opt-in live trust-line diagnostic

The read-only script `node scripts/xrpl-trustline-live-diagnostic.mjs` requires all four explicit environment variables: `NOSHASHI_TRUSTLINE_ISSUER`, `NOSHASHI_TRUSTLINE_HOLDER`, `NOSHASHI_TRUSTLINE_CURRENCY`, and `NOSHASHI_TRUSTLINE_LEDGER_HASH`. Use a **known existing** public trust line and a validated ledger hash that both fixed RPC providers retain. Without all four, it prints `SKIPPED` and makes no request. No private keys, credentials, transaction signing, or provider URL overrides are supported.

The script prints per-provider reason codes and an overall `UNKNOWN` when evidence is missing or conflicting. This diagnostic is intentionally not counted as a live pass by CI until a verified public fixture and observed provider interoperability are established. CI only checks the script syntax. Never interpret an `OBSERVED` or `CORROBORATED` RPC response as a cryptographic proof of ledger consensus.

### Mandatory diagnostic mode

Set `NOSHASHI_REQUIRE_LIVE_TRUSTLINE=1` alongside the four fixture variables to make missing fixture configuration, UNKNOWN evidence, or diagnostic exceptions exit nonzero. This is an opt-in local verification gate. Record the exact fixture source, validated ledger hash, provider diagnostics and exit status. The opt-in autopsy smoke checks a public RLUSD trust line at ledger 108,533,744. Both RPC sources returned `Flags=0x04920000` with the issuer on the high side. Issuer freeze, deep freeze, and owner reserve were set, and issuer authorization was clear. The [readiness report](../commercial/enterprise-readiness-continuation.md) records the fixture and other corroborated observations.

The standalone RippleState report includes `issuerDeepFrozen` and `holderDeepFrozen` as separate observations. Provider disagreement on either flag produces UNKNOWN. These fields describe raw ledger flags. The case review surfaces a separate reason code for either side observed set while keeping the outcome on HOLD. Three-character currency codes preserve letter case. Hexadecimal spellings use uppercase for comparison.
