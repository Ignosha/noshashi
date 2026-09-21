# noshashi-verify — the Compliance API

The server-side enforcement half of the NOSHASHI gate. It answers the same
question the console asks on every settlement — against live mainnet state —
but over HTTP, so your own systems can ask it too.

This is the flagship capability of the **Institution** plan
(`compliance_api` entitlement, sold as `nsh_live_…` API keys).

## Contract

`POST https://<project>.supabase.co/functions/v1/noshashi-verify`

Header:

```
Authorization: Bearer nsh_live_…
```

Body:

```json
{
  "subject": "r…",
  "domain": "DEX-US",
  "amount_xrp": 1000
}
```

| Field        | Type     | Notes                                          |
| ------------ | -------- | ---------------------------------------------- |
| `subject`    | string   | XRPL classic address to evaluate               |
| `domain`     | string   | Domain code from the registry (see GET)        |
| `amount_xrp` | number   | Transfer size; checked against reserve + cap   |

Response `200`:

```json
{
  "verdict": "go" | "hold" | "no-go",
  "domain": "DEX-US",
  "subject": "r…",
  "amount_xrp": 1000,
  "checks": [
    { "id": "ACCOUNT_ACTIVATED", "label": "…", "severity": "block", "passed": true, "detail": "…" }
  ],
  "digest": "SHA-256 receipt digest",
  "evaluated_at": "ISO timestamp",
  "latency_ms": 42
}
```

Errors are JSON with `{ "error": "<stable_code>", "message": "…" }`:

| Status | Code                | Meaning                                        |
| ------ | ------------------- | ---------------------------------------------- |
| 400    | `invalid_subject`   | address failed client-side shape check         |
| 400    | `invalid_amount`    | amount not a non-negative number               |
| 401    | `unauthorized`      | missing/unknown/revoked `nsh_live_` key        |
| 402    | `quota_exhausted`   | no prepaid verification credits remain         |
| 403    | `feature_not_enabled` | key is valid but the account lacks the feature |
| 403    | `entitlement_expired`  | entitlement has lapsed                      |
| 404    | `unknown_domain`    | domain code not in the registry                |
| 429    | `rate_limited`      | basic per-instance rate limit (60/min)         |
| 502    | `ledger_unavailable`| mainnet read failed; nothing consumed          |

`GET` the same URL (no auth) for the registry and a summary of the contract.

## Billing

One successful evaluation consumes **one** prepaid credit from
`noshashi.entitlements.verification_quota` via the atomic SQL function
`noshashi.consume_verification_credit`. The decrement happens **before** the
ledger read, so quota is never leakable through evaluation failures — but on a
`ledger_unavailable` failure a support operator can refund the single credit
manually. Feature and entitlement gates run first, so no credit is consumed by
a 401/403 response. Rate limit + quota exhaustion return before any debit.

Every call writes a row to `noshashi.verification_events` and stamps
`last_used_at` on the key — the console's Usage and API tabs read the same
tables.

## Deploy

```bash
# 1. Apply the schema (atomic credit function + event columns)
supabase db push

# 2. Deploy the function
supabase functions deploy noshashi-verify

# 3. Verify locally or against the endpoint
curl -X POST "https://<project>.supabase.co/functions/v1/noshashi-verify" \
  -H "Authorization: Bearer nsh_live_…" \
  -H "Content-Type: application/json" \
  -d '{"subject": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", "domain": "DEX-US", "amount_xrp": 100}'
```

## Production checklist

- [ ] Replace the in-memory rate limit with a managed limiter (Redis, Upstash)
      before selling to third parties.
- [ ] The ledger reader currently uses the public rippled HTTP endpoints; for
      an SLA-backed product point it at your own node(s).
- [ ] Keep `DOMAIN_REGISTRY` here in sync with `src/lib/policy.ts` — they are
      the same policy, mirrored deliberately.
- [ ] Refund policy for consumed-but-failed calls: implement
      `noshashi.refund_verification_credit` or handle via the console.
