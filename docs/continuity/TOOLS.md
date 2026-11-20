# Continuity development tools

Open the desktop app and select Continuity, then Access forecast & rule impact. Load sample to exercise both tools without network access. The web page at /continuity-preview/ continues to expose the issuer sample. The access tools are currently part of the desktop frontend.

## Implemented in this branch

| Tool | Input | Output |
| --- | --- | --- |
| Issuer sample review | Sample closure list JSON, fixed fictional balances | Queue, reviewer assignment while the workspace is open and JSON export |
| Access forecast | Mainnet domain ID, 1–20 distinct account addresses, horizon of 1–365 days | Current admission and projected admission, final qualifying expiry within the horizon |
| Rule removal scenario | Current domain rules with at least one retained rule | Current admission and hypothetical admission at the same ledger close time |

The access engine lives in src/lib/continuity/access.ts. It reuses admission from supabase/functions/_shared/ledgerRegistry.ts. Existing registry.ts methods read all observations at one validated ledger index. Both tools can be reused by a future authenticated API, but this change adds desktop tools only. No public HTTP endpoint is introduced.

Forecasts use XRPL epoch seconds internally and ISO timestamps for display. Exact expiry boundaries follow the existing shared credentialStatus implementation. The domain owner is admitted through ownership. Account inputs have syntactic address validation, and ledger reads determine whether requested data exists. The supplied portfolio is explicitly chosen by the analyst and does not imply complete institutional wallet coverage.

The export contains the input domain, observed credentials, ledger index, close time, horizon, proposed rules, results and assumptions. A SHA-256 digest covers the canonical evidence JSON using registry.ts canonical serialization. A reviewer can remove the digest, canonicalize the evidence property and hash it to check integrity. A digest alone does not authenticate a source.

Partial reads, missing domains and network failures stop the portfolio result. The existing registry pagination limit now raises an error if a continuation marker remains after ten pages. The interface clears results when an account or domain input changes. Rule removals are hypothetical, and the tools do not submit ledger transactions.

## Verification

Run npm run build for the desktop frontend and npm test -- tests/continuity-access.test.js tests/continuity-registry-read.test.js tests/continuity.test.js src/lib/compliance/__tests__/registry.test.ts for related policy tests. Native macOS signing, notarization and physical Intel Mac testing remain separate release checks. The sample issuer review still needs a production balance reader and durable team workflow before contracted use.

## Protocol references

- [Credential fields, acceptance flag and expiration](https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/credential)
- [Permissioned domain access rules](https://xrpl.org/docs/concepts/tokens/decentralized-exchange/permissioned-domains)
- [Permissioned DEX behavior after credential and rule changes](https://xrpl.org/docs/concepts/tokens/decentralized-exchange/permissioned-dexes)
