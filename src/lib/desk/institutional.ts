import { analyseConcentration, analyseIssuers } from "@/lib/desk/risk";
import type { PolicyCheck } from "@/lib/policy";
import type {
  AccountInfo,
  IssuerPosture,
  TrustLine,
  WalletTransaction,
} from "@/lib/xrpl/types";

/**
 * Institutional policy: the institution's own decision thresholds,
 * applied to every settlement the gate adjudicates.
 *
 * Three layers, never blended:
 *
 *   FACTS         what the ledger reports (measure(): no policy involved)
 *   POLICY        what the institution configured (InstitutionalPolicy)
 *   RESULT        what the two produce together (judge(): no I/O)
 *
 * Measurements are stored with every verdict, so a verdict can be shown
 * exactly as it was decided and a draft policy can be simulated against
 * real recorded facts without re-reading the ledger.
 *
 * Nothing here is advisory or model-driven. Every function is pure and
 * deterministic: the same facts and the same policy give the same result.
 *
 * A configured threshold is an institutional policy parameter. It is not
 * legal advice, a regulatory requirement, a universal standard or XRPL
 * policy, and nothing in this module says otherwise.
 */

/** Bumped whenever measure() or judge() would decide differently for the same input. */
export const POLICY_ENGINE_VERSION = "1";

/* ── Policy model ─────────────────────────────────────────────────── */

export type RuleOutcome = "review" | "fail";

export type PolicyParams = {
  /** HHI above this triggers the HHI outcome. Null turns the rule off. 0–10,000. */
  hhiLimit: number | null;
  /** Counterparty share above this (percent) triggers its outcome. Null turns it off. */
  counterpartyShareLimitPct: number | null;
  /**
   * Transfers valued at or above this threshold trigger a Travel Rule review.
   * The reference rate is the operator's own: there is no price feed.
   * Null turns the rule off.
   */
  travelRule: {
    thresholdFiat: number;
    currency: string;
    xrpReferenceRate: number | null;
  } | null;
  /** Spendable XRP left after the settlement must be at least this. Null turns it off. */
  reserveHeadroomMinXrp: number | null;
  /** When on, an issuer that can freeze a held balance triggers the freeze outcome. */
  strictFreeze: boolean;
  /** What each rule does when triggered: REVIEW (verdict HOLD) or FAIL (verdict NO-GO). */
  outcomes: {
    hhi: RuleOutcome;
    counterparty: RuleOutcome;
    travelRule: RuleOutcome;
    reserve: RuleOutcome;
    freeze: RuleOutcome;
  };
};

export type PolicyStatus = "draft" | "active" | "archived";

export type InstitutionalPolicy = {
  /** Profile id — stable across versions. */
  id: string;
  name: string;
  /** 1, 2, 3 … per profile. */
  version: number;
  status: PolicyStatus;
  params: PolicyParams;
  /** SHA-256 over canonical {id, name, version, params, engine}. */
  hash: string;
  createdAt: string;
  updatedAt: string;
  effectiveAt?: string;
  archivedAt?: string;
  createdBy?: string;
  activatedBy?: string;
  /** Where the initial values came from, shown until the policy is activated. */
  origin?: string;
};

/** What a verdict records about the policy that produced it. */
export type PolicyRef = {
  id: string;
  name: string;
  version: number;
  hash: string;
  engine: string;
};

export function refOf(policy: InstitutionalPolicy): PolicyRef {
  return {
    id: policy.id,
    name: policy.name,
    version: policy.version,
    hash: policy.hash,
    engine: POLICY_ENGINE_VERSION,
  };
}

/* ── Canonical serialisation and hashing ──────────────────────────── */

/**
 * JSON with object keys sorted at every depth, so the same policy
 * always serialises to the same bytes regardless of how it was built.
 * Refuses values JSON cannot represent faithfully.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number in canonical form");
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new Error(`Cannot canonicalise ${typeof value}`);
}

async function sha256Upper(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function policyHash(policy: Pick<InstitutionalPolicy, "id" | "name" | "version" | "params">) {
  return sha256Upper(
    canonicalJson({
      engine: POLICY_ENGINE_VERSION,
      id: policy.id,
      name: policy.name,
      params: policy.params,
      version: policy.version,
    })
  );
}

/* ── Validation ───────────────────────────────────────────────────── */

