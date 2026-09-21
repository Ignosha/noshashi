# NOSHASHI Compliance API — architecture specification

**Status of this document.** Sections 1–4 and 8–11 describe
`supabase/functions/noshashi-verify`, which is deployed and is the
authentication, billing, rate-limit and audit path for everything below.
Sections 5–7 specify `/v1/market` and `/v1/combined`, which are designed
but **not yet implemented** — they are here as the design of record so the
first integration is built against the shape it will keep. Anything not
yet built is marked `NOT BUILT`. Nothing in a customer-facing document
should claim otherwise.

Entitlement: the API requires the `compliance_api` grant, which is on the
Institutional plan. Pro accounts receive 5,000 verifications as part of
their plan and can consume them through the console; API key issuance is
Institutional.

---

## 1. Design principles

Four constraints shape everything else, and they are worth stating because
each one rules out an easier design.

**A verdict is about a ledger index, not about a moment.** Every response
carries the ledger state it rests on. A cached compliance answer is not a
stale answer, it is a wrong answer about a different ledger, which is why
nothing here is cacheable and every response is `Cache-Control: no-store`.

**The API and the console must never disagree.** The server-side policy
engine is a line-for-line mirror of `src/lib/policy.ts`, and both digest
the receipt with the same canonical JSON. If a customer's own systems and
their compliance officer's screen produce different verdicts for the same
facts, the product is worthless regardless of which one is right.

**Every adjudication is recorded before it is served.** The audit write is
not a side effect, it is a precondition. A verdict served without a record
of having served it is the exact gap an examiner asks about.

**A retry must not cost twice.** A caller whose request timed out cannot
know whether it was adjudicated. Idempotency is therefore not a
convenience feature; without it the only safe behaviour on the client side
is one that double-charges and double-logs.

---

## 2. Base URL and versioning

```
https://api.noshashi.app/v1
```

Currently served directly from Supabase Edge Functions at
`https://<project>.supabase.co/functions/v1/noshashi-verify`. The
`api.noshashi.app` origin is a CNAME in front of it; both work, and the
vanity origin is the one to publish.

Versioning is in the path. `/v1` is frozen once the first customer
integrates: new fields may be **added** to a response, and new optional
request fields may be accepted, but no field is removed, renamed or
retyped inside a version. A breaking change gets `/v2` and `/v1` gets a
minimum twelve months of support with a deprecation header.

---

## 3. Authentication

```http
Authorization: Bearer nsh_live_<40 base62 characters>
```

Keys are generated in the console (Account → Compliance API), shown once,
and stored only as a SHA-256 digest. There is no recovery path — support
genuinely cannot retrieve a key, which is the property that makes the
promise meaningful. Losing the database leaks no working key.

| Property | Value |
|---|---|
| Format | `nsh_live_` + 40 characters, uniform base62 (~238 bits) |
| Storage | SHA-256 hex; the plaintext is never written |
| Scopes | `verify` today; enforced per key, service-role writable only |
| Expiry | Optional `expires_at`. Enforced on every request |
| Revocation | **Terminal.** A database trigger refuses to un-revoke a key |
| Rotation | Issue the new key, deploy, revoke the old. No forced overlap window |

Every authentication failure returns the same `401` body regardless of
cause — unknown, revoked, expired, or out of scope. Distinguishing them
would confirm that a key had once been valid, which turns the endpoint
into an oracle for testing harvested keys. The specific reason is in the
logs against the request id.

Keys are per subscription. On cancellation, keys stop authenticating at
the end of the paid period; the audit trail stays exportable for 30 days.

---

## 4. Rate limits

Enforced per **API key**, in Postgres, on two windows. Two windows because
one number cannot describe both a burst and a sustained rate: a caller
allowed 50/sec is not thereby allowed 3,000 every second of every minute.

| Tier | Burst (1s) | Sustained (60s) |
|---|---|---|
| Free (`operator`) | 2 req/sec | 30 req/min |
| Pro (`desk`) | **50 req/sec** | 1,500 req/min |
| Institutional (`institution`) | 200 req/sec default | 9,000 req/min |
| Institutional, negotiated | `entitlements.rate_limit_per_second` | 30 × burst |

A negotiated Institutional limit is a number set per contract on the
account. It is not client-settable: `authenticated` holds `SELECT` on
entitlements and nothing more.

Responses carry standard headers:

```http
RateLimit-Limit: 50
RateLimit-Remaining: 0
RateLimit-Reset: 1
Retry-After: 1
```

There is also a coarse per-instance IP pre-filter (100 requests per 10
seconds) in front of authentication. It exists only to keep an
unauthenticated flood off the database. It is **not** the published limit
and is not sold as one.

