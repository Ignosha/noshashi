# Sales and launch materials

Everything here is ready to send. Placeholders are in `{{braces}}` and
there are only ever a few per template — if a message needs more than
three substitutions it is not specific enough to be worth sending.

**One rule for all of it.** Every claim must be something the free tier
can demonstrate in under two minutes. That is the whole reason Free
exists, and it is also the only defence against sounding like every other
crypto tool. Do not write a sentence you cannot immediately prove.

---

## 1. Cold outreach

### 1.1 What makes these work

Short, one specific observation about *their* situation, one number, one
ask. No product pitch in the first message. The ask is always for a
reaction, never for a meeting — a meeting request from a stranger is a
decision, and a reaction is not.

**Never** open with "I hope this finds you well", "quick question", or
anything about revolutionising anything. Never attach a deck. Never send a
calendar link before they have replied.

**Do the homework first.** Each template below has a
`{{specific_observation}}` slot. Fill it by actually running the free tier
against something they hold or something they operate. If you cannot fill
it with a real reading, do not send the message — send it to someone whose
book you have actually looked at instead. A generic version of any of
these is worse than nothing, because it burns the one cold-open you get.

---

### 1.2 XRPL developers

**Channel:** X DM, GitHub discussion, XRPL Dev Discord.
**Subject / opener:** none — go straight in.

> Saw your work on {{project}}.
>
> A thing I keep hitting on XRPL that I have not seen handled anywhere:
> `account_lines` gives you a balance, but nothing in that response says
> whether the issuer has `lsfNoFreeze` set. So a balance that can be
> immobilised in one transaction and a balance that cannot look identical
> in the API. Holders find out when the freeze lands.
>
> Built a thing that reads both sides. Free tier, runs locally, no account:
> noshashi.app
>
> Curious whether you have run into this or whether you handle it some
> other way.

Why it works: it is a real protocol gap, stated precisely, and it is
checkable in one call. A developer either recognises it immediately or
tells you why you are wrong — and both replies are useful.

---

### 1.3 Small funds and prop desks

**Channel:** email or LinkedIn DM.
**Subject:** `{{token}} depth — advertised vs fundable`

> {{name}} —
>
> I ran the {{token}}/XRP book on XRPL Mainnet this morning.
> {{advertised}} advertised on the bid side. {{fundable}} of that is
> backed by owners who currently hold the funds to honour it. The rest
> would not fill.
>
> {{specific_observation}}
>
> If you carry a position there, the number that matters for your mark is
> the second one, and no XRPL market data source I know of reports it.
>
> The tool that produced this is free for a single address —
> noshashi.app — no signup. Worth thirty seconds if only to check I have
> it right.

Why it works: it leads with a measured number about a market they care
about, and the number is surprising. It also invites falsification, which
is what a quant respects.

---

### 1.4 Market makers

**Channel:** email or Telegram.
**Subject:** `Exit routing across the {{pair}} book and pool`

> {{name}} —
>
> Most XRPL exit simulations walk the resting book only. On {{pair}} the
> AMM pool holds {{pool_xrp}} XRP, which for anything above about
> {{size}} makes book-only sizing materially wrong in both directions —
> it understates what you could clear, and it misprices what it would
> cost.
>
> We route across both and report the split. {{specific_observation}}
>
> Not pitching a subscription in a cold email. If the routing is useful,
> the free tier will show you. If it is wrong, I would genuinely like to
> know where — noshashi.app.

Why it works: market makers already know this and will respect that you
do. The credibility comes from stating the problem the way they would.

---

### 1.5 Compliance teams

**Channel:** email, or LinkedIn if the address is not published.
**Subject:** `Producing an XRPL adjudication six months later`

