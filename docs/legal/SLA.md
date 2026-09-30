# Service Level Agreement schedule

*Template. Not legal advice. Review by qualified counsel before use.*

> **Status: not offered.** NOSHASHI does not offer an uptime SLA today.
> The pricing page lists it as "coming soon". Do not attach this
> schedule to any Order Form until the items in
> [FUNDING_NEEDS.md](../FUNDING_NEEDS.md) §2 are in place:
> - Supabase Pro with point-in-time recovery
> - uptime monitoring with alerting and a public status history
> - an on-call arrangement that can meet the response times below
>
> The figures in [brackets] are proposals to confirm then.

This schedule forms part of the Master Subscription Agreement (**MSA**)
when an Order Form references it.

## 1. Definitions

- **Covered Services:**
  - the Compliance API (`noshashi-verify`)
  - the hosted organization features: sign-in, shared policies,
    exceptions, investigations and the audit log, reached through the
    Supabase project
  - webhook delivery
  - on Strategic Infrastructure, event feeds

  The desktop application runs on Customer's machines and is not a
  Covered Service. It keeps working, with its local features, when the
  hosted service is down.
- **Downtime:** a minute in which the Covered Services return errors
  (HTTP 5xx or connection failure) to correctly formed, authenticated
  requests. It is measured by NOSHASHI's external monitoring from at
  least two locations.
- **Monthly Uptime Percentage:** (total minutes in the month − Downtime
  minutes) ÷ total minutes in the month × 100.
- **Service Credit:** a credit against future fees, calculated below.

## 2. Availability commitment

NOSHASHI will make the Covered Services available with a Monthly
Uptime Percentage of at least **[99.9]%**. That allows about 43 minutes
of Downtime in a 30-day month.

## 3. Exclusions

Downtime does not include unavailability caused by:

1. Scheduled maintenance announced at least [72] hours ahead on the
   status page, up to [4] hours a month.
2. Failures of the public XRP Ledger, or of public XRPL servers that
   NOSHASHI does not operate.
3. Customer's own systems, network, or misuse of the Service, including
   exceeding rate limits.
4. Suspension under the MSA (for example for non-payment or a security
   threat).
5. Force majeure (MSA §12.5).
6. Features marked beta, preview or coming soon.

## 4. Service Credits

| Monthly Uptime Percentage | Credit (% of that month's fees for the affected plan) |
|---|---|
| Below [99.9]% and at or above [99.0]% | [10]% |
| Below [99.0]% and at or above [95.0]% | [25]% |
| Below [95.0]% | [50]% |

**Claiming a credit:**
- Customer must claim within thirty (30) days after the month ends, by
  email to support@noshashi.app, with the dates and times affected.
- Credits are applied to the next invoice. They are not paid in cash.
- Credits in a month are capped at [50]% of that month's fees.

Service Credits are Customer's sole remedy for unavailability, except
for termination under §6 below.

## 5. Support response targets

| Severity | Meaning | First response | Updates |
|---|---|---|---|
| 1: Critical | Covered Services down, or a suspected security incident | [1 hour], any day | Every [2] hours until resolved |
| 2: High | A major feature failing, no workaround | [4 business hours] | Daily |
| 3: Normal | Partial loss of function, workaround exists | [1 business day] | As progress is made |
| 4: Low | Questions, requests | [2 business days] | As needed |

- **Business hours:** [9:00–17:00 US Eastern, Monday to Friday,
  excluding US federal holidays].
- **Channels:** support@noshashi.app, or a support ticket in the app.
- **Response targets are targets.** Missing one earns no credit, but
  repeated misses count toward §6.

## 6. Chronic failure

If the Monthly Uptime Percentage is below [99.0]% in any three (3)
months of a rolling six-month period, Customer may terminate the
affected Order Form within thirty (30) days of the third such month.
NOSHASHI then refunds prepaid fees for the remaining term.

## 7. Reporting

NOSHASHI publishes current status and incident history at
`https://www.noshashi.app/status/`. On request, NOSHASHI will provide
Customer with the Monthly Uptime Percentage for the prior month.
