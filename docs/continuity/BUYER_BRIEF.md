# NOSHASHI Continuity buyer and investor brief

Prepared 20 November 2026. This brief accompanies the development branch for PR 200. Pricing is a proposed commercial application of NOSHASHI's existing tiers. Customer demand, savings and competitive superiority require validation.

## What the product does

NOSHASHI Continuity helps issuer and operations teams review whether their customer records and access requirements agree with XRPL state. The desktop now contains a sample issuer offboarding review, an access expiry forecast and a domain rule removal scenario. The access tools share NOSHASHI's existing credential and domain admission logic.

An analyst supplies a permissioned domain and up to 20 accounts. The access tools read the domain and each account's credentials at one validated Mainnet ledger index. A read failure prevents a portfolio finding. An incomplete paginated read raises an error. The analyst can project 1–365 days forward and remove accepted credential rules hypothetically. The export includes observed inputs, ledger index and close time, proposed rules, findings, assumptions and a digest.

The forecast assumes the observed credentials and rules persist. Issuer revocation, renewal, domain deletion, network changes and unrelated transaction restrictions can change the outcome. Admission to a domain is only one condition of completing a transaction. The interface labels fictional samples explicitly. Domain owners retain owner access. Reviewer assignment in the issuer sample lasts for the session.

## Why a buyer might care

A credential expiry alert alone can create unnecessary work when another credential keeps a desk eligible. A last-qualifying-credential forecast lets an operator prioritize accounts actually projected to lose domain access. A rule removal scenario lets a domain owner review affected accounts before authorizing a change elsewhere. An offboarding reconciliation can expose unresolved balances and missing customer-to-wallet mappings.

These benefits are hypotheses until a buyer tests the workflow against its own process. An eligibility result depends on complete observations. A report digest helps detect changes to the report and does not establish who authored it or the correctness of its inputs.

## Competition researched

The table describes public documentation reviewed on 20 November 2026. A listed feature has not been independently tested. A feature absent from the reviewed pages may exist in private customer deployments.

| Alternative | Publicly documented overlap | Proposed reason to evaluate Continuity | What to verify with the buyer |
| --- | --- | --- | --- |
| Chainalysis KYT | Transaction monitoring, configurable rules, alerts and API integration | Review specific XRPL issuer and domain operations alongside existing transaction monitoring | Does the buyer already generate equivalent operational reports? Can existing tooling add this at lower cost? |
| Elliptic | Screening, monitoring, investigations and APIs for institutional workflows | Replay ledger-specific access and offboarding cases using the buyer's policy and evidence requirements | Which existing case system owns the review and what information is missing? |
| Ripple Custody | XRPL trust-line creation, freeze/unfreeze, issuer control operations | Help an operations reviewer assess who is affected by a policy or access change | Does the deployed custody platform already supply this report? Would the buyer prefer extending its custody integration? |
| XRPLHub | Credential lists, expiry information, domain eligibility checks, wallet scores, payment prechecks and lending exposure | Project across a named portfolio and compare the consequences of proposed rule removals | Its current eligibility API is advertised free. Determine whether forecasting and review evidence save enough work to justify a subscription. |
| XR-Trust | Public permissioned-domain directory and API documentation | Analyze effects on the institution's own chosen accounts | Public API detail could not be fully retrieved during this review. Verify current product coverage directly. |
| Confiance | XRPL Devnet lending underwriting, scoring, approval and overdue monitoring | Start with issuer and domain operations, then evaluate lending only with a credit design partner | Team-reported demo capability and customer traction need independent confirmation. |
| Internal scripts and spreadsheets | Buyer-specific review processes | Reduce maintenance, reconciliation and evidence assembly time | Measure the existing process. A simple internal script may remain the better purchase decision for a small portfolio. |

Sources

