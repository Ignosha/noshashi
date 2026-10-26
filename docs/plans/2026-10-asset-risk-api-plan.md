# NOSHASHI: Asset Risk API plan (October 2026)

Written 2026-10-25 from an inspection of this repository, the production
Supabase project and the live site. Every "works" below was checked
against code, a test run or the production database on that date. Every
figure that is a forecast is labelled as one. Revenue to date is **$0**.

---

## 1. Current-state audit

### What actually works

| Area | Evidence |
|---|---|
| Free public reads on noshashi.app: issuer state, authority certificate, order book (quoted vs fillable), book health, delivered amounts, treasury report, badge | `api/tools.js`, `api/authority.js`; covered by `tests/*.test.js`; the homepage demo video was recorded against them on mainnet (ledger 107,894,325) |
| Authority rules with a version (`AUTHORITY_RULES_VERSION = 2`) and a SHA-256 digest that mirrors the desktop app byte for byte | `api/_lib/authority.js`, `tests/badge.test.js` against recorded production certificates |
| Quoted-vs-fillable depth that refuses to count unfunded offers | `api/_lib/book.js`. On 2026-10-25 the Bitstamp XRP/USD ask side listed 1,236,437 USD within 10% of mid; 18,042 USD (1.5%) was funded |
| A metered Compliance API: hashed `nsh_live_` keys, scopes, expiry, revocation, prepaid credits with a guarded decrement, idempotency, durable rate windows, audit rows | `supabase/functions/noshashi-verify/`, deployed (version 16). The migrations it needs are applied in production (checked 2026-10-25) |
| Stripe checkout and webhook, entitlements by tier | `supabase/functions/noshashi-checkout`, `noshashi-stripe-webhook`, `src/lib/billing/catalog.ts` |
| Desktop app (macOS, Windows, Linux) with key management | `src/lib/desk/apiKeys.ts`, release 1.0.22 |

### What is incomplete, unused or only advertised

