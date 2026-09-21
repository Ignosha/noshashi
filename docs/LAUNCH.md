# Launch plan — gate-sequenced, not date-sequenced

No day ranges. Each phase has an **exit gate**: a checkable condition,
not an elapsed time. Move when the gate is met. If that is today, move
today; if a gate takes three weeks because a bank is slow, the plan has
not slipped, it is waiting on the thing it is supposed to wait on.

Phase 0 is doable in one sitting and is what "start rolling" actually
requires. Everything before the first outbound message is either a
blocker or it is not — and most of what looks like a blocker is not.

**One ordering rule.** Nothing that takes money goes live before the
terms that govern it. Everything else can be parallel.

---

## Phase 0 — Ship what is already built

Nothing here needs a third party. All of it is in the repository now.

| # | Task | Detail | Blocker? |
|---|---|---|---|
| 0.1 | Apply the API hardening migration | `supabase db push` — adds key expiry and scopes, terminal revocation, the durable rate limiter, credit refunds, idempotency, `rate_limit_per_second` | **Yes for API** |
| 0.2 | Deploy the hardened Edge Function | `supabase functions deploy noshashi-verify`. Must go **after** 0.1 — it reads columns the migration adds | **Yes for API** |
| 0.3 | Smoke-test the API | Bad key → 401. Mistyped address → 400 `invalid_subject`. Same `Idempotency-Key` twice → second has `X-Idempotent-Replay: true` and no second credit. Exceed the limit → 429 with `Retry-After` | **Yes for API** |
| 0.4 | Publish the pricing page | `site/pricing/index.html` is written and renders. Deploy the site | No |
| 0.5 | Enable leaked-password protection | Supabase dashboard → Authentication → Policies → "Check for leaked passwords". Flagged as outstanding in `20260828_harden_function_grants.sql` and still open | No |
| 0.6 | Create the annual Stripe prices | $7,490/yr Pro, $40,000/yr Institutional. Put the ids in `catalog.ts` (`annualPriceId`, currently `null`) | No |
| 0.7 | Point `institutions@` and `security@` at a monitored inbox | Both are published on every page. An unread sales address is worse than no address | **Yes for outbound** |

**Exit gate:** the API refuses a bad key, refuses a mistyped address,
replays an idempotent retry without charging, and the pricing page is
live.

---

## Phase 1 — Make it sellable

Two independent tracks. Neither blocks the other.

### Track A — commercial and legal

| # | Task | Detail | Blocker? |
|---|---|---|---|
| 1.1 | Entity | LLC formation, EIN, business bank account. Required before invoicing an institution | **Yes for Institutional** |
| 1.2 | **Terms of Service** | Financial disclaimer: informational tooling, not investment advice; no accuracy warranty; liability limited for trading decisions | **Yes for any paid tier** |
| 1.3 | **Privacy Policy** | Wallet addresses queried, Stripe payment data, minimal-collection posture | **Yes for any paid tier** |
| 1.4 | **MSA template** | Institutional | **Yes for Institutional** |
| 1.5 | **SLA schedule** | 99.9% uptime, response targets by severity, service credits | **Yes for Institutional** |
| 1.6 | **DPA template** | Requested in most institutional security reviews before anything else | **Yes for Institutional** |
| 1.7 | Verify Stripe live mode | Products, prices, tax, the `checkout.session.completed` webhook writing the right `grants` | **Yes for Pro** |

> **1.2–1.6 are excluded from this engagement at your instruction** and
> are listed only because they are hard gates. Pro cannot take a card
> without 1.2 and 1.3; Institutional cannot be invoiced without 1.1,
> 1.4, 1.5 and 1.6. Everything else in this plan can proceed in parallel
> while an attorney drafts them, including all outbound in Phase 2 —
> a cold email is not a sale.

### Track B — product and proof

