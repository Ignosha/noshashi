# NOSHASHI Payment Review CLI

Read-only XRPL mainnet payment reviews. Node 18 or newer; no runtime dependencies.
The CLI is in source and is not published to npm.

1. Sign in at `/developers/portal/` and create a **Payment Review** API key.
2. Put that key in `NOSHASHI_REVIEW_KEY` through your shell's secure environment
   or secret manager. Never place it in arguments, source, screenshots or a URL.
3. Prepare `payments.json` containing a `rows` array:

```json
{
  "rows": [{
    "hash": "REPLACE_WITH_A_REAL_64_CHARACTER_HASH",
    "invoice": {
      "invoice_id": "invoice-001",
      "destination": "REPLACE_WITH_THE_EXPECTED_CLASSIC_ADDRESS",
      "expected_amount": "100.00",
      "asset": {"kind": "xrp"}
    }
  }]
}
```

These placeholders are not a ledger example. For issued tokens, use
`{"kind":"issued","currency":"USD","issuer":"THE_ACTUAL_ISSUER"}`.
Amounts stay decimal strings. Destination tags are optional whole numbers.

```sh
node packages/cli/bin/noshashi-review.mjs review --input payments.json --request-id invoice-batch-001 --output review.json
node packages/cli/bin/noshashi-review.mjs verify-receipt --input review.json
node packages/cli/bin/noshashi-review.mjs usage
node packages/cli/bin/noshashi-review.mjs runs
node packages/cli/bin/noshashi-review.mjs run --run-id RUN_UUID
```

CSV is also accepted. Columns:
`hash,invoice_id,destination,expected_amount,currency,issuer,destination_tag`.
Use XRP for native XRP; otherwise supply the exact currency and issuer.

Retries must reuse **both identical input and the same request ID**. A changed
payload receives 409. A processing run is not restarted. A saved replay is a
historical result. After a definitively failed run, use a new ID to explicitly
request another read. Output files are created with mode 0600 and never overwrite
an existing file. JSON is printed to stdout unless `--output` is set.

`NOSHASHI_REVIEW_API` can point to a development endpoint. HTTPS is required
except for localhost. The CLI refuses redirects before sending credentials.

Free: 25 records per UTC calendar month, up to 5 rows per request. Pro: 5,000,
up to 25 rows. Institutional and higher: 100,000, up to 25 rows, with a contract.
Browser, API and CLI share this new processing allowance; it is separate from
the existing Compliance API's verification credits. No automatic overage billing.
All completed results include full findings and evidence. Public single-payment
checks at `/delivered/` remain available without signing in.

Receipt verification only compares the hash of the identical canonical payload.
It does not identify the producer or independently verify XRPL consensus. A match
does not establish invoice-list completeness, allocate transactions, make an
accounting entry, prove compliance, or guarantee a payment's legal finality.
No keys are requested for wallets; the API key is only for NOSHASHI processing.