**Client guidance.** On `429`, honour `Retry-After`. Do not retry `4xx`
other than `429`. Retry `502`/`503`/`504` with exponential backoff and
jitter, always with the same `Idempotency-Key`.

---

## 5. `POST /v1/compliance/:address`

*Implemented, as `POST /noshashi-verify`. The path form below is the
published shape; the function accepts the subject in the body today.*

Answers: **may this account move this amount inside this Permissioned
Domain?**

### Request

```http
POST /v1/compliance/rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH HTTP/1.1
Host: api.noshashi.app
Authorization: Bearer nsh_live_…
Content-Type: application/json
Idempotency-Key: settlement-8814-attempt-1

{
  "domain": "DEX-US",
  "amount_xrp": 25000
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `subject` | string | yes (in body today) | XRPL classic address. **Base58 checksum validated** — a mistyped address is refused, not adjudicated |
| `domain` | string | yes | Domain code. `GET /v1/compliance` lists them |
| `amount_xrp` | number | yes | ≥ 0 and ≤ 100,000,000,000 (total XRP supply) |

Body limit is 4,096 bytes. `Content-Type: application/json` required.

### Response `200`

```json
{
  "verdict": "no-go",
  "domain": "DEX-US",
  "subject": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
  "amount_xrp": 25000,
  "checks": [
    {
      "id": "ACCOUNT_ACTIVATED",
      "label": "Account activated on mainnet",
      "severity": "block",
      "passed": true,
      "detail": "Account is funded and has a validated sequence number."
    },
    {
      "id": "CREDENTIAL_SANCTIONS_CLEARANCE",
      "label": "Holds sanctions clearance",
      "severity": "block",
      "passed": false,
      "detail": "Domain DEX-US requires an accepted SANCTIONS_CLEARANCE credential."
    },
    {
      "id": "DOMAIN_ATTESTATION",
      "label": "Account publishes a domain attestation",
      "severity": "warn",
      "passed": false,
      "detail": "No Domain field set on the account — attestation strengthens the audit trail."
    }
  ],
  "digest": "4F2A…C1",
  "evaluated_at": "2026-09-10T16:41:22.881Z",
  "latency_ms": 214,
  "request_id": "0f7c1d2e-8a41-4e0b-9c33-6b2f1a9d4e57"
}
```

**Verdict algebra.** `no-go` if any `block` check failed. `hold` if no
`block` failed but a `warn` did. `go` only if everything passed. A `hold`
is not a soft no-go: it means the facts are clean but something needs a
human, and it is designed to be routed to one.

**`digest`** is SHA-256, uppercase hex, over canonical JSON of
`{verdict, domainId, subject, amountXrp, evaluatedAt, checks:[[id,passed]…]}`.
The console computes it the same way over the same facts. Two receipts with
the same digest are the same adjudication; store it, and an examiner can be
handed a verdict and shown it was not edited.

### `GET /v1/compliance`

Unauthenticated service descriptor: domain codes, the request contract,
and published rate limits. Useful as a health check.

---

## 6. `GET /v1/market/:pair` — `NOT BUILT`

Answers: **what is this market actually worth, as distinct from what it
advertises?**

```http
GET /v1/market/USD.rIssuer…-XRP?size=50000
```

Pair form is `<currency>.<issuer>-<counter>`. `size` is optional and, when
given, adds an exit simulation for that size.

```json
{
  "pair": "USD.rIssuer…-XRP",
  "ledger_index": 94812004,
  "mid": 0.5142,
  "spread_bps": 38,
  "crossed": false,
  "depth": {
    "bid_listed": 4820000,
    "bid_fundable": 391402,
    "ask_listed": 2210000,
    "ask_fundable": 188774,
    "band_pct": 10
  },
  "amm": {
    "exists": true,
    "amount_xrp": 812004.2,
    "amount_asset": 417883.1,
    "trading_fee_bps": 30,
    "asset_frozen": false
  },
  "exit": {
    "requested": 50000,
    "to_book": 31402.8,
    "to_pool": 18597.2,
    "unfilled": 0,
    "proceeds_xrp": 96114.7,
    "vwap": 0.5203,
    "slippage_bps": 119
  },
  "request_id": "…"
}
```

The load-bearing distinction is `bid_listed` against `bid_fundable`.
Listed depth includes offers whose owner no longer holds the funds to
honour them; on some mainnet books that is over 90% of the total. Every
downstream number uses the fundable figure, and the listed one is returned
so the phantom depth is visible rather than quietly removed.

`exit` routes across the resting book **and** the AMM pool and reports the
split, because a book-only simulation understates thin markets and a
pool-only one ignores the queue.

---

## 7. `GET /v1/combined/:address` — `NOT BUILT`

Answers both questions in one read, against one ledger index. This is the
endpoint that is the product: not two calls stitched together by the
caller, but one adjudication where the compliance facts and the liquidity
facts provably describe the same instant.

```http
GET /v1/combined/rHolder…?domain=DEX-US&amount_xrp=25000
```

```json
{
  "subject": "rHolder…",
  "ledger_index": 94812004,
  "compliance": { "verdict": "go", "checks": [ … ], "digest": "…" },
  "liquidity": {
    "positions": [
      {
        "issuer": "rIssuer…",
        "currency": "USD",
        "balance": 412000,
        "mark_xrp": 801245.1,
        "recoverable_xrp": 612880.4,
        "recovery_ratio": 0.7649,
        "days_to_exit": 4,
        "can_be_frozen": true,
        "already_frozen": false
      }
    ],
    "stress": {
      "scenario": "stressed",
      "mark_xrp": 801245.1,
      "recoverable_xrp": 612880.4,
      "recovery_ratio": 0.7649,
      "waterfall": [
        { "id": "recoverable", "xrp": 612880.4 },
        { "id": "slippage", "xrp": 96218.0 },
        { "id": "contention", "xrp": 0 },
        { "id": "freeze", "xrp": 92146.7 }
      ],
      "freezable_share": 1.0
    }
  },
  "joint_verdict": "clear-but-illiquid",
  "request_id": "…"
}
```

`joint_verdict` is the value the two halves create together, and it has
readings neither side can produce alone:

| Value | Meaning |
|---|---|
| `clear` | Permitted to move, and exitable at an acceptable cost |
| `clear-but-illiquid` | Permitted, but the exit costs more than the policy allows |
| `liquid-but-blocked` | The market is there; the policy is not satisfied |
| `trapped` | Neither. No permitted route and no exit |

`clear-but-illiquid` is the reading a compliance system alone will always
report as a clean pass, and it is the one that loses money.

Billing: `/v1/combined` consumes **two** verification credits — one per
half — and says so in the response headers.

---

## 8. Webhooks

Institutional accounts register endpoints in the console. Delivery is
at-least-once; handlers must be idempotent on `event_id`.

### Envelope

```json
{
  "event_id": "evt_01JB7Q…",
  "type": "freeze_risk.raised",
  "created_at": "2026-09-10T16:41:22.881Z",
  "account_id": "…",
  "ledger_index": 94812004,
  "data": { … }
}
```

### Signature

```http
NOSHASHI-Signature: t=1789043282,v1=5f1c…
```

`v1` is HMAC-SHA256 over `"{t}.{raw body}"` using the endpoint's signing
secret, hex-encoded. **Verify against the raw bytes before parsing JSON** —
re-serialising changes them. Reject a timestamp more than 300 seconds old
to close the replay window, and compare with a constant-time function.

### Event types

| Type | Fires when |
|---|---|
| `freeze_risk.raised` | An issuer you hold sets `lsfGlobalFreeze`, or gains freeze capability |
| `freeze_risk.cleared` | An issuer clears a freeze, or sets `lsfNoFreeze` |
| `credential.expiring` | A credential a domain requires lapses within the configured horizon |
| `credential.revoked` | A required credential is revoked on-ledger |
| `domain.policy_changed` | A Permissioned Domain's requirements or ceiling changed |
| `market.depth_breach` | Fundable depth on a watched pair fell below a threshold |
| `market.slippage_breach` | Simulated exit slippage for a watched size exceeded a threshold |
| `stress.recovery_breach` | Portfolio recovery ratio under a scenario fell below a threshold |

### `freeze_risk.raised`

```json
{
  "type": "freeze_risk.raised",
  "data": {
    "issuer": "rIssuer…",
    "currencies": ["USD"],
    "balance_at_risk": 412000,
    "mark_xrp": 801245.1,
    "trigger": "lsfGlobalFreeze",
    "previous_posture": { "no_freeze": false, "global_freeze": false },
    "current_posture":  { "no_freeze": false, "global_freeze": true },
    "severity": "critical",
    "action": "Treat as immobilised, not as a holding. Contact the issuer."
  }
}
```

This is the event that justifies the monitor. An issuer setting
`lsfGlobalFreeze` immobilises every holder's balance the moment the
transaction validates, and nothing on the ledger notifies the holder.

### `market.depth_breach`

```json
{
  "type": "market.depth_breach",
  "data": {
    "pair": "USD.rIssuer…-XRP",
    "threshold": { "metric": "bid_fundable", "operator": "lt", "value": 250000 },
    "observed": { "bid_fundable": 191402, "bid_listed": 4820000 },
    "position": 412000,
    "position_over_depth": 2.15,
    "severity": "warn"
  }
}
```

`position_over_depth` above 1 means the position cannot exit into the book
at all — the operator *is* the market.

### Delivery

Retries at 0s, 30s, 2m, 10m, 1h, 6h, then dead-letter. Any `2xx` is
success. Expect a response within 5 seconds. An endpoint failing for 24
hours is disabled and an alert is raised in the console.

---

## 9. Errors

One envelope for every non-2xx, always JSON, always with `request_id`.

```json
{
  "error": "quota_exhausted",
  "message": "No verification credits remaining. Purchase a credit pack.",
  "request_id": "0f7c1d2e-8a41-4e0b-9c33-6b2f1a9d4e57"
}
```

Switch on `error`, never on `message` — messages are prose and will be
improved. `request_id` is also `X-Request-Id`, is stored on the audit row,
and is the only thing support needs to find your call.

| Status | `error` | Meaning | Retry? |
|---|---|---|---|
| 400 | `invalid_json` | Body is not a JSON object | No |
| 400 | `invalid_subject` | Not an XRPL address, or failed its base58 checksum | No |
| 400 | `invalid_amount` | Negative, non-finite, or above total XRP supply | No |
| 400 | `invalid_idempotency_key` | Over 255 characters | No |
| 401 | `unauthorized` | Key unknown, revoked, expired, or lacks `verify` | No |
| 402 | `quota_exhausted` | No prepaid credits | No — buy credits |
| 403 | `feature_not_enabled` | Plan does not include `compliance_api` | No |
| 403 | `entitlement_expired` | Subscription lapsed | No |
| 404 | `unknown_domain` | Domain code not in the registry | No |
| 405 | `method_not_allowed` | Wrong verb; `Allow` header lists the right ones | No |
| 413 | `payload_too_large` | Body over 4,096 bytes | No |
| 415 | `unsupported_media_type` | `Content-Type` is not `application/json` | No |
| 429 | `rate_limited` | Window exceeded; honour `Retry-After` | Yes |
| 500 | `internal_error` | Unexpected. Quote `request_id` | Yes, backoff |
| 502 | `ledger_unavailable` | No public node answered. **Credit refunded** | Yes, backoff |
| 503 | `not_configured` | Deployment misconfigured. Not your fault | Yes, backoff |
| 503 | `receipt_not_recorded` | Audit write failed, so nothing was served. **Credit refunded** | Yes |

Two of those deserve emphasis, because they are deliberate and unusual.

`502 ledger_unavailable` **refunds the credit.** The credit is drawn before
the ledger read, so an infrastructure failure would otherwise charge for a
verdict that never existed.

`503 receipt_not_recorded` means the verdict was computed and then
**withheld** because it could not be written to the audit trail. This is
fail-closed on purpose: for a customer whose adjudications an examiner will
read, an unlogged verdict is worse than no verdict. The credit is refunded.

---

## 10. Idempotency

```http
Idempotency-Key: settlement-8814-attempt-1
```

Send one on every `POST`. Scoped to your account, so two customers may
safely choose the same string. Up to 255 characters; a UUID or your own
settlement id is ideal.

A repeat replays the **stored response bytes**:

```http
HTTP/1.1 200 OK
X-Idempotent-Replay: true
X-Original-Request-Id: 0f7c1d2e-…
```

It does not re-adjudicate, and that is the point. Re-running the policy
would read a ledger that has moved on, so the retry could return a
different verdict and a different digest under the same key — which is the
one thing the key exists to rule out. A replay costs no credit.

Two concurrent requests with the same key: one wins, the other is served
the winner's receipt as a replay. No double charge, one audit row.

---

## 11. Quickstart

### 11.1 Get a key

1. Sign in to the console → **Account** → **Compliance API**.
2. **New key**, name it after the system that will use it
   (`settlement-engine-prod`), not after a person.
3. Copy it now. It is shown once and is not recoverable.
4. Put it in your secret manager. Never in source, never in a browser —
   a `nsh_live_` key in client-side JavaScript is a published key.

### 11.2 First call

```bash
curl -sS -X POST https://api.noshashi.app/v1/compliance \
  -H "Authorization: Bearer $NOSHASHI_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "subject": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
    "domain": "DEX-US",
    "amount_xrp": 1000
  }'
