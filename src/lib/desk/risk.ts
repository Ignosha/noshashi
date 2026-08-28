import type { IssuerPosture, TrustLine, WalletTransaction } from "@/lib/xrpl/types";

/**
 * Institutional risk analysis.
 *
 * Three exposures that regulated holders on the XRP Ledger carry today
 * and that no console surfaces:
 *
 *   1. Issuer freeze rights — an issued balance is only an asset if the
 *      issuer cannot unilaterally immobilise it. XRPL exposes this in
 *      account flags that nothing reads.
 *   2. Travel Rule reach — FATF Recommendation 16 obliges a VASP to
 *      transmit originator and beneficiary data above a threshold. On
 *      XRPL there is no standard carrier, so the first question is
 *      simply: which transfers are in scope?
 *   3. Counterparty concentration — screening stops at the direct
 *      counterparty, so nobody measures how much of a book sits against
 *      a single unattested address.
 *
 * Everything here is derived from validated ledger state. Nothing is
 * estimated, and where a number depends on an input the operator must
 * supply — a fiat rate, a threshold — that dependency is explicit.
 */

export type Severity = "critical" | "warn" | "info" | "ok";

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** What to actually do about it. */
  action?: string;
};

/* ── 1 · Issuer and freeze risk ──────────────────────────────────── */

export type IssuerExposure = {
  issuer: string;
  domain?: string;
  currencies: string[];
  /** Total balance held across this issuer's currencies. */
  balance: number;
  posture: IssuerPosture;
  severity: Severity;
  headline: string;
};

export function analyseIssuers(
  lines: TrustLine[],
  postures: Map<string, IssuerPosture>
): IssuerExposure[] {
  const byIssuer = new Map<string, TrustLine[]>();
  for (const line of lines) {
    if (line.balance <= 0) continue; // a zero line carries no exposure
    const bucket = byIssuer.get(line.issuer) ?? [];
    bucket.push(line);
    byIssuer.set(line.issuer, bucket);
  }

  const exposures: IssuerExposure[] = [];
  for (const [issuer, issuerLines] of byIssuer) {
    const posture =
      postures.get(issuer) ??
      ({
        address: issuer,
        noFreeze: false,
        globalFreeze: false,
        requireAuth: false,
        masterDisabled: false,
        transferRateBps: 0,
        unreadable: "Not read",
      } satisfies IssuerPosture);

    const balance = issuerLines.reduce((sum, line) => sum + line.balance, 0);
    const frozenHere = issuerLines.some((line) => line.frozenByIssuer);
    /*
     * XLS-77 deep freeze is a separate flag and a strictly worse position:
     * an ordinary freeze stops the holder sending, a deep freeze stops them
     * receiving as well. This module read only `frozenByIssuer`, so a line
     * the issuer had deep-frozen without an ordinary freeze was reported as
     * "issuer retains the right to freeze" at severity info — a present,
     * total immobilisation described as a future possibility.
     *
     * The free public check already read both flags. The paid exposure
     * analysis did not, which was exactly the wrong way round.
     */
    const deepFrozenHere = issuerLines.some((line) => line.deepFrozenByIssuer === true);

    let severity: Severity = "info";
    let headline = "Issuer retains the right to freeze this balance.";

    if (posture.globalFreeze) {
      severity = "critical";
      headline = "Global freeze is ACTIVE — every balance from this issuer is immobilised now.";
    } else if (deepFrozenHere) {
      severity = "critical";
      headline =
        "This issuer has DEEP-frozen your line. The balance can neither be sent nor added to.";
    } else if (frozenHere) {
      severity = "critical";
      headline = "This issuer has frozen your line specifically. The balance cannot move.";
    } else if (posture.noFreeze) {
      severity = "ok";
      headline = "Issuer has permanently surrendered freeze. This balance cannot be immobilised.";
    } else if (posture.requireAuth) {
      severity = "warn";
      headline = "Issuer requires per-holder authorisation and can still freeze.";
    } else if (posture.unreadable) {
      severity = "warn";
      headline = "Issuer account could not be read; freeze posture is unknown.";
    }

    exposures.push({
      issuer,
      domain: posture.domain,
      currencies: [...new Set(issuerLines.map((line) => line.currency))],
      balance,
      posture,
      severity,
      headline,
    });
  }

  const rank: Record<Severity, number> = { critical: 0, warn: 1, info: 2, ok: 3 };
  return exposures.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.balance - a.balance
  );
}

