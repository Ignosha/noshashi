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

## Five additional security workflows

The website and Security Center introduce the same tools and limits:

- **Treasury scenarios (Free):** local owner-supplied dependency mappings; separate compromise authorization from outage availability. Shared custodian/device labels are assumptions, never inferred key custody.
- **Ledger endpoint comparison (Free):** bounded reads of binary AccountRoot at one fresh validated ledger hash. Decode and match the requested account before hashing identical scope. Missing/mismatched bytes cannot pass. Ripple operates both s1 and s2; agreement is not independent consensus verification.
- **Software advisory exposure (Pro):** up to 50 exact npm versions queried against [OSV](https://google.github.io/osv.dev/post-v1-querybatch/), only after consent. Send package names/versions, never asset IDs/workflow labels. One 20-second deadline, 1 MiB response cap, 20 advisory details, explicit partial coverage. No-result and withdrawn advisories are not security clearance. No installed-software discovery, firmware or zero-day detection.
- **Response notebook (Pro):** procedures, roles and public contact routes encrypted on-device using AES-256-GCM and PBKDF2-SHA256 (600,000 iterations, random salt/IV). Lock on hide/five minutes. Ciphertext-only persistence/export, explicit save read-back, wrong-passphrase/tamper rejection. Never store wallet seeds or private keys. No shared vault, managed key custody or password reset; compromised devices remain a risk.
- **Reviewed indicator sharing (free lookup, Institutional filing):** opt-in organizations, independent staff participant review (expires within 90 days), plan/role enforcement, sourced reports, separate MFA staff review, withdrawal and private audit. Public lookup excludes pending, expired, legacy-only reviews and withdrawn indicators. Private notes/identities are omitted. Indicators do not prove wrongdoing or instruct automatic blocking.

### Required rollout before reviewed sharing

Apply `20261104123000_security_network.sql` through the normal reviewed database process, verify RPC/schema exposure and anonymous read access, configure staff MFA, establish an independent participant/source review procedure and test correction/withdrawal. **This change does not apply a production migration, populate a participant network or promise continuous monitoring.** Missing backend functions fail closed; there is no fallback to fabricated indicators. Existing legacy registry flows remain separate.

Prices, product IDs and entitlement grants are unchanged. Existing Pro alerts/asset-recovery entitlements gate the new desk tools; Institutional threat-registry entitlement is rechecked server-side. Exported hashes identify canonical evidence, not signatures. Evaluate these beta workflows against agreed institutional acceptance criteria; no guarantee of security, recovery, enterprise suitability or adoption. SSO, dedicated environments, SLAs and independent assessments are not added.

Reviewed custodian handoff agreements and independently operated verification infrastructure remain future evaluation work.

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

Additional regression commands:

```sh
node scripts/security/enterprise-smoke.mjs /tmp/noshashi-security-review
PGLITE_MODULE=/path/to/pglite/dist/index.js node scripts/test-security-network-db.mjs
```

The in-memory database harness loads the actual new migration and existing organization, support and threat-registry definitions. It omits unrelated webhook/cron integrations; a dedicated CI step runs this harness. The existing full PostgreSQL suite continues to test its own migration dependencies. Browser tests use labeled recorded fixtures and mocked network responses; they do not establish live advisory or participant coverage.

## Treasury Guard — local payment review, not a payment interceptor

Treasury Guard is mounted once in the main app (excluding its HUD/tray view). An operator acknowledges authority to monitor a public account, saves exact XRP limits and an optional destination allowlist, and explicitly enables/tests device notifications. There is no inferred owner, wallet connection, email recipient, SMS service or ownership certification. Existing Free (three) and Pro+ (fifty) local-watch capacity is reused; prices and grants are unchanged.

Rules flag a single-payment threshold, percentage of pre-transfer XRP balance, an unlisted destination, a rolling volume threshold and a qualifying split across distinct destinations. All arithmetic uses integer drops; the monitor compares validated delivered XRP with the sender AccountRoot delta minus fee. It does not substitute requested Amount. Cross-currency/path payments, account deletions and incomplete debit evidence remain review gaps, not fabricated quantities. Existing Guardian and Pre-sign/Incident tools cover complementary workflows.

A new watch establishes a starting validated-ledger baseline without claiming earlier history. Initial arming also confirms that the account exists at the anchor ledger. Each read uses a fresh validated anchor, pins account_tx bounds, validates row scope and reads at most four 200-row pages. An account read has a 20-second total deadline (12 seconds per command); a cycle stops attempting further accounts after a 45-second budget and marks them unchecked. Backlog retains its target and exact pagination marker. Empty/repeated markers fail closed. Local retention is bounded to 2,000 recent payments per account and the latest 200 findings; capacity and evidence gaps remain visible. A sleeping/closed app, denied notifications, node outage, insufficient history or backlog can delay/miss coverage; no instant or guaranteed alert delivery is claimed.

The queue records expected/not-recognized as editable local notes, not authenticated owner approval, an immutable audit log or an accusation. Notification submission is reported separately from receipt/read status and keeps wallet identifiers out of lock-screen text. Evidence exports include policy snapshots, amount derivation, coverage/cursors, finding hashes and review records. These are hashes, not digital signatures or independent consensus proof. Keep exported records; device storage may be unavailable or cleared.

The unsigned direct-XRP proposal preview uses the saved source policy and explicitly lists missing live balance, cumulative activity, risk and independent-approval checks. It never signs, submits, issues an approval credential, enforces a hold, freezes a recipient or reverses XRP. Institutional signing integration and hosted payment/recipient delivery require a separate scope; the existing Enterprise withdrawal-screening route is linked but not silently expanded. Local monitoring is not advertised as an unattended enterprise service.

## Desktop completion and preview installers

Treasury Guard now adds a live preflight to the static preview: one fresh validated ledger, source balance/sequence, proposal ledger expiry and bounded reverse history (eight pages / 25 seconds total). It derives delivered XRP and actual sender debits, retains full window evidence and leaves truncated history incomplete. Reserves, queued/concurrent transactions, destination intelligence, key possession and signing enforcement remain explicit unchecked items. A positive result means eligible for a separate review, never permission to spend.

`20261104150000_treasury_reviews.sql` adds an Enterprise review-record service using existing organization roles and MFA. Requester and reviewer are different authenticated accounts; neither proves separate human identity or control of a wallet. The service hashes the exact UTF-8 proposal text server-side, rejects signed/unsupported proposal fields, binds client evidence to the proposal/policy, deduplicates retries, rate-limits requests and checks expiry, role/plan and hash at decision time. Records expire in 15 minutes and can be cancelled. RLS limits reads to organization members with MFA and clients cannot update records directly. Client ledger evidence is retained for review, not independently verified by the service. No signing credential, reservation, consume endpoint or transfer-execution API is provided.

Apply the new migration and verify schema exposure/MFA/roles before using organization reviews. The UI reports missing service/history; no local note is substituted for an organization decision. A review exceeding 64 KiB must be exported for manual review; evidence is never silently stripped. The incident handoff export includes findings, local notes, coverage and preflight; external recipient verification/transmission remains manual and no contact is inferred from a wallet tag.

`.github/workflows/security-desktop-preview.yml` compiles Intel and Apple Silicon DMGs after tests, using `tauri.security-preview.conf.json` with identifier `com.noshashi.security-preview` and macOS minimum 12.0. It verifies bundle identity and Mach-O minimum OS, uploads DMGs/checksums as 14-day GitHub Actions artifacts, and publishes no release. The preview installs beside production, uses separate app storage, blocks production updater checks and checkout, and clearly identifies itself. It is not Developer ID signed/notarized; CI compilation does not replace testing on an actual Mac running 12.7.6. No signing-system integration is configured. Production builds retain their existing update/billing behavior.

## Scale boundary

This desktop build does not claim million-wallet or million-user capacity. Local polling remains three/fifty configured watches; organization review is a bounded human-review service (50 new requests per organization/day, latest 100 records per read). One million wallets polled once/minute would require at least 16,667 account reads/second before anchors, pagination or retries. That is not the architecture offered here.

A larger hosted product would ingest validated activity centrally, match subscribed accounts, evaluate versioned tenant rules, and deliver deduplicated alerts through verified recipient channels. It needs durable cursors/replay, queues, tenant isolation, delivery receipts, retention and measured load/failure testing. The desktop becomes a client of that service. This is a proposed growth path, not an implemented or benchmarked capacity claim. Revenue scale is a separate commercial question; neither wallet counts nor software features establish paying demand.
