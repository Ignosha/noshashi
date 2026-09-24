# Changelog

## 1.0.9

### Every screen scrolls instead of hiding its panels

Several screens were fixed to the window height and squeezed their lower
panels, sometimes to nothing, when the window was not tall enough. They
now scroll, and no panel shrinks below its content.

- **Mission Control:** the ledger cadence, compliance coverage, live ledger
  stream, wallet gate, policy rule set and network panels were squeezed
  under the status bar on a normal laptop screen. They are all there again.
- **Compliance Agent:** the runtime, guardrails and human escalation column
  was cut off; on a smaller window, human escalation had no height at all.
  The support and security addresses are shown in full, the "runtime not
  detected" message reads as two sentences, and Compliance, Support,
  Observer and Governance are now one set of tabs.
- **Trust & Security:** the page could not scroll, so "Where your data
  goes", "Human oversight", "What this does not claim" and the list of
  ledger commands could not be reached. It now scrolls and has the same
  margins as every other screen.
- **Domain Grid and Growth:** their side columns now scroll instead of
  squeezing network facts and the publishing note.
- **Sidebar:** the list fades out at the bottom, so a section heading below
  the fold no longer looks like an empty section.

### Groundwork for iPhone and iPad

The desktop-only parts (menu bar tray, HUD, global shortcut, launch at
login, updater) are now separated from the rest, the first step to an iOS
build from a Mac with Xcode. `docs/IOS.md` has the steps. There is no iOS
release yet, and the desktop app works exactly as before.


## 1.0.8

### Watching, investigating, and saying "no answer" honestly

- **Observer (Agent › Observer):** watches your saved wallets every 5, 15
  or 60 minutes against the validated ledger and reports only what changed:
  a line frozen or deep-frozen, a holding or XRP balance falling 10% or
  more, a credential revoked, expired or entering its last week, an
  issuer's controls drifting, an account deleted. Each observation carries
  the before and after readings, and one click hands it to the agent,
  which is told to use only those facts. Readings stay on this device.
- **One-click issuer investigation:** from the Garden and the authority
  certificate, one button runs the authority certificate and the issuer's
  outstanding obligations together and hands the agent every fact found.
- **Five-state checks:** every check now reads PASS, FAIL, REVIEW,
  INSUFFICIENT DATA or NOT APPLICABLE. A supply walk that did not finish is
  "no answer", not a failure; an issuer with no obligations has nothing a
  concentration check can measure. Receipts and certificates issued before
  this keep their exact digests. Authority rules are now version 2.
- **Exception review:** a reviewer can ask for more evidence instead of
  approving or rejecting. The requester adds links, transaction hashes,
  accounts or digests, and the exception returns to the queue. Both steps
  are audited and delivered to webhooks (`exception_evidence_requested`,
  `exception_evidence_added`).
- **Landing garden:** the pond on the home page and the app's landing
  screen moves with the XRP Ledger. Each validated ledger that closes sends
  one ring, stronger the more transactions it carried, and the caption
  names the ledger. With no ledger arriving the water stays still.


## 1.0.7

### The flower is the brand

- **Logo:** the owner's flower artwork replaces the rocket on the app icon,
  the dock, the installers, the favicon, every page header and inside the
  console. The macOS menu bar uses a flat single-colour version of it.
- **Website hero:** NOSHASHI as the title above the question; the flower,
  animated, with smaller flowers around it; the bloom blended behind them;
  an ASCII pond (asciify-engine) with the XRP mark rippling in the water.
- **Whole site:** a faint ASCII pond behind every page, green, following the
  light/dark toggle, pausing under the hero and in background tabs.
- **Desktop app:** the landing screen carries the ASCII pond and XRP mark;
  garden patterns replace the orbit graphics; matcha primary buttons.

### Fixes

- Enterprise and Strategic subscriptions now receive their tier (database,
  webhook and API limits); before, they fell through to the free tier.
- The Asset Passport PDF had a corrupt cross-reference table.
- The console showed "100%" stream success and ledger "0" before connecting;
  it now shows a dash until real data arrives.
- Site header overflowed from 1200 to 1480px; three pages scrolled sideways
  on phones.


## 1.0.4

### Website design theme unified across all pages

The guide, research/findings and legal pages were still rendering with the
old blue-dark palette (`--brand:#3A82F6`, `--ground:#0B0F14`) instead of
the green-black brand palette that the home page and all other public pages
use (`--brand:#9BE15D`, `--ground:#08100B`). This made the product look
like two different products depending on which page you landed on.