export function issuerFindings(exposures: IssuerExposure[]): Finding[] {
  const findings: Finding[] = [];
  const frozen = exposures.filter((e) => e.severity === "critical");
  const freezable = exposures.filter(
    (e) => e.severity !== "ok" && !e.posture.noFreeze && !e.posture.globalFreeze
  );
  const fees = exposures.filter((e) => e.posture.transferRateBps > 0);

  if (frozen.length > 0) {
    findings.push({
      id: "frozen",
      severity: "critical",
      title: `${frozen.length} position${frozen.length === 1 ? "" : "s"} immobilised`,
      detail:
        "An issuer has frozen these balances. They cannot be transferred or redeemed until the issuer lifts it, and marking them as liquid would misstate the book.",
      action: "Treat as unavailable in liquidity reporting and contact the issuer.",
    });
  }

  if (freezable.length > 0) {
    const total = freezable.reduce((sum, e) => sum + e.balance, 0);
    findings.push({
      id: "freezable",
      severity: "warn",
      title: `${freezable.length} issuer${freezable.length === 1 ? "" : "s"} retain freeze rights`,
      detail: `${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} units are held with issuers that have not set the No-Freeze flag. Any of it can be immobilised unilaterally, without notice.`,
      action: "Prefer issuers that have permanently surrendered freeze for treasury positions.",
    });
  }

  if (fees.length > 0) {
    findings.push({
      id: "transfer-fee",
      severity: "info",
      title: `${fees.length} issuer${fees.length === 1 ? "" : "s"} charge a transfer fee`,
      detail: fees
        .map((e) => `${e.currencies.join("/")}: ${(e.posture.transferRateBps / 100).toFixed(2)}%`)
        .join(" · "),
      action: "Model the fee into redemption cost; it applies on every hop.",
    });
  }

  if (findings.length === 0 && exposures.length > 0) {
    findings.push({
      id: "clean",
      severity: "ok",
      title: "No freeze exposure detected",
      detail: "Every issued position is held with an issuer that cannot immobilise it.",
    });
  }

  return findings;
}

/* ── 2 · Travel Rule (FATF Recommendation 16) ────────────────────── */

export type TravelRuleConfig = {
  /** Fiat threshold above which originator/beneficiary data is required. */
  thresholdFiat: number;
  currency: string;
  /** Operator-supplied reference rate. There is no price feed here. */
  xrpRate: number;
};

export const TRAVEL_RULE_PRESETS = [
  { label: "FATF / EU", thresholdFiat: 1000, currency: "EUR" },
  { label: "United States", thresholdFiat: 3000, currency: "USD" },
  { label: "Singapore", thresholdFiat: 1500, currency: "SGD" },
  { label: "Switzerland", thresholdFiat: 1000, currency: "CHF" },
] as const;

export type TravelRuleHit = {
  hash: string;
  date: string;
  direction: WalletTransaction["direction"];
  counterparty: string;
  amountXrp: number;
  amountFiat: number;
  /** True when we hold no identifying data for the counterparty. */
  counterpartyUnknown: boolean;
};

export type TravelRuleReport = {
  threshold: TravelRuleConfig;
  thresholdXrp: number;
  inScope: TravelRuleHit[];
  totalConsidered: number;
  unresolved: number;
};