| # | Task | Detail |
|---|---|---|
| 1.8 | Ship the stress-testing UI | Engine and tests are done (`src/lib/desk/stress.ts`). It needs the scene wired in — this is the demo that differentiates the pitch |
| 1.9 | Status page | `status.noshashi.app`. An SLA with nowhere to read uptime is not a credible SLA |
| 1.10 | Procurement pack | Security questionnaire answers, sub-processor list, insurance certificates, W-9, in one folder ready to send. Assemble before it is asked for, not after |
| 1.11 | Publish `/docs/api/quickstart` | `docs/API.md` §11 is written; publish it on the site |
| 1.12 | First research article | *Advertised vs fundable depth on the XRPL DEX*. The strongest asset available: a genuinely surprising, verifiable number |

**Exit gate:** Pro can be bought with a card end to end, on live keys, by
someone who is not you — and the resulting account has the right grants.

---

## Phase 2 — Outbound

Runs **in parallel with Phase 1**. Do not wait for legal to send a cold
email. Do wait for it to take money.

| # | Task | Detail |
|---|---|---|
| 2.1 | Build the list | 20 named contacts across the four segments in `docs/SALES.md` §1. Named humans, not companies |
| 2.2 | Do the homework | For each one, fill `{{specific_observation}}` with a real reading from the free tier. **If you cannot, drop them from the list** |
| 2.3 | Send in batches of five | Five, wait for replies, adjust the template, send the next five. Twenty at once teaches you nothing |
| 2.4 | One follow-up each | Seven to ten days, same thread, with the explicit release (§1.6) |
| 2.5 | Log every reply | Including the no's, with the reason. This is the highest-quality product input available at this stage |
| 2.6 | Publish research article 2 | Freeze rights across the top issuers by holder count |

**On the XRPL/Ripple question.** Treat it as one entry on this list, not a
separate strategy. Ripple does not buy compliance tooling by inbound
pitch, but XRPL Grants, XRPL Commons and the XRPL Dev Discord are real
front doors and the people behind them are technical. The route in is
§1.2 — a precise protocol observation, not a partnership request. Publish
the research first; a grant conversation goes very differently when there
is a dated, verifiable, citable measurement to point at. Do not lead with
"we would like to present to Ripple".

**Exit gate:** five substantive replies. Substantive means they engaged
with the observation — agreed, disagreed, or asked a real question. A
"thanks, will take a look" is not a reply.

---

## Phase 3 — Public launch

Gated on Phase 2, because a launch with no reference conversations is a
launch into silence. Every asset below is already drafted in
`docs/SALES.md`.

| # | Task | Detail |
|---|---|---|
| 3.1 | Show HN | §4. Tuesday–Thursday, 08:00–10:00 ET. Be present for three hours. Concede what is right before explaining what is not |
| 3.2 | Product Hunt | §3. Not the same week as Show HN — one at a time, so you can actually answer |
| 3.3 | Research article 3 | *Where XRPL exit liquidity actually is* — pool-dominant vs book-dominant pairs |
| 3.4 | Outbound to trading desks | Segments §1.3 and §1.4, now citing published findings. A cold email with a citation is a different message |
| 3.5 | Cross-link the cluster | Every research article links to its two nearest. Three articles is when a cluster starts to read as authority |
| 3.6 | Instrument the funnel | Article → download → account → paid. If a piece converts nobody, the finding was not practitioner-relevant — worth knowing before writing the fourth |

**Exit gate:** first paid Pro subscription from someone you did not
personally email.

---

## What to do first, if you only do one thing

In order, stopping wherever you run out of appetite:

1. **0.1 + 0.2 + 0.3** — apply the migration, deploy the function, smoke
   test. Everything else about the API is unverified until this is done,
   and it is fifteen minutes.
2. **0.7** — make sure `institutions@noshashi.app` reaches you. Every page
   on the site publishes it.
3. **0.4** — deploy the pricing page.
4. **2.1 + 2.2** — build the twenty-name list and do the homework. This is
   the highest-leverage unblocked work available, it needs no lawyer, no
   entity and no Stripe configuration, and it is the step most likely to
   be skipped.
5. **1.12** — write the phantom-depth article. It is the asset every
   later phase leans on.

Note what is *not* on that list: forming an LLC, drafting terms, and
configuring Stripe are real gates on taking money, but none of them gate
finding out whether anyone wants this.
