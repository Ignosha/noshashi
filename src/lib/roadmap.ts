import { PLANS } from "@/lib/billing/catalog";
/**
 * Product substance: what ships today, what is being built, what is
 * genuinely novel in this space, and how the thing is meant to earn.
 *
 * Home and Revenue both read from here so the pitch and the plan can
 * never drift apart.
 */

export type Maturity = "live" | "building" | "planned";

export type Capability = {
  id: string;
  title: string;
  blurb: string;
  maturity: Maturity;
  /** Which scene demonstrates it, when one does. */
  scene?: string;
};

export const CAPABILITIES: Capability[] = [
  {
    id: "telemetry",
    title: "Live mainnet telemetry",
    blurb:
      "Validated ledgers, per-close throughput, open-ledger fee pressure and node health, streamed over a single resilient WebSocket.",
    maturity: "live",
    scene: "Mission Control",
  },
  {
    id: "gate",
    title: "Explainable settlement gate",
    blurb:
      "Every settlement is adjudicated before signing and answered GO / HOLD / NO-GO with the exact rule that decided it.",
    maturity: "live",
    scene: "Verification",
  },
  {
    id: "receipts",
    title: "Tamper-evident receipts",
    blurb:
      "Each verdict is hashed over a canonical body with SHA-256, so an auditor can prove the check happened and was not edited after the fact.",
    maturity: "live",
    scene: "Verification",
  },
  {
    id: "credentials",
    title: "XLS-70 credential registry",
    blurb:
      "Credential objects read straight from the validated ledger, with acceptance and revocation state resolved from ledger flags.",
    maturity: "live",
    scene: "Credentials",
  },
  {
    id: "domains",
    title: "XLS-80 domain grid",
    blurb:
      "Permissioned domains as rule sets, showing what each demands and exactly how far this wallet is from satisfying it.",
    maturity: "live",
    scene: "Domain Grid",
  },
  {
    id: "audit",
    title: "Exportable audit trail",
    blurb:
      "Wallet history with compliance metadata attached, filterable and exportable to CSV for a filing or an examiner.",
    maturity: "live",
    scene: "Audit Trail",
  },
  {
    id: "agent",
    title: "On-device compliance analyst",
    blurb:
      "A local model that explains verdicts and the rule set, grounded in live state. Nothing is transmitted off the machine.",
    maturity: "live",
    scene: "Agent",
  },
  {
    id: "menubar",
    title: "macOS menu bar residency",
    blurb:
      "The gate verdict lives one keystroke away in the menu bar, with native notifications and a global accelerator.",
    maturity: "live",
  },
  {
    id: "issuer-risk",
    title: "Issuer freeze-rights analysis",
    blurb:
      "Reads every issued position and the issuing account's own flags, so an institution knows which balances an issuer can immobilise without notice — and which it has permanently surrendered the right to touch.",
    maturity: "live",
    scene: "Exposure Analysis",
  },
  {
    id: "travel-rule",
    title: "Travel Rule (FATF R.16) scoping",
    blurb:
      "Identifies which settlements cross the originator/beneficiary threshold in a chosen jurisdiction, and which of those have no counterparty data attached.",
    maturity: "live",
    scene: "Exposure Analysis",
  },
  {
    id: "concentration",
    title: "Counterparty concentration",
    blurb:
      "Scores the settlement book with the Herfindahl-Hirschman Index, the same measure a regulator uses, so single-counterparty dependence is a number rather than a hunch.",
    maturity: "live",
    scene: "Exposure Analysis",
  },
  {
    id: "local-ledger",
    title: "Local adjudication ledger",
    blurb:
      "Every verdict the workstation produces is written to disk and survives a restart, with the wallet explorer and signed export built on top. It never leaves the machine, so an institution's settlement history does not become somebody else's dataset.",
    maturity: "live",
    scene: "Ledger & Policy",
  },
  {
    id: "policy-editor",
    title: "Operator-owned rule set",
    blurb:
      "Concentration limits, reserve headroom, Travel Rule thresholds and strict freeze handling are all editable and persisted. Risk appetite belongs to the institution, not to the vendor.",
    maturity: "live",
    scene: "Ledger & Policy",
  },
  {
    id: "issuer-drift",
    title: "Issuer drift monitoring",
    blurb:
      "An issuer's posture is not static. lsfGlobalFreeze can be set in one transaction, and every balance behind that issuer stops being spendable — with no notice to the holder. The workstation baselines each issuer and alerts on the transition.",
    maturity: "live",
    scene: "Ledger & Policy",
  },
  {
    id: "offline",
    title: "Offline adjudication",
    blurb:
      "Compliance often runs on segregated networks. Capture validated state while connected, adjudicate without one, and carry the ledger index and capture age on every verdict so a snapshot result is never mistaken for a live one.",
    maturity: "live",
    scene: "Ledger & Policy",
  },
  {
    id: "integrity",
    title: "Binary integrity verification",
    blurb:
      "Hashes the running executable so an operator can confirm the binary was not altered between download and execution. Free on every tier — charging for the ability to verify we are not malicious would be perverse.",
    maturity: "live",
  },
  {
    id: "zk",
    title: "Selective disclosure proofs",
    blurb:
      "Prove one predicate — accredited, of age, not sanctioned — without disclosing the credential payload behind it.",
    maturity: "building",
    scene: "Credentials",
  },
  {
    id: "drift",
    title: "Policy drift alerts",
    blurb:
      "When a domain changes its requirements, every member's eligibility is recomputed and whoever just fell out is notified.",
    maturity: "building",
  },
  {
    id: "api",
    title: "Compliance API",
    blurb:
      "REST and webhook endpoints so a third-party venue can ask the same question the console asks, and get the same receipt.",
    maturity: "planned",
  },
  {
    id: "regulator",
    title: "Regulator read-only seat",
    blurb:
      "A scoped, time-boxed console an examiner can open directly — no custody, no PII, full receipt lineage.",
    maturity: "planned",
  },
];