All three pages now link `core.css` — the single stylesheet that holds the
correct tokens — and no longer carry an inline copy of a superseded palette.
The inline token block was the only thing that needed to change; layout and
component styles were untouched.

Light-mode support is now active across every public page. The `color-scheme`
meta was `dark`-only on the three affected pages; it is now `dark light`, and
the theme-toggle script and `localStorage` persistence are wired in, matching
every other page on the site.

**Pages fixed:** `/guide/`, `/research/` (Findings), `/legal/`
**Pages already correct:** home, pricing, contact, news, progress, status,
certificate, developers, enterprise, strategic-infrastructure

## Unreleased

### The public site is now rendered before it is served

The website was a hand-maintained static page whose most important
section had gone stale. The download block named **v0.3.0** while the
repository was on **v0.3.1**, with byte sizes and SHA-256 values to
match — on a page whose whole argument is that you should verify the
hash before running the binary. A wrong hash there does not just fail;
it teaches the reader that the check is noise.

The download section is now generated from the GitHub Releases API at
build time. It cannot disagree with the release again, because there is
no second copy to disagree with. Every artifact is labelled **BETA**:
the builds are pre-1.0 and unsigned, and that belonged on each one
rather than only in a note underneath.

`scripts/build-site.mjs` renders the landing page from
`templates/home.html`, plus four new pages — `/news/`, `/status/`,
`/progress/` and `/contact/`. Rendering at deploy time rather than per
request was chosen deliberately: it puts the same content in the HTML a
crawler receives, without making the homepage's availability depend on a
news site's uptime. A failed upstream fetch renders an honest empty
state and never fails the build.

### Live XRP data, and an honest empty state for it

A market panel carrying spot price, seven days of history, reported
volume, and the validated ledger the network is on right now — read
server-side from CoinGecko and an XRPL public node, so the page makes no
cross-origin request and the CSP stays closed. The charts are SVG
rendered on the server with a crosshair, a tooltip carrying the exact
value and timestamp, labelled axes and keyboard traversal.

The 24-hour change is **not** coloured green or red. Status colour is
spent on GO/HOLD/NO-GO and a price moving is not a verdict; direction is
carried by a glyph and a signed number, which also survives a reader who
cannot separate the two hues.

The newsroom merges three public RSS feeds. Two of the three were
silently returning nothing at first: the tag extractor stripped markup
before unwrapping CDATA, and `<![CDATA[Ripple files a brief]]>` matches
a tag-stripper end to end, which deleted the headline and dropped the
whole source. Decode first, then strip.

### Accounts and the hosted workspace were withdrawn

`/login/`, `/dashboard/` and `/auth/` are deleted and redirect to the
root. The workspace presented fabricated figures — "04 open evidence",
"07 active workflows" — which is the one thing this codebase bans
outright. NOSHASHI runs on your machine and reads public ledger state;
the site no longer asks anyone to create an account to evaluate it.

### Checkout failures are now diagnosable

Every Stripe error collapsed into `502 "Stripe could not create
checkout."` — the same five words whether the key was from the wrong
mode, the price had been archived, or the account was restricted. Stripe
returns a precise code for all three and the handler discarded it. The
real error is now logged, the price ID moved to `STRIPE_PRO_PRICE_ID`
(a price ID is mode-scoped, so a literal can only be correct in one of
test or live), the `fetch` is guarded, and the endpoint answers JSON
when asked so the page can show the reason in place.

`/api/stripe-status` reports whether checkout actually works, without
revealing the key.

### Contact, support and the mission log

A contact form that delivers to every configured channel and refuses to
claim a delivery it did not perform — with nothing configured it returns
503 and shows the address that works, rather than accepting a message
nobody will receive. `/api/contact-status` reports what is configured.

A support console answering from `api/_lib/kb.js`, which is also the
source for the landing page's questions section. It works with no API
key by retrieval and upgrades to Claude when one is present; both modes
refuse to state a figure the site does not state. A price-prediction
question used to reach the entry about which network is read, on the
word "xrp" alone — a confident answer to a question nobody asked. It now
refuses.

A mission log built from repository notices merged with the GitHub
releases feed, so a release cannot appear in it without a build behind
it, and a status board derived from the log rather than maintained
separately.

### Elsewhere

- Typefaces are self-hosted on the site, matching the desktop build's
  policy. Opening a page no longer announces the visitor to a font CDN,
  and two render-blocking connections are gone.
