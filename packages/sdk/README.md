# @noshashi/sdk

Screen XRP Ledger counterparties before value moves. Zero dependencies. It
runs anywhere `fetch` does: Node 18+, Deno, Bun, browsers and Workers.

```js
import { Noshashi } from "@noshashi/sdk";

const nsh = new Noshashi(); // free calls need no key

// What can this issuer still do to holders? Freeze, clawback, one key signing…
const cert = await nsh.authority("rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B");
console.log(cert.verdict, cert.ledgerIndex, cert.digest);

// Is the address on the OFAC SDN list or in the scam registry?
const check = await nsh.screenAddress("r…");

// What did each payment actually deliver? (delivered_amount, never Amount)
const { rows, complete } = await nsh.delivered("r…", { from: "2026-01-01", to: "2026-06-30" });

// A live badge for a README or token page
nsh.badgeUrl("r…", { style: "card" });
```

## Free calls (no key)

| Method | Answers |
|---|---|
| `authority(issuer, { walk })` | The authority certificate. It covers freeze, global freeze, permissioned holding, unilateral signer, transfer fee and (with `walk`) supply concentration. It carries a SHA-256 digest. |
| `issuerState(issuer)` | The issuer's AccountRoot and signer list exactly as the ledger returned them. |
| `issuerPowers(issuer)` | The snapshot issuer alerts compare against, including clawback. |
| `badgeUrl(issuer, opts)` | URL of the live SVG badge. |
| `checkCertificate(cert)` | Whether a certificate's digest matches its own body. |
| `sanctions(addresses)` | OFAC SDN matches for up to 50 addresses, refreshed daily from treasury.gov. |
| `threats(addresses)` | Confirmed scam-registry entries. |
| `phishing(domain)` | Whether a domain has been advertised in micro-payment memos. |
| `verifyDomain({ address } \| { domain })` | Whether `xrp-ledger.toml` vouches for the account. |
| `screenAddress(address, { asIssuer })` | Sanctions plus threats (plus authority) in one call. Failed parts are listed in `errors`. |
| `delivered(account, { from, to, format })` | Payments with stated vs delivered amounts and partial-payment flags. Use `format: "csv"` for the file. |

Free calls are rate-limited per caller.

## Keyed calls (`nsh_live_…`)

```js
const nsh = new Noshashi({ apiKey: process.env.NOSHASHI_KEY }); // server-side only
const decision = await nsh.verify({ subject: "r…", domain: "DEX-US", amount_xrp: 1000 });
// decision.verdict is "go" | "hold" | "no-go"; decision.digest is the receipt
```

| Method | Cost | Plan |
|---|---|---|
| `verify({ subject, domain, amount_xrp })` | 1 prepaid credit | Compliance API |
| `receipt(digest)` | free | Compliance API |
| `screenDeposit({ hash, deposit_address })` | free | Organization key |
| `screenWithdrawal({ destination, … })` | free | Enterprise |

Credits are sold in prepaid packs at https://www.noshashi.app/pricing/. A key
is a secret. Never put one in browser code.

## Errors

Every failure throws `NoshashiError` with `status`, a stable `code` (for
example `invalid_address`, `key_required`, `quota_exhausted`, `rate_limited`)
and the response `body`. A fact the ledger could not supply is never
returned as a pass.

## What this is not

Ledger facts and screening findings are not legal advice, not a credit score
and not a determination that any asset is or is not a security.

MIT licensed. Source: https://github.com/Ignosha/noshashi/tree/main/packages/sdk