export type Concept = {
  id: string;
  title: string;
  /** Why nothing in the XRP ecosystem does this today. */
  gap: string;
  detail: string;
  /** Rough build weight, for sequencing rather than estimating. */
  weight: "S" | "M" | "L";
};

/**
 * The differentiated bets. Each one is stated with the gap it fills,
 * because "novel" is only useful if you can name what is missing.
 */
export const CONCEPTS: Concept[] = [
  {
    id: "proof-of-check",
    title: "Proof-of-Check",
    gap: "Compliance checks today are private logs. Nobody can verify one happened without trusting the party that ran it.",
    detail:
      "Anchor each receipt digest on-ledger in a transaction memo. The payload stays off-chain, but anyone can prove a specific check ran at a specific ledger, against a specific rule set version. Compliance becomes publicly auditable without becoming public.",
    weight: "M",
  },
  {
    id: "drift-radar",
    title: "Policy Drift Radar",
    gap: "When a permissioned domain tightens its requirements, existing members find out by being rejected mid-transaction.",
    detail:
      "Watch every domain's rule set for change, recompute eligibility across the member set the moment it moves, and push a notification to whoever just lost access — before their next settlement fails.",
    weight: "M",
  },
  {
    id: "expiry-radar",
    title: "Credential Expiry Radar",
    gap: "XLS-70 credentials expire silently. A wallet can be compliant on Monday and locked out on Tuesday with no warning.",
    detail:
      "Track expiration across a portfolio of accounts, forecast which domains each expiry will close, and open a renewal request with the issuer while there is still runway.",
    weight: "S",
  },
  {
    id: "counterparty-graph",
    title: "Counterparty Risk Graph",
    gap: "Sanctions screening in crypto stops at the direct counterparty. Second-hop exposure is invisible.",
    detail:
      "Build a graph from account_tx across hops, score exposure to unattested and flagged accounts, and surface the concentration risk an institution is actually carrying.",
    weight: "L",
  },
  {
    id: "reserve-planner",
    title: "Reserve-Aware Settlement Planner",
    gap: "Wallets quote a balance that includes reserve. Users routinely try to send XRP they cannot legally move.",
    detail:
      "Model the true spendable position against base and owner reserves, and refuse — with a number, not a shrug — before the ledger does.",
    weight: "S",
  },
  {
    id: "passport",
    title: "Portable Compliance Passport",
    gap: "Every venue re-runs the same KYC. Users re-disclose the same identity to each one.",
    detail:
      "A signed, revocable bundle of zero-knowledge predicates the user carries between venues. Each venue verifies the predicate it needs and learns nothing else. Onboarding drops from days to a single verification.",
    weight: "L",
  },
  {
    id: "local-analyst",
    title: "Zero-Egress Analyst",
    gap: "Every compliance copilot ships your transaction context to a vendor's API, which is itself a data-handling event.",
    detail:
      "Run the model on the operator's machine. The assistant sees wallet addresses, receipts and rule traces, and none of it crosses the network boundary. Already live in this build.",
    weight: "M",
  },
  {
    id: "sla-oracle",
    title: "Verification SLA Oracle",
    gap: "Institutions cannot contract against infrastructure whose uptime nobody publishes.",
    detail:
      "Publish verification latency, availability and dispute rate on-ledger on a fixed cadence, so an enterprise agreement can reference a number that neither party controls.",
    weight: "M",
  },
];

