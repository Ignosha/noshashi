# XRPL payment verification engine

`src-tauri/src/verify/` answers one question: **did this XRPL transaction
pay this invoice?** It reads the transaction from allowlisted XRPL nodes,
checks it with exact arithmetic, and returns `VERIFIED`, `HOLD` or
`REJECTED` with a stable reason code, a plain-English explanation and a
SHA-256 digest over a canonical evidence record.

The desktop app calls it through the Tauri command `verify_xrpl_payment`.
The hosted Compliance API serves the same rules as `POST payment/verify`
(`supabase/functions/noshashi-verify/payment.ts`, see "Hosted API" below).
In the app it is the **Invoice check** panel on the Settlement screen
(`src/components/scenes/InvoiceCheck.tsx`). The existing settlement read
(`src/lib/desk/settlement.ts`) is unchanged: it describes what a
transaction moved, and this engine decides whether that settles an invoice.

## Layers

| Layer | File | Holds |
|---|---|---|
| Amounts | `amount.rs` | Exact decimals (digit strings + exponent), XRP as integer drops, asset identity (currency **and** issuer). No floating point. |
| Contract | `model.rs` | `Status`, `Reason`, `InvoicePolicy`, `Observation`, `VerificationReport`, `RULES_VERSION` |
| Rules | `verifier.rs` | Pure function: source reads + invoice → report. No I/O, no clock. |
| Evidence | `evidence.rs` | Canonical JSON and SHA-256 |
| Transport | `rpc.rs` | Allowlisted endpoints, timeouts, size cap, retries |
| Idempotency | `book.rs` | Which transaction already settled which invoice (per session) |
| Command | `mod.rs` | `verify_xrpl_payment`: the only entry point from the web view |

Evidence, interpretation and policy are kept apart. `evidence.observed`
holds what each source returned, copied. `evidence.invoice` is what the
caller supplied. `evidence.derived` is what these rules concluded from the
two.

## Request

```json
{
  "hash": "F3B8B18E…7A70",
  "network": "mainnet",
  "invoice": {
    "invoice_id": "INV-1042",
    "destination": "r…",
    "destination_tag": 42,
    "asset": { "kind": "issued", "currency": "USD", "issuer": "r…" },
    "expected_amount": "125.50",
    "underpayment_tolerance": "0.01",
    "allow_partial_payment": false,
    "hold_overpayment": false
  },
  "dualSource": true,
  "record": true
}
```

- `asset` is `{ "kind": "xrp" }` or `{ "kind": "issued", "currency", "issuer" }`.
- `expected_amount` is in units of the asset (XRP, not drops), always a string.
- `invoice` is optional. Without it, the report gives the transaction's facts with `NO_INVOICE_POLICY` (HOLD); it never says an invoice is settled.
- `dualSource` reads from two endpoints run by **different operators** (XRPL Labs and Ripple) and compares them.
- `record` remembers a VERIFIED settlement for this session, so the same transaction cannot settle a different invoice.

The command never takes a URL, never signs and never touches a key.

## Statuses and reason codes

