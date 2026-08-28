/**
 * The commercial catalog, mirrored from the live Stripe account.
 *
 * Price ids are safe to ship — a price id is a public identifier, and
 * the Edge Function refuses any id that is not on its own allow-list, so
 * a tampered client cannot invent a cheaper plan.
 */

export type PlanId = "operator" | "desk" | "institution";

export type Plan = {
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
};

export const PLANS: Plan[] = [
  {
    id: "operator",
    name: "OPERATOR",
    audience: "Individuals and single desks",
    priceLabel: "Free",
    cadence: "forever",
    priceId: null,
    seatBased: false,
    features: [
      "Full console and menu bar HUD",
      "Unlimited local gate checks",
      "Ledger sync — four public nodes compared side by side",
      "Inbox — spot impersonated tokens addressed to you",
      "On-device compliance agent",
      "CSV audit export",
      "Binary integrity verification",
      "Community support",
    ],
    grants: ["console", "gate", "agent", "export"],
  },
  {
    id: "desk",
    name: "DESK",
    audience: "Trading desks and funds",
    priceLabel: "$749",
    cadence: "per seat / month",
    priceId: "price_1U6U1eGSxPXLjUKIGnORqp43",
    seatBased: true,
    emphasis: true,
    features: [
      "Everything in Operator",
      "Multi-wallet portfolios with live gate status",
      "Settlement forensics — what a transaction delivered, not what it requested",
      "Counterparty provenance — account age and who funded it",
      "Treasury control surface — how few signers can actually move a balance",
      "AMM pool governance — who votes the fee, and who holds the discount",
      "Policy drift and credential expiry alerts",
      "Issuer freeze-rights analysis — know who can immobilise your balance",
      "Counterparty concentration (HHI) across the settlement book",
      "Persistent adjudication ledger — 10,000 verdicts, survives restart",
      "Wallet explorer — every address ever scanned, sortable by risk",
      "Editable policy rule set — your thresholds, not ours",
      "Issuer drift monitor — native alert the moment an issuer freezes you",
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
    ],
  },
  {
    id: "institution",
    name: "INSTITUTION",
    audience: "Regulated venues and custodians",
    priceLabel: "$4,000",
    cadence: "per month",
    priceId: "price_1U6U1sGSxPXLjUKI7mCncAIu",
    seatBased: false,
    features: [
      "Everything in Desk",
      "Issuance surveillance — who holds your paper, and how concentrated",
      "Travel Rule (FATF R.16) scoping across every settlement",
      "Signed audit export — SHA-256 chain-of-custody for examiners",
      "Offline adjudication — run on a segregated network from captured state",
      "Compliance API keys and webhooks",
      "White-labelled wallet",
      "Regulator read-only seats",
      "100,000 API verifications included",
      "Published SLA and named support",
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
      "compliance_api",
      "webhooks",
      "regulator_seats",
      "white_label",
      "sla",
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
    label: "Editable rule set",
    requires: "desk",
    blurb:
      "State your own thresholds for concentration, reserve headroom and Travel Rule scope. A compliance officer has to be able to change the number that produced a HOLD.",
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
  compliance_api: {
    label: "Compliance API",
    requires: "institution",
    blurb: "Issue keys and let your own systems ask the gate the same question.",
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
};

export function planFor(tier: string): Plan {
  return PLANS.find((plan) => plan.id === tier) ?? PLANS[0];
}
