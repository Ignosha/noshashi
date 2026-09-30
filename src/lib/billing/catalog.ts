/**
 * The commercial catalog, mirrored from the live Stripe account.
 *
 * Price ids are safe to ship — a price id is a public identifier, and
 * the Edge Function refuses any id that is not on its own allow-list, so
 * a tampered client cannot invent a cheaper plan.
 */

export type PlanId = "operator" | "desk" | "institution" | "enterprise" | "strategic";

/**
 * Note on naming: the customer-facing names are FREE, PRO and
 * INSTITUTIONAL. The identifiers are `operator`, `desk` and
 * `institution`, and they are deliberately not renamed to match.
 *
 * Those strings are load-bearing outside this file: they are the values
 * of the `tier` check constraint on noshashi.entitlements, the tier the
 * Stripe webhook writes on a successful checkout, and the tier the
 * Compliance API reads to pick a rate limit. Renaming the display name is
 * a copy change; renaming the identifier is a migration, a webhook
 * deploy and an Edge Function deploy that have to land together or every
 * paying account loses its entitlements in the gap. The mapping lives
 * here, once, instead.
 */
export type Plan = {
  /**
   * Monthly price in USD as a NUMBER, for anything that needs to compute
   * with it. priceLabel is for display; this is for arithmetic.
   *
   * Both exist because the business plan's revenue model was multiplying
   * seats by a hard-coded 149 while the catalogue charged 749 — a fivefold
   * understatement of Desk revenue that nothing caught, because the two
   * numbers lived in different files and neither referenced the other.
   */
  monthlyUsd: number;
  id: PlanId;
  name: string;
  audience: string;
  priceLabel: string;
  cadence: string;
  /** Null for the free tier — nothing to check out. */
  priceId: string | null;
  seatBased: boolean;
  emphasis?: boolean;
  features: string[];
  /** Entitlement flags this plan grants; must match the webhook. */
  grants: string[];

  /**
   * Annual price. Pro and Institutional: annual prepay, two months free
   * against twelve at the monthly rate, stated as the arithmetic rather
   * than a percentage nobody can check (10 x monthly). Enterprise and
   * Strategic are contracted by the year; their monthly figure is the
   * annual price divided by twelve, rounded to the dollar.
   */
  annualUsd?: number;
  annualPriceId?: string | null;
  /**
   * How this plan is bought.
   *
   * `self_serve` goes to Stripe Checkout. `contact_sales` does not, and
   * that is a commercial decision rather than a missing feature:
   * Institutional requires an executed MSA, and a card payment that
   * completes before anyone has signed one creates an entitlement with
   * no contract behind it.
   */
  purchase: "free" | "self_serve" | "contact_sales";
};

/** Two months free — the annual figure every tier is quoted at. */
export function annualFor(plan: Plan): number | undefined {
  return plan.monthlyUsd > 0 ? plan.monthlyUsd * 10 : undefined;
}

