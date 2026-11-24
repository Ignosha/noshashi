# XRPL control evidence integration — research milestone

Status: read-only research integration; NOT an enterprise payment approval service.

## Implemented
- `scripts/xrpl-account-root-evidence.mjs`: validates a pinned `AccountRoot` response and interprets `lsfRequireDestTag` and `lsfGlobalFreeze`; requires two provider reports to agree.
- `scripts/xrpl-account-root-lookup.mjs`: read-only, bounded, fixed-provider HTTPS `account_info` lookup using a specific ledger hash. Failures and disagreements return UNKNOWN.
- `scripts/xrpl-payment-controls.mjs`: looks up the **destination's** tag requirement and the **issuer's** global-freeze flag at the same pinned ledger hash. It always returns `trustLineFrozen:null` and `trustLineAuthorized:null`, never substitutes false for missing data.
- `scripts/case-ledger-controls.mjs`: compares the pinned observations with caller-supplied case-review claims, flags conflicts, and ALWAYS returns HOLD without authorization. The caller's approval/policy snapshot is still unauthenticated.
- `scripts/xrpl-account-root-live-diagnostic.mjs`: obtains a validated ledger hash from a fixed RPC provider and attempts corroborated read-only account lookups. It prints CORROBORATED or UNKNOWN; **UNKNOWN is not a passing evidence result**. This is an informational CI diagnostic, not a release gate. Historical archive coverage and live service compatibility still require review.

## Deliberately not claimed
- Trust-line frozen/authorized state: needs currency, issuer, holder, the correct RippleState ledger entry and side-specific flag interpretation, plus pinned-ledger verification. The issuer's AccountRoot global-freeze bit does not substitute for trust-line state.
- No authenticated customer approval or independently verified source signatures. Agreement by two RPC endpoints is not a cryptographic consensus proof.
- No full preflight, no transaction signing, no transaction submission, no customer production deployment, no public endpoint, no payment permission.
- The ledger hash used by the control adapter must be pinned and validated; customer-supplied hash assertions alone are not trusted.

## Tests and diagnostic
```sh
node --test scripts/xrpl-account-root-evidence.test.mjs scripts/xrpl-account-root-lookup.test.mjs scripts/case-ledger-controls.test.mjs
node scripts/xrpl-account-root-live-diagnostic.mjs
```

## Remaining critical steps before a paid institutional pilot
1. Verify live pinned AccountRoot results against two independent providers; investigate any UNKNOWN responses rather than counting them as successful.
2. Implement pinned RippleState trust-line lookup and both issuer/holder flag directions, including asset identity and tests for freezes and authorization.
3. Bind the evidence to an authenticated intent, approval event, policy version, immutable case ID, role model, freshness limit, and audit log.
4. Add signed, independently verifiable receipts and tenant isolation.
5. Integrate a secure backend and Ledger Desk review UI with clear provenance and unknown states; validate security, failure handling, and ROI in a scoped design-partner pilot.

No merge, production deploy, billing or outreach is included.

## Case composition validation update

The case composer now rejects `CORROBORATED` results unless issuer RequireAuth,
trust-line freeze, trust-line authorization, and the derived authorization
condition are explicit booleans. It also checks that the derived condition equals
`!issuerRequireAuth || trustLineAuthorized`. Incomplete or contradictory results
return `CONTROL_EVIDENCE_UNAVAILABLE`, HOLD, and no authorization. Regression tests
cover missing, null, string and numeric flags, all contradictory authorization
combinations, and a valid unmet authorization condition.

Trust-line lookup is implemented in `xrpl-trustline-lookup.mjs` and exercised by
`xrpl-trustline-lookup.test.mjs`; the earlier remaining-steps list predates that
increment. Live provider corroboration, authenticated approval snapshots, and
production release gates still require verification.

## Ledger identity and source evidence

The control adapter requires a positive ledger index from both AccountRoot providers. It cross-checks the agreed index across destination AccountRoot, issuer AccountRoot, and the RippleState when present. The case reviewer also compares it with the corroborated transaction index. A shared requested hash with inconsistent observed indices cannot yield corroborated controls.

The adapter retains the three normalized observations under `evidence.destination`, `evidence.issuer`, and `evidence.trustLine`, including provider diagnostics when available. Observations explain the source of each control. A separate optional control attestation binds these observations to the transaction receipt when the issuer, destination, asset, ledger hash and ledger index agree. See [attestation verification](evidence-receipt-research.md).
