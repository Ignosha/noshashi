# Continuity desktop suite

The desktop and browser preview at /continuity-preview/ have a vertical workspace menu, a source/input rail and a results area. It uses the existing Ledger Desk theme, type and controls. Select a table row to review its evidence and follow-up fields. Workspace state remains available while switching within Continuity.

| Workspace | Working input | What it evaluates |
| --- | --- | --- |
| Change rehearsal | Validated Mainnet domain and credentials, or a fictional sample, plus declared activities | Current and proposed access at scheduled deadlines, missing coverage and follow-up |
| Issuer offboarding | Customer closure records with operator-provided wallet mappings | Balances and issuer-side authorization/freeze flags at one validated Mainnet ledger, compared with a declared redemption window and optional freeze policy |
| Bridge records | A normalized supplied record set with route expectation, source status, bridge message, destination receipt and accounting credits | Exact net delivery, destination identity, message correlation, confirmation status, duplicate/missing credits and declared export coverage |
| Lending exposure | A supplied single-asset loan export, borrower mappings, proposed loan, limit basis and concentration limit | Combined mapped borrower exposure, exact headroom and incomplete coverage |

The bridge and lending workspaces accept JSON imports and include fictional samples. Their results say supplied records reconcile or describe the observed exception. These modules do not fetch a bridge provider's records or underwrite borrower credit. An imported record's provenance requires independent verification.

## Issuer data contract

Supply an issuer address, raw currency code and 1–20 records containing id, wallet and closed. Use a UTC date in closed and null for an unmapped wallet. The default redemption window is 30 days and can be changed to 0–365. An optional policy requires an issuer-side freeze for a remaining trust line.

All mapped holders and the issuer are read at one validated ledger index. Trust-line pagination must finish. A malformed response or read failure stops the result. Missing wallet mappings and absent accounts remain unresolved. A missing trust line and a zero balance have distinct findings. Zero balance with persistent authorization remains explicit. The wallet-to-customer relationship is operator-supplied.

The reader uses peer_authorized and freeze_peer from the holder's perspective. The issuer's account flags are retained in evidence. Global flags require separate interpretation by the issuer's responsible team. Findings address the stated issuer, asset and policy at the snapshot. The responsible team reviews the full customer relationship.

## Bridge data contract

Load the sample to see the schema. Status fields accept confirmed, pending or failed. A bridge confirmed status means the operator's export reports the corresponding bridge step complete. Expected delivery is the net amount declared for the destination asset, after route fees. Amounts are asset units represented as decimal strings. Source and destination tokens may have different identities. The destination receipt must match the expected network, account and assetId, and the bridge message identifier. Credits refer to the receipt transaction. creditExportComplete is a declared completeness flag.

## Lending data contract

Load the sample to see the schema. portfolioValue is the fixed asset-denominated limit basis chosen by the operator. maximumShareBps is an integer from 0 to 10,000. Loan IDs are unique. All loan rows use the same exact assetId. entityId is the verified mapping supplied by the operator, or null for unknown. The same wallet cannot be mapped to conflicting named borrowers. exportComplete declares record coverage. Unknown mappings preserve an incomplete-coverage finding even if known exposure already exceeds the limit.

Amounts reuse the existing decimal expansion and exact integer-unit conversion logic. Numeric amounts, negative principal and exponents outside the supported range are rejected. No floating-point sums determine limit outcomes.

## Demonstration

Open Change rehearsal and remove one credential rule. Inspect affected work and export the decision package. Open Issuer offboarding and show persistent authorization at zero balance. Open Bridge records and reconcile the sample to reveal an accounting credit larger than the receipt. Open Lending exposure and show two mapped wallets taking a borrower over the declared limit.

The short [meeting brief](CYRILLE_BRIEF.md) covers the questions to discuss with Cyrille. The longer buyer brief preserves research and the proposed pilot measures.

## Release checks

The frontend build and related fixture/interaction tests cover the calculations and normal workspace entry points. Live institutional source validation, visual inspection, native Intel Mac testing and durable team governance remain required before a contracted production rollout.

[XRPL account_lines fields](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_lines)

## Browser preview

Run npm run site:continuity to build the shared scene into site/assets/continuity. The normal site build runs this step before generating /continuity-preview/. Native and web views share the workspace implementations and include fictional samples. Fonts use the existing self-hosted site paths.
