# NOSHASHI seed package

**Proposed round:** $4.5 million for about 24 months of runway.

**Status of this document:** working draft for the founder. It is not an offer of securities. Before it goes to any investor, a lawyer must review it, and the cap table in section 9 must be filled in from real records.

**Rule followed throughout:** every figure is either verified, with its source and date given, or labelled as an assumption.
- No customers, revenue, partnerships, certifications or commitments are claimed, because none exist yet.
- A $1 billion valuation is treated as an upside direction, not a forecast.

## What is true today (2026-10-26)

| Fact | Value | Source |
|---|---|---|
| Revenue to date | **$0** | Production database: 1 account; its only subscription is cancelled |
| Paying customers | **0** | Same |
| Hosted API verifications served to anyone other than the founder | **0** | `noshashi.verification_events` (0 rows) and `noshashi.payment_verifications` (2 rows: the founder's own production tests, unsigned and signed, 2026-10-27) |
| Institutions emailed | 23, from 162 researched | `outreach/contacts.csv` (`status = contacted`) |
| Replies from them | 0 (1 bounce) | Hourly inbox checks since the sends |
| Tester interviews logged | 0 | `docs/first-tester-campaign.md` log |
| Legal entity | Not formed yet (the LLC does not exist) | `outreach/freelance.md` |
| Certifications (SOC 2, ISO 27001, pen test) | None | `docs/FUNDING_NEEDS.md` §5 |
| Desktop release | 1.0.22, 13 tagged releases | `git tag` |
| Automated tests | 1,339 TypeScript + 45 Rust passing; 1 live mainnet test | `npx vitest run`, `cargo test --lib` |

The honest summary: a working product with real engineering depth, and no market evidence yet. Investors at seed fund the second part, so the plan below is built around producing it.

## 1. Product and architecture

NOSHASHI reads the validated XRP Ledger and answers compliance and settlement questions, with the evidence attached.

| Part | What it does | Where |
|---|---|---|
| Desktop app (Tauri 2, Rust and React) | Console for issuer analysis, settlement checks and invoice verification. Local-first, no telemetry. | `src-tauri/`, `src/` |
| Payment verification engine (Rust) | Did this transaction pay this invoice? Returns VERIFIED, HOLD or REJECTED with one of 27 stable reason codes and a SHA-256 evidence digest. | `src-tauri/src/verify/`, `docs/VERIFICATION_ENGINE.md` |
| Compliance API (Supabase Edge Function) | Keys, scopes, credits, durable rate limits, an audit trail and receipts. `payment/verify` serves the same rules as the desktop engine. | `supabase/functions/noshashi-verify/`, `docs/api/COMPLIANCE_API.md` |
| Free Asset Risk API | No key needed: what an issuer can do to holders, and what its order book can actually fill. | `/api/v1/asset-risk`, `docs/API.md` §6a |
| Website and workspace | Marketing site, docs and a browser workspace on Vercel | `site/`, `api/` |

Architecture details are in `docs/ARCHITECTURE.md`, and security in `docs/SECURITY_THREAT_MODEL.md` and `docs/SECURITY_ASSESSMENT_2026-09.md`.

## 2. Demonstrable technical advantage

Each of these claims can be checked in the repository or on the ledger.

- **Partial payments decided correctly.** The engine credits only `meta.delivered_amount`, never `Amount`, and holds when the delivered figure is missing or `"unavailable"`.
  - Mainnet transaction `F3B8B18E…7A70` (ledger 107,587,014) requested 162.6994990013102 CSC and delivered 161.1605415577872.
  - A system reading `Amount` would over-credit it. The engine returns `PARTIAL_NOT_PERMITTED`.
  - This is checked live against mainnet in CI, from two independent operators (workflow `verify-engine.yml`, runs 40345517702 and 40345580240, passed 2026-10-26).
- **Exact money.** Decimal arithmetic on digit strings, never floating point. A real shortfall of 0.000000000014687 SOLO is reported exactly (test `t16`).
- **Two independent sources.** The engine reads XRPL Labs and Ripple nodes and holds if their validated answers differ. Nothing is guessed when sources disagree.
- **Evidence a third party can re-check.** Canonical JSON plus SHA-256, byte-identical in Rust and TypeScript. 38 shared vectors pin both implementations.
  - The hosted API can also sign with Ed25519 once its key is configured. The private key is held only server-side.
- **Double-credit protection.** A payment settles at most one invoice per tenant. A database unique constraint enforces it, including when two requests race.
- **Order-book depth, not quotes.** For example, the free API read Bitstamp USD on 2026-10-25 at ledger 107,894,639. A 1,000 USD sale filled at −3.85% against mid, and a purchase of the same size at +5.73%.

The advantage is precision and evidence, not secrecy: the code is MIT-licensed. What is sold is the hosted service, its records and the work around it (section 5).

## 3. Customer problem and evidence

**The problem (documented, not hypothetical):**
- xrpl.org warns integrators that partial payments can make an incoming payment look larger than what arrived. The real case above is an example.
- Anyone who credits XRPL payments (merchants, payment processors, exchanges, OTC desks) must read the delivered amount, check validation and finality, match destination tags, and avoid crediting one payment twice.
- Issued tokens add issuer controls (freeze, clawback, transfer fees) and books thinner than their quotes.

**Evidence of demand: none yet.**
- 23 institutional emails have gone out with no reply. No interviews or pilots have happened.
- This is the largest risk in the company (section 8). The first use of money, or of time if the round is not raised yet, is producing this evidence.

## 4. Pilot pipeline

| Stage | Count | Notes |
|---|---|---|
| Researched institutions | 162 | 61 marked skip; 50 waiting for the address to be checked on the institution's own page; 27 with no published contact yet |
| Contacted | 23 | Published role addresses only; at most one follow-up each |
| Replied | 0 | |
| In pilot | 0 | |
| Paid | 0 | |

**Offers ready to sell** (prices are hypotheses until someone pays them):
- Payment-verification pilot, **$5,000–10,000** fixed scope (`docs/VERIFICATION_ENGINE.md`, "Commercial boundary").
- Asset Risk pilot, **$1,500** for 30 days (`docs/plans/2026-10-asset-risk-api-plan.md` §5).

**Milestones a seed investor should be able to see before or soon after closing** (proposed):
1. 10 recorded buyer interviews, with three describing the partial-payment or double-credit problem in their own operations.
2. 3 paid pilots.
3. 1 pilot converted to a recurring contract.

## 5. Revenue model

- **Hosted Compliance API**, metered by credits.
  - Tiers are hypotheses:
    - Developer: $99 a month.
    - Professional: $750 a month.
    - Institutional: $3,000–4,000 a month.
    - Strategic: $100,000–250,000 a year, by contract.
  - Tier content is in the plan §5.
- **Fixed-scope pilots** that convert to subscriptions, with the pilot fee credited.
- **Later:**
  - continuous monitoring and webhooks;
  - signed evidence exports;
  - dedicated environments (each customer pays its own infrastructure, `docs/FUNDING_NEEDS.md` §3);
  - integration work.
- **Unit economics** (forecast): about $45 a month of paid hosting covers early customers. A verification costs a few public-node reads, so gross margin is high once paid. The real cost is people: sales, support and on-call.
- **The open-source app stays fully functional.** Revenue comes from what a desktop binary cannot provide: shared records, uptime, signing, support.

## 6. Hiring and spending plan

The numbers are in `model.md`, generated by `model.py`; every input is an assumption stated in the script.

- **Seven people by month 15**, including the founder:
  - three engineers (Rust/XRPL, platform/API, integrations);
  - a sales and solutions lead;
  - a security and compliance engineer;
  - a customer engineer.
- **Other spend:** paid infrastructure, an own full-history node from month 4, legal paper, insurance, a penetration test in month 8, SOC 2 Type I (months 10–12) and Type II (months 18–24), plus a 10% contingency.
- **Totals:** about **$2.95M** over 24 months, rising from about $46k a month to about $162k a month.
- **What that leaves:** $4.5M funds this plan with about $1.55M to spare, or about **34 months** with no revenue at all.

**Two honest readings:**
- Either the round can be smaller (about $3M covers the plan), or the extra buys more time to find product-market fit.
- Raising before the milestones in section 4 would sell a large share of the company for evidence that does not exist yet. `docs/plans/2026-10-asset-risk-api-plan.md` §8 recommends proving that someone pays first.

## 7. Security and compliance roadmap

| When | Item | Status today |
|---|---|---|
| Done | Keys hashed at rest, scoped, expiring and revocable; a fail-closed audit trail; append-only tables; row-level security; bounded, allowlisted ledger reads; no keys in the desktop app | In the repository |
| Months 1–2 | Vercel Pro and Supabase Pro (the Hobby plan is non-commercial); entity formation; MSA, DPA and terms reviewed by a lawyer | Not done |
| Months 1–3 | Configure the signing key for evidence exports; recover the missing source of the deployed `noshashi-portal` and `noshashi-return` functions | Signing live since 2026-10-27 (key `2F6500CAC968AF37`); function source still to recover |
| Month 4 | Own full-history XRPL node as a third source; point-in-time recovery | Not done |
| Month 8 | Independent penetration test | Not done |
| Months 10–12 | SOC 2 Type I | Not done |
| Months 18–24 | SOC 2 Type II; an uptime SLA once on-call cover exists | Not done |

Out of scope, stated so nobody assumes otherwise: sanctions screening, Travel Rule compliance and custody. An address check is not OFAC compliance.

## 8. Financial projections

Full tables are in `model.md`. Summary:

| Scenario | ARR at month 24 | Revenue over 24 months | Cash at month 24 |
|---|---|---|---|
| Downside | $300,000 | $219,500 | $1,772,520 |
| Base | $1,800,000 | $1,218,000 | $2,771,020 |
| Upside | $6,000,000 | $3,718,000 | $5,271,020 |

These are assumptions about a future with no evidence behind it yet, not forecasts anyone has earned.

**On $1 billion.** Infrastructure software is valued at a multiple of ARR.
- At 10–20× ARR, $1B needs $50–100M ARR. At an exceptional 30–40×, it needs $25–35M.
- The upside case reaches $6M ARR at month 24. A $1B valuation at month 36 would need ARR to grow about 4–17× in the following year.
- So it is a possible direction if the upside case happens, not a plan.

**Main risks** (full register in the plan §9):
- No buyer has an urgent enough problem.
- The company depends on a single founder.
- Public XRPL nodes have no SLA.
- Reports could be misread as investment advice.
- Larger data providers could enter.

## 9. Cap table scenarios

**Actual ownership data is not available here.** No entity exists yet, so there are no share records.
- The table assumes the founder holds 100% before the round and a 10% option pool is created pre-money.
- Replace both with the real figures from the formation documents before showing it to anyone.

| Pre-money (assumption) | Post-money | Investors, $4.5M | Option pool | Founder |
|---|---|---|---|---|
| $12M | $16.5M | 27.3% | 10.0% | 62.7% |
| $18M | $22.5M | 20.0% | 10.0% | 70.0% |
| $25M | $29.5M | 15.3% | 10.0% | 74.7% |

Instrument (a priced round or SAFEs), the valuation cap and pro-rata rights are for the founder and a lawyer to decide. Nothing here is a term sheet.

## 10. Diligence data room checklist

**Ready now:**
- Architecture: `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`.
- Engine and API contracts: `docs/VERIFICATION_ENGINE.md`, `docs/api/COMPLIANCE_API.md`.
- Security: `docs/SECURITY_THREAT_MODEL.md`, `docs/SECURITY_ASSESSMENT_2026-09.md`, `docs/INCIDENT_RESPONSE.md`.
- Operations: `docs/OPERATIONS.md`, `docs/DISASTER_RECOVERY.md`, `docs/DEPLOYMENT.md`, `docs/RELEASE_SIGNING.md`.
- Commercial: `docs/plans/2026-10-asset-risk-api-plan.md`, `docs/FUNDING_NEEDS.md`.
- Proof:
  - CI history, with live mainnet runs;
  - test suites;
  - the 38 shared verification vectors;
  - measured installer sizes (`.deb` 4.5 MB, AppImage 80.4 MB);
  - the narrated product demo (`/assets/video/noshashi-demo.mp4`).
- Code: MIT-licensed, full commit history on GitHub.

**Needs the founder or a professional:**
- [ ] Certificate of formation, operating agreement or charter, and the share ledger.
- [ ] IP assignment from the founder (and any contributor) to the company.
- [ ] Open-source licence inventory of dependencies.
- [ ] Bank statements, and the cost and revenue ledger (currently $0 revenue).
- [ ] Customer and pilot contracts (none yet), and the interview log (empty).
- [ ] MSA, DPA and terms of use, reviewed by a lawyer.
- [ ] A legal opinion on whether reports could be read as investment advice (US, EU, UK).
- [ ] Insurance policies (none yet).
- [ ] Penetration test report (none yet).
- [ ] Founder background and references.
- [ ] Hiring plan with real offers, to replace the model's assumptions.
- [ ] Trademark search for NOSHASHI.

## How to update this package

1. Change assumptions in `model.py`.
2. Run `python3 docs/fundraising/model.py > docs/fundraising/model.md`.
3. Copy the new summary figures into sections 6 and 8.

Update the "What is true today" table from the production database and the outreach log on the day the package is sent, never from memory.
