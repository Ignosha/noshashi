# NOSHASHI Compliance API

One Edge Function, `noshashi-verify`, serves every verb. Paths are relative to

```
https://<project>.supabase.co/functions/v1/noshashi-verify
```

`GET` on the bare path (no key needed) lists every verb, the domain registry
and the published rate limits.

## Verbs

| Verb | Method | Scope | Cost | What it answers |
|---|---|---|---|---|
| *(bare path)* | POST | `verify` | 1 credit | Adjudicate a settlement: GO / HOLD / NO-GO, with a digested receipt. |
| `receipts/{digest}` | GET | `read` or `verify` | free | A receipt your account or organization recorded, exactly as it was served. |
| `analyze/issuer` | POST | `read` or `verify` | free | An issuer's controls, read live from the validated ledger. |
| `analyze/address` | POST | `read` or `verify` | free | Balance, reserve, spendable XRP, owner count and credentials, read live. |
| `analyze/transaction` | POST | `read` or `verify` | free | A transaction's type, parties, final result and delivered amount. |
| `authority/check` | POST | none | free | Whether an authority certificate's digest is the digest of its own body. |

**Auth.** Every verb except `authority/check` needs `Authorization: Bearer nsh_live_…`.

**Plan.** Every verb needs the account's `compliance_api` entitlement.

**Rate limits.** Every verb draws on the same per-key, per-tier rate limit. The limits are durable and enforced in Postgres.

**Scopes.** A `verify` key can also read. A `read` key cannot spend credits.

**Refused keys.** One message covers every refusal, whether the key is unknown, revoked, expired or lacks the scope. This is deliberate, so the endpoint can't be used to test whether a key was ever valid.

**Organization keys.** A key issued to an organization records its receipts as that organization's. They are visible to its members and sent to its `receipt_created` webhooks (see `WEBHOOKS.md`). The same key can read any receipt the organization holds.

## `GET receipts/{digest}`

`digest` is the 64-character hex digest printed on the receipt. The API matches it case-insensitively.

```json
{
  "receipt": { "verdict": "go", "domain": "DEX-US", "subject": "r…", "checks": [ … ], "digest": "…", "evaluated_at": "…" },
  "digest": "…",
  "recorded_at": "2026-09-24T01:34:12Z",
  "original_request_id": "…",
  "scope": "account" | "organization"
}
```

The response is `404 receipt_not_found` when the digest was not recorded for your account or organization. A receipt that belongs to someone else gets the same answer, so its existence is not disclosed.

## `POST analyze/issuer` — `{ "issuer": "r…" }`

```json
{
  "address": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
  "ledger_index": 107193471,
  "domain": "bitstamp.net",
  "controls": {
    "require_auth": false,
    "global_freeze": false,
    "no_freeze": false,
    "clawback_enabled": false,
    "default_ripple": true,
    "deposit_auth": false,
    "master_key_disabled": true,
    "transfer_fee_bps": 15
  },
  "flags_raw": 10092544,
  "source": "XRPL mainnet, validated ledger, read live from the public rippled servers",
  "read_at": "…"
}
```

The example above is Bitstamp's account as read at ledger 107,193,471. The test suite checks the same reply against rippled's own `account_flags` reading of that ledger.

## `POST analyze/address` — `{ "address": "r…" }`

- **`reserve_xrp`:** computed from the reserve figures the server reports at the time of the read. It is not a constant. If those figures cannot be read, `reserve_xrp` and `spendable_xrp` are `null`; the API never falls back to a remembered value.
- **Never-funded address:** the response has `"funded": false` and `"account": null`, rather than a zero balance.
- **Credentials:** each one lists its issuer, its decoded type, whether it has been accepted, and its expiry.

## `POST analyze/transaction` — `{ "hash": "…" }`

- **Validated transactions:** only a validated transaction has a final result, so `result_final` and `succeeded` are set only when `validated` is true. Otherwise `succeeded` is `null`.
- **`delivered_amount`:** the amount the ledger says was actually delivered. It is `null` for a transaction that delivers nothing, and `"unavailable"` where rippled says so (partial payments before 2014).
- **Lookup across nodes:** if the first public node does not hold the transaction, the API asks the full-history node before answering `404 transaction_not_found`.

## Errors

Every response is JSON and carries a `request_id`. Every refusal is `{ "error": "<stable code>", "message": "…" }`.

| Status | Code | When |
|---|---|---|
| 400 | `invalid_digest`, `invalid_address`, `invalid_hash`, `invalid_json`, `invalid_subject`, `invalid_amount` | The input is malformed. Addresses must pass their base58 checksum. |
| 401 | `unauthorized` | No usable key with the required scope. |
| 402 | `quota_exhausted` | Adjudication only: no credits left. |
| 403 | `feature_not_enabled`, `entitlement_expired` | The account's plan doesn't include the API, or the entitlement has lapsed. |
| 404 | `receipt_not_found`, `account_not_found`, `transaction_not_found`, `unknown_domain`, `unknown_verb` | |
| 405 | `method_not_allowed` | `receipts/*` takes GET; `analyze/*` takes POST. |
| 413 / 415 | `payload_too_large`, `unsupported_media_type` | |
| 429 | `rate_limited` | Comes with `Retry-After`. |
| 502 | `ledger_unavailable` | Mainnet could not be read. Nothing was charged. |

## Not served by the API yet

These run in the app today, against the organization's governed policy, but have no API verb:

- policy evaluation against an organization's custom policy (`policy/evaluate`);
- simulation, which re-decides recorded verdicts under a draft policy (`simulation/run`);
- investigations (read or write).

The adjudication verb evaluates the published domain registry, not an organization's custom policy.