- Security headers, including a Content-Security-Policy, and a local
  preview server that applies them — so the policy is exercised against
  a real browser before it meets production.
- `/assets/*` moved to a five-minute browser cache with a long CDN
  cache. The filenames carry no content hash, so the previous one-hour
  browser cache could leave a visitor on new markup with the previous
  deploy's stylesheet.
- The landing page opens with the name and the mission, over a starfield
  confined to the hero — a bounded exception to the motion rules,
  recorded in DESIGN.md with the terms it is granted on.
- 32 tests covering the render layer, most of them about escaping
  third-party feed text, which is the difference between a newsroom and
  a stored XSS on the marketing site.


## 0.3.1

**LEDGER CADENCE reported a healthy network as failing.** 0.3.0 measured the
interval between closes by differencing `ledger_time`, which is not a
timestamp of the resolution that implies: XRPL rounds a close time to the
ledger's `close_time_resolution`, and when the rounded value collides with
the parent's it takes parent + 1 second instead. Consecutive closes inside
one resolution bucket therefore report exactly 1s, and the bucket boundary
reports 8s or 9s.

Measured against mainnet on 2026-09-15, thirty-three consecutive intervals
read 9,1,1,8,1,1,8 — never once the three to four seconds the network
actually runs at. Their mean was 3.94s, which is right, because the rounding
preserves the total and destroys the distribution. Drawn per-interval it
announced eighteen of twenty-eight closes as out of band while the network
was entirely healthy — the panel inventing a fault, which is the one thing
this product is sold on not doing.

Cadence is now measured from when each close reaches this machine, and
labelled as that rather than as the ledger's own rhythm: it includes the
local network path, exactly as `roundTripMs` does in `net/sync.ts`. The same
window now reads 3.72–4.08s with a mean of 3.85s. `closeAt` is kept for
labelling a ledger and carries a note against using it for intervals.

The ribbon also became a dot strip. As bars it had to be anchored at zero or
it would misstate every ratio, and at that scale the real signal — four
tenths of a second of spread — was a few pixels inside a wall of identical
bars. A dot encodes position rather than length, claims no baseline, and can
carry a range zoomed to the data honestly, with the 3–4s band drawn behind
it supplying the reference the axis no longer does.

**The application icon had white corners.** It painted a rounded rectangle on
a square canvas, leaving four transparent corners — which render white on any
light ground and bake white in through a converter that flattens. Every
platform masks an icon itself, so the second rounding underneath was never
wanted. The ground is now full-bleed and the mark is centred, six pixels left
of true before.

## 0.3.0

**LEDGER CADENCE was not measuring cadence.** The panel plotted transactions
per close, which is throughput: a ledger carrying four hundred transactions
and one carrying none can close on exactly the same rhythm, and a network
genuinely slowing down would not have moved the line at all. The one reading
the panel is named for was the one reading it did not contain. It now draws
the interval between consecutive closes against the three-to-four-second
window a healthy network closes in, with the observed median as a centre line
and the distribution of intervals down the right edge — twenty closes
crossing the band and twenty pressed against one edge of it look alike in
sequence and mean different things about the network.

This needed the close time carried through as a number. `LedgerTick` kept
only the formatted string, and an interval cannot be recovered from
`"14:32:07"`. `LedgerStreamClose.closeAt` is the ledger's own close time in
epoch millis — deliberately not the moment the frame arrived here, because
arrival interval measures this machine's connection and a local network
stall would otherwise render as XRPL slowing down. It is zero rather than a
date when a node omits `ledger_time`, since `rippleTimeToDate(0)` is
2000-01-01 and differencing against it would manufacture an interval.

**Two things in COMPLIANCE COVERAGE were drawn as measurements that were not
measurements.** `DOMAIN ENFORCEMENT` was `connected ? 100 : 0` and `NODE LOAD
FACTOR` was `100 / loadFactor`, both rendered as percentage bars. A bar
implies a scale and a measured position on it; a binary has no such
continuum, and an inverted multiplier is not a percentage of anything. Both
are now states, showing the actual load multiplier and distinguishing "not
read" from "off" — a node that never reported a load factor is not a node
under no load.

The two figures that *are* proportions became bullet graphs, so each carries
the threshold it is judged against rather than leaving the reader to supply
one from memory. Credential coverage is judged at 100: a permissioned domain
admits on all of its requirements or none, so eighty percent is not most of
the way there.

