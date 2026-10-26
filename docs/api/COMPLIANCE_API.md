# NOSHASHI Compliance API

One Edge Function, `noshashi-verify`, serves every verb. Paths are relative to

```
https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-verify
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
| `payment/verify` | POST | `verify` | 1 credit | Did this XRPL transaction pay this invoice? VERIFIED / HOLD / REJECTED, with a reason code, an evidence digest and, where configured, an Ed25519 signature. |
| `payment/signing-key` | GET | none | free | The public key that signs payment evidence, when signing is configured. |
| `authority/check` | POST | none | free | Whether an authority certificate's digest is the digest of its own body. |

**Auth.** Every verb except `authority/check` and `payment/signing-key` needs `Authorization: Bearer nsh_live_…`.

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

## `POST payment/verify` — did this transaction pay this invoice?

```json
{
  "hash": "F3B8B18E6AEFDCEA3388D0B0932820C4F10F4849847E7989876FA9CD19687A70",
  "network": "mainnet",
  "invoice": {
    "invoice_id": "INV-1042",
    "destination": "rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6",
    "destination_tag": 42,
    "asset": { "kind": "issued", "currency": "CSC", "issuer": "rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr" },
    "expected_amount": "162.6994990013102",
    "underpayment_tolerance": "0",
    "allow_partial_payment": false,
    "hold_overpayment": false
  },
  "dual_source": true,
  "record": true
}
```

The rules are the desktop engine's (`docs/VERIFICATION_ENGINE.md`, rules version `xrpl-payment/1`). The same reason codes come back in the same order. The decision key and evidence digest are byte-identical: `tests/fixtures/payment-verify-vectors.json` is checked against both implementations.

- **Inputs.**
  - Money is always a decimal string; a JSON number is refused.
  - `network` defaults to `mainnet`.
  - `invoice` is optional. Without it the report is `HOLD` / `NO_INVOICE_POLICY`: the transaction's facts, never a settlement.
- **Sources.** `dual_source` (default `true`) reads two nodes run by different operators: XRPL Labs and Ripple. Validated answers that differ give `HOLD` / `SOURCE_DISAGREEMENT`. With `false`, the API reads one node and moves to the next only if it gave no answer. Callers never supply a URL.
- **Settlement book.** With `record` (default `true`), a `VERIFIED` result is written to `payment_settlements` before it is served.
  - Each transaction can settle one invoice per tenant (the key's organization, otherwise its account) and network. A unique constraint enforces this.
  - The same transaction against a different invoice comes back `REJECTED` / `ALREADY_APPLIED`. That holds across instances and when two requests race.
- **Response.** `{ report, signature, signing, recorded, source_stats, billed }`. `report` has the contract fields: `status`, `reason_code`, `explanation`, `findings`, `validated`, `ledger_index`, `transaction_result`, `requested_amount`, `delivered_amount`, `partial_payment`, `amount_difference`, `sources`, `rule_version`, `decision_key`, `evidence_digest` and `evidence`.
- **What is decided.** Only `meta.delivered_amount` counts. A payment flagged `tfPartialPayment` is `REJECTED` / `PARTIAL_NOT_PERMITTED` unless the invoice allows partial payments.
- **Billing.** One credit per call. It is not charged when no source answered (`billed: false`), or for a 400.
- **Audit.** Every served report is written to `payment_verifications` before the response. If that write fails, the report is not served (`503 report_not_recorded`) and the credit is returned.
- **Idempotency.** `Idempotency-Key` replays the stored response. A key reused for a different hash, network or invoice is refused with `422 idempotency_key_reused`.
- **Signature.** When `PAYMENT_EVIDENCE_SIGNING_KEY` is set, `signature` is Ed25519 over `payload`, a canonical statement of the hash, invoice, status, reason, rules, decision key and evidence digest. Check it with the key from `GET payment/signing-key`, then re-hash `evidence`. Without the key, `signature` is `null` and `signing` says so: the digest then proves integrity, not origin.

## Check results: five states

Every check carries `passed`, and may carry `state`: `PASS`, `FAIL`, `REVIEW`, `INSUFFICIENT_DATA` or `NOT_APPLICABLE`. Without `state`, the state is implied: `PASS` when passed, otherwise `FAIL` for a blocking check and `REVIEW` for an advisory one.

- **`INSUFFICIENT_DATA`** (`passed: false`) means the evidence the rule needs could not be read. It is no answer, not a failure.
- **`NOT_APPLICABLE`** (`passed: true`) means the rule does not apply to this subject, for example supply concentration for an issuer with nothing outstanding.

In a digest a check is `[id, passed]`, or `[id, passed, state]` when the state is one of those two. Every receipt and certificate issued before the states existed therefore keeps its bytes. `authority/check` accepts `state` on each check and binds it the same way; any other value is refused with `invalid_checks`.

## Errors

Every response is JSON and carries a `request_id`. Every refusal is `{ "error": "<stable code>", "message": "…" }`.

| Status | Code | When |
|---|---|---|
| 400 | `invalid_digest`, `invalid_address`, `invalid_hash`, `invalid_json`, `invalid_subject`, `invalid_amount`, `invalid_network`, `invalid_invoice`, `invalid_policy`, `invalid_idempotency_key` | The input is malformed. Addresses must pass their base58 checksum. |
| 401 | `unauthorized` | No usable key with the required scope. |
| 402 | `quota_exhausted` | Adjudication and `payment/verify`: no credits left. |
| 403 | `feature_not_enabled`, `entitlement_expired` | The account's plan doesn't include the API, or the entitlement has lapsed. |
| 404 | `signing_not_configured`, `receipt_not_found`, `account_not_found`, `transaction_not_found`, `unknown_domain`, `unknown_verb` | |
| 405 | `method_not_allowed` | `receipts/*` takes GET; `analyze/*` takes POST. |
| 422 | `idempotency_key_reused` | `payment/verify`: the key was used for a different question. |
| 413 / 415 | `payload_too_large`, `unsupported_media_type` | |
| 429 | `rate_limited` | Comes with `Retry-After`. |
| 502 | `ledger_unavailable` | Mainnet could not be read. Nothing was charged. |
| 503 | `report_not_recorded`, `receipt_not_recorded` | The audit row could not be written, so nothing was served or charged. Retry. |

## Free: `GET /api/v1/asset-risk` (no key)

Before you have a key, one call on the website's own origin answers the
first question most integrations ask about an issued asset: what can its
issuer do to holders, and what could actually be sold or bought on its XRP
order book right now?

```
curl "https://www.noshashi.app/api/v1/asset-risk?issuer=rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B&currency=USD&size=1000"
```

- `issuer` (required), `currency` (optional; without it only issuer controls are read), `size` (optional, units of the asset; adds what a sale and a purchase of that size would fill at).
- Response schema `noshashi.asset-risk.v1`: `issuer_controls` (the authority certificate's verdict, rules version, digest and every check), `liquidity` (quoted against fillable depth, reference mid, `exit.sell` and `exit.buy`), `ledgers` (the validated ledger of each read), `unknowns` (each source that could not be read), `limitations` (what is never checked), `evidence` (the raw-read endpoints) and `receipt` (SHA-256 over everything else, keys sorted).
- Errors are `{ "error": "<code>", "message": "…" }`: `invalid_issuer`, `invalid_currency`, `invalid_size`, `size_needs_currency`, `rate_limited` (with `Retry-After`), `ledger_unreachable`. One unreadable source does not fail the call; it is listed in `unknowns`.
- 30 uncached requests a minute per caller; answers are cached for 60 seconds.

It is not a rating. A report without findings means the ledger showed none of the controls or thin books it checks for; it says nothing about backing, redemption or who the issuer is.

## Not served by the API yet

These run in the app today, against the organization's governed policy, but have no API verb:

- policy evaluation against an organization's custom policy (`policy/evaluate`);
- simulation, which re-decides recorded verdicts under a draft policy (`simulation/run`);
- investigations (read or write).

The adjudication verb evaluates the published domain registry, not an organization's custom policy.
