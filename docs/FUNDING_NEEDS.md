# What needs funding

Everything NOSHASHI runs on today is on a free tier, apart from the
domain. Some promises can't be made honestly on
free tiers. Until they are paid for, the website and the app mark them
**coming soon** rather than offering them:

- uptime SLA
- dedicated environment
- single sign-on

Prices were checked on 2026-09-30 from each provider's own documentation.
They change, so recheck before paying.

## 1. Before selling to anyone

| Item | Why | Cost | Unlocks |
|---|---|---|---|
| **Vercel Pro** | Vercel's Hobby plan is for personal, non-commercial use only. The website takes payments through Stripe Checkout, which is commercial use | $20 per developer seat per month | Staying within Vercel's terms, plus rollbacks |
| **Supabase Pro** | Free projects pause after a week of inactivity (a GitHub job works around this), have no managed backups and no point-in-time recovery | $25 per month for the organization, which includes $10 of compute credit covering one project on the default size | Daily managed backups, no pausing. The base for everything below |
| **Legal paper** (MSA, DPA, SLA schedule) | An Institutional contract can't be signed without them (`docs/OPERATIONS.md`, `docs/LAUNCH.md`) | Lawyer's quote | Signing the first Institutional customer |

## 2. Uptime SLA (coming soon)

A 99.9% monthly uptime SLA allows about 43 minutes of downtime a month.
To offer one honestly, NOSHASHI needs:

| Item | Cost |
|---|---|
| Supabase Pro (above) | $25 per month |
| Point-in-time recovery, 7 days | about $100 per month per project ($0.137 per hour) |
| Uptime monitoring with alerts, and a public status page | Free tiers exist. Adds no cost until the free limits are outgrown |
| Someone on call to answer an alert within the SLA's response time | Staff time: the real cost |
| Service credits | Paid out of revenue when the SLA is missed; the MSA sets the size |

**Smallest sensible start:** about $125 per month in infrastructure, plus
an on-call rota. Until then, the pricing page shows the SLA as coming
soon on Institutional and above.

## 3. Dedicated environment (coming soon)

A separate Supabase project per customer, built from this repository
(`docs/DEPLOYMENT.md` lists the steps).

| Item | Cost per customer |
|---|---|
| Extra Supabase project on the default compute size | about $10 per month |
| Point-in-time recovery for that project, if the SLA covers it | about $100 per month |
| A desktop build pointed at that project | Engineering time per customer |
| Recovering the source of `noshashi-portal` and `noshashi-return` first | Engineering time, once |

A dedicated environment is priced into the Enterprise contract, so each
customer covers their own. It needs Supabase Pro in place first.

## 4. Single sign-on (coming soon)

Supabase supports SAML 2.0 single sign-on on Pro and above.

| Item | Cost |
|---|---|
| Supabase Pro (above) | $25 per month |
| SSO users | First 50 monthly active SSO users included, then $0.015 each |
| Linking identity providers to organizations in the app | Engineering time; no code exists yet |

## 5. Trust and distribution

| Item | Why | Cost |
|---|---|---|
| Apple Developer Program | Code signing and notarisation, so macOS stops warning about an unidentified developer. On hold by the owner's decision | $99 per year |
| Windows code signing (Azure Artifact Signing, Basic) | Removes the SmartScreen warning. On hold by the owner's decision | $9.99 per month, 5,000 signatures |
| Penetration test | Procurement reviews ask for one; none has been done | Security firm's quote |
| SOC 2 Type I, then Type II | Asked for by larger institutions | Auditor's quote, plus compliance tooling |
| Insurance (cyber, errors and omissions) | Often a contract requirement | Broker's quote |

## Order to spend in

1. Vercel Pro ($20 per month) and Supabase Pro ($25 per month). Together
   about **$45 per month**, and needed before charging anyone.
2. Legal paper, before the first Institutional contract.
3. Point-in-time recovery (about $100 per month) and on-call cover, then
   switch the SLA from coming soon to offered.
4. Single sign-on, when the first customer asks. The infrastructure is
   already covered by step 1.
5. Dedicated environments, per contract, paid by the customer.
6. Code signing, when it comes off hold ($99 per year plus $9.99 per
   month).
7. Penetration test and SOC 2, when deals of that size are on the table.

## Sources

- Supabase billing FAQ (Pro plan, compute credits, extra projects),
  point-in-time recovery pricing, and SAML SSO pricing, from
  supabase.com/docs.
- Vercel pricing: Hobby is for personal, non-commercial use; Pro is $20
  per developer seat per month (vercel.com/pricing).
- Apple Developer Program fee: developer.apple.com/support/enrollment.
- Azure Artifact Signing pricing:
  azure.microsoft.com/en-us/pricing/details/artifact-signing.
