import type { SceneId } from "@/App";
import type { ControlRoom } from "@/lib/desk/controlRoom";
import { hasPolicyException } from "@/lib/desk/controlRoom";
import type { LedgerEntry } from "@/lib/desk/ledger";
import type { WalletSnapshot } from "@/lib/desk/portfolio";
import { reserveRequirementXrp } from "@/lib/policy";
import type { MemberRole } from "@/lib/org/governance";

/**
 * Role lenses: the same evidence, ordered for the person looking at it.
 *
 * A lens never has data of its own. Its figures are computed from the
 * control room's summary and the recorded verdicts, and every item drills
 * down into the scene that holds the underlying record — executive →
 * analyst → evidence → raw ledger data. A figure with no source is null
 * and shown as unavailable.
 */

export type Lens = "executive" | "compliance" | "risk" | "trading" | "operations" | "analyst";

export const LENS_ORDER: Lens[] = ["executive", "compliance", "risk", "trading", "operations", "analyst"];

/** The lens a member sees first. Anyone can switch; this only orders the screen. */
export const LENS_FOR_ROLE: Record<MemberRole, Lens> = {
  owner: "executive",
  admin: "executive",
  compliance: "compliance",
  risk: "risk",
  analyst: "analyst",
  viewer: "executive",
  api: "operations",
};

export type LensMetrics = {
  exposureXrp: number | null;
  /** XRP spendable above the owner reserve across readable portfolio wallets. */
  spendableXrp: number | null;
  /** Recorded verdicts in the last 30 days. */
  verdicts30d: number;
  /** Share of those with no institutional-policy exception, 0–100. Null with no verdicts. */
  complianceRate30d: number | null;
  activeExceptions: number;
  pendingDecisions: number | null;
  critical: number;
  openCases: number;
  highCases: number;
  /** Highest counterparty HHI measured in a recorded verdict in 30 days. */
  worstHhi30d: number | null;
  mainnet: "connected" | "degraded" | "offline";
  policy: "active" | "none" | "unavailable" | "loading";
};

export function lensMetrics(input: {
  now: number;
  room: ControlRoom;
  entries: LedgerEntry[];
  snapshots: WalletSnapshot[] | null;
  mainnet: LensMetrics["mainnet"];
  policy: LensMetrics["policy"];
}): LensMetrics {
  const since = input.now - 30 * 24 * 60 * 60 * 1000;
  const recent = input.entries.filter((e) => Date.parse(e.at) >= since);
  const readable = (input.snapshots ?? []).filter((s) => !s.loading && !s.error && s.account);
  const spendable =
    input.snapshots && readable.length
      ? readable.reduce((sum, s) => sum + Math.max(0, Number(s.account!.balanceXrp) - reserveRequirementXrp(s.account!.ownerCount ?? 0)), 0)
      : null;
  const hhis = recent.map((e) => e.hhi).filter((h): h is number => typeof h === "number");
  return {
    exposureXrp: input.room.exposure.state === "ok" ? input.room.exposure.value.xrp : null,
    spendableXrp: input.room.exposure.state === "ok" ? spendable : null,
    verdicts30d: recent.length,
    complianceRate30d: recent.length ? Math.round((recent.filter((e) => !hasPolicyException(e)).length / recent.length) * 1000) / 10 : null,
    activeExceptions: input.room.exceptions.recorded30d,
    pendingDecisions: input.room.exceptions.pendingOrg,
    critical: input.room.critical,
    openCases: input.room.queue.open,
    highCases: input.room.queue.high,
    worstHhi30d: hhis.length ? Math.max(...hhis) : null,
    mainnet: input.mainnet,
    policy: input.policy,
  };
}

export type LensItem = {
  id: string;
  label: string;
  /** What the person learns by opening it. */
  answers: string;
  scene: SceneId;
  /** Where in that scene, when it has tabs. */
  where?: string;
  /** The headline figure for this item, from the metrics. Null = unavailable. */
  figure?: (m: LensMetrics) => string | null;
};

const xrp = (v: number | null) => (v === null ? null : `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} XRP`);
const n = (v: number | null) => (v === null ? null : v.toLocaleString("en-US"));

