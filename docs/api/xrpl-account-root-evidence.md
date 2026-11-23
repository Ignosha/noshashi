# XRPL pinned AccountRoot evidence — research parser

This module is the first narrow step toward replacing **caller-asserted destination-tag requirements** with independently corroborated ledger data.

Implementation: `scripts/xrpl-account-root-evidence.mjs`
Tests: `scripts/xrpl-account-root-evidence.test.mjs`

## What it checks
- The caller requests a specific classic XRPL account and **ledger hash**.
- Each `account_info` response must explicitly report `validated: true` and the **same** `ledger_hash`.
- The `account_data` object must be an `AccountRoot` belonging to the requested account, with valid integer `Flags`.
- It interprets only the `lsfRequireDestTag` bit (`0x00020000`).
- Two independently collected provider responses must agree or the result is UNKNOWN.
- The result explicitly says `independentlyAuthenticated: false`: two matching RPC reports do not cryptographically prove the ledger state.

## Not implemented yet
- No network fetcher for pinned account_info responses; these functions accept provider responses supplied by the caller. No historical-ledger availability guarantees.
- No independent validation of XRP Ledger consensus, signed source attestations, or archival RPC service-level agreement.
- No `RippleState` trust-line or issuer freeze/authorization interpretation. Those require asset/issuer identity, precise ledger entries, and separate validations.
- No connection to an authenticated institutional approval or policy record.
- No customer wallet integration, signing, transaction submission or public endpoint.

## Suggested read-only RPC request
```json
{"method":"account_info","params":[{"account":"<classic XRPL address>","ledger_hash":"<64-hex ledger hash>","strict":true}]}
```
Reject any provider response without explicit pinned ledger confirmation. A provider that lacks the historical ledger is not evidence that a destination tag is unnecessary.

Reference: https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_info and https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/accountroot

## Release gate
Wire two real read-only providers with response-size/timeouts, validate against documented historical fixtures and current mainnet observations, then bind the resulting control evidence to case review with actor/tenant context. Never treat a missing flag or an unavailable provider as permission to send funds.