> {{name}} —
>
> A question for how {{institution}} handles XRPL settlements: when an
> examiner asks why a transfer was permitted in {{month}}, what do you
> hand them?
>
> The hard part is not the decision, it is that the decision rested on
> ledger state that has since moved. Our verdicts carry the ledger index
> they were made against and a SHA-256 digest over the exact facts, so an
> adjudication can be reproduced and shown to be unedited months later.
>
> {{specific_observation}}
>
> Free tier runs locally with no account and no data leaving the machine,
> which is usually the fastest way past a security review —
> noshashi.app. Happy to send the DPA and security questionnaire first if
> that is the order you prefer.

Why it works: it asks about their process rather than describing ours, and
the offer to send compliance paperwork *before* the product signals you
have sold to a regulated entity before.

---

### 1.6 Follow-ups

**One follow-up. Not three.** Seven to ten days after, on the same thread.

> {{name}} — following up once on the below in case it was buried.
>
> Since I wrote, {{new_specific_thing}}.
>
> If this is not a priority, no reply needed and I will not chase again.

The explicit release is the part that works. It also means the one in
twenty who does reply, replies honestly.

---

### 1.7 A short list of who to write to first

Prioritise by whether you can fill `{{specific_observation}}` with a real
reading:

1. Anyone who has publicly published an XRPL issued asset — you can read
   their issuer flags and holder concentration without asking.
2. XRPL AMM pool creators — visible on-ledger, and they care about depth.
3. Desks that have posted about XRPL DEX liquidity in the last year.
4. Compliance leads at venues that already list XRP — findable, and
   Permissioned Domains are on their roadmap whether they like it or not.
5. XRPL Commons / XRPL Grants alumni — technical, reachable, and they
   already believe the ecosystem needs tooling.

---

## 2. Institutional one-pager

*Layout: one side of A4. Headline, the join, three panels, the maths,
the ask. No stock photography. Brand palette from `DESIGN.md`.*

---

### NOSHASHI

## Compliance state and exit liquidity, from the same ledger read

**The gap.** Compliance tooling reads account flags and never opens the
order book. Market terminals read the book and never look at who can
freeze the balance. Both are correct about their half. A position that
passes a compliance check and cannot be exited is invisible to the first,
and a position with deep liquidity behind an issuer who can freeze at will
is invisible to the second.

The two answers are also produced at different moments. Reconciling them
by hand means comparing a compliance answer about one ledger state with a
liquidity answer about another, and calling the pair a position.

**What NOSHASHI does.** Reads both halves of the *same* validated ledger
state and reconciles them into one verdict, with the ledger index attached
so it can be reproduced later.

---

| **Am I allowed to move this?** | **Could I actually get out?** | **What is it really worth?** |
|---|---|---|
| Credentials held on-ledger, checked against a Permissioned Domain's requirements. Reserve solvency, transfer ceilings, domain governance state. GO / HOLD / NO-GO with every check itemised and a SHA-256 digest over the facts. | Fundable depth, not advertised depth — on some Mainnet books the phantom share exceeds 90%. Exit routed across the DEX book and the AMM pool together. Issuer freeze rights read from the flags that actually decide them. | Redemption stress testing: liquidity-adjusted recoverable value for the whole book, shocked for depth that walks away, charged for contention between your own lines, and discounted for balances an issuer could immobilise. |

---

### What $4,000 a month buys

Unlimited seats. SSO with SCIM. An immutable audit log of every
adjudication, export, key issuance and policy change, with actor and
timestamp. Bulk portfolio monitoring with scheduled stress runs. Custom
alert logic on your thresholds, not ours. The Compliance API — 100,000
verifications a month, signed webhooks, negotiated rate limits. Signed
chain-of-custody exports for examiners. Offline adjudication on segregated
networks. Regulator read-only seats that expire on their own. Travel Rule
(FATF R.16) scoping. A 99.9% uptime SLA with service credits. Dedicated
onboarding and a named support contact. Invoice, ACH, wire, NET-30.

### The arithmetic

$4,000 a month is $48,000 a year.