export type PolicyError = { field: string; message: string };

const OUTCOMES: RuleOutcome[] = ["review", "fail"];

export function validateParams(params: PolicyParams): PolicyError[] {
  const errors: PolicyError[] = [];
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);

  if (params.hhiLimit !== null && (!finite(params.hhiLimit) || params.hhiLimit < 0 || params.hhiLimit > 10_000)) {
    errors.push({ field: "hhiLimit", message: "HHI limit must be a number between 0 and 10,000." });
  }
  if (
    params.counterpartyShareLimitPct !== null &&
    (!finite(params.counterpartyShareLimitPct) ||
      params.counterpartyShareLimitPct <= 0 ||
      params.counterpartyShareLimitPct > 100)
  ) {
    errors.push({
      field: "counterpartyShareLimitPct",
      message: "Counterparty share must be above 0% and at most 100%.",
    });
  }
  if (params.travelRule !== null) {
    const t = params.travelRule;
    if (!finite(t.thresholdFiat) || t.thresholdFiat < 0) {
      errors.push({ field: "travelRule.thresholdFiat", message: "Travel Rule threshold must be a non-negative amount." });
    }
    if (typeof t.currency !== "string" || !/^[A-Z]{3}$/.test(t.currency)) {
      errors.push({ field: "travelRule.currency", message: "Currency must be a three-letter ISO code, such as USD." });
    }
    if (t.xrpReferenceRate === null || !finite(t.xrpReferenceRate) || t.xrpReferenceRate <= 0) {
      errors.push({
        field: "travelRule.xrpReferenceRate",
        message: "Set the XRP reference rate your books use. There is no price feed, so the rule cannot value a transfer without it.",
      });
    }
  }
  if (
    params.reserveHeadroomMinXrp !== null &&
    (!finite(params.reserveHeadroomMinXrp) || params.reserveHeadroomMinXrp < 0)
  ) {
    errors.push({ field: "reserveHeadroomMinXrp", message: "Reserve headroom must be a non-negative XRP amount." });
  }
  if (typeof params.strictFreeze !== "boolean") {
    errors.push({ field: "strictFreeze", message: "Strict freeze must be on or off." });
  }
  for (const key of ["hhi", "counterparty", "travelRule", "reserve", "freeze"] as const) {
    if (!OUTCOMES.includes(params.outcomes?.[key])) {
      errors.push({ field: `outcomes.${key}`, message: "Outcome must be REVIEW or FAIL." });
    }
  }
  return errors;
}

/* ── Facts ────────────────────────────────────────────────────────── */

export type PolicyFacts = {
  amountXrp: number;
  /** The settlement's destination, when the operator named one. */
  destination?: string;
  account: AccountInfo | null;
  /** Live reserve values from server_info. Null when they could not be read. */
  reserve: { baseXrp: number; incXrp: number; source: string } | null;
  /** Validated account history. Null when it could not be read. */
  transactions: WalletTransaction[] | null;
  /** Issued-currency positions. Null when they could not be read. */
  trustLines: TrustLine[] | null;
  /** Issuer flags for each position's issuer. Null when they could not be read. */
  postures: IssuerPosture[] | null;
};

type Unavailable = { state: "unavailable"; reason: string };
type Absent = { state: "none"; reason: string };