| Finding | Evidence | Why it matters |
|---|---|---|
| **The paid API has never been called by a customer.** One API key exists (the founder's, Strategic tier), never used. `verification_events` is empty. One account; its one subscription is cancelled | Production database, 2026-10-25 | There is no usage to learn from and no revenue |
| **There was no way to try the API without paying.** The cheapest tier that grants `compliance_api` is Pro at $749 per seat per month, and a key can only be made in the desktop app | `src/lib/billing/catalog.ts`, `src/lib/desk/apiKeys.ts` | Developers evaluate with a free call before they talk to sales. Fixed in part by this change (§3) |
| **The developer page printed a placeholder URL** (`https://<project>.supabase.co/…`) | `scripts/build-site.mjs`, `docs/api/COMPLIANCE_API.md` | A developer could not find the endpoint. Fixed in this change |
| No liquidity or exit figure in any API, only on the free web tool | `docs/API.md` §6 marked `NOT BUILT` | Exit impact is the question treasury, listing and risk teams ask. Built in this change as `/api/v1/asset-risk` |
| `docs/API.md` §12 said four migrations still needed applying | They are applied in production | Corrected in this change |
| `noshashi-portal` and `noshashi-return` run in production with no source in this repository | `supabase functions list` vs `supabase/functions/` | Cannot be reviewed, tested or redeployed. Recover the source before relying on them |
| Outreach: 23 institutions contacted, 0 replies, 1 bounce | `outreach/contacts.csv`, Gmail label | Cold email to institutions has not produced a conversation. Change channel (§5) |

### Security, reliability and release-readiness gaps

1. **Terms of service.** Vercel Hobby forbids commercial use. Move to Vercel Pro ($20/month) before taking the first payment (`docs/FUNDING_NEEDS.md`).
2. **No managed backups.** Supabase is on the free tier: no backups, no point-in-time recovery, pauses unless the keep-alive job runs. Supabase Pro ($25/month) before a paying customer depends on stored data.
3. **Upstream with no SLA.** Every read goes to public XRPL nodes (`s1/s2.ripple.com`, xrplcluster). They rate-limit and can be down. No uptime SLA can be sold on them; `docs/FUNDING_NEEDS.md` already marks SLA "coming soon". The fallback list in `rippleRpc` is the current mitigation.
4. **The public limiter is per instance**, not global (`api/_lib/rate-limit.js` says so). The edge cache absorbs repeat reads; a determined caller can still spread across regions. Acceptable for a free read; not for a paid quota, which is why paid calls go through `noshashi-verify`'s durable windows.
5. **Usage on the free endpoint is not counted anywhere durable.** Vercel Hobby keeps runtime logs for about an hour. Demand cannot be measured until calls are counted (backlog item 3).
6. **Legal paper** (MSA, DPA) does not exist; no Institutional contract can be signed without it.

### Code to preserve, not rewrite

`api/_lib/authority.js`, `api/_lib/book.js`, `supabase/functions/noshashi-verify/` (auth, credits, idempotency, audit), the Stripe functions, and the parity tests that keep the web and desktop rules identical. The Asset Risk API is built on top of these; nothing was rewritten.

---

## 2. Prioritized backlog

Ordered by what most raises the chance of a first paying customer. Each item names its files.

| # | Item | Files | Done when |
|---|---|---|---|
| 1 | **Free Asset Risk API** (this change) | `api/_lib/asset-risk.js`, `api/_lib/routes/asset-risk.js`, `api/tools.js`, `vercel.json`, `tests/asset-risk.test.js` | Live call on production returns a report with a receipt; tests pass |
| 2 | Move hosting to paid tiers before the first invoice | Vercel and Supabase dashboards | Vercel Pro and Supabase Pro active |
| 3 | Count free API usage: one row per uncached call (issuer, currency, size given, status, latency; no IP) | new table via migration, write from `api/_lib/routes/asset-risk.js` with a service key held in Vercel env | Weekly count of callers and calls is queryable |
| 4 | Web key issuance for a **Developer** tier: sign in on the website, make a key, see usage, without the desktop app | Supabase auth already exists; a page under `site/developers/`, reuse `api_keys` and `entitlements` | A developer gets a working `nsh_live_` key in under five minutes |
| 5 | `asset-risk` as a keyed verb on `noshashi-verify` (same schema, recorded receipt, credits, history) | `supabase/functions/noshashi-verify/index.ts`, `read.ts` | A keyed call returns the same report and stores its receipt; `receipts/{digest}` returns it |
| 6 | OpenAPI 3.1 document for both endpoints, and a TypeScript example | `docs/api/openapi.json`, `site/developers/` | Validates; example runs against production |
| 7 | Recover `noshashi-portal` and `noshashi-return` source into the repository | `supabase/functions/` | Source matches the deployed versions |
| 8 | Change alerts on an issuer's controls by webhook (tables `org_webhooks`, `webhook_deliveries` exist) | `supabase/functions/noshashi-issuer-alerts/` | A flag change on a watched issuer delivers a signed webhook |
| 9 | AMM pool depth alongside the order book | `api/_lib/book.js` and a new AMM read | Exit estimate states both, or says which was not read |

Not on the list on purpose: more networks, new dashboards, more marketing pages. None of them is blocked on anything but demand.

---

## 3. Files and routes changed in this change

| Route / file | Change |
|---|---|
| `GET /api/v1/asset-risk` | New. Rewritten to `/api/tools?tool=asset-risk` (no new serverless function; the Hobby plan's limit of 12 holds) |
| `api/_lib/asset-risk.js` | New: `walkBook` (exit estimate on funded depth), `assemble` (report), `canonical` and `receiptFor` (SHA-256 over sorted-key JSON), `LIMITATIONS` |
| `api/_lib/routes/asset-risk.js` | New: validation, per-caller limit (30/min), parallel reads that fail independently, stable error codes, 60 s edge cache |
| `api/tools.js`, `vercel.json`, `tests/function-count.test.js` | Route registered |
| `tests/asset-risk.test.js` | New: 19 tests (exit arithmetic, receipt stability, a production report re-hashed to its own receipt, report assembly against the recorded Bitstamp certificate, every error code, the 429 path) |
| `docs/API.md`, `docs/api/COMPLIANCE_API.md`, `scripts/build-site.mjs` | Endpoint documented; real Compliance API URL replaces the placeholder; stale migration status corrected |

---

## 4. API contract and test plan

### Contract: `GET /api/v1/asset-risk?issuer=&currency=&size=`

Schema `noshashi.asset-risk.v1`. Full table in `docs/API.md` §6a. Rules:

- Additive changes only within v1. A removed or retyped field means v2.
- `issuer_controls.authority_verdict` is the authority rules' verdict on ledger controls. It is never described as a rating, and the report never says an asset is safe (a test enforces this).
- A source that cannot be read is named in `unknowns` and its section is `null`; the call still answers. Only when nothing can be read does it return `502 ledger_unreachable`.
- `receipt.digest` covers every other field, including `evidence`, so the report can be re-hashed by anyone.

### Test plan

| Layer | What | Where |
|---|---|---|
| Unit | Exit walk: partial fill, unfunded size ignored, no mid, empty book | `tests/asset-risk.test.js` |
| Unit | Receipt independent of key order, changes with any figure | same |
| Unit | Report from the recorded production certificate (`tests/fixtures/authority-bitstamp-107585800.json`) | same |
| Contract | Every 400 code, 405, 429 with `Retry-After`, rejected requests not counted | same |
| Parity | Book and authority maths match the desktop app | existing tests |
| Live | Done on the PR #124 preview, 2026-10-25, mainnet: Bitstamp USD `size=1000` (both reads at ledger 107,894,639; sell fills at −3.85% vs mid, buy at +5.73%), RLUSD 40-hex `size=50000` (−0.19% / +0.23%), GateHub issuer only (recorded as `tests/fixtures/asset-risk-gatehub-107894643.json`) | repeat on production after merge |

---

## 5. Customer acquisition and pricing

### Who to talk to first (in order)

| Profile | Why they would pay | Where to find them |
|---|---|---|
| XRPL wallets and explorers that list tokens | They show tokens to users and carry the blame when one freezes or claws back | xrpl.org ecosystem pages, XRPL Developers Discord, Bithomp (already contacted) |
| Tokenization and stablecoin issuers on XRPL | They need to show holders and partners their own controls, and to watch peers | Ripple press releases; the issuers already in `outreach/contacts.csv` |
| Exchanges listing XRPL tokens | Listing review needs issuer controls and real exit depth | `outreach/contacts.csv` (exchange rows) |
| Treasury holders of XRPL assets and their auditors | Fair-value support: what could actually be sold | `outreach/contacts.csv` |
| Risk-data providers who could resell | Distribution: one integration reaches many end customers | Later; after two direct customers |

Change of channel: 23 cold emails to institutions produced no reply. Developers answer in public places. Lead with the free endpoint where builders already are: XRPL Developers Discord, GitHub, a Show HN with the 1.5% fillable finding, and one post per week with a real finding and the curl that reproduces it (`outreach/launch/` has drafts).

### Interview questions (20 minutes, past behaviour, no pitch)

1. When did you last have to decide whether to list, accept or hold an XRPL token? What did you check?
2. Where did each fact come from, and how long did it take?
3. Has an issuer's freeze, clawback or a thin book ever surprised you or a user? What did it cost?
4. Who signs off, and what would they need to see in writing?
5. What do you pay for today that does part of this?
6. If this ran on every token you touch, what would you stop doing by hand?

### Repeatable demonstration (10 minutes)

1. One curl on Bitstamp USD with `size=1000`: controls, depth, exit estimate, receipt.
2. The same on a token the prospect names.
3. Re-hash the receipt in front of them; open the raw book via `evidence`.
4. Show `unknowns` and `limitations`: what it does not claim.
5. Ask question 6 above.

### Fixed-scope paid pilot

- 30 days, up to 50 assets the customer names, daily Asset Risk reports, a change alert by email when an issuer's controls change, one written summary at the end.
- **$1,500**, paid up front, credited in full against the first year if they subscribe. No SLA, no custom development, no custody, no access to their systems.
- Success is agreed in writing before it starts: for example "the listing team used the report in at least five decisions".

### Templates

**Developer (Discord, GitHub, forum reply):**
> If you need to know what an XRPL token's issuer can do (freeze, claw back, require auth, fees, who holds the keys) and how much of its book can actually fill, this is one free call, no key:
> `curl "https://www.noshashi.app/api/v1/asset-risk?issuer=…&currency=…&size=1000"`
> Every figure carries the ledger index and a receipt. I'd like to hear what's missing.

**Institution (one email, at most one follow-up, to an address they publish):**
> Subject: [Token] on XRPL: what can its issuer do, and what can actually be sold?
> For whoever reviews XRPL tokens before listing or holding them. At ledger [N], [Token]'s issuer [finding], and of [X] listed within 10% of mid, [Y] was funded. The report and the raw ledger replies behind it are here: [link]. Would a 20-minute call to look at the tokens you hold be useful?
> Joshua, founder, NOSHASHI · [postal address] · reply "no" and I won't write again.

### Pilot to subscription

Day 0 written success criteria → day 7 check-in on the first decisions made with the reports → day 21 review against the criteria and a quote → day 30 summary and decision. Convert to the tier that matches the asset count and alerting they used, with the pilot fee credited.

### Pricing: hypotheses until someone pays

| Tier | Hypothesis | What it includes | Test |
|---|---|---|---|
| Free | $0 | `/api/v1/asset-risk`, 30 uncached calls a minute | Count callers (backlog 3) |
| Developer | $99/month | Key, 10,000 keyed reports, receipts stored, usage page | First 3 self-serve purchases |
| Professional | $750/month | 100,000 reports, change alerts by webhook, 50 watched issuers | Pilots converting |
| Institutional | $3,000–4,000/month (current catalog: $4,000) | Higher volume, exports, support response times without SLA until §1 gap 3 is closed | First signed order form |
| Strategic | $100k–250k/year | Scoped contracts only, after legal paper and SLA infrastructure exist | Not before month 9 |

The current Pro tier ($749 per seat) prices the console, not the API. Keep it; add Developer as the API entry point.

**Unit economics (forecast, from `docs/FUNDING_NEEDS.md` prices):** paid hosting is about $45/month (Vercel Pro $20 + Supabase Pro $25), plus Stripe's fee (2.9% + 30¢ per card charge in the US). A report costs five public-node reads (two `account_info`, one `ledger`, two `book_offers`) and no paid compute beyond the plan. Gross margin at one Developer customer is already above 50% and above 95% from about ten. The real cost is founder time on support and sales; track hours per customer from the first pilot.

### Metrics

| Stage | Metric | Source |
|---|---|---|
| Acquisition | Distinct callers of the free API per week; conversations started per channel | backlog 3; outreach log |
| Activation | Callers who make 10+ calls in their first week; developers who create a key | backlog 3 and 4 |
| Revenue | Pilots sold, pilots converted, MRR | Stripe |
| Retention | Paying accounts active 90 days after purchase; net revenue retention | Stripe, `verification_events` |
| Cost | Support hours per customer per month; infrastructure per customer | own log; provider invoices |
| CAC | Founder hours plus spend per paying customer | own log |

---

## 6. 90-day checklist

**Days 1–30: audit and validation**
- [x] Audit (this document)
- [x] Free Asset Risk API built, documented and checked live on the preview deployment (repeat on production after merge)
- [ ] Count free API usage (backlog 3)
- [ ] Post the free endpoint in XRPL Developers Discord, GitHub README, one Show HN
- [ ] 10 interviews from the profiles in §5, using the questions in §5
- [ ] Decide from interviews: which profile has a deadline and a budget?

Proceed when: at least 3 interviewees describe doing this by hand today, and at least 20 distinct external callers have used the free API. If neither, change the wedge question before building more.

**Days 31–60: reliability and developer experience**
- [ ] Vercel Pro and Supabase Pro (before any invoice)
- [ ] Developer tier: web sign-in, key, usage page (backlog 4)
- [ ] Keyed `asset-risk` verb with stored receipts (backlog 5)
- [ ] OpenAPI document and a copy-paste example (backlog 6)
- [ ] Uptime check on `/api/v1/asset-risk` with a free monitor

Proceed when: a developer goes from nothing to a keyed call in under five minutes without help, and error rate on the free endpoint is under 2% over a week.

**Days 61–90: paid pilots**
- [ ] Offer the $1,500 pilot to every interviewee who described the problem
- [ ] Draft MSA and DPA with a lawyer (needed before any Institutional order)
- [ ] Run up to 3 pilots with written success criteria
- [ ] Recover `noshashi-portal` / `noshashi-return` source

Proceed when: 1 paid pilot. If 0 paid pilots after 15 offers, the problem is real but not urgent enough for this buyer: switch profile (§5 order) before adding features.

---

## 7. Two-year roadmap

| Stage | Deliverables | Acceptance | Go / change direction |
|---|---|---|---|
| Days 1–30 | §6 | §6 | §6 |
| Days 31–60 | §6 | §6 | §6 |
| Days 61–90 | §6 | §6 | §6 |
| Months 4–6 | Repeatable onboarding; webhook change alerts (backlog 8); self-serve Developer tier selling | 3–5 paying customers; one documented case study | Fewer than 2 paying: stop building, sell only |
| Months 7–12 | One distribution partner (wallet, explorer or data provider embedding the report); AMM depth (backlog 9); SLA infrastructure if an Institutional buyer requires it | $10k+ MRR; one partner live | Partner interest but no revenue: price the partner deal, not more features |
| Months 13–24 | Second sales motion (partner-led or a hire); expand to another ledger only if 2+ paying customers ask for the same one; capital decision | $50k–100k MRR in the base case | Below $20k MRR at month 18: keep it a profitable small business rather than raise |

---

## 8. 24-month revenue and funding model

Actual revenue to date: **$0**. Everything below is a forecast with stated assumptions, not a projection to rely on.

| Scenario | Month 6 MRR | Month 12 MRR | Month 24 MRR | Month 24 ARR | Team | Funding |
|---|---|---|---|---|---|---|
| Downside | $0–500 | $1,000 | $3,000 | $36k | Founder alone | Bootstrapped; freelance XRPL work covers costs (`outreach/freelance.md`) |
| Base | $2,000 | $10,000 | $60,000 | $720k | Founder + 1 engineer or seller (month 10–14) | Bootstrapped to month 12; optional small round or grant after |
| Exceptional | $8,000 | $50,000 | $400,000 | $4.8M | 5–8 people | Seed round once repeatable sales are proven |

Assumptions for the base case: about 8 paying accounts at month 12 averaging $1,250/month; about 30 at month 24 averaging $2,000 with one Strategic-scale contract. Costs: hosting $45–300/month; first hire at roughly $8–12k/month fully loaded; legal paper one-off.

**What $1 billion requires.** Infrastructure software is valued at a multiple of ARR. At 10–20× ARR, $1B needs **$50–100M ARR**; at an exceptional 30–40× for very fast growth, $25–35M ARR. From $0 today, reaching that in 24 months would require growth faster than almost any company achieves. Treat it as the direction of travel, not a plan: the decisions in this document are the same whether the company ends at $1M ARR or far higher.

**When to do what.**
- Bootstrap while the question is "does anyone pay": revenue is the only test that counts and it costs no ownership.
- Pay for Vercel Pro, Supabase Pro and legal paper from the first revenue (or now, out of freelance income; about $45/month plus a one-off legal fee).
- Hire the first specialist when a recurring task the founder cannot do well (sales follow-up or on-call) is losing revenue; base case month 10–14.
- Partner when one partner can put the report in front of more customers than a quarter of founder outreach; after two direct customers prove the value.
- Consider outside investment only when there is repeatable revenue to multiply (several customers acquired the same way) and a specific use for the money (sales hires, SLA infrastructure). Raising before that trades a lot of ownership for little. Grants (XRPL Grants, already contacted) are non-dilutive and fit now.

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| No buyer has an urgent enough problem | High | Fatal | Interviews before features; change profile after 15 unanswered pilot offers |
| Public XRPL nodes fail or rate-limit | Medium | High | Fallback node list; edge cache; a paid or own node before selling an SLA |
| A report is read as "this token is safe" and someone loses money | Medium | High | `limitations` in every response, no safety language (tested), terms reviewed by a lawyer |
| Vercel or Supabase terms or limits (Hobby is non-commercial; free projects pause) | High once selling | Medium | Paid tiers before the first invoice |
| Founder is a single point of failure | High | High | Runbooks in `docs/OPERATIONS.md`; recovered function source; first hire in base case |
| Deployed functions with no source (`noshashi-portal`, `noshashi-return`) | Certain today | Medium | Backlog 7 |
| Larger data providers add XRPL issuer controls | Medium | Medium | Speed, evidence receipts and XRPL depth; partner rather than compete |
| Regulatory: data or advice regulation in a customer's jurisdiction | Low–medium | High | Read-only facts, no recommendations; legal review before Institutional contracts |
| Key or credential leak | Low | High | Keys hashed at rest; scoped, expiring, revocable; fail-closed audit |

**Needs a qualified professional:** MSA, DPA and terms of use (lawyer); whether reports could be read as investment advice in the US, EU or UK (lawyer); tax and entity formation before invoicing (accountant; the LLC does not exist yet, `outreach/freelance.md`); any SLA or service-credit wording (lawyer).

---

## 10. Next five actions

1. **Merge this change and call `/api/v1/asset-risk` on production** for Bitstamp USD, GateHub USD and RLUSD; record one response as a fixture.
2. **Post the endpoint where developers are**: XRPL Developers Discord, the GitHub README, one Show HN built on the 1.5% fillable finding. Free, today.
3. **Book 10 interviews** from §5 using the six questions; ask every interviewee who describes the problem to try the endpoint on a token they hold.
4. **Count calls** to the free endpoint (backlog 3) so demand is measured, not guessed.
5. **Offer the $1,500 pilot** to the first three interviewees with the problem, after moving to Vercel Pro and Supabase Pro.
