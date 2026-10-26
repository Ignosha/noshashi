# Test fixtures

Every file here is a real response captured from production on the date and
ledger in its name — nothing is invented. They pin the shape tests run
against; they are not refreshed automatically. To refresh one, fetch the
same URL again and keep the ledger index in the file name.

- `authority-solo-107585799.json` — `GET https://www.noshashi.app/api/authority?issuer=rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz`, 2026-10-11
- `authority-bitstamp-107585800.json` — `GET https://www.noshashi.app/api/authority?issuer=rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B`, 2026-10-11
- `issuer-state-solo-107586973.json`, `issuer-state-bitstamp-107586973.json`, `issuer-state-rlusd-107586974.json` — `GET /api/issuer-state?issuer=…` on the PR #79 preview deployment, 2026-10-11 (live `account_info`, validated ledger)
- `account-tx-solo-107587061.json` — five entries copied unmodified from the first page of `GET /api/delivered?account=rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz&format=raw` on the PR #79 preview, 2026-10-11 (two payments into the SOLO issuer, two real partial-payment self-conversions by another account that rippled through it, one OfferCancel)
- `asset-risk-gatehub-107894643.json` — `GET /api/v1/asset-risk?issuer=rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq` on the PR #124 preview deployment, 2026-10-25 (live mainnet; issuer controls only, no currency)

**One exception, labelled as such:**
- `payment-verify-vectors.json` holds test vectors shared by the Rust payment engine and the hosted API, not a captured response.
- Its entries with `fixture` point by index at the real `account-tx-solo-107587061.json` above.
- Entries named `synthetic:` are rippled `tx` replies built by hand. They cover cases no recorded transaction does: XRP invoices, failures, missing fields, a disagreeing second source. They are not ledger evidence.
- `expected` was written by the Rust engine (`NOSHASHI_WRITE_VECTORS=1 cargo test --lib verify::tests::t36`) and is frozen.
