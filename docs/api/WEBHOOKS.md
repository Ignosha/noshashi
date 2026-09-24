# NOSHASHI webhooks

An organization's owners and admins can register HTTPS endpoints that
receive the organization's governance events as they are recorded by the
server. Manage them in the app: **Ledger & Policy → POLICY** (organization
mode) → **WEBHOOKS**.

## Events

| Event | Sent when the server records… |
|---|---|
| `policy_exception` | an exception request on a verdict |
| `exception_decided` | an exception approved or rejected by an authorized second person |
| `policy_activated` | a policy version activated (four-eyes) |
| `investigation_created` | a shared investigation opened |
| `investigation_resolved` | a shared investigation closed |
| `receipt_created` | an API verification recorded against the organization |
| `ping` | a test delivery requested from the app |

Events come only from server records (the append-only audit log and API
verifications). XRPL-side changes a workstation detects — issuer flags,
credential expiry, liquidity — are not server records and are not sent.

## Request

`POST` with `Content-Type: application/json` and these headers:

| Header | Value |
|---|---|
| `X-Noshashi-Event` | the event name |
| `X-Noshashi-Delivery` | the delivery id (unique; use it to de-duplicate retries) |
| `X-Noshashi-Signature` | `t=<unix seconds>,v1=<hex HMAC-SHA256>` |
| `User-Agent` | `NOSHASHI-Webhooks/1` |

Body:

```json
{
  "id": "delivery uuid",
  "event": "exception_decided",
  "created_at": "2026-09-24T01:00:00.000000+00:00",
  "organization_id": "uuid",
  "data": {
    "action": "exception.approved",
    "entity_type": "policy_exception",
    "entity_id": "uuid",
    "actor_account_id": "uuid",
    "occurred_at": "…",
    "state": { "status": "approved", "requested_by": "…", "decided_by": "…", "receipt_digest": "…", "policy_id": "…", "policy_version": 6, "policy_hash": "…" },
    "audit_id": 123
  }
}
```

## Verifying the signature

The signature is HMAC-SHA256, keyed with the webhook's secret (`whsec_…`,
shown once when the webhook is created), over the string
`"<t>.<raw request body>"`. Verify against the raw bytes you received —
never a re-serialised object — and reject timestamps more than five
minutes old.

```ts
// Node 18+ / Deno / Workers
async function verify(secret: string, header: string, rawBody: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2)));
  const t = Number(parts.t);
  if (Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, parts.v1);
}
```

The same function, tested against the server's signing, is in
`src/lib/org/webhookSignature.ts`.

## Delivery and retries

Deliveries leave the database after the transaction that recorded the
event commits; nothing is sent for an action that was rolled back. A 2xx
response marks the delivery delivered. Anything else, a timeout (10 s) or
no response is recorded as failed and retried, up to three attempts in all:
the second about a minute after the first fails, the third about four
minutes after the second. Each attempt carries a fresh timestamp and
signature and the same delivery id. Delivery history is visible to owners
and admins in the app.

## Addresses

Only `https://` to a public DNS name is accepted. IP literals, `localhost`,
`.local`, `.internal`, `.arpa` and Supabase hosts are refused.
