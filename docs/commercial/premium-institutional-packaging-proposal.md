# NOSHASHI LABS — premium institutional packaging proposal (DRAFT)

**Status:** Pricing hypothesis only. Not approved, published, billable, or evidence of customer demand. Do not change production checkout, billing, website pricing, or sales claims from this document.

## Commercial packages (USD, annual unless specified)

| Package | Proposed price | Buyer and use case | Commercial gate |
| --- | ---: | --- | --- |
| Scoped institutional pilot | $25,000 fixed, 6–8 weeks | One issuer, counterparty, payment verification, or evidence workflow | Written scope, customer-owned test data, success metrics, demo and mutually accepted limitations |
| Institutional Intelligence | $75,000/year | Analyst risk monitoring and evidence review | Reliable live ingestion, monitoring, alert accuracy, export controls, data provenance, customer access boundaries |
| Institutional Control | $150,000/year | Compliance operations and policy reviews | All Intelligence gates plus independently tested role permissions, four-eyes approval, policy change audit trail, case workflow, retention/export and documented fail-closed behavior |
| Enterprise Assurance | $300,000–$500,000+/year | Regulated institutions needing deployment, integration and contractual assurance | All Control gates plus independent security review, penetration testing, SSO/SAML or OIDC, tenant isolation verification, incident response, disaster recovery testing, support coverage, SLA measurement, contractual and regulatory review |

No tier includes autonomous transfer authorization or a claim of consensus cryptographic proof. Any enterprise-specific security or compliance certification requires independent verification.

## Capability truth table — implementation and sales gating

| Capability | Current repository evidence | Required before sale as production feature |
| --- | --- | --- |
| XRPL AccountRoot pinned read-only checks | Two-RPC live diagnostic reported corroborated observations in CI; RPC agreement is not independent consensus proof | Repeatability, documented provider behavior and reliability monitoring |
| XRPL RippleState trustline evidence | Parser and two-source diagnostic corroborated a pinned public fixture. Issuer freeze, deep freeze and trust-line authorization were also verified live on a pinned fixture. | Real validated fixture, both provider responses, error behavior, correct issuer-side flags and live regression |
| Issuer RequireAuth / global freeze / destination tag | Research parser and composition with tests | End-to-end customer workflow validation, all relevant XRPL restrictions, complete provenance |
| Case Review / claimed control conflicts | Read-only HOLD review and tests | Authenticated evidence chain, analyst UX, access control, audit trail, acceptance tests |
| Policy approvals / four-eyes | Local PostgreSQL verified tenant isolation, role restrictions, distinct approvers and one audit event on repeated decisions. Hosted identity remains unverified. | Code-level inspection, privilege separation, adversarial tests, tamper-evident audit history |
| Liquidity intelligence / issuer scoring | Product direction; no assertion of validated production accuracy here | Coverage definitions, source freshness, historical backtesting, methodology, error budgets |
| Enterprise tenancy / SSO / SLAs / deployment | Not independently verified for these packages | Security audit, tested isolation, documented SLOs, incident response, disaster recovery and support capacity |

## Package boundaries

- **Pilot:** one documented workflow and limited users, non-production/read-only, success criteria agreed before invoice, deliver evidence and decision memo. Do not promise compliance certification.
- **Intelligence:** monitoring and explainable analysis, historical review, configurable alerts, exportable reports, defined usage and support; **gated** until monitoring and evidence quality are proven.
- **Control:** Intelligence plus documented policy change workflow, role-scoped approvals, exception queue, audit trail, evidence bundles; **gated** until enforcement and audit security are verified.
- **Assurance:** Control plus private/isolated deployment options, enterprise identity, integration support, security review package, measured availability and response commitments; **gated** until delivery capability and contractual obligations are demonstrated.

## Existing catalog and enforcement

The commercial experiments above are draft offers. The existing catalog uses the plan IDs below. Payment Review and the Compliance API have distinct quotas. The listed Payment Review capacity is the local entitlement and batch limit, subject to active subscription and billing-hold checks for paid access.

| Catalog plan | Catalog price in USD | Payment Review monthly records / batch | Purchase path |
| --- | --- | --- | --- |
| Free (`operator`) | $0 | 25 / 5 | Free account |
| Pro (`desk`) | $749 per seat/month or $7,490 per seat/year | 5,000 / 25 | Self-serve in the existing catalog |
| Institutional (`institution`) | $4,000/month or $40,000/year | 100,000 / 25 | Contract |
| Enterprise (`enterprise`) | $120,000/year | 100,000 / 25 | Contract |
| Strategic Infrastructure (`strategic`) | $250,000/year | 100,000 / 25 | Contract. Any higher capacity requires separate agreement and verification. |

The catalog and its provisioning code share grant names for API access, audit logging and other features. Grant parity tests prove synchronization of those names. Hosted access, identity and usage tests are needed to verify delivery of each contracted feature. SSO, dedicated environments, SLA commitments and independently authenticated audit custody remain subject to capability and contract review.

## Proposed institutional pilot workflow

| Stage | Operator actions | Evidence for acceptance |
| --- | --- | --- |
| Scope | Choose one read-only workflow, public XRPL fixtures, one dedicated test organization and a named operator and approver. Confirm the data boundary and an approved route for any non-public data. | Written scope, role matrix, allowed data and retention terms. |
| Provision | Establish an approved test environment. Assign time-bounded access by role and confirm the grant for the intended workflow. Use a separate test account in another organization. | Verify permitted operations, cross-tenant denial, disabled or expired access, and absence of provider signing or custody permissions. |
| Exercise | Review a known successful payment, a source-disagreement fixture and a retry after an interrupted run. Submit an exception, attempt self-approval, then have a distinct eligible user decide it. | Capture exact amount and asset, pinned controls, reason codes, signed research attestation if configured, and one actor-bound audit event. Label live ledger observations and fixture scenarios in the record. |
| Exit | Revoke accounts and keys, export approved evidence, and record the customer's decision. | Evidence inventory, revocation checks, residual gaps and written launch decision. |

For the proposed pilot, measure completed review time against the operator's documented baseline. Treat any cross-tenant access, false verified outcome, or accepted self-approval as an acceptance failure. Agree on coverage and turnaround targets in the pilot scope. Founder approval is required before inviting participants, agreeing to fees, or sharing private case data.

## Price justification and validation

Validate with 10–15 qualified buyer interviews and 3 paid design partners. For each prospect record problem cost, existing alternatives, required controls, procurement budget, willingness to pay, implementation objections, and decision authority. Quote value-based pricing only after demonstrating ROI such as investigation hours saved, avoided rework, or faster evidence preparation. Do not claim fraud losses prevented without measured proof.

## Revenue scenarios — illustrative, not forecasts

- 4 Intelligence customers at $75,000 = $300,000 ARR.
- 5 Control customers at $150,000 = $750,000 ARR.
- 3 Assurance customers at $350,000 = $1,050,000 ARR.
- Combined illustrative ARR = $2,100,000 before expenses and taxes.

## Immediate next engineering priorities

1. Extend live XRPL coverage to positive AccountRoot RequireAuth, global freeze and holder-side deep freeze fixtures. Link each observation to the pilot evidence register.
2. Inventory existing UI/API/policy features and label **implemented / mocked / unverified / missing**.
3. Build an end-to-end institutional evidence workflow with provenance and controlled exports.
4. Threat-model tenant boundaries, roles, four-eyes approvals, audit logs, and credential management.
5. Validate customer needs and pricing with paid pilots before publishing enterprise tier promises.

**Non-goals:** no billing changes, checkout links, public price publication, automatic deployment, production policy modification, or customer outreach.