One issuer you did not hold because you read its freeze rights first.
One position you sized against fundable depth instead of advertised depth.
One adjudication you could produce for an examiner without a forensic
reconstruction.

Any one of the three is worth more than the annual fee, and the first two
are worth more than that in a single trade. We are not going to pretend
this is a hard procurement decision on price. The decision is whether the
readings are correct — which is exactly what the free tier is for, and why
it has no clock on it.

### What this is not

Informational tooling. Not investment advice, not a recommendation, not a
substitute for your compliance programme or your judgement about a
counterparty. Every figure depends on ledger state at the moment it was
read, which is why every verdict carries the ledger index it rests on.

---

**Start with the free tier.** Runs locally, no account, nothing leaves the
machine. Check it against an address you already understand.
noshashi.app

**Procurement first, if you prefer.** Security questionnaire, DPA,
sub-processor list, insurance certificates and W-9 available before any
commitment. institutions@noshashi.app

---

## 3. Product Hunt launch

**Name:** NOSHASHI

**Tagline (60 char max):**
`Compliance and exit liquidity from one XRPL ledger read`

**Alternates:**
- `Know if you can move it — and if you could get out`
- `The XRPL position check that reads both halves`

**Description (260 chars):**

> Compliance tools read account flags and never open the order book.
> Market terminals do the opposite. NOSHASHI reads both sides of the same
> validated XRPL ledger state and reconciles them into one verdict. Free
> for a single address, no account, runs locally.

**Topics:** Fintech · Developer Tools · Crypto · SaaS · Security

**First comment:**

> Maker here.
>
> This started with a specific annoyance. XRPL's `account_lines` gives you
> a balance for an issued asset, but nothing in that response tells you
> whether the issuer can freeze it. A balance behind `lsfNoFreeze` and a
> balance the issuer can immobilise in one transaction look identical.
> Holders find out when the freeze lands, and nothing on the ledger
> notifies them.
>
> Then a second one. XRPL DEX order books advertise depth from offers whose
> owners no longer hold the funds to honour them. On some Mainnet books
> that phantom share is over 90%. So the depth a position is marked
> against is not depth that would fill.
>
> Neither problem is hard on its own. What is hard is that they interact,
> and no tool looks at both. A position can pass every compliance check
> and be unexitable. A position can have deep liquidity and be held
> entirely at an issuer's discretion. Compliance tooling reports the first
> as clean; market data reports the second as liquid.
>
> So the product is the join: read both halves of the same ledger state,
> in the same second, and reconcile them. The newest piece is redemption
> stress testing — what your whole book would actually realise if you had
> to raise cash, routed across the DEX and the AMM together, shocked for
> depth that walks away, charged for your own lines competing on one
> issuer, and discounted for balances an issuer could freeze. A
> mark-to-mid valuation assumes every unit sells at the touch and that
> nobody can stop you. Both are false and neither is priced anywhere else.
>
> The free tier is not a trial. It runs locally, needs no account, and
> nothing you type leaves your machine — there is no server-side state to
> leak because there is no server involved. It exists so you can check our
> arithmetic against an address you already understand before any money is
> involved, which is the only honest way to sell a second opinion.
>
> Paid tiers start where a desk needs something an individual does not:
> multiple wallets, persistent adjudication history, the liquidity engine.
> Source is on GitHub.
>
> Two things I would genuinely like feedback on:
>
> 1. The freeze haircut in the stress model is a parameter you set, not a
>    number we assert. Is a stated-and-arguable parameter the right call,
>    or would you rather we published a default with reasoning?
> 2. Is `clear-but-illiquid` a useful verdict, or does it just move the
>    judgement call somewhere else?
>
> Happy to answer anything.

---

## 4. Show HN

**Title:**
`Show HN: XRPL position checks that read compliance flags and order book depth together`

*Under 80 chars if it needs trimming:*
`Show HN: NOSHASHI – XRPL compliance and exit liquidity in one ledger read`