export type Measurements = {
  amountXrp: number;
  concentration:
    | {
        state: "ok";
        hhi: number;
        /** The counterparty the share rule looks at. */
        counterparty: string;
        counterpartyRole: "destination" | "largest";
        sharePct: number;
        parties: number;
        transfers: number;
        totalVolumeXrp: number;
        includesSettlement: boolean;
        fromLedger: number | null;
        toLedger: number | null;
      }
    | Unavailable
    | Absent;
  headroom:
    | {
        state: "ok";
        balanceXrp: number;
        ownerCount: number;
        reserveBaseXrp: number;
        reserveIncXrp: number;
        reserveXrp: number;
        headroomXrp: number;
        reserveSource: string;
      }
    | Unavailable
    | Absent;
  freeze:
    | {
        state: "ok";
        issuers: number;
        /** Issuers that have not permanently surrendered freeze. */
        capable: string[];
        /** Issuers with a freeze in effect on a held line right now. */
        active: string[];
        /** Issuers whose flags could not be read. */
        unreadable: string[];
      }
    | Unavailable
    | Absent;
};

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Everything the rules need, read from the facts only. No policy is involved. */
export function measure(facts: PolicyFacts): Measurements {
  /* Concentration over the book, pro forma for this settlement. */
  let concentration: Measurements["concentration"];
  if (facts.transactions === null) {
    concentration = { state: "unavailable", reason: "Account transaction history could not be read." };
  } else {
    const book: WalletTransaction[] = [...facts.transactions];
    const includesSettlement = Boolean(facts.destination) && facts.amountXrp > 0;
    if (includesSettlement) {
      book.push({
        hash: "PROPOSED",
        transactionType: "Payment",
        result: "PROPOSED",
        ledgerIndex: 0,
        date: "",
        timestamp: 0,
        direction: "out",
        counterparty: facts.destination!,
        amountXrp: facts.amountXrp,
        feeXrp: "0",
      });
    }
    const report = analyseConcentration(book);
    if (report.counterparties.length === 0) {
      concentration = {
        state: "none",
        reason: "No XRP transfers with a counterparty in the account's recent history.",
      };
    } else {
      const target =
        (facts.destination && report.counterparties.find((c) => c.address === facts.destination)) ||
        report.counterparties[0];
      const ledgers = facts.transactions.map((t) => t.ledgerIndex).filter((n) => n > 0);
      concentration = {
        state: "ok",
        hhi: report.hhi,
        counterparty: target.address,
        counterpartyRole: facts.destination && target.address === facts.destination ? "destination" : "largest",
        sharePct: round(target.sharePct, 2),
        parties: report.counterparties.length,
        transfers: report.counterparties.reduce((n, c) => n + c.transfers, 0),
        totalVolumeXrp: round(report.totalVolumeXrp, 6),
        includesSettlement,
        fromLedger: ledgers.length ? Math.min(...ledgers) : null,
        toLedger: ledgers.length ? Math.max(...ledgers) : null,
      };
    }
  }

  /* Reserve headroom after the settlement. */
  let headroom: Measurements["headroom"];
  if (!facts.account || facts.account.unfunded || facts.account.sequence < 1) {
    headroom = { state: "none", reason: "No activated account to measure." };
  } else if (!facts.reserve) {
    headroom = { state: "unavailable", reason: "Live reserve values could not be read from the network." };
  } else {
    const balanceXrp = Number(facts.account.balanceXrp);
    const reserveXrp = facts.reserve.baseXrp + facts.reserve.incXrp * facts.account.ownerCount;
    headroom = {
      state: "ok",
      balanceXrp,
      ownerCount: facts.account.ownerCount,
      reserveBaseXrp: facts.reserve.baseXrp,
      reserveIncXrp: facts.reserve.incXrp,
      reserveXrp: round(reserveXrp, 6),
      headroomXrp: round(balanceXrp - reserveXrp - facts.amountXrp, 6),
      reserveSource: facts.reserve.source,
    };
  }

  /* Freeze capability over issued positions held. */
  let freeze: Measurements["freeze"];
  if (facts.trustLines === null || facts.postures === null) {
    freeze = { state: "unavailable", reason: "Issued-currency positions or issuer flags could not be read." };
  } else {
    const exposures = analyseIssuers(
      facts.trustLines,
      new Map(facts.postures.map((p) => [p.address, p]))
    );
    if (exposures.length === 0) {
      freeze = { state: "none", reason: "The account holds no issued-currency balances." };
    } else {
      const unreadable = exposures.filter((e) => e.posture.unreadable).map((e) => e.issuer);
      const readable = exposures.filter((e) => !e.posture.unreadable);
      freeze = {
        state: "ok",
        issuers: exposures.length,
        capable: readable.filter((e) => !e.posture.noFreeze || e.posture.globalFreeze).map((e) => e.issuer).sort(),
        active: exposures
          .filter(
            (e) =>
              e.posture.globalFreeze ||
              facts.trustLines!.some(
                (l) => l.issuer === e.issuer && l.balance > 0 && (l.frozenByIssuer || l.deepFrozenByIssuer)
              )
          )
          .map((e) => e.issuer)
          .sort(),
        unreadable: unreadable.sort(),
      };
    }
  }

  return { amountXrp: facts.amountXrp, concentration, headroom, freeze };
}