export const PLANS: Plan[] = [
  {
    id: "operator",
    name: "FREE",
    audience: "Individuals and single desks",
    priceLabel: "Free",
    monthlyUsd: 0,
    cadence: "forever",
    priceId: null,
    seatBased: false,
    purchase: "free",
    features: [
      "Full console and menu bar HUD",
      "Unlimited local gate checks",
      "Ledger sync — four public nodes compared side by side",
      "Inbox — spot impersonated tokens addressed to you",
      "Token rights — check an NFT before you buy it",
      "On-device compliance agent",
      "CSV audit export",
      "Account security check — who can sign, open doors, key changes, poisoning attempts, and an unsigned hardening plan",
      "Safe send — check a pasted address against your own for lookalikes before you sign",
      "Pre-sign explainer — paste any transaction or blob and see what it really does before you sign (DO NOT SIGN on takeovers and NFT giveaways)",
      "Stuck funds & reserve recovery — matured escrows, expired channels and checks, and reserve locked in old objects, with the transactions to get it back",
      "Exposure audit — every check, NFT sell offer, channel, order, key and preauthorisation that lets someone else take value, with a revoke for each",
      "Wrong-deposit helper — a deposit that 'vanished' explained from its hash, with the letter to the exchange when it arrived without a tag",
      "Domain impersonation check — does the domain an account claims list it back in its xrp-ledger.toml",
      "Forgotten-asset inventory — tokens, LP shares, NFTs and open orders an account still holds",
      "Personal Guardian — native takeover alerts for up to 3 of your own addresses while the app is open",
      "Binary integrity verification",
      "Community support",
    ],
    grants: ["console", "gate", "agent", "export"],
  },
  {
    id: "desk",
    name: "PRO",
    audience: "Trading desks and funds",
    priceLabel: "$749",
    monthlyUsd: 749,
    cadence: "per seat / month",
    priceId: "price_1U6U1eGSxPXLjUKIGnORqp43",
    annualUsd: 7_490,
    annualPriceId: "price_1UHV60GSxPXLjUKIytehVDNd",
    purchase: "self_serve",
    seatBased: true,
    emphasis: true,
    features: [
      "Everything in Free",
      "Redemption stress testing — liquidity-adjusted recoverable value across the book",
      "Multi-wallet portfolios with live gate status",
      "Settlement forensics — what a transaction delivered, not what it requested",
      "Order book integrity — quoted depth against depth that can actually fill",
      "Counterparty provenance — account age and who funded it",
      "Treasury control surface — how few signers can actually move a balance",
      "AMM pool governance — who votes the fee, and who holds the discount",
      "Policy drift and credential expiry alerts",
      "Issuer freeze-rights analysis — know who can immobilise your balance",
      "Authority certificate — a signed, re-checkable record of who can still freeze, seize or gate an issuance",
      "Counterparty concentration (HHI) across the settlement book",
      "Persistent adjudication ledger — 10,000 verdicts, survives restart",
      "Wallet explorer — every address ever scanned, sortable by risk",
      "Editable policy rule set — your thresholds, not ours",
      "Issuer drift monitor — native alert the moment an issuer freezes you",
      "Incident response — follow stolen value hop by hop past the dust, with every recovery path that exists and a SHA-256 dossier for police and exchanges",
      "Asset recovery suite — forgotten assets valued in XRP at the live best bid, recovery and exposure scans across 25 addresses at once, Personal Guardian on 50 addresses",
      "Scam cluster mapper — the accounts one operation runs, linked by funder, AccountDelete sweeps, vanity endings and shared memos (two hops, 40 accounts)",
      "5,000 API verifications included",
      "Priority support",
    ],
    grants: [
      "console",
      "gate",
      "agent",
      "export",
      "portfolios",
      "alerts",
      "receipt_anchoring",
      "priority_support",
      "authority_certificate",
      // Pro is sold "5,000 API verifications included" and the verify
      // function publishes a 50 req/sec limit for this tier. Without
      // this flag every one of those calls answered 403: the quota and
      // the key have to be granted by the same tier, or one of them is
      // a line on a pricing page that nothing honours.
      "compliance_api",
      "incident_response",
      "asset_recovery",
    ],
  },
  {
    id: "institution",
    name: "INSTITUTIONAL",
    audience: "Regulated venues and custodians",
    priceLabel: "$4,000",
    monthlyUsd: 4000,
    cadence: "per month",
    priceId: "price_1U6U1sGSxPXLjUKI7mCncAIu",
    annualUsd: 40_000,
    annualPriceId: "price_1UHV6AGSxPXLjUKIyxTwSBpO",
    purchase: "contact_sales",
    seatBased: false,
    features: [
      "Everything in Pro, unlimited seats",
      "Immutable audit log of every adjudication, export and settings change",
      "Bulk portfolio monitoring — unlimited wallets, scheduled stress runs",
      "Recovery and exposure scans across up to 500 addresses in one run, exported for the audit file",
      "Custom alert logic — your own thresholds, expressions and destinations",
      "Issuance surveillance — who holds your paper, and how concentrated",
      "Travel Rule (FATF R.16) scoping across every settlement",
      "Signed audit export — SHA-256 chain-of-custody for examiners",
      "Offline adjudication — run on a segregated network from captured state",
      "Compliance API keys and webhooks",
      "White-label console and reports — your name and colour on the console and on exports",
      "Regulator read-only seats — time-boxed examiner access, every visit logged",
      "100,000 API verifications included",
      "Dedicated onboarding and a named support contact",
      "Invoice, ACH, wire, NET-30 — MSA required",
    ],
    grants: [
      "console",
      "gate",
      "agent",
      "export",
      "portfolios",
      "alerts",
      "receipt_anchoring",
      "priority_support",
      "authority_certificate",
      "compliance_api",
      "webhooks",
      "regulator_seats",
      "white_label",
      "sla",
      "sso",
      "audit_log",
      "bulk_monitoring",
      "custom_alert_logic",
      "incident_response",
      "asset_recovery",
      "proof_of_reserves",
      "threat_registry",
    ],
  },
  {
    id: "enterprise",
    name: "ENTERPRISE",
    audience: "Institutional teams operating at scale",
    priceLabel: "$10,000",
    monthlyUsd: 10000,
    cadence: "per month",
    // No Stripe price exists yet: contract tiers are invoiced per deal.
    priceId: null,
    annualUsd: 120_000,
    annualPriceId: null,
    purchase: "contact_sales",
    seatBased: false,
    emphasis: true,
    features: [
      "Everything in Institutional",
      "Deposit screening: partial payments, counterfeit tokens, phishing dust, address poisoning, OFAC-listed senders and three-hop source of funds, before you credit",
      "Embeddable screening widget for your own site: address verification against poisoning, sanctions and deposit status",
      "Forensic trace — five hops deep, 1,000 transactions an account, straight into an organization investigation case",
      "Forensic cluster mapping — four hops and 200 accounts per scam operation, opened as an investigation case",
      "Asset passports and issuer intelligence at institutional scope",
      "Portfolio monitoring, counterparty and liquidity intelligence",
      "Deterministic policy engine, adjudication and decision history",
      "Evidence records, hashes, audit exports and review workflow",
      "Institutional API, scoped keys and webhooks",
      "Dedicated environment (coming soon)",
      "Architecture review and named implementation planning",
    ],
    grants: [
      "console",
      "gate",
      "agent",
      "export",
      "portfolios",
      "alerts",
      "receipt_anchoring",
      "priority_support",
      "authority_certificate",
      "compliance_api",
      "webhooks",
      "regulator_seats",
      "white_label",
      "sla",
      "sso",
      "audit_log",
      "bulk_monitoring",
      "custom_alert_logic",
      "asset_passports",
      "dedicated_environment",
      "deposit_screening",
      "embedded_delivery",
      "incident_response",
      "forensic_trace",
      "asset_recovery",
      "proof_of_reserves",
      "threat_registry",
      "customer_protection",
      "withdrawal_screening",
      "market_surveillance",
    ],
  },
  {
    id: "strategic",
    name: "STRATEGIC INFRASTRUCTURE",
    audience: "Institutions building their own XRPL intelligence layer",
    priceLabel: "$20,833",
    // $250,000 a year divided by twelve, rounded to the dollar.
    monthlyUsd: 20833,
    cadence: "per month",
    // No Stripe price exists yet: contract tiers are invoiced per deal.
    priceId: null,
    annualUsd: 250_000,
    annualPriceId: null,
    purchase: "contact_sales",
    seatBased: false,
    features: [
      "Everything in Enterprise",
      "High-volume API capacity and contracted burst limits",
      "XRPL event feeds: watched accounts read every minute, signed webhooks, JSON/NDJSON feed and history API",
      "Custom export schemas, bulk export and event retention you set",
      "Security Guardian — signed security_alert webhooks the minute a watched account's keys change or it is deleted, and one-click watching of a theft trail or a whole scam cluster",
      "Architecture review before commitment",
      "Scope documented against the integration",
    ],
    grants: [
      "console",
      "gate",
      "agent",
      "export",
      "portfolios",
      "alerts",
      "receipt_anchoring",
      "priority_support",
      "authority_certificate",
      "compliance_api",
      "webhooks",
      "regulator_seats",
      "white_label",
      "sla",
      "sso",
      "audit_log",
      "bulk_monitoring",
      "custom_alert_logic",
      "asset_passports",
      "dedicated_environment",
      "deposit_screening",
      "embedded_delivery",
      "event_feeds",
      "custom_schemas",
      "incident_response",
      "forensic_trace",
      "security_guardian",
      "asset_recovery",
      "proof_of_reserves",
      "threat_registry",
      "customer_protection",
      "withdrawal_screening",
      "market_surveillance",
      "protection_monitoring",
      "phishing_feed",
    ],
  },
];

