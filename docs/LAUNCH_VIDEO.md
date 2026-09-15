# Beta launch video

Shot-by-shot for the Raylight assembly. Two cuts from one asset set: a 9:16
vertical for TikTok/Reels/Shorts and a 16:9 for YouTube and the site hero.

The argument is the same in both, and it is the argument the product already
makes everywhere else: **everyone else shows you a number. This one shows you
whether the number is true.** Nothing in this script claims a capability the
build does not have — the same rule the interface is held to.

---

## Before you record

Capture at **2560×1440**, dark theme, window chrome off. Raylight scales down
cleanly; it cannot invent pixels going up.

Use a funded mainnet account with real trust lines. A blank wallet produces
empty states, and empty states are honest but they do not sell.

**Do not fake a verdict.** If the demo account returns GO, build the cut
around GO. Staging a NO-GO that the ledger did not produce is precisely the
thing this product exists to refuse, and it is the one dishonesty a viewer
could later catch by running it themselves.

### Asset list

| # | Screen | Where | Note |
|---|---|---|---|
| A1 | Overview with GLOBAL RELAY PULSE live | OVERVIEW | Wait for `connected` — the map must be animating |
| A2 | LEDGER CADENCE ribbon, ≥20 intervals | MISSION CONTROL | Let it run 90s first so the ribbon is full |
| A3 | COMPLIANCE COVERAGE panel | MISSION CONTROL | Both rings plus the four rows |
| A4 | Verdict card, whatever it really says | VERIFICATION | The hero frame |
| A5 | Receipt with digest visible | VERIFICATION | Proof, not decoration |
| A6 | LEDGER SYNC, four nodes | LEDGER SYNC | The "we asked four" frame |
| A7 | Order book: quoted vs fillable | EXPOSURE ANALYSIS | The strongest single number we have |

---

## 9:16 — TikTok / Reels / Shorts · 28s

Hook lands in under two seconds or the rest does not get watched. No logo
first. The logo goes at the end, when they have a reason to care.

| Beat | t | Visual | On-screen text |
|---|---|---|---|
| 1 | 0.0–2.0 | A7 punched in hard on the depth figure. Hold, no motion. | **92.8% of that order book could not fill.** |
| 2 | 2.0–4.5 | Slow push out to the full book panel | Every offer was real. Most were unbacked. |
| 3 | 4.5–8.0 | A6, four node rows resolving in sequence | One node is not the network. So we ask four. |
| 4 | 8.0–12.0 | A2, cadence ribbon animating against its band | Ledger closes every 3–4s. We measure it. |
| 5 | 12.0–17.0 | A4 verdict card, camera settles and stops | GO · HOLD · NO-GO |
| 6 | 17.0–22.0 | A5 receipt, digest legible | Every verdict leaves a receipt an auditor can check. |
| 7 | 22.0–25.5 | A1 relay map, pull back | Mainnet only. No testnet. No demo data. |
| 8 | 25.5–28.0 | Logo on ground, single line | **NOSHASHI** · noshashi.app |

**Caption:** `We built a compliance tool that refuses to guess. 92.8% of one
XRPL order book couldn't actually fill — here's how you'd know. Beta open.`

**Sound:** something with a pulse near 3–4s that you can cut the cadence beat
to. Do not use a trending track that dates the video a month from now.

---

## 16:9 — YouTube / site hero · 72s

Room to make the argument rather than assert it. Same spine, earns each claim.

| Beat | t | Visual | Voiceover / text |
|---|---|---|---|
| 1 | 0–5 | Black, then A7 fading up on the depth number | "This order book advertised 1.4 million dollars of depth. One offer behind it was backed by twenty-two thousand." |
| 2 | 5–12 | Book panel, quoted vs fillable side by side | "An offer rests on XRPL whether or not its owner still holds the asset. Nothing in the book tells you which." |
| 3 | 12–20 | A6, four nodes, disagreement highlighted | "Ask one node if the network is healthy and you learn about that node. We ask four and show you where they disagree." |
| 4 | 20–28 | A2, cadence ribbon filling in real time | "Ledgers close every three to four seconds. This is the actual interval, measured, against the window it should sit in." |
| 5 | 28–38 | A3, coverage rows | "Where a number is measured, it gets a bar. Where it isn't, it doesn't. A binary never gets drawn as a percentage." |
| 6 | 38–50 | A4 verdict, then checks expanding | "Every check is named. Every one says which ledger field it read." |
| 7 | 50–60 | A5 receipt, digest | "And it produces a receipt. Byte-stable, so an auditor can verify the verdict without seeing your wallet." |
| 8 | 60–68 | A1 relay map | "Mainnet only. There is no testnet path in the build — compliance answers rehearsed against fake state are worth nothing." |
| 9 | 68–72 | Logo, URL, beta line | **NOSHASHI** — beta open · noshashi.app |

---

## Raylight assembly

1. Start from a **launch template** rather than an empty canvas — camera work
   and pacing are the part that takes days to get right.
2. Drop A1–A7 in as product screens. Keep them on the canvas plane; the
   template's 3D camera supplies the depth. Screens tilted on two axes stop
   reading as software.
3. Set text blocks from the tables above. One idea per card — the copy is
   already cut to the bone, and splitting a line across two cards halves the
   time the viewer has to read each.
4. Cut beat changes on the audio pulse, not on even seconds.
5. Export **full quality**, then produce the 9:16 as its own composition.
   Cropping the 16:9 to vertical will cut the right-hand column off every
   panel, and the right-hand column is where the numbers live.

### Two things to check before publishing

- **Every figure on screen is one the app actually produced.** The 92.8% and
  the 1,400,100-against-22,273 are from the README's measured findings — if
  your capture shows different numbers, use the numbers in your capture.
- **No claim of a capability behind a gate.** Macro and sentiment render as
  NOT CONFIGURED in the product. They must not appear in a launch video as
  though they were live.
