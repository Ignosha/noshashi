# Policy engine

Last reviewed 2026-09-29 against `src/lib/policy.ts` and
`src/lib/desk/institutional.ts` (engine version `1`). This is how a verdict
is reached. There is no model anywhere in this path.

## Three layers, never blended

| Layer | What | Code |
|---|---|---|
| **Facts** | What the validated ledger reports: account, credentials, reserve, trust lines, recent transactions | `src/lib/xrpl/client.ts`; `measure()` in `institutional.ts` |
| **Policy** | What the institution configured: thresholds and what each does when triggered | `PolicyParams`, `InstitutionalPolicy` |
| **Result** | What the two produce together | `judge()`, `toChecks()`, `evaluatePolicy()`, `verdictForChecks()` |

Every function in the result layer is pure: the same facts and the same
policy give the same result, every time, on every machine.

## Check states

Each rule produces one of five states.

| State | Means | Effect on the verdict |
|---|---|---|
| PASS | The rule is satisfied | None |
| FAIL | A blocking rule is not satisfied | NO-GO |
| REVIEW | An advisory rule is not satisfied | HOLD |
| INSUFFICIENT_DATA | The ledger could not supply what the rule needs | INSUFFICIENT DATA, unless something blocks |
| NOT_APPLICABLE | The rule does not apply (turned off, or nothing to measure) | None |

## Verdict

`verdictForChecks()` in order:

1. Any blocking check failed → **NO-GO**.
2. Otherwise any check is INSUFFICIENT_DATA → **INSUFFICIENT DATA**. No
   decision is issued on missing evidence.
3. Otherwise any advisory check failed → **HOLD**.
4. Otherwise → **GO**.

A GO means the rules passed. It is not an approval: an authorized person at
the institution decides.

## Base rules (every verdict)

| Rule id | Severity | Passes when |
|---|---|---|
| `ACCOUNT_ACTIVATED` | block | The account exists on the validated ledger with a sequence number |
| `CREDENTIAL_<TYPE>` | block | One per credential the rule profile requires: an accepted, unrevoked XLS-70 credential is held |
| `RESERVE_SOLVENCY` | block | Balance covers the base reserve plus the owner reserve per object, read from the ledger's FeeSettings |
| `SPENDABLE_BALANCE` | block | The amount fits in balance minus reserve |
| `TRANSFER_CEILING` | block | The amount is within the profile's per-settlement cap |
| `DOMAIN_GOVERNANCE` | block if suspended, else advisory | The profile's governance is active |
| `DOMAIN_ATTESTATION` | advisory | The account publishes a Domain field |
| `SOURCE_AGREEMENT` | advisory | Every public node that answered returned the same ledger hash and the same account state at the verdict's ledger. Disagreement, a single answering node, or state that moved gives REVIEW (HOLD) |
| `EVIDENCE_<SOURCE>` | advisory, INSUFFICIENT_DATA | Added for each source that could not be read |

Rule profiles (`DOMAIN_REGISTRY`) set which credentials are required, the
transfer ceiling and governance state. They are rule profiles, not ledger
permissioned domains; real domains and credentials are read from mainnet in
the Credential Registry.

## Institutional policy rules

Configured per institution, versioned, and applied to every verdict while
active.

| Rule id | Parameter | Triggers when | Reads |
|---|---|---|---|
| `POLICY_HHI_LIMIT` | `hhiLimit` (0–10,000) | Herfindahl–Hirschman index of the account's holdings is above the limit | Trust lines |
| `POLICY_COUNTERPARTY_SHARE` | `counterpartyShareLimitPct` | The largest counterparty's (or the destination's) share is above the limit | Recent payments |
| `POLICY_TRAVEL_RULE` | `travelRule.thresholdFiat`, `currency`, `xrpReferenceRate` | The amount, valued at the operator's own reference rate, is at or above the threshold. There is no price feed | Amount |
| `POLICY_RESERVE_HEADROOM` | `reserveHeadroomMinXrp` | Spendable XRP left after the settlement is below the minimum | Account, reserve |
| `POLICY_STRICT_FREEZE` | `strictFreeze` | An issuer of a held balance can freeze it | Issuer flags |

For each rule the institution chooses the outcome when triggered:
**REVIEW** (verdict HOLD) or **FAIL** (verdict NO-GO). A parameter set to
null turns the rule off (NOT_APPLICABLE). A rule that cannot be measured
becomes `EVIDENCE_POLICY_…` with INSUFFICIENT_DATA.

The Policy screen shows each rule as a row of the **rule sheet**
(`ruleSheet()`): value, unit, what it reads, when it triggers, and its
effect.

A configured threshold is the institution's own parameter. It is not legal
advice, a regulatory requirement, a universal standard or XRPL policy.

## Versions and hashing

- Each policy is `{id, name, version, params}`; its hash is SHA-256 over
  canonical JSON (sorted keys) of those fields plus the engine version.
- The receipt carries `[id, version, hash, engine]`, so a verdict names the
  exact policy that produced it.
- `POLICY_ENGINE_VERSION` is bumped whenever `measure()` or `judge()` would
  decide differently for the same input.

## Lifecycle and four-eyes (organizations)

```
DRAFT ──submit──► IN REVIEW ──activate (another person)──► APPROVED · ACTIVE ──► SUPERSEDED
```

- Only drafts change.
- Activators: owner, admin or compliance, and never the author. The
  author rule is enforced by a table constraint and a trigger
  in `noshashi.org_policies`, and re-checked in
  `noshashi-policy-activate`.
- Activation archives the previous active version in the same transaction
  and writes an audit row.

## Exceptions

An exception is a person's decision recorded beside a verdict. It never
changes the verdict or its receipt.

- Requester ≠ decider (constraint).
- Deciders: owner, admin or compliance.
- An approval carries an expiry of 1–365 days (default 30). Standing is
  shown as open, in force, expired, rejected, or no expiry for approvals
  made before expiry was recorded.
- Expired approvals no longer count.

## Simulation

A draft policy can be run against the measurements stored with past
verdicts, without re-reading the ledger, to see which verdicts it would
change before anyone activates it.

## Server parity

The Compliance API (`supabase/functions/noshashi-verify`) and the public
certificate page (`api/_lib/authority.js`) run the same rules and the same
canonical form. Runtime parity tests hold all three equal.

## Tests

`src/lib/__tests__/` and `src/lib/desk/__tests__/` cover every rule, the
verdict order, the five states, policy hashing, the rule sheet, and replay,
using recorded mainnet replies.
