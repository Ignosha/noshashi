# NOSHASHI Pre-Sign Guard

A Fireblocks API Co-signer **Callback Handler** for XRP Ledger transactions.
The Co-signer calls it before every signature. It answers APPROVE, REJECT or
RETRY within the Co-signer's 30 seconds, and it logs a receipt for each answer.

The institution hosts it next to its Co-signer. NOSHASHI never receives a
request, a key or a decision. The guard cannot create a signature: it can
only withhold approval, and Fireblocks fails closed when it does.

## What it checks before a signature

| Check | What it refuses |
|---|---|
| **Is this the transaction being signed?** The XRPL signing hash is recomputed from `rawTx` or the XRP SDK's `unhashedTxPayload`. It is then compared with the hash the Co-signer was asked to sign, and with the destination, tag and amount Fireblocks shows. | A transaction that differs from what Fireblocks shows: the destination, tag or amount has been swapped. |
| **Who controls the account afterwards** | `SetRegularKey`, `SignerListSet`, `AccountDelete`, or `AccountSet` that disables the master key, unless the policy allows key changes |
| **The destination**, with the same screening as the NOSHASHI app | A destination on the OFAC SDN list or the scam registry, or funded by such an account up to three hops back; address poisoning (a lookalike of a known destination); a missing required tag; a payment too small to create the account |
| **Every issued-token amount** | A ticker from an issuer you don't accept (counterfeit RLUSD), a token you haven't listed, or an issuer under Global Freeze |
| **The ledger's own answer**: `simulate` on two servers run by different operators | Any transaction the ledger would refuse (`tec`, `tef`, `tem`) |

A fact it cannot read (a server, the sanctions list or an issuer) means RETRY,
never a pass. The Co-signer retries every 3 minutes for up to an hour by default.

## Where it fits next to what you already run

Fireblocks Policy decides who may move which amounts to which whitelisted
destinations. Chainalysis KYT and Elliptic score sanctions and AML risk,
and Fireblocks can reject on their scores. **Keep both.** This guard covers
XRPL-specific checks that neither performs:

- it confirms the signed bytes match the transaction Fireblocks shows;
- it refuses key and signer-list changes;
- it checks token issuers by address, not by ticker;
- it reads issuer freeze state;
- it asks the ledger whether the transaction would succeed.

Transaction-simulation firewalls such as Blockaid, Hypernative and Blowfish
publish EVM and Solana support. We found no XRPL support from any of them
as of November 2026.

## Run it

Requirements: Node 22.6 or later, run from a checkout of this repository. It
uses only `ripple-binary-codec`, which is already a dependency.

