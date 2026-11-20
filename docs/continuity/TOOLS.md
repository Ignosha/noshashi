# Continuity development tools

Open the desktop app and select Continuity, then Change rehearsal. Load sample to exercise both tools without network access. The browser preview at /continuity-preview/ uses the same four workspace components as the desktop.

## Implemented in this branch

| Tool | Input | Output |
| --- | --- | --- |
| Issuer sample review | Sample closure list JSON, fixed fictional balances | Queue, reviewer assignment while the workspace is open and JSON export |
| Access forecast | Mainnet domain ID, 1–20 distinct account addresses, horizon of 1–365 days | Current admission and projected admission, final qualifying expiry within the horizon |
| Change rehearsal | Operator-declared account/domain prerequisites and activity deadlines | Deadline queue, baseline and proposed access findings, missing evidence, review owner and next action |
| Rule removal scenario | Current domain rules with at least one retained rule | Current admission and hypothetical admission at the same ledger close time |

The access engine lives in src/lib/continuity/access.ts. It reuses admission from supabase/functions/_shared/ledgerRegistry.ts. Existing registry.ts methods read all observations at one validated ledger index. Both tools can be reused by a future authenticated API, but this change adds desktop tools only. No public HTTP endpoint is introduced.

Forecasts use XRPL epoch seconds internally and ISO timestamps for display. Exact expiry boundaries follow the existing shared credentialStatus implementation. The domain owner is admitted through ownership. Account inputs have syntactic address validation, and ledger reads determine whether requested data exists. The supplied portfolio is explicitly chosen by the analyst and does not imply complete institutional wallet coverage.

The export contains the input domain, observed credentials, ledger index, close time, horizon, proposed rules, results and assumptions. A SHA-256 digest covers the canonical evidence JSON using registry.ts canonical serialization. A reviewer can remove the digest, canonicalize the evidence property and hash it to check integrity. A digest alone does not authenticate a source.

Partial reads, missing domains and network failures stop the portfolio result. The existing registry pagination limit now raises an error if a continuation marker remains after ten pages. The interface clears results when an account or domain input changes. Rule removals are hypothetical, and the tools do not submit ledger transactions.

## Verification

Run npm run build for the desktop frontend and npm test -- tests/continuity-decision-pack.test.js tests/continuity-rehearsal.test.js tests/continuity-access.test.js tests/continuity-registry-read.test.js tests/continuity.test.js src/lib/compliance/__tests__/registry.test.ts for related policy tests. Native macOS signing, notarization and physical Intel Mac testing remain separate release checks. The issuer reader now supports a pinned Mainnet snapshot. Customer validation and the durable team workflow remain necessary before contracted use.

## Protocol references

- [Credential fields, acceptance flag and expiration](https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/credential)
- [Permissioned domain access rules](https://xrpl.org/docs/concepts/tokens/decentralized-exchange/permissioned-domains)
- [Permissioned DEX behavior after credential and rule changes](https://xrpl.org/docs/concepts/tokens/decentralized-exchange/permissioned-dexes)

See [the product evolution and demonstration](EVOLUTION.md) for the combined workflow and scope.

## Decision package

Export decision report saves a printable HTML report and its companion evidence JSON using the same captured inputs. Reopen saved rehearsal accepts a version 1 rehearsal file up to 2 MB, verifies its SHA-256 digest, validates its input schema and recomputes findings. Import failures preserve the open review. Reopened observations are labeled as imported and require independent source verification. Review owners, next actions, activities, proposed rules and the horizon are restored.

The report and interface show coverage of declared prerequisites, baseline access gaps, missing evidence and unassigned follow-up work. See [quality and pricing](QUALITY_AND_PRICING.md) for delivery scope.

## Expanded desktop layout

See [the suite guide](SUITE.md) for the live issuer reader and the bridge and lending record evaluators. [The short meeting brief](CYRILLE_BRIEF.md) is the concise version for Cyrille.