```

A `401` on the first try is almost always a copy-paste artefact — a
trailing newline, or the `nsh_live_` prefix dropped. Confirm the endpoint
is reachable and your JSON is right with the unauthenticated descriptor:

```bash
curl -sS https://api.noshashi.app/v1/compliance
```

### 11.3 Node

```js
// The retry loop is the part worth copying. Everything else is a fetch.
const KEY = process.env.NOSHASHI_KEY;

export async function verify(subject, domain, amountXrp, idempotencyKey) {
  const backoff = [0, 500, 2000, 8000];

  for (let attempt = 0; attempt < backoff.length; attempt += 1) {
    if (backoff[attempt]) {
      // Full jitter. A fleet retrying on a fixed schedule reconverges
      // into the same spike it was backing off from.
      await new Promise((r) => setTimeout(r, backoff[attempt] * Math.random()));
    }

    const response = await fetch("https://api.noshashi.app/v1/compliance", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        // Constant across retries — that is what makes them free.
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ subject, domain, amount_xrp: amountXrp }),
    });

    if (response.ok) return response.json();

    const body = await response.json().catch(() => ({}));

    if (response.status === 429) {
      const wait = Number(response.headers.get("retry-after") ?? 1) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    // 502 and 503 are transient and the credit has already been
    // refunded, so retrying is both safe and free.
    if (response.status >= 500) continue;

    // Everything else is a decision, not a hiccup. Retrying a 402 or a
    // 400 just burns the budget on the same answer.
    throw Object.assign(new Error(body.message ?? response.statusText), {
      code: body.error,
      requestId: body.request_id,
      status: response.status,
    });
  }
  throw new Error("verify: exhausted retries");
}
```

### 11.4 Python

```python
import os, uuid, time, random, requests