/* ── Judgement ────────────────────────────────────────────────────── */

export type RuleState = "PASS" | "REVIEW" | "FAIL" | "NOT_APPLICABLE" | "INSUFFICIENT_DATA";

export type RuleKey = "hhi" | "counterparty" | "travelRule" | "reserve" | "freeze";

export type RuleResult = {
  key: RuleKey;
  /** Check id carried into the receipt. */
  id: string;
  label: string;
  state: RuleState;
  /** FACT — what was measured. Null when nothing could be. */
  observed: string | null;
  /** POLICY — what was configured. */
  configured: string;
  /** Observed minus configured, where both are numbers. */
  delta: string | null;
  /** RESULT — one sentence on why this state. */
  reason: string;
  /** How the observed value was calculated, from which data. */
  calculation: string;
};

export const RULE_IDS: Record<RuleKey, string> = {
  hhi: "POLICY_HHI_LIMIT",
  counterparty: "POLICY_COUNTERPARTY_SHARE",
  travelRule: "POLICY_TRAVEL_RULE",
  reserve: "POLICY_RESERVE_HEADROOM",
  freeze: "POLICY_STRICT_FREEZE",
};

const LABELS: Record<RuleKey, string> = {
  hhi: "HHI limit",
  counterparty: "Counterparty share",
  travelRule: "Travel Rule threshold",
  reserve: "Reserve headroom",
  freeze: "Strict freeze",
};

const fmt = (n: number, dp = 2) => n.toLocaleString("en-US", { maximumFractionDigits: dp });
const signed = (n: number, dp = 2, unit = "") => `${n > 0 ? "+" : ""}${fmt(n, dp)}${unit}`;
const triggered = (outcome: RuleOutcome): RuleState => (outcome === "fail" ? "FAIL" : "REVIEW");

function base(key: RuleKey): Pick<RuleResult, "key" | "id" | "label"> {
  return { key, id: RULE_IDS[key], label: LABELS[key] };
}