| Reason | Status | When |
|---|---|---|
| `SETTLED` | VERIFIED | Validated, `tesSUCCESS`, not partial, right account, tag and asset, delivered ≥ expected − tolerance |
| `SETTLED_PARTIAL_PERMITTED` | VERIFIED | As above, flagged partial, and the invoice allows partial payments |
| `NO_INVOICE_POLICY` | HOLD | No invoice supplied: facts only |
| `NOT_FOUND` | HOLD | No source has it (not the same as failed) |
| `NOT_VALIDATED` | HOLD | Not in a validated ledger, or validation not stated |
| `MISSING_METADATA`, `MISSING_RESULT` | HOLD | The response lacks what the decision needs |
| `DELIVERED_MISSING` | HOLD | No `delivered_amount`; the requested amount is never used instead |
| `DELIVERED_UNAVAILABLE` | HOLD | `delivered_amount` is `"unavailable"` (pre-2014 ledgers): unknown, not zero |
| `UNSUPPORTED_ASSET` | HOLD | e.g. MPT amounts; never read as XRP |
| `MALFORMED_AMOUNT`, `MALFORMED_RESPONSE` | HOLD | Unreadable fields |
| `HASH_MISMATCH` | HOLD | A source answered with a different transaction; its answer is discarded |
| `SOURCE_UNAVAILABLE` | HOLD | Timeouts, HTTP errors, rate limits, oversized or malformed replies |
| `SOURCE_DISAGREEMENT` | HOLD | Two validated observations differ; neither is chosen |
| `OVERPAID_REVIEW` | HOLD | Overpaid and the invoice asks for review |
| `INVALID_HASH` | REJECTED | Not 64 hex characters; nothing is read |
| `INVALID_POLICY` | REJECTED | The invoice itself is invalid (zero amount, negative tolerance, sub-drop XRP…) |
| `TRANSACTION_FAILED` | REJECTED | Validated with a non-`tesSUCCESS` result: final, delivered nothing |
| `NOT_PAYMENT` | REJECTED | Not a Payment transaction |
| `DESTINATION_MISMATCH`, `DESTINATION_TAG_MISMATCH` | REJECTED | Paid somewhere else |
| `ASSET_MISMATCH` | REJECTED | Different asset; same code from another issuer counts as different |
| `PARTIAL_NOT_PERMITTED` | REJECTED | Flagged `tfPartialPayment` and the invoice does not accept partial payments |
| `UNDERPAID` | REJECTED | Delivered less than expected − tolerance |
| `ALREADY_APPLIED` | REJECTED | This transaction already settled a different invoice |

`PARTIAL_PAYMENT_FLAGGED` appears only as an informational finding, never as
the deciding reason. Codes are never renamed within a rules version
(`xrpl-payment/1`); new codes are added. Any change to which status or
reason an input gets bumps `RULES_VERSION`.

## How the hard cases are handled

- **Partial payments.** The decision uses `meta.delivered_amount` only. `Amount` and `DeliverMax` are recorded as `requested_amount` and never credited. `tfPartialPayment` (0x00020000) is read from `Flags`. A missing `delivered_amount` is HOLD, and `"unavailable"` is HOLD. Neither is treated as zero or as the requested amount.
- **Hash.** It must be 64 hex characters, normalised to upper case and checked before any read. Every observation's returned hash must equal it.
- **Validation.** Only `validated: true` counts. A missing flag is treated as not validated.
- **Asset identity.** XRP is integer drops (`1 XRP = 1,000,000 drops`). Issued assets compare both currency and issuer. 40-hex currency codes compare case-insensitively.
- **Amounts.** Exact decimals throughout. A real mainnet partial payment that was short by 0.000000000014687 SOLO is reported as exactly that (test `t16`).
- **Several sources.** Two validated observations must agree on hash, ledger, type, result, account, destination, tag, flags and both amounts. A source that has not seen the transaction yet is recorded as lagging, not as a contradiction.

## Evidence and what its digest means

The record has the schema `noshashi.xrpl-payment-evidence/1`. It holds:
- the rules version, network, hash and evaluation time;
- every source read (`observed`): returned hash, validation flag, ledger index, type, result, accounts, tag, flags, raw requested and delivered amounts, and observation time;
- the invoice as supplied;
- the derived status, reason, findings and amounts.

**Canonical form:** object keys are sorted by UTF-8 bytes at every depth, with no whitespace, and money is always stored as strings. `evidence_digest` is the upper-case hex SHA-256 of that form. `canonicalJson` in `src/lib/desk/verifyPayment.ts` produces the same bytes, and a shared test vector pins both sides (`t35` in Rust, `verifyPayment.test.ts` in TypeScript).