**Post body:**

> XRPL has two facts about an issued asset that live in different places
> and are almost never read together.
>
> The first: `account_lines` returns a balance, but says nothing about
> whether the issuer holds freeze rights. `lsfGlobalFreeze` immobilises
> every holder's balance the moment the transaction validates, and
> `lsfNoFreeze` is the only thing that makes that permanently impossible.
> Neither appears in the balance response. You have to go read the
> issuer's account flags separately, and almost nothing does.
>
> The second: DEX order books advertise depth from offers whose owners have
> since spent the funds. rippled reports the offer; it does not tell you
> the owner cannot honour it. You have to cross-reference each offer owner's
> balance to find out. On some Mainnet books over 90% of advertised bid
> depth is not fundable.
>
> Individually these are just protocol quirks you learn. Together they are
> a valuation problem. A position marked at mid against advertised depth,
> held behind an issuer with live freeze rights, is being valued on two
> assumptions that are both false — that every unit sells at the touch,
> and that nobody can stop you selling.
>
> So the tool reads both. Same ledger index, same second, one verdict, with
> the ledger index attached so the adjudication can be reproduced later.
>
> Some implementation notes that might be of more interest here than the
> product:
>
> - **Exit routing.** Book-only exit simulation understates thin markets,
>   because an AMM pool is real depth priced by a constant product rather
>   than a queue. Proceeds are concave in size at both venues, so total
>   proceeds is concave in the split and has a single maximum — found by
>   ternary search on the pool share rather than closed form, because the
>   book is a step function of discrete levels and the closed-form
>   marginal-price match would need correcting at every level boundary.
>
> - **Shared-book contention.** Two positions on the same issuer are one
>   market, so summing independent per-position exits double-counts the
>   depth. Depth is allocated pro rata by position size — pro rata rather
>   than by any priority rule, because there is no defensible ordering and
>   any ordering would flatter whichever line it put first.
>
> - **Two policy engines, one answer.** The server-side engine is a
>   line-for-line mirror of the client one, and both digest the receipt
>   with identical canonical JSON. If a customer's systems and their
>   compliance officer's screen disagreed about the same facts, the product
>   would be worthless regardless of which was right. A test pins them
>   together.
>
> - **A bug worth mentioning because it was invisible.** `CredentialType`
>   is a variable-length blob and arrives hex-encoded — `KYC_LEVEL_1`
>   reaches you as `4B59435F4C4556454C5F31`. The client decoded it; the
>   server did not. So the server compared hex against plain text, never
>   matched, and every credential check failed for subjects who genuinely
>   held the credential. It failed *closed*, which is why it survived: a
>   compliance tool that wrongly says no does not look broken.
>
> - **Fail-closed auditing.** The audit row is written before the verdict
>   is served, and a failed write withholds the response with a 503. For a
>   customer whose adjudications an examiner will read, an unlogged verdict
>   is worse than no verdict.
>
> Desktop app (Tauri + React). The free tier runs entirely locally against
> public rippled nodes — no account, no server-side state, nothing to leak.
> Paid tiers add multi-wallet books, persistent history and an API.
>
> Source: https://github.com/Ignosha/noshashi
>
> Interested in criticism of the routing model in particular. The freeze
> haircut is deliberately a parameter rather than an asserted number, and
> I am not certain that is the right call.

**Notes on posting:** submit Tuesday–Thursday, 08:00–10:00 ET. Be present
for the first three hours. Answer criticism by conceding what is right
before explaining what is not — the audience can tell the difference, and
the concession is what buys the explanation a hearing. Do not mention
pricing unless asked; if asked, answer plainly and completely.

---

## 5. Research-to-marketing pipeline

`/research/` already publishes measured findings from Mainnet. Those are
the highest-value marketing assets available, because they are the only
kind of content in this category that is *checkable*. Nobody links to a
listicle about DeFi compliance. People link to a number they can verify.