export function analyseTravelRule(
  transactions: WalletTransaction[],
  config: TravelRuleConfig,
  knownCounterparties: Set<string> = new Set()
): TravelRuleReport {
  const thresholdXrp = config.xrpRate > 0 ? config.thresholdFiat / config.xrpRate : Infinity;

  const inScope: TravelRuleHit[] = [];
  let considered = 0;

  for (const entry of transactions) {
    if (entry.amountXrp === undefined || entry.amountXrp <= 0) continue;
    // Only value transfers between parties are in scope.
    if (entry.direction === "cross") continue;
    considered += 1;
    if (entry.amountXrp < thresholdXrp) continue;

    inScope.push({
      hash: entry.hash,
      date: entry.date,
      direction: entry.direction,
      counterparty: entry.counterparty,
      amountXrp: entry.amountXrp,
      amountFiat: entry.amountXrp * config.xrpRate,
      counterpartyUnknown: !knownCounterparties.has(entry.counterparty),
    });
  }

  inScope.sort((a, b) => b.amountXrp - a.amountXrp);

  return {
    threshold: config,
    thresholdXrp,
    inScope,
    totalConsidered: considered,
    unresolved: inScope.filter((hit) => hit.counterpartyUnknown).length,
  };
}

/* ── 3 · Counterparty concentration ──────────────────────────────── */

export type Counterparty = {
  address: string;
  transfers: number;
  volumeXrp: number;
  /** Share of total transferred volume, 0–100. */
  sharePct: number;
  inbound: number;
  outbound: number;
};

export type ConcentrationReport = {
  counterparties: Counterparty[];
  totalVolumeXrp: number;
  /** Share held by the single largest counterparty. */
  topSharePct: number;
  /** Herfindahl-Hirschman Index, 0–10,000. Above 2,500 is concentrated. */
  hhi: number;
};

export function analyseConcentration(
  transactions: WalletTransaction[]
): ConcentrationReport {
  const byParty = new Map<string, Counterparty>();
  let total = 0;

  for (const entry of transactions) {
    const amount = entry.amountXrp ?? 0;
    if (amount <= 0 || !entry.counterparty || entry.counterparty === "—") continue;

    total += amount;
    const existing = byParty.get(entry.counterparty) ?? {
      address: entry.counterparty,
      transfers: 0,
      volumeXrp: 0,
      sharePct: 0,
      inbound: 0,
      outbound: 0,
    };
    existing.transfers += 1;
    existing.volumeXrp += amount;
    if (entry.direction === "in") existing.inbound += amount;
    if (entry.direction === "out") existing.outbound += amount;
    byParty.set(entry.counterparty, existing);
  }

  const counterparties = [...byParty.values()];
  for (const party of counterparties) {
    party.sharePct = total > 0 ? (party.volumeXrp / total) * 100 : 0;
  }
  counterparties.sort((a, b) => b.volumeXrp - a.volumeXrp);

  // HHI is the standard regulatory measure of concentration.
  const hhi = counterparties.reduce(
    (sum, party) => sum + party.sharePct * party.sharePct,
    0
  );

  return {
    counterparties,
    totalVolumeXrp: total,
    topSharePct: counterparties[0]?.sharePct ?? 0,
    hhi: Math.round(hhi),
  };
}

export function concentrationFindings(report: ConcentrationReport): Finding[] {
  if (report.counterparties.length === 0) return [];
  const findings: Finding[] = [];

  if (report.hhi > 2500) {
    findings.push({
      id: "hhi",
      severity: report.hhi > 5000 ? "critical" : "warn",
      title: `Concentrated counterparty book (HHI ${report.hhi.toLocaleString()})`,
      detail: `Above 2,500 is treated as concentrated under standard competition analysis; above 5,000 is highly concentrated. The largest single counterparty carries ${report.topSharePct.toFixed(1)}% of transferred volume.`,
      action: "Diversify settlement counterparties or document the concentration as accepted risk.",
    });
  }

  const dominant = report.counterparties.filter((party) => party.sharePct >= 25);
  if (dominant.length > 0) {
    findings.push({
      id: "dominant",
      severity: "warn",
      title: `${dominant.length} counterparty at or above 25% of volume`,
      detail:
        "A counterparty failure, freeze or sanctions designation at this share would be a material event for the book rather than an inconvenience.",
      action: "Confirm each dominant counterparty is attested and screened.",
    });
  }

  return findings;
}
