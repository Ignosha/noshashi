# NOSHASHI — Product Truth

> Market intelligence, reimagined.
> Analyze · Discover · Navigate

## Mission

NOSHASHI is a **zero-trust intelligence workstation for the XRP Ledger**.

It answers two questions about the same position, in the same place, from the
same validated ledger state:

1. **Am I allowed to move this?** — compliance adjudication
2. **Could I actually get out of it?** — market and liquidity intelligence

Every other tool on this chain answers one or the other. Holding both is the
product.

## The thesis

An issued balance on XRPL is only an asset if two things are true at once:

- the **issuer cannot immobilise it** (a compliance fact, in account flags)
- there is **somewhere to sell it** (a market fact, in the DEX and AMM)

Either one alone is a half-answer. A position with clean freeze rights and no
order book is untradeable. A position with deep liquidity behind an issuer who
can freeze it at will is not owned. Institutions carry both risks and currently
measure neither, because the tooling is split between compliance vendors who
never read the book and market terminals that never read the flags.

NOSHASHI reads both from the same WebSocket, in the same second, and reports
them as one number.

## Target users

| User | Job to be done |
|---|---|
| Trading desks and funds | Know which positions are exitable before size goes on |
| Regulated venues and custodians | Discharge Travel Rule and freeze-rights obligations with an audit trail |
| Issuers | Understand who holds their paper and how concentrated it is |
| Individuals | See GO / HOLD / NO-GO before a fee is burnt |

## Capabilities that exist today

Everything listed here reads validated mainnet state. Nothing is estimated,
simulated, or backfilled.

### Compliance
- **Adjudication gate** — GO / HOLD / NO-GO against XLS-80 permissioned domains, with a canonical SHA-256 receipt
- **XLS-70 credential registry** with selective disclosure
- **Issuer freeze rights** — reads `lsfGlobalFreeze`, `lsfNoFreeze`, `lsfRequireAuth`, `lsfDisableMaster`
- **Travel Rule (FATF R.16) scoping** against a configurable jurisdiction threshold
- **Counterparty concentration** scored by Herfindahl-Hirschman Index
- **Issuer drift monitor** — baselines each issuer, alerts natively on a flag transition
- **Persistent adjudication ledger** — 10,000 verdicts, on device, survives restart
- **Editable rule set** — the operator states their own thresholds
- **Signed audit export** — SHA-256 chain-of-custody over the exact bytes
- **Offline adjudication** — captured state, stamped with ledger index and age
- **Settlement forensics** — `delivered_amount` against the requested `Amount`. A partial payment can return `tesSUCCESS` having delivered a fraction of the stated figure; measured on mainnet, three of 223 consecutive payments carried the flag and one delivered 0.4%
- **Counterparty provenance** — account age and the account that sent the first XRP in. Corrects for sequence numbers being seeded to the creation ledger index rather than counting transactions
- **Treasury control surface** — the minimum number of signers who must agree, derived from summed signing weights rather than a headcount, plus master-key bypass and reserve/escrow locks
- **Issuance surveillance** — holder concentration from the issuer's side, withheld entirely when the holder walk covers too little of the supply to support a figure
- **Binary integrity verification** — hashes the running executable

### Market intelligence
- **Order book integrity** — quoted depth against depth an owner can actually deliver. An offer rests whether or not its owner kept the asset, and on measured mainnet books over 90% of visible depth could not fill
- **Order book depth** — real bids and asks via `book_offers`, discounted to what is funded
- **AMM pool state** — liquidity, trading fee, and frozen status via `amm_info`
- **Issuer obligations** — real circulating supply per currency via `gateway_balances`
- **AMM pool governance** — who votes the trading fee, on what share of the LP supply, and who holds the discounted auction slot
- **NFT rights** — what an issuer can still do to a token after selling it: destroy it, rewrite what its URI points at, block resale, or take a cut of every transfer. Decoded from the NFTokenID itself, offline
- **Unsolicited claim detection** — checks a stranger has addressed to an account, with the claimed issuer verified. A currency code is not a name anyone owns, so an impersonated ticker from an issuer with zero obligations is identified as uncashable rather than rendered as a balance
- **Ledger sync** — four public nodes queried by name, with disagreement between them treated as the reading rather than smoothed away
- **Exit liquidity analysis** — the synthesis: freeze risk × concentration × realisable depth

### Platform
- macOS menu-bar HUD with a live ticker
- On-device compliance agent (any model; local defaults)
- Multi-wallet portfolios and a compliance radar
- Accounts, 2FA/OTP, subscription billing, entitlement gating
- Subject handoff — an address found in one screen carries into the next, so a finding becomes the following question rather than a copy-paste
- A test suite over the findings logic, verified by mutation rather than by passing

## What NOSHASHI is not

State these plainly rather than letting an interface imply otherwise:

- **Not custody.** It cannot hold, sign, or move an asset. There is no signing path in the build.
- **Not advice.** A GO verdict means configured rules passed. It is not a representation that a transaction is lawful anywhere.
- **Not a price oracle.** It reports the book as the ledger reports it. It does not forecast.
- **Not a trading terminal.** It has no order entry.
- **No testnet.** No testnet path exists in the build.

## Data sources — and their honest limits

| Module | Source | Status |
|---|---|---|
| Ledger state | `wss://xrplcluster.com` (+ s1/s2 failover) | **Live** |
| Market data | XRPL DEX `book_offers` | **Live** |
| Liquidity | XRPL AMM `amm_info` | **Live** |
| On-chain supply | `gateway_balances` | **Live** |
| Identity | Supabase (accounts only) | **Live** |
| Macro | *no source in the build* | **Not configured** |
| Sentiment | *no source in the build* | **Not configured** |

Macro and sentiment require external feeds NOSHASHI does not ship. They appear
in the interface as **NOT CONFIGURED** with a place for the operator to add
their own key. They are never rendered as live, and never populated with
placeholder numbers.

> This is a load-bearing rule, not a caveat. NOSHASHI is sold to regulated
> institutions on the claim that it does not fabricate. An interface that
> displays a sentiment score it did not measure would falsify the product's
> central promise on the first screen a buyer sees.

## Voice

Declarative. Technical. Never breathless.

- Say what a number is and where it came from.
- Name the rule that produced a verdict.
- Disclose staleness rather than hiding it.
- Never use "AI-powered", "revolutionary", "seamless", or "cutting-edge" in the interface.

**Good:** `Adjudicated offline against ledger 84,112,907 captured 2026-08-22T09:14:02Z (3h 20m old).`

**Bad:** `Your compliance is looking great!`

## Principles

1. **Determinism.** Identical inputs produce an identical verdict and an identical digest. Restyling must never change a receipt.
2. **Disclosure over confidence.** Stale, partial, and unreadable states are shown, not smoothed.
3. **Least data.** The safest data is data nobody holds. No telemetry, no analytics, no crash reporting.
4. **On-device by default.** The agent runs locally. Secrets live in the OS keychain.
5. **Colour means status.** GO / HOLD / NO-GO own the palette's saturation. Nothing decorative competes with them.