### 5.1 The mechanism

One finding becomes one standalone article at `/research/{slug}/`. Not a
summary of the product — a piece of primary research that happens to be
produced by the product.

**Structure, every time:**

1. **The question**, as a question a practitioner would actually ask.
2. **The method** — which RPC calls, which nodes, which ledger index,
   what was excluded and why. This section is why the piece gets cited.
3. **The measurement** — the number, with the distribution, not just the
   headline. Include the cases that went the other way.
4. **What it means** — the practitioner consequence, stated conservatively.
5. **Reproduce it** — the exact steps, and the free tier that does it in
   one click. This is the conversion mechanism, and it converts precisely
   because it is an invitation to disprove you.
6. **Re-measured on {{date}} at ledger {{index}}.** A dated,
   ledger-anchored number is a citable number.

**Never** structure one as a product page with a statistic on top. The
finding is the asset; the product is the footnote.

### 5.2 Target queries and the article each one gets

| Query | Article | Angle |
|---|---|---|
| `XRPL issuer freeze rights` | *Which XRPL issuers can freeze your balance, measured* | Sample the top issuers by holder count; report the `lsfNoFreeze` / `lsfGlobalFreeze` / `lsfRequireAuth` distribution. The finding is the share of circulating issued value held at issuer discretion |
| `lsfGlobalFreeze` / `lsfNoFreeze` | *What `lsfNoFreeze` actually guarantees, and what it does not* | Reference explainer. Precise, short, correct. Wins on accuracy against a field of vague summaries |
| `DEX slippage analysis` / `XRPL DEX slippage` | *Advertised vs fundable depth on the XRPL DEX* | The phantom-depth measurement. Publish the per-book distribution. Strongest asset available — a genuinely surprising verifiable number |
| `XRPL AMM vs order book` | *Where XRPL exit liquidity actually is* | Which pairs are pool-dominant, which are book-dominant, at what sizes the answer flips. Directly useful to a trader today |
| `XRPL Permissioned Domains` | *Permissioned Domains: what a credential check actually checks* | Early-mover on a term whose search volume is about to grow. Own it now |
| `XRPL Travel Rule` | *Scoping FATF R.16 across XRPL settlements* | Compliance-officer intent. Lower volume, far higher intent |
| `XRPL account concentration` / `HHI` | *Counterparty concentration in XRPL settlement books* | Method piece. Attracts links from quant readers |
| `how to value an illiquid token position` | *Why mark-to-mid is wrong for issued assets* | Broadest reach. The stress-testing thesis without the product |

### 5.3 Cadence and mechanics

- **One article per fortnight.** Eight pieces is a full quarter and a
  complete topical cluster. More than that and the method section gets
  thin, which is the only part that matters.
- **Re-measure quarterly.** Update the number, keep the URL, add
  "re-measured {{date}} at ledger {{index}}". A dated series is a citation
  magnet and it compounds; a one-off number decays.
- **Cross-link within the cluster.** Every article links to the two
  nearest. Search engines read a cluster as topical authority, and a
  reader who arrived on slippage genuinely wants freeze rights next.
- **Publish the query.** Where a finding came from RPC calls, publish the
  calls. It costs nothing, it is the strongest possible credibility
  signal, and the people who reproduce it become the people who cite it.
- **Syndicate, do not duplicate.** Summary plus canonical link on X,
  LinkedIn, r/Ripple and the XRPL Dev Discord. Never repost the body — a
  duplicate splits the ranking.
- **Instrument it.** Each article gets one CTA: run the same check on your
  own address, free. Track article → download → account. If a piece
  converts nobody, the finding was not practitioner-relevant, and that is
  worth knowing before writing the next one.
- **Feed it back into section 1.** Every published finding is a fresh
  `{{specific_observation}}` for cold outreach — and one that is now
  public, dated and verifiable, which makes the cold email a citation
  rather than a claim.