What the digest proves, and what it doesn't:
- **Content integrity:** yes. The record re-hashes to its digest only if not one byte changed.
- **Authenticity:** not from the digest alone, because anyone can compute a SHA-256. The hosted API can add an Ed25519 signature with a key held only in its secrets (see "Hosted API").
- **Ledger truth:** no. It fixes what the sources said. Validation and agreement between independent sources are separate checks, recorded inside the record.

`decision_key` is SHA-256 of `{network, hash, invoice, rules}`. The same transaction, invoice and rules always give the same key, so it can be used to deduplicate.

## Transport limits (`rpc.rs`)

- **Allowlist:**
  - mainnet: `xrplcluster.com` (XRPL Labs), `s2.ripple.com` and `s1.ripple.com` (Ripple);
  - testnet: `s.altnet.rippletest.net`, `testnet.xrpl-labs.com`.
- **Timeouts:** 5 s to connect, 12 s per request.
- **No redirects:** an allowlisted host cannot pass the request on.
- **Body cap:** 1 MiB, enforced while streaming.
- **Compressed bodies:** refused (`accept-encoding: identity` is requested).
- **Retries:** up to 3 attempts, only for timeouts, connection errors, 5xx, 429 (honouring `Retry-After`, capped at 5 s) and busy-node codes. Backoff is exponential with clock-derived jitter. A 4xx is never retried.
- **Concurrency:** at most 4 verifications in flight.
- **Per-source statistics:** attempts, latency and last error are returned with every response.
- **Error messages:** never include URLs, headers or bodies.

## Tests

`cargo test --lib verify` (in `src-tauri`) runs 41 tests. `.github/workflows/verify-engine.yml` runs them on every change to `src-tauri`, then runs the live test:

- **Real mainnet fixtures** (`tests/fixtures/account-tx-solo-107587061.json`):
  - a full payment;
  - two partial payments that delivered less than requested;
  - a payment short by 1.4687e-11;
  - an OfferCancel.
- **Synthetic fixtures, labelled as such:** an XRP invoice, unvalidated, failed, missing metadata/result/delivered, `"unavailable"`, MPT, malformed and negative amounts, hash mismatch, source conflict, stale source.
- **Transport**, against a local HTTP server: timeout, HTTP 403, 429 with retry, oversized body, malformed JSON, gzip refused, a good reply end to end.
- **Idempotency, digest reproducibility and rules version:**
  - duplicate settlement across invoices;
  - identical reports for identical inputs;
  - digest independent of key order;
  - tamper detection;
  - rules version changes the digest and the key.
- **Properties:** 5,000 deterministic pseudo-random cases checking comparison, addition, subtraction and round-tripping against i128 arithmetic.
- **Shared vectors** (`t36`): 38 cases in `tests/fixtures/payment-verify-vectors.json`, 16 of them built on the real mainnet entries. Each pins the status, reason, findings, difference, decision key and evidence digest. The hosted API's TypeScript port must reproduce every one (`src/lib/desk/__tests__/payment-hosted.test.ts`).
- **Live** (`--ignored`, run in CI): verifies the real CSC partial payment from two operators on mainnet and expects `PARTIAL_NOT_PERMITTED`. It passed on 2026-10-26 (workflow runs 40345517702 and 40345580240).

## Hosted API

`POST payment/verify` on the `noshashi-verify` Edge Function serves these rules to integrations. `docs/api/COMPLIANCE_API.md` has the request and response. The hosted version adds what a desktop binary cannot:

- **Keys, quotas and limits.** A `verify`-scoped key, the `compliance_api` entitlement and the durable per-key rate limit. One credit per call, not charged when no source answered.
- **A persistent settlement book.** `noshashi.payment_settlements` has a unique constraint on (tenant, network, transaction hash). A transaction settles at most one invoice per organization, or per account for a personal key. Two requests that race for different invoices cannot both get `VERIFIED`: the loser is decided again against the winner's invoice and gets `ALREADY_APPLIED`.
- **An audit trail.** `noshashi.payment_verifications` keeps every served report, as served, and is append-only (no UPDATE or DELETE grant for any role). The row is written before the response; if it cannot be written, nothing is served and the credit is returned.
- **Idempotency.** `Idempotency-Key` replays the stored response. A key reused for a different question is refused, because the decision key is computed before any read.
- **Signed exports.** These are optional and gated on configuration.
  - With the function secret `PAYMENT_EVIDENCE_SIGNING_KEY` set (an Ed25519 key, base64 PKCS#8), each report carries an Ed25519 signature over a canonical statement. The statement covers the hash, network, invoice, status, reason, rules, decision key and evidence digest.
  - The public key is served at `GET payment/signing-key`. `checkSignature` in `payment.ts` shows the check: verify the signature, then re-hash the evidence.
  - The private key exists only in the function's secrets: never in this repository, the desktop app or a response.
  - Without it, the API says signing is not configured and the digest proves integrity only.

The hosted rules are a port, not a binding to the Rust crate, because the Edge runtime is Deno. Parity is enforced, not assumed: the shared vectors, the canonical-JSON parity vector (`t35`) and the same transport limits (allowlist, no redirects, 1 MiB cap, compressed bodies refused, three attempts) are tested on both sides.

## Installer size

Measured on 2026-10-26 with `npx tauri build --bundles deb,appimage` on Linux x86-64, version 1.0.22, with this engine included:

| Artifact | Size |
|---|---|
| Release binary (`noshashi`) | 8,531,416 bytes (8.5 MB) |
| `.deb` | 4,463,352 bytes (4.5 MB) |
| AppImage (bundles WebKitGTK) | 80,386,552 bytes (80.4 MB) |

The build then stopped at updater signing, because `TAURI_SIGNING_PRIVATE_KEY` is held only by the release workflow. That step comes after bundling and does not change the sizes. macOS and Windows installers were not measured here.

## Security notes

Implemented:
- No keys or signing anywhere in this path.
- No caller-supplied URLs, and no redirects.
- Bounded reads, timeouts and concurrency.
- Input validated in Rust; the web view's checks are only convenience.
- Fails closed: anything unread or uncertain is HOLD.
- No telemetry: transaction data goes only to the allowlisted XRPL nodes.

Remaining:
- In the desktop app the settlement book is in memory and per session. The hosted API's book is persistent and shared per tenant (above).
- Signed exports exist only on the hosted API, and only once its signing key is configured. The desktop app never signs, by design.
- Public nodes carry no SLA, and both mainnet operators are public endpoints. An institutional deployment should add its own node as a third source.
- The free-tier limit of 10 verifications a month is **not** enforced in the desktop app. Client-side metering is not a security control, so metering belongs to the hosted API.
- Sanctions screening and the Travel Rule are out of scope. An address check is not OFAC compliance.
- An independent security review is needed before this backs a hosted, paid service.

## Commercial boundary

The repository is MIT-licensed, and this engine is part of it: the open-source app keeps full local verification, undegraded. What can be sold is what a desktop binary cannot provide:
- a hosted API with keys, metering, quotas and tenant isolation (the `noshashi-verify` Edge Function already has these);
- persistent, deduplicated settlement records;
- continuous monitoring and webhooks;
- signed exports, dedicated nodes, integration work and support.

**Pilot offer (hypothesis, to be validated with buyers):** a fixed-scope XRPL payment-verification pilot at **$5,000–10,000**.
- **Included:**
  - an integration assessment;
  - an agreed set of the customer's own transaction hashes and invoices run through this engine;
  - a findings report with the evidence records;
  - a review meeting.
- **Acceptance:** criteria are written down before the pilot starts.
- **Excluded:**
  - custody and signing;
  - access to production systems;
  - guaranteed fraud prevention or savings;
  - an SLA.

Prices on the pricing page are hypotheses until someone pays them.
