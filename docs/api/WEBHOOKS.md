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
| `exception_evidence_requested` | a reviewer asking for more evidence before deciding an exception |
| `exception_evidence_added` | the requester adding that evidence, which returns the exception to pending |
| `policy_activated` | a policy version activated (four-eyes) |
| `investigation_created` | a shared investigation opened |
| `investigation_resolved` | a shared investigation closed |
| `receipt_created` | an API verification recorded against the organization |
| `custom_alert` | one of the organization's alert rules fired on a scheduled stress run (Institutional); `data.state` holds the rule, the condition, the wallet and the measured values |
| `xrpl_event` | the server watcher reading an event on one of the organization's watched XRPL accounts from a validated ledger (Strategic, or Enterprise for deposit addresses); `data` holds the address, type, tx_hash, ledger_index, ledger_time, counterparty and the event's facts |
| `deposit_screened` | an incoming payment to a watched deposit address screened before crediting (Enterprise); as `xrpl_event`, plus `verdict` (clear, review, hold) and `screening` (the amount to credit, each finding and the sender's funding chain) |
| `security_alert` | a watched account's signing keys changed (SetRegularKey, SignerListSet), its master key was disabled or re-enabled, or it was deleted (Strategic, Security Guardian); as `xrpl_event`, plus `reason`. The first move in almost every XRPL account takeover is a new key of the thief's own |
| `ping` | a test delivery requested from the app |

Events come only from server records: the append-only audit log, API
verifications, and the ledger events the server watcher
(`noshashi-xrpl-watch`) reads every minute for watched accounts. Changes
a workstation detects on its own are not server records and are not sent.

## Ledger events without webhooks

The same events can be pulled with an organization-scoped `nsh_live_` key:

- `GET /functions/v1/noshashi-xrpl-watch/events?after=<id>&limit=<≤1000>` —
  JSON (`next_cursor`), or `format=ndjson|csv`; filters `types`, `address`,
  `verdict`; `schema=<id>` applies one of the organization's export schemas.
- `POST /functions/v1/noshashi-xrpl-watch/history` with
  `{ address, from_ledger, to_ledger?, types?, screen?, config? }` — any
  account's events over a ledger range, read live and not stored.
- `POST /functions/v1/noshashi-xrpl-watch/screen` with
  `{ hash, deposit_address, config? }` — screen one incoming payment.

Screening includes the OFAC SDN list (refreshed daily from treasury.gov):
a sender or funder on it adds a critical `sanctioned_hop_<n>` finding and
the deposit is held with nothing to credit. A sender that starts and ends
like one of the organization's watched addresses or `trustedCounterparties`
adds `address_poisoning`.

## Sanctions lookup (public)

`GET /functions/v1/noshashi-xrpl-watch/sanctions?addresses=r…,r…` (up to
50) needs no key and answers any origin:

```json
{ "list": "OFAC SDN", "listed": 1, "list_as_of": "2026-09-28T04:42:11Z",
  "hits": [{ "address": "rnXyVQzgxZe7TR1EPzTkGj2jxH4LMJYh66", "entityName": "CHATEX",
             "entityNumber": 33854, "program": "CYBER2", "list": "OFAC SDN",
             "sourceUrl": "https://www.treasury.gov/ofac/downloads/sdn_comments.csv" }] }
```

## Website widget (Enterprise, Strategic)

Created in LEDGER WATCH › WEBSITE WIDGET, which gives the two lines to
paste: an element carrying `data-noshashi-embed` set to the widget's id,
and the script `https://www.noshashi.app/embed/v1.js` loaded async. It calls
`/functions/v1/noshashi-xrpl-watch/embed/{id}/{config|verify|check|deposit}`
with no key; the server answers only the origins the widget lists, at most
120 requests a minute per widget, and a deposit under review is shown to
the customer as `under_review` without its findings.

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