/** Apply a policy to measured facts. Pure. */
export function judge(m: Measurements, params: PolicyParams): RuleResult[] {
  const results: RuleResult[] = [];
  const c = m.concentration;

  /* HHI */
  if (params.hhiLimit === null) {
    results.push({ ...base("hhi"), state: "NOT_APPLICABLE", observed: c.state === "ok" ? fmt(c.hhi, 0) : null, configured: "not configured", delta: null, reason: "This policy sets no HHI limit.", calculation: concentrationCalc(c) });
  } else if (c.state !== "ok") {
    results.push({ ...base("hhi"), state: c.state === "unavailable" ? "INSUFFICIENT_DATA" : "NOT_APPLICABLE", observed: null, configured: fmt(params.hhiLimit, 0), delta: null, reason: c.reason, calculation: concentrationCalc(c) });
  } else {
    const over = c.hhi > params.hhiLimit;
    results.push({
      ...base("hhi"),
      state: over ? triggered(params.outcomes.hhi) : "PASS",
      observed: fmt(c.hhi, 0),
      configured: fmt(params.hhiLimit, 0),
      delta: signed(c.hhi - params.hhiLimit, 0),
      reason: over
        ? `Observed HHI ${fmt(c.hhi, 0)} is above the configured limit of ${fmt(params.hhiLimit, 0)}.`
        : `Observed HHI ${fmt(c.hhi, 0)} is within the configured limit of ${fmt(params.hhiLimit, 0)}.`,
      calculation: concentrationCalc(c),
    });
  }

  /* Counterparty share */
  if (params.counterpartyShareLimitPct === null) {
    results.push({ ...base("counterparty"), state: "NOT_APPLICABLE", observed: c.state === "ok" ? `${fmt(c.sharePct)}%` : null, configured: "not configured", delta: null, reason: "This policy sets no counterparty share limit.", calculation: concentrationCalc(c) });
  } else if (c.state !== "ok") {
    results.push({ ...base("counterparty"), state: c.state === "unavailable" ? "INSUFFICIENT_DATA" : "NOT_APPLICABLE", observed: null, configured: `${fmt(params.counterpartyShareLimitPct)}%`, delta: null, reason: c.reason, calculation: concentrationCalc(c) });
  } else {
    const over = c.sharePct > params.counterpartyShareLimitPct;
    const who = c.counterpartyRole === "destination" ? "The destination" : "The largest counterparty";
    results.push({
      ...base("counterparty"),
      state: over ? triggered(params.outcomes.counterparty) : "PASS",
      observed: `${fmt(c.sharePct)}%`,
      configured: `${fmt(params.counterpartyShareLimitPct)}%`,
      delta: `${signed(c.sharePct - params.counterpartyShareLimitPct)} pts`,
      reason: `${who} (${c.counterparty}) carries ${fmt(c.sharePct)}% of transferred volume, ${over ? "above" : "within"} the configured maximum of ${fmt(params.counterpartyShareLimitPct)}%.`,
      calculation: concentrationCalc(c),
    });
  }

  /* Travel Rule */
  const t = params.travelRule;
  if (t === null) {
    results.push({ ...base("travelRule"), state: "NOT_APPLICABLE", observed: `${fmt(m.amountXrp, 6)} XRP`, configured: "not configured", delta: null, reason: "This policy sets no Travel Rule threshold.", calculation: "Not evaluated." });
  } else if (t.xrpReferenceRate === null || !(t.xrpReferenceRate > 0)) {
    results.push({ ...base("travelRule"), state: "INSUFFICIENT_DATA", observed: `${fmt(m.amountXrp, 6)} XRP`, configured: `${fmt(t.thresholdFiat)} ${t.currency}`, delta: null, reason: "No XRP reference rate is configured, so the transfer cannot be valued.", calculation: "Not evaluated." });
  } else if (!(m.amountXrp > 0)) {
    results.push({ ...base("travelRule"), state: "NOT_APPLICABLE", observed: "0 XRP", configured: `${fmt(t.thresholdFiat)} ${t.currency}`, delta: null, reason: "No value is being transferred.", calculation: "Not evaluated." });
  } else {
    const fiat = round(m.amountXrp * t.xrpReferenceRate, 2);
    const inScope = fiat >= t.thresholdFiat;
    results.push({
      ...base("travelRule"),
      state: inScope ? triggered(params.outcomes.travelRule) : "PASS",
      observed: `${fmt(fiat)} ${t.currency}`,
      configured: `${fmt(t.thresholdFiat)} ${t.currency}`,
      delta: `${signed(fiat - t.thresholdFiat)} ${t.currency}`,
      reason: inScope
        ? "Travel Rule review triggered according to configured institutional policy. This is not a determination that a legal obligation applies."
        : "Transfer value is below the configured institutional Travel Rule threshold.",
      calculation: `${fmt(m.amountXrp, 6)} XRP × ${fmt(t.xrpReferenceRate, 6)} ${t.currency}/XRP (operator-configured reference rate; no price feed) = ${fmt(fiat)} ${t.currency}. In scope at or above the threshold.`,
    });
  }

  /* Reserve headroom */
  const h = m.headroom;
  if (params.reserveHeadroomMinXrp === null) {
    results.push({ ...base("reserve"), state: "NOT_APPLICABLE", observed: h.state === "ok" ? `${fmt(h.headroomXrp, 6)} XRP` : null, configured: "not configured", delta: null, reason: "This policy sets no reserve headroom minimum.", calculation: headroomCalc(h) });
  } else if (h.state !== "ok") {
    results.push({ ...base("reserve"), state: h.state === "unavailable" ? "INSUFFICIENT_DATA" : "NOT_APPLICABLE", observed: null, configured: `${fmt(params.reserveHeadroomMinXrp, 6)} XRP`, delta: null, reason: h.reason, calculation: headroomCalc(h) });
  } else {
    const below = h.headroomXrp < params.reserveHeadroomMinXrp;
    results.push({
      ...base("reserve"),
      state: below ? triggered(params.outcomes.reserve) : "PASS",
      observed: `${fmt(h.headroomXrp, 6)} XRP`,
      configured: `${fmt(params.reserveHeadroomMinXrp, 6)} XRP`,
      delta: `${signed(h.headroomXrp - params.reserveHeadroomMinXrp, 6)} XRP`,
      reason: below
        ? `After this settlement ${fmt(h.headroomXrp, 6)} XRP would remain above the reserve, below the configured minimum of ${fmt(params.reserveHeadroomMinXrp, 6)} XRP.`
        : `After this settlement ${fmt(h.headroomXrp, 6)} XRP would remain above the reserve, meeting the configured minimum.`,
      calculation: headroomCalc(h),
    });
  }

  /* Strict freeze */
  const f = m.freeze;
  const factLine =
    f.state === "ok"
      ? `${f.capable.length} of ${f.issuers} issuer${f.issuers === 1 ? "" : "s"} can freeze a held balance${f.active.length ? `; ${f.active.length} with a freeze in effect now` : ""}${f.unreadable.length ? `; ${f.unreadable.length} unreadable` : ""}`
      : null;
  if (!params.strictFreeze) {
    results.push({
      ...base("freeze"),
      state: "NOT_APPLICABLE",
      observed: factLine,
      configured: "disabled",
      delta: null,
      reason:
        f.state === "ok" && f.capable.length
          ? "Freeze capability detected. Strict freeze is disabled in this policy, so it has no verdict impact."
          : "Strict freeze is disabled in this policy.",
      calculation: freezeCalc(f),
    });
  } else if (f.state === "unavailable") {
    results.push({ ...base("freeze"), state: "INSUFFICIENT_DATA", observed: null, configured: "enabled", delta: null, reason: f.reason, calculation: freezeCalc(f) });
  } else if (f.state === "none") {
    results.push({ ...base("freeze"), state: "NOT_APPLICABLE", observed: null, configured: "enabled", delta: null, reason: f.reason, calculation: freezeCalc(f) });
  } else if (f.capable.length > 0) {
    results.push({
      ...base("freeze"),
      state: triggered(params.outcomes.freeze),
      observed: factLine,
      configured: "enabled",
      delta: null,
      reason: `Issuer freeze capability detected on ${f.capable.length} held position${f.capable.length === 1 ? "" : "s"}, and strict freeze is enabled.`,
      calculation: freezeCalc(f),
    });
  } else if (f.unreadable.length > 0) {
    results.push({ ...base("freeze"), state: "INSUFFICIENT_DATA", observed: factLine, configured: "enabled", delta: null, reason: "Some issuers' flags could not be read, so freeze capability cannot be ruled out.", calculation: freezeCalc(f) });
  } else {
    results.push({ ...base("freeze"), state: "PASS", observed: factLine, configured: "enabled", delta: null, reason: "Every issuer of a held balance has permanently surrendered freeze.", calculation: freezeCalc(f) });
  }

  return results;
}