export type Tier = {
  id: string;
  name: string;
  audience: string;
  price: string;
  cadence: string;
  features: string[];
  emphasis?: boolean;
};

/**
 * Proposed commercial model. These are a starting hypothesis to test
 * with design partners, not observed prices — nothing here has been
 * validated against a real buyer yet.
 */
/**
 * Pricing shown on the business plan comes from the billing catalogue.
 *
 * It used to be restated here, and drifted: this file said Desk was $149
 * while the catalogue charged $749, so the revenue model on the business
 * plan screen understated Desk revenue fivefold. Editorial copy stays
 * here; the number comes from the one place that also drives checkout.
 */
const priced = (id: string) => {
  const plan = PLANS.find((p) => p.id === id);
  return {
    price: plan?.priceLabel ?? "",
    cadence: plan?.cadence ?? "",
  };
};

export const TIERS: Tier[] = [
  {
    id: "operator",
    name: "OPERATOR",
    audience: "Individuals and single desks",
    ...priced("operator"),
    features: [
      "Full console and menu bar HUD",
      "Unlimited local gate checks",
      "On-device compliance agent",
      "CSV audit export",
      "Community support",
    ],
  },
  {
    id: "desk",
    name: "DESK",
    audience: "Trading desks and small funds",
    ...priced("desk"),
    features: [
      "Everything in Operator",
      "Multi-wallet portfolios",
      "Policy drift and expiry alerts",
      "Issuer freeze-rights analysis",
      "Counterparty concentration scoring",
      "Persistent adjudication ledger",
      "Editable policy rule set",
      "Issuer drift monitor with native alerts",
      "Priority email support",
    ],
    emphasis: true,
  },
  {
    id: "institution",
    name: "INSTITUTION",
    audience: "Regulated venues and custodians",
    ...priced("institution"),
    features: [
      "Everything in Desk",
      "Travel Rule (FATF R.16) scoping",
      "Signed audit export (chain-of-custody)",
      "Offline adjudication from captured state",
      "Compliance API with webhooks",
      "White-labelled wallet",
      "Regulator read-only seats",
      "Published SLA and named support",
    ],
  },
];

export type RevenueStream = {
  id: string;
  name: string;
  model: string;
  unit: string;
  note: string;
};

export const REVENUE_STREAMS: RevenueStream[] = [
  {
    id: "verification-fee",
    name: "Verification micro-fee",
    model: "Usage",
    unit: "per programmatic check",
    note: "Institutions pay in XRP per API verification. Console checks stay free — the fee attaches to automation, not to people.",
  },
  {
    id: "subscription",
    name: "Seat subscription",
    model: "Recurring",
    unit: "per seat / month",
    note: "The predictable base. Desk and Institution tiers carry the alerting, portfolio and API surface.",
  },
  {
    id: "api",
    name: "Compliance API",
    model: "Metered",
    unit: "per 1,000 calls",
    note: "Third-party venues embed the gate. Tiered volume pricing with a committed-use discount.",
  },
  {
    id: "white-label",
    name: "White-label wallet",
    model: "License",
    unit: "annual",
    note: "The programmable compliance wallet under the institution's own brand, with their domain registry preloaded.",
  },
  {
    id: "diligence",
    name: "Premium diligence",
    model: "Per engagement",
    unit: "per asset",
    note: "Deep review for high-value assets and unusual structures, delivered as a signed report with receipt lineage.",
  },
  {
    id: "regulator",
    name: "Regulator seats",
    model: "License",
    unit: "per examiner / year",
    note: "Read-only, time-boxed access sold to the supervised entity as part of its examination readiness.",
  },
];

/** Sequenced so each phase unlocks the revenue of the next. */
export const MILESTONES: Array<{
  phase: string;
  window: string;
  goal: string;
  unlocks: string;
}> = [
  {
    phase: "PHASE 01",
    window: "Weeks 1–6",
    goal: "Console hardened, receipts anchored on-ledger, five design partners on Operator.",
    unlocks: "Proof that the gate is trusted before anyone is asked to pay.",
  },
  {
    phase: "PHASE 02",
    window: "Weeks 7–14",
    goal: "Desk tier ships: portfolios, drift and expiry alerts, priority support.",
    unlocks: "First recurring revenue and a churn signal worth reading.",
  },
  {
    phase: "PHASE 03",
    window: "Weeks 15–24",
    goal: "Compliance API in private beta with two venues, metered billing live.",
    unlocks: "Usage revenue that grows without headcount.",
  },
  {
    phase: "PHASE 04",
    window: "Weeks 25–40",
    goal: "Institution tier, white-label wallet, published SLA, first regulator seats.",
    unlocks: "Contract sizes that justify an enterprise motion.",
  },
];
