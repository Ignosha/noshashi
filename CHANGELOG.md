# Changelog

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