function concentrationCalc(c: Measurements["concentration"]): string {
  if (c.state !== "ok") return c.reason;
  const window =
    c.fromLedger !== null ? ` in validated ledgers ${c.fromLedger.toLocaleString("en-US")}–${c.toLedger!.toLocaleString("en-US")}` : "";
  return `Herfindahl-Hirschman Index = Σ (each counterparty's % of XRP volume)² over ${c.parties} counterparties and ${c.transfers} transfers totalling ${fmt(c.totalVolumeXrp, 6)} XRP${window}${c.includesSettlement ? ", including this settlement" : ""}.`;
}

function headroomCalc(h: Measurements["headroom"]): string {
  if (h.state !== "ok") return h.reason;
  return `${fmt(h.balanceXrp, 6)} XRP balance − reserve (${fmt(h.reserveBaseXrp, 6)} base + ${fmt(h.reserveIncXrp, 6)} × ${h.ownerCount} owned objects = ${fmt(h.reserveXrp, 6)} XRP) − this settlement = ${fmt(h.headroomXrp, 6)} XRP. Reserve values from ${h.reserveSource}.`;
}

function freezeCalc(f: Measurements["freeze"]): string {
  if (f.state !== "ok") return f.reason;
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none");
  return `Issuer account flags read for every issuer of a held balance. Can freeze (no lsfNoFreeze, or global freeze set): ${list(f.capable)}. Freeze in effect: ${list(f.active)}. Unreadable: ${list(f.unreadable)}.`;
}

