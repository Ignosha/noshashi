# NOSHASHI

> Market intelligence, reimagined.
> Analyze · Discover · Navigate

A zero-trust intelligence workstation for the XRP Ledger. It answers two
questions about the same position, in the same second, from the same
validated ledger state:

1. **Am I allowed to move this?** — compliance adjudication
2. **Could I actually get out of it?** — market and liquidity intelligence

Every other tool on this chain answers one or the other. Holding both is the
product.

---

## Quick start

```bash
npm install
npm run tauri:dev
```

That opens the desktop app against **XRPL mainnet**. There is no testnet path
in the build — see [Why no testnet](#why-there-is-no-testnet).

Nothing is signed and no key is ever held, so there is nothing to lose by
running it.

---

## The two editions

NOSHASHI builds from one source tree into two artefacts that install side by
side:

| | Full | Demo |
|---|---|---|
| Product name | `NOSHASHI` | `NOSHASHI Demo` |
| Bundle identifier | `com.noshashi.compliance` | `com.noshashi.compliance.demo` |
| Frontend output | `dist/` | `dist-demo/` |
| Paid capabilities | all | closed |
| Billing | live Stripe | inert — links to pricing |
| Live mainnet data | yes | **yes** |
| Adjudication engine | full | **full** |
| Receipts | real | **byte-identical** |

```bash
./scripts/build-editions.sh          # both, staged into ./release/
./scripts/build-editions.sh full     # only the real product
./scripts/build-editions.sh demo     # only the public early release
```

Use the script rather than calling Tauri directly. Tauri wipes
`src-tauri/target/release/bundle/` before every bundle, so building the two
back to back and collecting at the end silently loses whichever finished
first. The script copies each artefact out immediately after its own build.

The demo is deliberately **not** crippled where it matters. It reads the same
mainnet, runs the same deterministic policy engine and produces the same
receipts, because a demo that fakes its output teaches nothing about the
product and contradicts everything this one claims.

---

## What it reads, and what it does not

Everything below comes from validated mainnet state.

| Module | Source | Status |
|---|---|---|
| Ledger state | `wss://xrplcluster.com` (+ s1/s2 failover) | live |
| Account and flags | `account_info` · `account_lines` | live |
| Credentials | XLS-70 objects | live |
| Market data | XRPL DEX `book_offers` | live |
| Liquidity | XLS-30 AMM `amm_info` | live |
| On-chain supply | `gateway_balances` | live |
| Issuer holder walk | `account_lines` paginated | live |
| Signer lists and escrows | `account_objects` | live |
| AMM governance | `amm_info` vote slots · auction slot | live |
| Settlement forensics | `tx` · `meta.delivered_amount` | live |
| Multi-node sync | `server_info` across 4 public nodes | live |
| Macro | *no source in the build* | **not configured** |
| Sentiment | *no source in the build* | **not configured** |

Macro and sentiment appear in the interface as **NOT CONFIGURED** with a place
for your own key. They are never rendered as live and never populated with a
placeholder number.

> This is load-bearing, not a caveat. NOSHASHI is sold on the claim that it
> does not fabricate. An interface displaying a sentiment score it never
> measured would falsify the product on the first screen a buyer sees.

### The traps these tools are built around

Each read module exists because a specific field lies if you take it at face
value. They are handled explicitly and documented at the top of each module.

| Trap | Where | What goes wrong if ignored |
|---|---|---|
| `delivered_amount` ≠ `Amount` | `lib/desk/settlement.ts` | A `tesSUCCESS` payment can deliver 0.4% of the stated amount. Crediting `Amount` over-credits by 250x. This is how exchanges get drained. |
| Absent ≠ false | `lib/desk/issuance.ts` | A trust line carries `freeze`/`authorized` only when set. Reading absence as "not frozen" asserts a guarantee the ledger never made. |
| Partial walk ≠ measurement | `lib/desk/issuance.ts` | Concentration over an incomplete holder set has no known direction of error. Coverage below 95% withholds the figure rather than caveating it. |
| Quorum is weight, not count | `lib/desk/control.ts` | Five signers where one carries the quorum is a single-key account. The headline reports minimum signers required. |
| One node ≠ the network | `lib/net/sync.ts` | `server_info` describes the node that answered. Four are queried and their disagreement is the reading. |
| Not disclosed ≠ unknown | `lib/net/sync.ts` | `s1`/`s2.ripple.com` redact version and peer count by choice. Rendered as "not disclosed", never as a gap. |
| `rpc` rejects, never returns `.error` | `lib/xrpl/client.ts` | `if (res.error)` is dead code. Inside a pagination walk, an uncaught rejection discards every page already gathered. |

### Amendments are checked, not assumed

XRPL ships features as amendments, and a feature exists in three states:
**specified**, **implemented in rippled**, and **activated by validator
majority**. Only the third one works — until then every transaction of that
type is rejected by every validator on the network.

`src/lib/xrpl/amendments.ts` reads the ledger's own amendments object and
computes each amendment ID locally (SHA-512Half of the feature name), so no
lookup table can drift. Anything not activated is not offered.

Verified against mainnet on 2026-08-24 (rippled 3.3.0, 93 amendments active):

- **Live:** Credentials (XLS-70), PermissionedDomains (XLS-80),
  PermissionedDEX (XLS-81), DeepFreeze (XLS-77), TokenEscrow (XLS-85),
  MPTokensV1, Clawback, AMMClawback, DID, PriceOracle
- **Not activated:** SingleAssetVault (XLS-65), LendingProtocol (XLS-66),
  ConfidentialMPT (XLS-96), DynamicMPT, Batch, PermissionDelegation

`server_definitions` lists the *un*activated transaction types too, because
rippled knows them. Checking that endpoint is how tooling ends up offering a
lending product the network refuses.

---

## What NOSHASHI is not

- **Not custody.** It cannot hold, sign or move an asset. There is no signing path in the build.
- **Not a money transmitter.** It never touches fiat and never converts anything. It sells software.
- **Not advice.** A GO verdict means the configured rules passed. It is not a representation that a transaction is lawful anywhere.
- **Not a price oracle.** It reports the book as the ledger reports it.
- **Not a trading terminal.** There is no order entry.

### Why there is no testnet

Compliance answers that were rehearsed against fake state are worth nothing.
Every reading is mainnet or it is absent.

---

## Project layout

```
src/
  lib/
    policy.ts              deterministic GO/HOLD/NO-GO engine + receipt digest
    xrpl/
      link.ts              single persistent WebSocket, id-correlated, failover
      client.ts            every mainnet read
      amendments.ts        live capability detection
    desk/
      risk.ts              freeze rights, Travel Rule, HHI concentration
      liquidity.ts         exit liquidity — the compliance × market join
      watch.ts             issuer drift monitoring
      ledger.ts            durable local adjudication record
      rules.ts             operator-owned thresholds
      offline.ts           captured-state adjudication
    public/
      counterparty.ts      the free public address check
    edition.ts             full vs demo, resolved at build time
  components/
    nova/                  design system
      brand/               logo + section-07 brand pattern
    scenes/                one file per screen
src-tauri/                 Rust: tray, keychain, integrity, file export
scripts/
  build-editions.sh        build and stage both artefacts
  build-legal-page.mjs     generate site/legal/ from src/lib/legal.ts
docs/
  build_briefing.py        generate the 8-page briefing PDF
site/                      noshashi.app — deploy with `vercel deploy --prod`
```

`PRODUCT.md` holds product truth. `DESIGN.md` holds the design system and the
reasoning behind every deviation from the brand board.

---

## Security posture

- **No key material.** The app never holds, derives or transmits a private key.
- **OS keychain.** Secrets live in the system keychain, never in app storage.
- **Zero egress by default.** The compliance agent runs on your machine.
- **Strict CSP.** Every outbound host is named in `src-tauri/tauri.conf.json`.
- **Row-level security.** Every Supabase table is scoped to its owning account, and entitlements are written only by the Stripe webhook using the service role.
- **No card data.** Payments are handled entirely by Stripe.
- **Binary integrity.** `verify_integrity` hashes the running executable so you can confirm it was not altered after download. Free on every tier — charging for the ability to verify we are not malicious would be perverse.

Report anything you find to **security@noshashi.app**.

---

## Development

```bash
npm run dev            # frontend only, in a browser
npm run tauri:dev      # the real desktop app
npm run build          # typecheck + production frontend
npx tsc --noEmit       # typecheck alone
node scripts/build-legal-page.mjs     # regenerate site/legal/
python3 docs/build_briefing.py out.pdf
```

### House rules

1. **Never fabricate.** No placeholder numbers, no invented reputation scores, no feature that depends on an unactivated amendment. If a source is missing, the interface says so.
2. **Determinism is load-bearing.** `policy.ts` produces byte-stable receipt digests. Restyling must never change one — a changed digest invalidates every receipt ever issued.
3. **Colour means status.** GO / HOLD / NO-GO own the palette's saturation. See `DESIGN.md`.
4. **Measure, do not assume.** Contrast, book depth and amendment state are all checked against reality rather than asserted.

---

© 2026 NOSHASHI Labs · [noshashi.app](https://noshashi.app) ·
[Legal & accessibility](https://noshashi.app/legal/) ·
[New to XRP? Start here](https://noshashi.app/guide/)
