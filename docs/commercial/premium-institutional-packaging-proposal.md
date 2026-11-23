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
| XRPL RippleState trustline evidence | Parser, two-source adapter, mocked tests and opt-in diagnostic; **live integration not yet verified** | Real validated fixture, both provider responses, error behavior, correct issuer-side flags and live regression |
| Issuer RequireAuth / global freeze / destination tag | Research parser and composition with tests | End-to-end customer workflow validation, all relevant XRPL restrictions, complete provenance |
| Case Review / claimed control conflicts | Read-only HOLD review and tests | Authenticated evidence chain, analyst UX, access control, audit trail, acceptance tests |
| Policy approvals / four-eyes | Product direction; no assertion of production verification in this pricing document | Code-level inspection, privilege separation, adversarial tests, tamper-evident audit history |
| Liquidity intelligence / issuer scoring | Product direction; no assertion of validated production accuracy here | Coverage definitions, source freshness, historical backtesting, methodology, error budgets |
| Enterprise tenancy / SSO / SLAs / deployment | Not independently verified for these packages | Security audit, tested isolation, documented SLOs, incident response, disaster recovery and support capacity |

## Package boundaries

- **Pilot:** one documented workflow and limited users, non-production/read-only, success criteria agreed before invoice, deliver evidence and decision memo. Do not promise compliance certification.
- **Intelligence:** monitoring and explainable analysis, historical review, configurable alerts, exportable reports, defined usage and support; **gated** until monitoring and evidence quality are proven.
- **Control:** Intelligence plus documented policy change workflow, role-scoped approvals, exception queue, audit trail, evidence bundles; **gated** until enforcement and audit security are verified.
- **Assurance:** Control plus private/isolated deployment options, enterprise identity, integration support, security review package, measured availability and response commitments; **gated** until delivery capability and contractual obligations are demonstrated.

## Price justification and validation

Validate with 10–15 qualified buyer interviews and 3 paid design partners. For each prospect record problem cost, existing alternatives, required controls, procurement budget, willingness to pay, implementation objections, and decision authority. Quote value-based pricing only after demonstrating ROI such as investigation hours saved, avoided rework, or faster evidence preparation. Do not claim fraud losses prevented without measured proof.

## Revenue scenarios — illustrative, not forecasts

- 4 Intelligence customers at $75,000 = $300,000 ARR.
- 5 Control customers at $150,000 = $750,000 ARR.
- 3 Assurance customers at $350,000 = $1,050,000 ARR.
- Combined illustrative ARR = $2,100,000 before expenses and taxes.

## Immediate next engineering priorities

1. Finish live XRPL RippleState two-provider interoperability and fail-closed evidence tests.
2. Inventory existing UI/API/policy features and label **implemented / mocked / unverified / missing**.
3. Build an end-to-end institutional evidence workflow with provenance and controlled exports.
4. Threat-model tenant boundaries, roles, four-eyes approvals, audit logs, and credential management.
5. Validate customer needs and pricing with paid pilots before publishing enterprise tier promises.

**Non-goals:** no billing changes, checkout links, public price publication, automatic deployment, production policy modification, or customer outreach.