**The Compliance API refused every credentialed subject.** `CredentialType`
is a variable-length blob and arrives hex-encoded — `KYC_LEVEL_1` reaches the
edge function as `4B59435F4C4556454C5F31`. The console decodes it; the server
did not, and compared raw hex against the domain's plain-text requirement. It
never matched. Every `CREDENTIAL_*` check failed for subjects who genuinely
held the credential, and the API's answer was `no-go` regardless of the
ledger. Decoded now, exactly as `fetchWalletCredentials` does.

**The same function invented ledger state when it could not read any.**
rippled's HTTP JSON-RPC reports a command error *inside* `result` and sends
HTTP 200 doing it — only the WebSocket API puts the error at the top level,
which is the shape the code tested for. An unknown or unreadable account
therefore arrived as an empty result and became an account with a zero
balance and no credentials, which was then adjudicated as though it had been
read. It now raises the ledger's own error code: an unfunded account gets the
same unfunded record the console produces, so both sides digest the same
receipt, and anything else returns 502 rather than a verdict.

**Windows and Linux stored no secrets at all.** `keyring` compiles no
credential store unless a backend feature asks for one, and falls back to an
in-process mock in silence. Only `apple-native` was listed, so on the Windows
and Linux builds the compliance API key and every model-provider key were
written to memory: the UI reported success, and the value was gone at the
next launch. Backends are now selected per target.

**`open_external` could run arbitrary commands on Windows.** It shelled out
through `cmd /C start`, and cmd re-parses its command line with rules Rust's
argument quoting does not cover — `&`, `|` and `^` reach it unquoted, so a URL
of `https://example.com/?a=b&calc.exe` ran `calc.exe`. That is the exact
escape the command's scheme check exists to prevent. It now uses `rundll32`,
which is not a shell.

**`export_text_file` could write outside Downloads on Windows.** Taking the
last path segment does not help when `join` *replaces* the base path for an
argument carrying a drive prefix, so `C:audit.csv` escaped intact. Names
carrying a separator, a drive letter or a control character are refused
rather than salvaged.

**The version was wrong everywhere it was shown.** The About panel, the
footer and the legal BUILD row all read 0.1.0 at version 0.2.2, as did both
DMG packaging scripts — which meant the release script never found the DMG it
had just built and silently repackaged from the `.app` every time. All of it
now reads `package.json`, substituted at build time.

**Automatic updates.** Signed, verified against a key compiled into the
application, and never installed without a click — see `docs/UPDATES.md`.
Inert until a signing keypair exists, and it says so rather than offering a
button that cannot work.

Two receipt lines corrected: `ACCOUNT_ACTIVATED` said "Account is funded"
beside a *failed* check for an address that had never been funded, and the
`transferCeilingXrp` documentation said zero meant uncapped where the engine
— correctly, and under test — treats it as a closed domain.

## 0.2.2

**Linux ships.** The 0.2.1 release run failed on one of its four build
jobs — `Install Linux webview dependencies` on the Ubuntu runner — so no
`.deb` or `.AppImage` was ever attached to that release, while macOS and
Windows published normally. The dependency list had drifted from Tauri
2's documented set for Ubuntu 22.04 in two ways: it carried the legacy
`libappindicator3-dev` alongside the ayatana package that supersedes it,
and it omitted `libxdo-dev`, which Tauri 2 requires. Both corrected.

`pkg-config --modversion webkit2gtk-4.1` now runs immediately after the
install, so a missing webview names itself at the step that installs it
rather than surfacing minutes later as an opaque Rust link error.

Releases are no longer marked as pre-releases. The 0.2.1 release carried
that flag, which meant `releases/latest` returned nothing and the repo
page never showed a current release.

The site advertised Windows as "Building in CI" for a build that had
succeeded and been published. The `.exe` and `.msi` are now real
downloads with their SHA-256 beside them, and the Linux card states what
actually happened rather than claiming a build is still running.