KEY = os.environ["NOSHASHI_KEY"]
URL = "https://api.noshashi.app/v1/compliance"

def verify(subject: str, domain: str, amount_xrp: float, idem: str | None = None):
    idem = idem or str(uuid.uuid4())
    for delay in (0, 0.5, 2, 8):
        if delay:
            time.sleep(delay * random.random())
        r = requests.post(
            URL,
            headers={
                "Authorization": f"Bearer {KEY}",
                "Content-Type": "application/json",
                "Idempotency-Key": idem,
            },
            json={"subject": subject, "domain": domain, "amount_xrp": amount_xrp},
            timeout=15,
        )
        if r.ok:
            return r.json()
        if r.status_code == 429:
            time.sleep(float(r.headers.get("Retry-After", 1)))
            continue
        if r.status_code >= 500:
            continue
        body = r.json()
        raise RuntimeError(f"{body.get('error')}: {body.get('message')} "
                           f"[request_id={body.get('request_id')}]")
    raise RuntimeError("verify: exhausted retries")
```

### 11.5 Common patterns

**Pre-settlement gate.** Call before broadcasting. Treat `no-go` as a
refusal and `hold` as a route to a human — not as a pass with a warning.
Store `digest` and `request_id` against your own settlement record; that
pair is what lets you produce the adjudication later without trusting our
copy of it.

**Nightly book review.** Walk your positions once a day well inside the
sustained limit. `stress.recovery_breach` webhooks catch intraday moves;
the sweep is for the slow drift a threshold does not fire on.

**Reconciling usage against an invoice.** Console usage counts are exact
counts from the audit table, not samples. If your count and ours differ,
the difference will be replays (`X-Idempotent-Replay: true`, never billed)
and refunds (`502`/`503`, credited back). Both are visible in the export.

**What not to do.** Do not cache a verdict. Do not treat `latency_ms` as
an SLA measurement — it is server-side processing time and excludes the
network. Do not call from a browser.

---

## 12. Implementation status

| Item | Status |
|---|---|
| `POST /noshashi-verify` — auth, entitlement, credit, audit | Deployed |
| Base58 checksum validation of `subject` | Done |
| Durable per-key, tier-aware rate limiting | Done — needs migration applied |
| Idempotency-Key replay | Done — needs migration applied |
| Credit refund on `502`/`503` | Done — needs migration applied |
| Terminal key revocation, key expiry, key scopes | Done — needs migration applied |
| Fail-closed audit write | Done |
| Vanity `api.noshashi.app` origin | Not configured |
| Path-style `/v1/compliance/:address` | Not built (body-style works) |
| `GET /v1/market/:pair` | Not built |
| `GET /v1/combined/:address` | Not built |
| Webhook delivery, signing, retries | Not built |
| OpenAPI 3.1 document | Not built |

Apply the migration before deploying the function — the function reads
`entitlements.rate_limit_per_second`, `api_keys.scopes` and
`verification_events.receipt`, and will fail on a database that does not
have them:

```bash
supabase db push
supabase functions deploy noshashi-verify
```
