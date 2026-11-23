# Pinned RippleState trust-line evidence (research)

`scripts/xrpl-trustline-evidence.mjs` provides an offline, fail-closed parser and two-provider comparator for XRPL `RippleState` ledger objects.

- Request must identify **issuer**, **holder**, **currency**, and a specific **validated ledger hash**.
- Requires the returned `RippleState` LowLimit and HighLimit issuer accounts and currencies to match the requested pair. It interprets **issuer-side** flags based on which account is the low or high party.
- `lsfLowFreeze` / `lsfHighFreeze` and `lsfLowAuth` / `lsfHighAuth` are side-specific. Holder-side flags must not be mistaken for issuer controls.
- Missing, unvalidated, contradictory or wrong-ledger responses remain **UNKNOWN**. Two agreeing RPC observations are **not independent cryptographic authentication**.
- The authorization flag being unset does **not** by itself mean a payment is prohibited: `lsfRequireAuth` on the issuer's AccountRoot must be checked separately before drawing an authorization-policy conclusion.
- The issuer's global freeze is a separate AccountRoot control; both checks must be considered. This parser does not check NoRipple, DeepFreeze, trust-line existence, asset transfer restrictions, transaction authorization, or signatures.

**Not yet connected to live RPC**: the next increment is a fixed-provider, bounded, read-only `ledger_entry` adapter that requests a `RippleState` by account pair and currency pinned to a validated ledger hash. Production integration remains blocked.

Run: `node --test scripts/xrpl-trustline-evidence.test.mjs`.

This is not a production preflight or evidence of institutional approval.
