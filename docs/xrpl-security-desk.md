# XRPL security desk

The security desk groups implemented tools into prevention, investigation and
organization operations. It does not provide custody, key recovery, transaction
reversal, legal seizure or automatic wallet-policy enforcement. No industry-first
or unique-in-the-market claim is made.

## Credential registry correction

The reported “DOMAINS THIS ACCOUNT ENTERS” timeout comes from a separate registry
HTTP request. Both live endpoints returned HTTP 200 in this review (about 1–1.4
seconds); a permanent outage was not reproduced. A delayed response reproduces
the old raw abort error and lack of retry.

- Directory HTTP reads now have an eight-second deadline including body parsing,
  compatible AbortController cancellation and an actionable timeout message.
- No-held-credential accounts read owned domains directly and do not wait for a
  directory that cannot establish additional credential-based admission.
- With held credentials, the directory discovers candidates. Each candidate is
  read again at the credentials’ validated ledger before deciding admission.
- An unavailable directory preserves owned-domain results, labels other coverage
  unknown, offers retry, and leaves direct domain-ID checking available.
- Candidate discovery can omit new domains; only 40 candidates are checked per
  reading. Failed candidates and incomplete coverage are disclosed.
- Held-credential reads paginate at a fixed validated ledger, distinguish issuer
  and subject roles, reject malformed/missing data, and fail on truncated reads.
  The screen now displays credential errors instead of a false empty result.
- Superseded account reads cannot overwrite a newer wallet’s state.

## New workflows and existing tier allocation

The shared tool directory is `src/lib/security/tools.json`. Its paid minimum tiers
are regression-checked against existing grants in `src/lib/billing/catalog.ts`.
Prices, Stripe price IDs and webhook entitlement behavior are unchanged.

| Priority | Tier | Workflow |
| --- | --- | --- |
| P0: basic safety | Free | Visual signing map, signer-unavailability drill, account hardening, pre-sign inspection, destination review, emergency checklist and individual exposure reads |
| P1: desk investigation | Pro | New local control-change comparison under the existing alerts grant; existing bounded incident/cluster tools and desk-scale scans |
| P2: organization review | Institutional | Existing audit, bulk review, threat-report filing and declared reserve-evidence workflows; contract required |
| P2–P3: operational integration | Enterprise | Existing withdrawal review, deeper evidence cases and market surveillance; contracted scope |
| P3: monitoring capacity | Strategic Infrastructure | Existing hosted watch/event delivery; contract, watches and configuration required |

Critical prevention checks stay free. Paid scope adds workflow and capacity, not
a hidden pass/fail finding. Free threat lookups and on-device monitoring remain
identified beside paid filing/hosted monitoring.

The signing drill models weighted signer addresses. It does not verify that
people or custodians are independent, inspect every signer account’s own keys,
or prove possession of keys. Master and regular keys may each bypass a signer
list. A regular-key bypass now produces an explicit critical hardening finding.

Control references are device-local, editable public-control snapshots. They
must match the same address and precede the newly read ledger. The comparison
normalizes signer ordering. Export includes complete before/after payloads,
changes, canonicalization and a SHA-256 digest. The digest is not a signature or
independent attestation. An unavailable history remains unknown.

Incident diagrams show observed transfers, bounded by the trace’s existing read
limits. They do not establish that identical funds traversed commingled accounts
or identify criminals. Destination tags do not identify a verified custodian.
EscrowCreate is no longer plotted as delivery to its destination, and trace
outflows require an explicit validated transaction row.
Trace reads also stop at 40 accounts on standard depth or 200 on forensic depth,
5,000 transfer records and ten pages per account. Failed history reads are marked
unread, empty/repeated pagination cannot loop indefinitely, and omitted accounts
are disclosed. These are analysis coverage limits, not recovered-fund amounts.

## Website

`/cybersecurity/` explains the implemented desktop beta, includes a no-account
local quorum calculator using the same arithmetic as the desktop, and links to
the desktop download, current pricing and scoped evaluation process. The
calculator is clearly a scenario, not a live wallet reading. The platform page,
footer and pricing comparison link to the security page. Existing routes remain.

## Protocol sources and recovery limits

- [XRPL account keys](https://xrpl.org/docs/concepts/accounts/cryptographic-keys)
- [Master-key precautions](https://xrpl.org/docs/tutorials/best-practices/key-management/disable-master-key-pair)
- [Credential objects](https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/credential)
- [Account object pagination](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_objects)
- [Token clawback limits](https://xrpl.org/docs/concepts/tokens/fungible-tokens/clawing-back-tokens)

XRP is not an issued token and cannot be clawed back. A token issuer’s conditional
powers concern its own tokens. A verified custodian’s possible response depends
on its records and procedures; legal action requires appropriate professional
advice. No custody relationship is inferred solely from a destination tag or
self-declared domain. No recovery outcome is promised.

## Recommended next research, not offered capabilities

1. **Cross-custodian control dependencies:** obtain verified owner-supplied key
   custody context to reveal shared operational dependencies that ledger signer
   weights cannot show. Never infer key possession from an address label.
2. **Independent-node evidence comparisons:** compare the identical account
   object at the identical ledger hash from separately operated nodes, with
   provider provenance. Agreement is not independent consensus verification.
3. **Reviewed incident handoff packets:** establish an agreed evidence schema and
   verified recipient process with a willing custodian or issuer. No automated
   accusations, outreach or guaranteed freeze/recovery process.

These are proposed evaluation work, not novel-industry claims or included paid
functionality. SSO, dedicated environments and SLAs remain planned; no independent
security assessment, certification or OS installer-signing claim is added.

## Reproduction and validation

```sh
npm test
npx tsc --noEmit
npm run build
npm run academy:build
npm run site:build
npm run site:security
npm run check:security
```

For browser regression checks, run Vite on port 1420 and the static preview on
4326 (`PORT=4326 node scripts/dev-site.mjs`), then:

```sh
node scripts/security/smoke.mjs /tmp/noshashi-security-review
```

The review harness under `scripts/security/` is a local development fixture and
is excluded from production builds. Its screenshots explicitly label simulated
network/billing and recorded public-ledger data. The browser run covers timeout,
direct checking during outage, retry, error-vs-empty behavior, control changes,
evidence export and desktop/mobile public-calculator states. This is not a
physical Mac or production deployment test. An installed desktop app needs a
later release to receive these source changes.