Findings are published at [noshashi.app/research](https://noshashi.app/research/):
the five mainnet measurements, each carrying the date it was taken and
what would need re-running before anyone repeats it — including the
negative result that removed address-poisoning detection from the
roadmap.

## 0.2.1

Control-change forensics in Provenance: when the signing authority over an
account last moved, and whether that is the shape of a stolen key. Rare
events — 7,965 consecutive mainnet transactions contained none — which is
what makes each one worth surfacing.

Two site fixes. The header nav wrapped and collided with the wordmark
between roughly 900 and 1100px. The hero graphic pushed the page 39px
wider than the viewport in the same band.

A handoff sent to a plan-gated scene never expired, so it could fire a
stale lookup weeks later once the plan was bought.

**Not built: address-poisoning detection.** It was on the roadmap and the
evidence removed it. Fourteen accounts scanned for lookalike counterparties
turned up nothing, and XRPL charges 1 XRP to bring an address into
existence — a thousand lookalikes cost 1,000 XRP before a single dust
payment, where the same attack on an account-free chain costs only gas.
The reserve is a structural deterrent, and building a detector for a threat
the ledger already prices out would have meant inventing a problem.

## 0.2.0

Eight new read tools, two correctness fixes in capabilities that were
already shipping, and the first test suite.

### Two bugs that were giving wrong answers to paying customers

**Order book depth was overstated by up to fourteen times.** An offer rests
in the book whether or not its owner still holds the asset to honour it,
and `rippled` reports the difference in `taker_gets_funded`. NOSHASHI was
summing the advertised amount. Measured on mainnet on 2026-08-28:

| Book | Advertised | Actually fundable | Phantom |
|---|---|---|---|
| USD / Bitstamp | 1,606,485 | 116,107 | 92.8% |
| USD / GateHub | 1,881,039 | 772,777 | 58.9% |

One offer advertised 1,400,100 USD against an owner balance of 22,273. That
figure fed **exit liquidity**, so the console was telling operators they
could exit positions the book could not absorb. Depth is now discounted to
what can actually fill, and the advertised figure is kept beside it rather
than silently dropped.

**Deep-frozen balances were reported as merely freezable.** XLS-77 deep
freeze is a separate flag from an ordinary freeze and a strictly worse
position: an ordinary freeze stops the holder sending, a deep freeze stops
them receiving as well. Exposure analysis read only the ordinary flag, so a
deep-frozen line came back as "issuer retains the right to freeze this
balance" at severity *info* — a present, total immobilisation described as a
future possibility. The free public address check already read both flags;
only the paid analysis was blind to it.

### New tools

| Tool | Plan | What it answers |
|---|---|---|
| **Settlement** | Desk | What a transaction *delivered*, against what it requested |
| **Order Book** | Desk | How much quoted depth is backed by someone who still holds the asset |
| **Provenance** | Desk | How old an account is, and who sent it its first XRP |
| **Control Surface** | Desk | How few signers can actually move a treasury |
| **Pool Governance** | Desk | Who votes an AMM's fee, and who holds the discounted slot |
| **Issuance** | Institution | Holder concentration from the issuer's side |
| **Inbox** | **Free** | Unsolicited claims, with the claimed issuer verified |
| **Ledger Sync** | **Free** | Four public nodes compared, disagreement treated as the reading |

Each is built around a specific field that misleads when taken at face
value. `delivered_amount` against `Amount`, because a `tesSUCCESS` payment
can deliver 0.4% of the stated figure. Signing *weight* rather than a count
of signers, because five signers where one carries the quorum is a
single-key account. A currency code, because it is not a name anyone owns —
any account may issue a token called USDT.

Findings now carry between screens: an address named in one is one click
from being the subject of the next.

### Tests

164, over the logic that makes claims. There were none before.

They are verified by mutation rather than by passing — each safety rule is
deliberately broken to confirm a test fails. That process found four cases
where a suite passed while the code was wrong, every one of them because
the tests exercised the reasoning and never the code that reads the ledger.

CI now runs typecheck, the suite, a build and a production dependency audit
on every push, and a release cannot be cut without them.

### Security

- Content Security Policy corrected — a node the console queries was not on
  the connect-src allowlist, which would have failed silently in the
  packaged app while working in development.
- `freezePrototype` enabled.
- Two database advisories closed: an unnecessary `EXECUTE` grant revoked,
  and a function's `search_path` pinned. Row-level security verified still
  auto-enabling afterwards.

### Housekeeping

The demo's own description of itself, the pricing tiers in the app, the
pricing on noshashi.app, the compliance agent's console reference, and the
documentation had all been written before these tools existed. All five now
agree, and two of them are held to it by tests — the agent's reference
against the actual scene list, and the plan catalogue against the
entitlements each tier grants.

The agent had also been quoting the wrong keyboard shortcut for every
screen, and knew about six of twenty-four. Because it is instructed to say
it lacks a fact rather than guess, an incomplete list made it deny features
that shipped.

## 0.1.0

Initial release.