1. **Keys.** Generate the handler's signing key. An ECDSA P-256 key needs
   Co-signer version 2026.08.19 or later; otherwise use RSA 2048.
   ```bash
   openssl ecparam -name prime256v1 -genkey -noout -out callback_private.pem
   openssl ec -in callback_private.pem -pubout -out callback_public.pem
   ```
   Give `callback_public.pem` to the Co-signer when you configure the
   Callback Handler. Export the Co-signer's public key from the Co-signer
   (see Fireblocks' maintenance guide) and save it as `cosigner_public.pem`.
2. **Policy.** Copy `policy.example.json` and fill it in. List your vault
   addresses in `sourceAccounts`, the issuers you accept per ticker in
   `acceptedIssuers`, and the destinations you pay in `knownDestinations`.
   Every field is required, so a missing one stops the guard from starting.
3. **Config.** Save this as `guard.config.json`:
   ```json
   {
     "listen": { "host": "0.0.0.0", "port": 8443 },
     "tls": { "cert": "server.crt", "key": "server.key" },
     "cosignerPublicKey": "cosigner_public.pem",
     "handlerPrivateKey": "callback_private.pem",
     "policy": "policy.json",
     "auditLog": "audit.jsonl",
     "servers": ["https://your-rippled-1:51234/", "https://your-rippled-2:51234/"]
   }
   ```
   Fireblocks requires HTTPS with a CA-signed certificate. You can leave out
   `tls` and terminate TLS in front of the guard instead.
   Without `servers`, the guard uses s1.ripple.com and xrplcluster.com, both on port 443. In
   production, use your own nodes.
4. **Start it.**
   ```bash
   node --experimental-strip-types tools/presign-guard/server.ts guard.config.json
   ```
   Point the Co-signer's Callback Handler URL at the base URL. The Co-signer
   adds `/v2/tx_sign_request` and `/v2/config_change_sign_request` itself.
5. **Roll out in observe mode first.** With `"mode": "observe"` the guard
   approves everything and records what enforce mode would have answered.
   Read the log for a week, tune the policy, then switch to `"enforce"`.

## Without Fireblocks: `POST /v1/check` and the command line

The same checks work with any signing setup: your own HSM or wallet
service, a custodian with no approval hook, or a script. Call the guard
just before you sign, and sign only on `APPROVE`.

```bash
curl -s https://guard.internal:8443/v1/check \
  -H "Authorization: Bearer $GUARD_TOKEN" -H 'content-type: application/json' \
  -d '{"tx_json": {...the unsigned transaction...}, "signingHash": "optional: the hash you are about to sign", "requestId": "your reference"}'
```

`tx_blob` (unsigned, hex, with or without the `53545800` prefix) works in
place of `tx_json`. Fields a ledger reply adds (`hash`, `ctid`, `date`,
`DeliverMax` and so on) are dropped before hashing, so a transaction copied
from an API reply hashes the same way it is signed. An already-signed
transaction is refused.

The answer includes:

- `action`, and `enforced` (what enforce mode decided);
- `reason`;
- `signingHash`;
- `ledgerIndex`;
- every finding;
- the receipt and its `receiptHash`.

The endpoint is off by default. Turn it on in the config:

```json
"check": { "enabled": true, "tokenEnv": "GUARD_TOKEN" }
```

`tokenEnv` names an environment variable that holds a bearer token of at
least 32 characters. The guard refuses to serve `/v1/check` beyond loopback
without one. A deployment that only uses `/v1/check` can leave out both
Fireblocks key paths.

From the command line, against live ledgers:

```bash
node --experimental-strip-types tools/presign-guard/check.ts policy.json tx.json
```

It prints the same answer and exits with 0 for APPROVE, 1 for REJECT and 2 for RETRY.

**Under load.** A transaction whose fee is below the network's current
fee is refused before the ledger evaluates it (`telCAN_NOT_QUEUE`). The
guard then simulates a copy at the open-ledger fee, so it still learns
whether the transaction itself would succeed, and records that the signed
fee is low. The signed transaction and its hash are not changed.

On 19 November 2026, at ledger 108439461, a 1 XRP payment to Bitstamp
behaved like this:

- **Without its tag:** refused, with `tecDST_TAG_NEEDED` on both servers.
- **With its tag:** approved, with `tesSUCCESS` at 5,041 drops after a first `telCAN_NOT_QUEUE` at 12.

## Ask Fireblocks Support to enable rawTx

A plain XRP transfer (the SDK's `xrpTransfer()`, or a transfer made in the
Console) carries no `unhashedTxPayload`. Its exact bytes reach the
Callback Handler only through `rawTx`, which Fireblocks enables per
workspace on request. Without it, the guard can screen Fireblocks'
destination and amount, but it cannot prove those are what is signed. With
`requireExactTransaction: true` it refuses such requests outright.

The guard accepts XRPL `rawTx` with or without the `53545800` signing prefix.
Fireblocks does not document which form it sends for XRP, so run observe mode
on a sandbox workspace before enforcing.

## Receipts and the audit log

Each decision is written to a receipt and appended to `auditLog` as one
JSON line. A receipt records:

- the request and transaction IDs;
- the signing hash;
- the answer, and what enforce mode would have answered;
- the finding IDs;
- the validated ledger index;
- the policy version and its SHA-256.

Each log line's SHA-256 covers the line before it, so an edited or deleted
line breaks the chain. `verifyAuditLog()` in `server.ts` checks the chain.
A REJECT's `rejectionReason` ends with the first 16 hex characters of the
receipt hash. Fireblocks doesn't store rejection reasons, so the log is the
record.

## What it does not do

- **Other chains.** It inspects XRP Ledger transactions only. For other
  assets it gives the answer set in `otherAssets`.
- **Hand a transaction to a person.** Fireblocks doesn't allow a Callback
  Handler to route a signing request to a Console user. Findings that need a
  person's judgment are therefore decided by `onReview`.
- **Replace your sanctions programme.** The OFAC check reads the SDN list's
  published XRPL addresses through the free NOSHASHI lookup. It doesn't
  resolve entities or names.

These are ledger facts read at signing time, not legal or compliance advice.
