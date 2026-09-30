# Contract templates

Drafts for selling Institutional, Enterprise and Strategic
Infrastructure. They are **templates, not legal advice**. Have a
qualified lawyer review them before first use, and whenever a customer
negotiates a change. Blanks are shown as `[●]`. Text in `[square
brackets]` is an option or a drafting note, to be completed or deleted.

| Document | Purpose | Signed |
|---|---|---|
| [MSA.md](MSA.md) | Master Subscription Agreement: the terms that govern every order | Once per customer |
| [ORDER_FORM.md](ORDER_FORM.md) | What was bought: plan, term, fees, limits, contacts | Each purchase or renewal |
| [SLA.md](SLA.md) | Service Level Agreement schedule: availability, support response, service credits | **Not offered yet.** The uptime SLA is "coming soon" until the items in [FUNDING_NEEDS.md](../FUNDING_NEEDS.md) §2 are paid for |
| [DPA.md](DPA.md) | Data Processing Addendum: GDPR/UK GDPR/CCPA terms, subprocessors, security measures, transfers | With the MSA, when the customer asks |

## How they fit together

The order of precedence, highest first:

1. the Order Form (for its own commercial terms)
2. the DPA (for personal data)
3. the SLA (for availability and credits)
4. the MSA
5. the online terms at `/legal/`

The online Terms of Use still govern self-serve Pro customers, who sign
nothing.

## Consistency with what is published

These drafts follow the published legal pages (`src/lib/legal.ts`) and
the product as it is:

- NOSHASHI reads public ledger data and never holds, signs or moves
  assets.
- Verdicts are not legal, tax or investment advice.
- Subprocessors are Supabase, Stripe, Vercel and Resend.
- Personal data is hosted in the United States.
- Breaches are notified within 72 hours.

Before sending any of these, check each promise against the current
product. In particular:

- **Uptime:** there is no uptime commitment until the SLA is funded and
  offered.
- **SSO and dedicated environments:** coming soon, not included.
- **Security certifications:** none held. SOC 2 readiness has started
  (`docs/soc2/`).

## Before first use: open points for the lawyer

1. The legal entity's full name, form and state of organization. The
   site says "NOSHASHI Labs" and "United States".
2. Governing law and venue. The online terms use arbitration and "the
   laws of the United States". A state must be named.
3. The liability cap. The online terms cap it at twelve months' fees;
   an institutional customer will ask for a higher cap on data breaches.
4. Insurance the MSA may promise. None is held today
   ([FUNDING_NEEDS.md](../FUNDING_NEEDS.md) §5).
5. Standard contractual clauses (EU module 2 and 3; UK addendum) to
   attach to the DPA for customers transferring data from the EEA or UK.