export type CreditPack = {
  id: string;
  priceId: string;
  verifications: number;
  priceLabel: string;
  unitLabel: string;
};

/** Prepaid API verifications. Console checks by a human are never billed. */
export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "credits-10k",
    priceId: "price_1U6U3lGSxPXLjUKIfMMEwMcG",
    verifications: 10_000,
    priceLabel: "$450",
    unitLabel: "$0.045 each",
  },
  {
    id: "credits-50k",
    priceId: "price_1U6U3yGSxPXLjUKIcnPSGUSr",
    verifications: 50_000,
    priceLabel: "$2,000",
    unitLabel: "$0.040 each",
  },
  {
    id: "credits-250k",
    priceId: "price_1U6U4EGSxPXLjUKIsEUlezwg",
    verifications: 250_000,
    priceLabel: "$8,750",
    unitLabel: "$0.035 each",
  },
];

/** Every gateable capability, with the plan that first unlocks it. */
export const FEATURE_CATALOG: Record<
  string,
  { label: string; requires: PlanId; blurb: string }
> = {
  portfolios: {
    label: "Multi-wallet portfolios",
    requires: "desk",
    blurb: "Watch a book of accounts at once, with a live gate verdict on each.",
  },
  alerts: {
    label: "Drift and expiry alerts",
    requires: "desk",
    blurb: "Know the moment a domain tightens or a credential is about to lapse.",
  },
  receipt_anchoring: {
    label: "Receipt vault",
    requires: "desk",
    blurb:
      "Every verdict stored, searchable and exportable, so a check can be produced on demand months later.",
  },
  issuer_risk: {
    label: "Issuer freeze-rights analysis",
    requires: "desk",
    blurb:
      "An issued balance is only an asset if the issuer cannot freeze it. This reads the flags that decide that.",
  },
  concentration: {
    label: "Counterparty concentration",
    requires: "desk",
    blurb:
      "Measures how much of the book rests on a single counterparty failing, using the standard HHI index.",
  },
  adjudication_ledger: {
    label: "Persistent adjudication ledger",
    requires: "desk",
    blurb:
      "Every verdict written to disk and kept. A session log is a convenience; this is the record that still exists when an examiner asks in six months.",
  },
  policy_editor: {
    label: "Institutional policy",
    requires: "desk",
    blurb:
      "Encode your own thresholds for concentration, counterparty share, Travel Rule scope, reserve headroom and issuer freeze as a versioned policy. The active version decides every gate verdict and is named and hashed in its receipt; a draft is simulated against your recorded verdicts before you activate it, and recorded verdicts never change.",
  },
  drift_monitor: {
    label: "Issuer drift monitor",
    requires: "desk",
    blurb:
      "Re-reads every issuer you hold on a timer and raises a native alert when the flags change. An issuer setting lsfGlobalFreeze immobilises your balance the moment it lands, and nothing on the ledger tells the holder.",
  },
  offline_mode: {
    label: "Offline adjudication",
    requires: "institution",
    blurb:
      "Capture validated ledger state while connected, then adjudicate from a segregated network. Every offline verdict carries the ledger index and age of the state it rests on, so a snapshot result can never be passed off as a live one.",
  },
  signed_export: {
    label: "Signed audit export",
    requires: "institution",
    blurb:
      "Exports are signed with a SHA-256 digest over the exact bytes, so a recipient can prove the file is the one that left the workstation.",
  },
  travel_rule: {
    label: "Travel Rule scoping",
    requires: "institution",
    blurb:
      "Identifies which transfers cross the FATF Recommendation 16 threshold and lack counterparty data.",
  },
  authority_certificate: {
    label: "Authority certificate",
    requires: "desk",
    blurb:
      "Seven questions about one issuance, answered from validated ledger state at a named ledger index, and digested so the answer can be re-checked months later by anyone holding it. Deliberately not a score and deliberately not a legal finding: it reports what authority the issuer has kept, and leaves the conclusion to whoever is required to draw it.",
  },
  compliance_api: {
    label: "Compliance API",
    requires: "desk",
    blurb:
      "Issue keys and let your own systems ask the gate the same question. Pro includes 5,000 verifications a month; Institutional includes 100,000 and negotiates its own rate limit.",
  },
  webhooks: {
    label: "Webhooks",
    requires: "institution",
    blurb: "Push revocation and drift events into your stack as they happen.",
  },
  regulator_seats: {
    label: "Regulator seats",
    requires: "institution",
    blurb: "Scoped, time-boxed read-only access for an examiner.",
  },
  redemption_stress: {
    label: "Redemption stress testing",
    requires: "desk",
    blurb:
      "What the whole book would actually realise if it had to be raised as cash — routed across the DEX and the AMM together, shocked for depth that walks away, and discounted for balances an issuer could immobilise. A mark-to-mid portfolio value assumes every unit sells at the touch and that nobody can freeze it; both assumptions are false and neither is priced anywhere else.",
  },
  // Not built. The flag stays in the grants because the Stripe webhook
  // grants the same set (entitlement-parity.test.ts) and nothing gates on
  // it; no plan lists SSO as a feature until it exists.
  sso: {
    label: "Single sign-on (coming soon)",
    requires: "institution",
    blurb:
      "Not available yet. Sign-in is by email and password with two-factor authentication. SAML 2.0 or OIDC with SCIM provisioning is on the roadmap, not in the product.",
  },
  audit_log: {
    label: "Immutable audit log",
    requires: "institution",
    blurb:
      "Append-only record of every adjudication, export, key issuance and settings change, with the actor and the time. The question an examiner asks is not what the policy is, it is who changed it and when.",
  },
  bulk_monitoring: {
    label: "Bulk portfolio monitoring",
    requires: "institution",
    blurb:
      "Unlimited wallets under watch, with stress runs on a schedule rather than on a click, so a position that became unexitable overnight is an alert instead of a discovery.",
  },
  custom_alert_logic: {
    label: "Custom alert logic",
    requires: "institution",
    blurb:
      "Your own thresholds and expressions over the same measured facts, routed to your own destinations. A compliance function that cannot state its own trigger is using someone else's risk appetite.",
  },
  asset_passports: {
    label: "Asset passports",
    requires: "enterprise",
    blurb:
      "A signed, portable record of an asset's compliance posture — issuer authority, freeze rights, concentration, domain eligibility — that travels with the asset and can be verified by any counterparty without re-running the checks.",
  },
  dedicated_environment: {
    label: "Dedicated environment (coming soon)",
    requires: "enterprise",
    blurb:
      "Coming soon, not offered yet. Planned: isolated compute and storage for your compliance workload, with your own node endpoints and retention policy, scoped and provisioned per contract after architecture review.",
  },
  incident_response: {
    label: "Incident response",
    requires: "desk",
    blurb:
      "When an account is drained: the key changes that preceded it, the stolen value followed hop by hop through payments and AccountDelete sweeps (ignoring the dust thieves spray), what became of every account it reached, every recovery path that actually exists on the XRP Ledger, and a SHA-256 dossier for police, exchanges and issuers.",
  },
  forensic_trace: {
    label: "Forensic trace",
    requires: "enterprise",
    blurb:
      "Incident response at investigator depth: five hops and 1,000 transactions per account, custodial landings and sanctioned addresses named, vanity-address series detected, and the dossier opened as an organization investigation case in one click.",
  },
  asset_recovery: {
    label: "Asset recovery suite",
    requires: "desk",
    blurb:
      "The recovery tools at desk scale: every token, LP share and NFT valued in XRP at the live best bid, stuck-funds and exposure scans across a book of addresses at once (25 on Pro, 500 on Institutional and above), Personal Guardian on up to 50 addresses, and the scam cluster mapper: the accounts one operation runs, linked by who funded them, where they swept on deletion, vanity endings and shared memos.",
  },
  proof_of_reserves: {
    label: "Proof of reserves",
    requires: "institution",
    blurb:
      "Prove customer balances are backed without showing anyone the balances: a Merkle sum tree built on your own machine (only its root, total and count are published), each customer given the path that proves their balance is counted, and the reserve accounts you name read from a validated ledger and attested daily, hash-chained.",
  },
  customer_protection: {
    label: "Customer Asset Protection",
    requires: "enterprise",
    blurb:
      "A protection fund with a per-customer limit, verified on the ledger: how much is locked in escrow or held under a signer list no single key can satisfy, how much of the promise it covers, and a public page your customers can check their own inclusion on. Verification, not insurance: NOSHASHI pays no claims.",
  },
  protection_monitoring: {
    label: "Protection monitoring",
    requires: "strategic",
    blurb:
      "A signed protection_alert webhook whenever an attestation finds reserves below customer balances, liabilities unpublished, or a status worse than the day before.",
  },
  withdrawal_screening: {
    label: "Withdrawal screening",
    requires: "enterprise",
    blurb:
      "Every outbound payment checked before it is signed: whether it would bounce (missing tag, unfunded destination, deposit authorisation), whether the destination is brand new, hours old, a lookalike of an address the customer used before, OFAC-listed or in the scam registry up to three funding hops back.",
  },
  threat_registry: {
    label: "Shared scam registry",
    requires: "institution",
    blurb:
      "Report a scam address with the transactions that prove it. NOSHASHI staff who did not submit it review every report; confirmed entries screen deposits and withdrawals for every organization, shown as counts and categories, never who reported.",
  },
  phishing_feed: {
    label: "Phishing link feed",
    requires: "strategic",
    blurb:
      "Every domain advertised in micro-payment memos on the XRP Ledger, read from a validated ledger every minute, with the transactions behind each listing, as an API feed for your own blocklists. Single lookups are free.",
  },
  market_surveillance: {
    label: "Market surveillance",
    requires: "enterprise",
    blurb:
      "An issuer's order-book history read for manipulation indicators: accounts re-quoting orders that never fill, one account supplying most of the activity, and trades between accounts funded by the same account, each with the numbers and transactions behind it.",
  },
  security_guardian: {
    label: "Security Guardian",
    requires: "strategic",
    blurb:
      "Server-side takeover alerts: a signed security_alert webhook within a minute of any watched account's regular key or signer list changing, its master key being disabled or re-enabled, or its deletion, and every account in a theft trail watched in one click so you see the moment stolen value moves.",
  },
  embedded_delivery: {
    label: "Embeddable screening widget",
    requires: "enterprise",
    blurb:
      "One script tag on your own website: customers check that an address really is yours before they pay (catching lookalike addresses made for address poisoning), check any address against the ledger and the OFAC SDN list, and see whether their deposit has arrived. Allowed only on the sites you list; no key ever reaches the browser.",
  },
  deposit_screening: {
    label: "Deposit screening",
    requires: "enterprise",
    blurb:
      "Every incoming payment to your deposit addresses judged before it is credited: what actually arrived (never the Amount of a partial payment), whether the token is real or a counterfeit ticker, whether a drop of dust is carrying a phishing link, and who funded the sender three hops back against your own deny list.",
  },
  event_feeds: {
    label: "XRPL event feeds",
    requires: "strategic",
    blurb:
      "Up to 100 accounts per organization read from validated ledgers every minute: payments, trust-line freezes, settings and issuer flag changes, clawbacks and more, as signed webhooks and as a cursor-paged JSON/NDJSON feed, with a history API to backfill any range.",
  },
  custom_schemas: {
    label: "Custom schemas & bulk export",
    requires: "strategic",
    blurb:
      "Your own record shapes for ledger events and the audit log (adjudications, exports, settings changes), applied to bulk exports from the console and to the feed API, which your systems pull on their own schedule. Event history is kept for as long as you set, from 7 days to 10 years.",
  },
};

export function planFor(tier: string): Plan {
  return PLANS.find((plan) => plan.id === tier) ?? PLANS[0];
}