/**
 * The results as engine checks, so the verdict is decided by the same
 * rule as every other check (verdictForChecks):
 *   FAIL → blocking failure · REVIEW → advisory failure
 *   INSUFFICIENT_DATA → an EVIDENCE_ check · PASS → passing check
 *   NOT_APPLICABLE → no check (it did not take part in the decision)
 */
export function toChecks(results: RuleResult[], params: PolicyParams): PolicyCheck[] {
  const checks: PolicyCheck[] = [];
  for (const r of results) {
    const outcome = params.outcomes[r.key];
    if (r.state === "NOT_APPLICABLE") continue;
    if (r.state === "INSUFFICIENT_DATA") {
      checks.push({ id: `EVIDENCE_${r.id}`, label: `${r.label}: evidence available`, severity: "warn", passed: false, detail: r.reason });
      continue;
    }
    checks.push({
      id: r.id,
      label: r.label,
      severity: r.state === "FAIL" || (r.state === "PASS" && outcome === "fail") ? "block" : "warn",
      passed: r.state === "PASS",
      detail: r.reason,
    });
  }
  return checks;
}

/* ── Diff ─────────────────────────────────────────────────────────── */

export type ParamChange = { field: string; label: string; from: string; to: string };

export function describeParams(p: PolicyParams): Array<{ field: string; label: string; value: string }> {
  const oc = (o: RuleOutcome) => (o === "fail" ? "FAIL" : "REVIEW");
  return [
    { field: "hhiLimit", label: "HHI limit", value: p.hhiLimit === null ? "off" : fmt(p.hhiLimit, 0) },
    { field: "outcomes.hhi", label: "HHI outcome", value: oc(p.outcomes.hhi) },
    { field: "counterpartyShareLimitPct", label: "Counterparty share", value: p.counterpartyShareLimitPct === null ? "off" : `${fmt(p.counterpartyShareLimitPct)}%` },
    { field: "outcomes.counterparty", label: "Counterparty outcome", value: oc(p.outcomes.counterparty) },
    { field: "travelRule.thresholdFiat", label: "Travel Rule threshold", value: p.travelRule === null ? "off" : `${fmt(p.travelRule.thresholdFiat)} ${p.travelRule.currency}` },
    { field: "travelRule.xrpReferenceRate", label: "XRP reference rate", value: p.travelRule?.xrpReferenceRate ? `${fmt(p.travelRule.xrpReferenceRate, 6)} ${p.travelRule.currency}` : p.travelRule ? "not set" : "—" },
    { field: "outcomes.travelRule", label: "Travel Rule outcome", value: oc(p.outcomes.travelRule) },
    { field: "reserveHeadroomMinXrp", label: "Reserve headroom", value: p.reserveHeadroomMinXrp === null ? "off" : `${fmt(p.reserveHeadroomMinXrp, 6)} XRP` },
    { field: "outcomes.reserve", label: "Reserve outcome", value: oc(p.outcomes.reserve) },
    { field: "strictFreeze", label: "Strict freeze", value: p.strictFreeze ? "ON" : "OFF" },
    { field: "outcomes.freeze", label: "Freeze outcome", value: oc(p.outcomes.freeze) },
  ];
}

export function diffParams(from: PolicyParams, to: PolicyParams): ParamChange[] {
  const a = describeParams(from);
  const b = describeParams(to);
  return a
    .map((row, i) => ({ field: row.field, label: row.label, from: row.value, to: b[i].value }))
    .filter((c) => c.from !== c.to);
}
