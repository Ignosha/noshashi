# NOSHASHI Continuity demonstration for Dfns

**December 1, 2026, 3:00 p.m. EST (20:00 UTC) · 6 minutes.** Use the local browser build as the dependable presentation path. Use native Continuity for the opening only after a rehearsal on that Mac. Keep the browser and screenshots ready on the same machine. The demonstration requires no sign-in, signing keys, API credentials, external account, or live network connection after the local build is ready.

## Rehearse before the meeting

From the repository root, install the pinned dependencies once while online. Vite copies bundled fonts, code, and the dataset locally. Start the preview and open the two tabs below.

```sh
npm ci
npm run continuity:check
npx vitest run tests/continuity-demo.test.js
npm run continuity:build
npm exec vite preview -- --config vite.continuity.config.mts --host 127.0.0.1 --port 1430 --strictPort
```

- Overview at `http://127.0.0.1:1430/continuity/index.html`
- Rehearsal at `http://127.0.0.1:1430/continuity/demo/index.html`

With that server running, rehearse the exact path and save three fallback screenshots. With Playwright Chromium installed, omit `CHROMIUM_PATH`. On a Linux machine with system Chromium, use the command below.

```sh
CHROMIUM_PATH=/usr/bin/chromium node continuity/demo/rehearse.mjs \
  http://127.0.0.1:1430/continuity/demo/index.html /tmp/noshashi-demo-screenshots
```

The rehearsal aborts any non-loopback request, takes Chromium offline after loading the page, clicks each step, independently checks the downloaded JSON's digests, and checks narrow-screen overflow. Keep the screenshots open. Close unrelated tabs and hide real account data before sharing your screen.

## Click path and script

| Time | Click | Say | What the screen proves |
| --- | --- | --- | --- |
| 0:00–0:45 | Show **Continuity workspace**, then use **Continuity demonstration** or switch to the prepared rehearsal tab. | “Continuity gives payment operators a reviewable record of what was observed, what changed, and what needs a human decision.” | The workspace separates the proposed transaction from subsequent observations, review, and evidence. |
| 0:45–2:10 | Stay on **Recorded payment** and click **Run payment review**. Point to the requested and delivered amounts, disposition, destination/issuer, and tag finding. Open **Capture timestamps**. | “These are two archived public XRPL responses for one historical SOLO payment. The validated ledger recorded a successful payment and the delivered amount was `0.067791435856414 SOLO`. We also read the destination’s AccountRoot at that exact ledger. The invoice decision is HOLD because there is no invoice.” | The verifier reads delivered amount from metadata, binds the destination observation to the historical ledger, and abstains on reconciliation without a supplied invoice. This observation cannot authorize payment. |
| 2:10–3:05 | Click **Verify receipt digest**, then **Export receipt JSON**. Point to **Digest matches** and the SHA-256 value. | “The evidence includes the transaction, asset, destination, ledger hash and source observations. The digest checks this record against its recorded hash. Provider authentication, a signature, and the institution’s approvals are separate.” | The exported payload can be verified independently and altering a recorded field breaks the saved digest. An example does not prove live source agreement or tenant identity. |
| 3:05–4:15 | Click **RLUSD intelligence**. Point to **Issuer account**, **XRPL currency code**, and the historical ledger number and flags. | “RLUSD is our first stablecoin intelligence focus. On XRPL, the asset is identified by network, issuer and currency code. The historical snapshot shows whether freeze and authorization controls were set at that point. Concentration is unknown in this snapshot. Reserves come from carefully attributed issuer disclosures and are a separate workstream.” | A historical issuer reading is traceable to one archived AccountRoot. The XRPL interpretation does not apply to Ethereum and does not estimate reserves. |
| 4:15–5:40 | Click **Wallet handoff** and **Assess simulated intent**. Show HOLD. Click **Simulate new tag requirement** and show NO-GO on the unchanged intent fingerprint. | “This is a hypothetical Dfns evaluation using a mock wallet provider. If a destination starts requiring a tag, the same proposed payment needs attention. The wallet provider would retain custody, approval, signing, and execution. NOSHASHI would provide evidence and a read-only assessment.” | The existing rules fail closed on incomplete evidence and surface a specific, simulated disposition change while preserving the intent fingerprint. No Dfns request is made. |
| 5:40–6:10 | Leave the reason open. | “The evaluation question is whether your payment workflow can consume a bounded assessment and recheck it when conditions change. We can walk through the request, response, and evidence boundary next.” | The useful integration surface is preflight plus post-transaction evidence. |

## Fallbacks and evidence labels

- **Native app fails to launch, resolve a bundled route, or download a receipt.** Start on the rehearsed browser route and show the overview there. The browser path is designed to cover every timed step. JavaScript asset navigation in a native WebView and the download flow need a Mac rehearsal on that revision.
- **Network or RPC outage.** Stay on the recorded flow. No live session is required. If a live fetch is requested in the discussion, say “A live reading is unavailable” and leave it out of the timed path.
- **Browser or local server fails.** Open `01-recorded-payment-and-receipt.png`, `02-rlusd-issuer.png`, then `03-wallet-handoff-tag-change.png`. Say they are captures from the same local rehearsal. Use the timestamps in the evidence view to identify the archive. Do not offer a production download or create an outbound link during the presentation.
- **Historical.** Both archived providers are identified in `continuity/demo/solo-mainnet-107585451.json`. The capture retains the fields used by the demonstration and omits memos, signing fields, and unrelated account metadata. The transaction and destination reads pin validated ledger `107585451` and the same ledger hash. The RLUSD AccountRoot is a separate repository fixture at ledger `107586974` with its own observation time. Ripple publishes the network-specific RLUSD issuer identity. [RLUSD token addresses](https://docs.ripple.com/products/stablecoin/overview/token-addresses)
- **Live.** The offline route never labels a value live. The ordinary preflight workspace can attempt a live XRPL read. A successful historical result does not imply current payment conditions.
- **Simulated.** The 250 RLUSD intent, ledger values, control change, and wallet interaction are synthetic. Any public addresses in the mock are fixtures. The handoff is illustrative, with no confirmed Dfns partnership, execution, or authority.

## Verification recorded November 24, 2026

On Debian Linux with Node 24.22.3 and Chromium 156.0.8078.79, the Continuity typecheck and production build passed. The existing Continuity suite passed 37 tests, and the three demonstration tests passed, including mixed-ledger, conflicting-source, and digest-mutation coverage. The Chromium rehearsal passed on the production build with separate receipt hashing and no external HTTP requests. No native macOS demonstration was run in this verification.

## Release boundaries

The rehearsal demonstrates historical verification, a locally recomputable evidence digest, issuer provenance and a simulated change. It requires separate hosted identity and policy evidence before use in an institutional pilot. Native compatibility, signing, notarization, managed signing keys, live integration and production enforcement are separate release gates.