export const LENSES: Record<Lens, { title: string; purpose: string; items: LensItem[] }> = {
  executive: {
    title: "EXECUTIVE",
    purpose: "The organization's state without raw ledger detail. Every figure opens the evidence behind it.",
    items: [
      { id: "exposure", label: "TOTAL EXPOSURE", answers: "Live balances across the portfolio", scene: "desk", figure: (m) => xrp(m.exposureXrp) },
      { id: "exceptions", label: "ACTIVE EXCEPTIONS", answers: "Verdicts where a policy rule asked for review or failed (30 days)", scene: "workstation", where: "EVIDENCE", figure: (m) => n(m.activeExceptions) },
      { id: "critical", label: "CRITICAL ITEMS", answers: "Live alerts and refused settlements", scene: "control", figure: (m) => n(m.critical) },
      { id: "liquidity", label: "LIQUIDITY", answers: "XRP spendable above the owner reserve", scene: "desk", figure: (m) => xrp(m.spendableXrp) },
      { id: "compliance", label: "POLICY COMPLIANCE", answers: "Share of recorded verdicts with no policy exception (30 days)", scene: "workstation", where: "POLICY", figure: (m) => (m.complianceRate30d === null ? null : `${m.complianceRate30d}% of ${m.verdicts30d}`) },
      { id: "cases", label: "INVESTIGATION STATUS", answers: "Open cases and how many are high priority", scene: "workstation", where: "CASES", figure: (m) => `${m.openCases} open · ${m.highCases} high` },
      { id: "system", label: "SYSTEM STATUS", answers: "Mainnet connection and the policy in force", scene: "network", figure: (m) => `${m.mainnet.toUpperCase()} · POLICY ${m.policy.toUpperCase()}` },
    ],
  },
  compliance: {
    title: "COMPLIANCE",
    purpose: "Violations, credentials, issuer controls, evidence, investigations and the audit history.",
    items: [
      { id: "violations", label: "POLICY VIOLATIONS", answers: "Verdicts with REVIEW or FAIL rules, and exceptions awaiting a decision", scene: "workstation", where: "EVIDENCE", figure: (m) => `${m.activeExceptions}${m.pendingDecisions !== null ? ` · ${m.pendingDecisions} pending` : ""}` },
      { id: "credentials", label: "CREDENTIALS", answers: "Which credentials a wallet holds, from whom, and when they expire", scene: "credentials" },
      { id: "issuers", label: "ISSUER CONTROLS", answers: "Freeze, clawback and authorization settings of an issuer", scene: "authority" },
      { id: "evidence", label: "EVIDENCE", answers: "Each verdict's facts, rules and receipt, re-verifiable", scene: "workstation", where: "EVIDENCE" },
      { id: "cases", label: "INVESTIGATIONS", answers: "Open cases and their hash-chained history", scene: "workstation", where: "CASES", figure: (m) => `${m.openCases} open` },
      { id: "audit", label: "AUDIT HISTORY", answers: "Every recorded verdict, exportable and signed", scene: "history" },
    ],
  },
  risk: {
    title: "RISK",
    purpose: "Exposure, concentration, liquidity, counterparties, scenarios and simulations.",
    items: [
      { id: "exposure", label: "EXPOSURE", answers: "Live balances across the portfolio", scene: "desk", figure: (m) => xrp(m.exposureXrp) },
      { id: "concentration", label: "CONCENTRATION", answers: "Highest counterparty HHI measured in a verdict (30 days)", scene: "risk", figure: (m) => n(m.worstHhi30d) },
      { id: "liquidity", label: "LIQUIDITY", answers: "Spendable XRP above reserve; pool depth", scene: "amm", figure: (m) => xrp(m.spendableXrp) },
      { id: "counterparties", label: "COUNTERPARTY RELATIONSHIPS", answers: "Who a wallet transacts with, and how much", scene: "risk" },
      { id: "scenarios", label: "SCENARIOS & SIMULATIONS", answers: "Re-decide recorded verdicts under a changed policy", scene: "workstation", where: "SIMULATE" },
    ],
  },
  trading: {
    title: "TRADING",
    purpose: "Market depth, execution conditions, slippage, liquidity and settlement constraints.",
    items: [
      { id: "depth", label: "MARKET DEPTH", answers: "Live order book on the XRPL DEX", scene: "book" },
      { id: "slippage", label: "EXECUTION & SLIPPAGE", answers: "What a size would cost against the live book and pools", scene: "book" },
      { id: "pools", label: "LIQUIDITY", answers: "AMM pool depth and governance", scene: "amm" },
      { id: "settlement", label: "SETTLEMENT CONSTRAINTS", answers: "What must hold for a settlement to go", scene: "settlement" },
      { id: "gate", label: "PRE-TRADE GATE", answers: "Run the settlement gate before signing", scene: "verify" },
    ],
  },
  operations: {
    title: "OPERATIONS",
    purpose: "Settlement state, verification, exceptions, reconciliation and alerts.",
    items: [
      { id: "settlement", label: "SETTLEMENT STATE", answers: "Where a settlement stands", scene: "settlement" },
      { id: "verify", label: "TRANSACTION VERIFICATION", answers: "Gate a transfer and issue a receipt", scene: "verify" },
      { id: "exceptions", label: "EXCEPTIONS", answers: "Exceptions requested and awaiting a decision", scene: "workstation", where: "POLICY", figure: (m) => (m.pendingDecisions === null ? n(m.activeExceptions) : `${m.pendingDecisions} pending`) },
      { id: "reconcile", label: "RECONCILIATION", answers: "Recorded verdicts and signed exports", scene: "workstation", where: "EXPORT", figure: (m) => `${m.verdicts30d} verdicts (30d)` },
      { id: "alerts", label: "ALERTS", answers: "Live alerts from the portfolio and issuer watch", scene: "control", figure: (m) => n(m.critical) },
    ],
  },
  analyst: {
    title: "ANALYST",
    purpose: "Executive → analyst → evidence → raw data. Everything a finding rests on.",
    items: [
      { id: "raw", label: "RAW LEDGER STATE", answers: "Validated ledgers as they close", scene: "network" },
      { id: "tx", label: "TRANSACTION METADATA", answers: "A transaction's full record and provenance", scene: "provenance" },
      { id: "relationships", label: "RELATIONSHIPS", answers: "Counterparties and flows", scene: "risk" },
      { id: "trustlines", label: "TRUST LINES & ISSUER CONTROLS", answers: "Holdings, issuers and their flags", scene: "authority" },
      { id: "book", label: "ORDER BOOKS", answers: "Live DEX depth", scene: "book" },
      { id: "credentials", label: "CREDENTIALS", answers: "On-ledger credentials and their issuers", scene: "credentials" },
      { id: "rules", label: "POLICY RULES", answers: "The active policy, its versions and simulation", scene: "workstation", where: "POLICY" },
      { id: "evidence", label: "EVIDENCE", answers: "Verdict facts, rules and receipts", scene: "workstation", where: "EVIDENCE" },
      { id: "ai", label: "AI INVESTIGATION", answers: "Ask about a finding; the AI cannot change a verdict", scene: "agent" },
    ],
  },
};
