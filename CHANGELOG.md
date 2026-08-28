# Changelog

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