- [Chainalysis KYT](https://www.chainalysis.com/product/kyt/)
- [Elliptic institutional screening and monitoring](https://www.elliptic.co/solutions/financial-institutions/screening-and-monitoring/)
- [Ripple Custody XRPL token API](https://docs.ripple.com/products/custody/accounts-and-assets/tokenization/ledger-specific/xrpl-api)
- [XRPLHub repository and API descriptions](https://github.com/Dcroyalty/XRPLHub.io)
- [XR-Trust API documentation](https://trust.xrpl-utilities.io/docs)
- [Confiance project submission](https://hackathons.xrpl-commons.org/projects/confiance-2922327b)

## Answers for Cyrille

### What is NOSHASHI Continuity?

“It's the operations workspace for NOSHASHI. We help an XRPL issuer or trading operations team see which accounts need review, understand the ledger evidence and keep a record of the decision. We are starting with issuer offboarding and permissioned access.”

### What makes this better than competitors?

“The advantage we are testing is the complete review for an XRPL operation. For example, we can show whether a credential expiry actually removes access after accounting for alternative credentials, or which desks lose eligibility under a proposed rule removal. We will compare that workflow with the customer's existing tools using the same cases and measure the difference.”

### Why would an institution buy it?

“If a team spends substantial time combining ledger reads, customer records and review evidence, we can test whether Continuity reduces that work. The buyer pays when the time saved and operational value justify the cost. We want an operations lead to validate that with a real case set before an annual commitment.”

### Why pay when XRPLHub has free credential and eligibility APIs?

“Free APIs are a strong alternative. Our paid proposition needs to earn its price through portfolio review, time projections, policy scenarios, evidence completeness and support. If the customer's only need is a current eligibility lookup, those existing APIs may satisfy it.”

### Why wouldn't a custody vendor just build it?

“They can. Our current code is reproducible, and a feature alone provides little protection. Our opportunity is to deliver and maintain the workflow across customers' existing systems. Repeat adoption, reliable integrations and better review outcomes would make that proposition stronger.”

### Who is the first buyer?

“An issuer operations lead or tokenization platform operator managing permissioned holders and recurring reviews. For the access tools, we want a domain operator with enough accounts and credential changes to create recurring work. Those roles are our buyer hypothesis.”

### What can I see working today?

“The development branch has a sample offboarding queue with import, reviewer assignment and export. The desktop access tools read a domain and accounts at one validated ledger, forecast expiry and model rule removals. We have verified the logic with fixtures and the frontend build. A customer deployment and native Mac release still need validation.”

### What is still missing before institutional rollout?

“Offboarding still uses a fictional fixture. It needs approved customer-to-wallet mappings, a production source for issuer balances and agreed policy inputs. Shared review assignments, authenticated hosted API access, retention controls, deployment review and native release verification need completion for contracted use. We will agree those requirements with the pilot buyer.”

### Are the findings legally binding or a guarantee of access?

“The report states what was observed and how our rules evaluated it. Domain membership is one prerequisite of a transaction. Renewals, revocations, domain updates and other ledger conditions can change the result. The institution's responsible reviewer decides how to act.”

### Is this unique?

“We found adjacent products and direct overlap, including free current eligibility checks. The combination of portfolio forecasting, change scenarios and issuer review is our differentiation hypothesis. We still need to compare it with deployed customer systems.”

### What is the business model?

“An analyst can use Pro for recurring reviews. Institutional would cover a team workflow and agreed scope. Enterprise would cover multiple entities and integrations. I propose a $5,000 pilot to establish fit, followed by a subscription only if we show value. The pricing requires buyer validation.”

### Why start with XRP Ledger?

“NOSHASHI already reads XRPL issuer controls, payments, credentials and domains. Reusing those foundations lets us test a specific operations problem sooner. Expansion should follow evidence that a customer has the same workflow on another ledger.”

### What would make an investor interested?

“A paid pilot, repeated use, a conversion to recurring revenue and evidence that delivery costs fall as we reuse the implementation. We also need to show customer retention and how the workflow applies to more institutions. We currently have a product hypothesis and development work, with customer evidence still to earn.”

### How can XRPL Commons help?

“Could you introduce us to one issuer operations lead and one permissioned-domain operator? We'd like each to bring a recent review, compare the results with Continuity and tell us whether the work is frequent and expensive enough to buy a solution.”

## A pilot with a decision at the end

Proposed scope is one institution, one issuer asset for an offboarding replay, one permissioned domain and up to 20 accounts for access analysis. Offboarding production data collection must be implemented and reviewed before processing customer records. Use anonymized case references wherever practical.

Agree the baseline, test cases and acceptance criteria before the pilot begins. Candidate thresholds below are proposals.

| Measure | Proposed acceptance criterion |
| --- | --- |
| Review time | At least 30% less analyst time on the same agreed cases, including corrections and export work |
| Known access cases | Correct outcomes for every agreed expiry, alternative-credential and owner-access case |
| Evidence | Every finding includes its inputs, rule, timestamp or ledger reference, assumptions and missing information |
| Read failure | Every incomplete or failed ledger read produces an error that the reviewer can see |
| Reviewer usefulness | The operations lead can identify the next action without reconstructing the ledger read manually |
| Continued demand | A named budget owner requests another review cycle and discusses a paid scope |

For an illustrative $4,000 monthly fee and a $50 loaded hourly cost, time savings alone need 80 hours a month to cover the subscription. Adding a $500 monthly integration and support cost raises that threshold to 90 hours. These are assumptions. Measure actual customer costs and include onboarding, procurement and ongoing support. Savings from hypothetical incidents should be labeled separately until documented.

## Demonstration sequence

1. Open Continuity and show the sample issuer closure list. Explain the unresolved balance and missing wallet mapping.
2. Open Access forecast and load the sample. Desk A has a credential expiring in two days but remains eligible through the second credential. Desk B loses its only qualifying credential in three days.
3. Clear issuer A's rule. Desk A keeps access through issuer B. Desk B loses access under the scenario.
4. Set the horizon to 21 days. Desk A now loses access when its final credential expires. Desk C has a qualifying credential with no scheduled expiry.
5. Export the evidence and show the inputs and assumptions. For a live demonstration, use a permissioned domain and account addresses supplied and approved by the operator.
6. Ask for a design partner and a replay of one real review.

## Development priorities

First validate the two access tools with a domain operator. Then build production offboarding data collection with an issuer's verified mappings and policy. Add durable shared review only with the customer's governance requirements. A hosted API can expose the same tested review functions after authentication, capacity and tenancy requirements are agreed. Lending should follow a credit design partner's validated need.

The potential scale comes from becoming a recurring review process used across issuer, custody and domain operations. Research, implementation correctness and customer adoption are the evidence needed to support that ambition.
