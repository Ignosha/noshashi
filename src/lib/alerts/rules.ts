/**
 * Custom alert logic — the organization's own triggers over measured facts.
 *
 * A rule is one or more conditions over the figures a scheduled stress run
 * measures for a wallet (./../desk/scheduledStress.ts), joined by ALL or
 * ANY, scoped to every wallet in the book or to named ones, and sent to
 * the destinations the rule names: the console, the desktop, and the
 * organization's webhooks (as the signed event "custom_alert").
 *
 * The facts are the same numbers the Risk screen shows, so a rule can
 * always be checked by opening that screen. A rule never measures anything
 * itself; it only states, in the organization's own terms, which readings
 * matter to it.
 *
 * Everything here is pure: the runner feeds it snapshots and a clock.
 */

export type Metric =
  | "recovery_ratio"
  | "freezable_share"
  | "days_to_exit"
  | "trapped_xrp"
  | "mark_xrp"
  | "frozen_positions"
  | "freezable_positions";

export type Op = "<" | "<=" | ">" | ">=";
export type Destination = "console" | "desktop" | "webhook";

export type Condition = { metric: Metric; op: Op; threshold: number };

export type AlertRule = {
  id: string;
  name: string;
  conditions: Condition[];
  /** ALL conditions must hold, or ANY one of them. */
  match: "all" | "any";
  /** Every wallet in the book, or the listed addresses only. */
  scope: "all" | string[];
  destinations: Destination[];
  enabled: boolean;
  /** Hours before the same rule fires again for the same wallet while it still holds. */
  cooldownHours: number;
};

/** The figures a rule can test, as measured for one wallet by one stress run. */
export type MetricFacts = Record<Metric, number>;

export const METRICS: Array<{ id: Metric; label: string; unit: "ratio" | "days" | "xrp" | "count"; help: string }> = [
  { id: "recovery_ratio", label: "Recovery ratio", unit: "ratio", help: "What the book would realise if sold now, as a share of its mark." },
  { id: "freezable_share", label: "Freezable share", unit: "ratio", help: "Share of the mark held with issuers who can freeze it." },
  { id: "days_to_exit", label: "Days to exit", unit: "days", help: "Longest time to sell a position at the daily participation cap." },
  { id: "trapped_xrp", label: "Trapped value", unit: "xrp", help: "XRP value with no bid at any acceptable price." },
  { id: "mark_xrp", label: "Mark value", unit: "xrp", help: "The book valued at mid, before any exit cost." },
  { id: "frozen_positions", label: "Frozen positions", unit: "count", help: "Positions an issuer has already frozen." },
  { id: "freezable_positions", label: "Freezable positions", unit: "count", help: "Positions whose issuer keeps the right to freeze." },
];

const METRIC_IDS = new Set<string>(METRICS.map((m) => m.id));
const OPS = new Set<string>(["<", "<=", ">", ">="]);
const DESTINATIONS = new Set<string>(["console", "desktop", "webhook"]);

export const OP_WORDS: Record<Op, string> = { "<": "below", "<=": "at or below", ">": "above", ">=": "at or above" };

export function formatMetric(metric: Metric, value: number): string {
  const unit = METRICS.find((m) => m.id === metric)?.unit;
  if (!Number.isFinite(value)) return "—";
  if (unit === "ratio") return `${(value * 100).toFixed(1)}%`;
  if (unit === "days") return `${value.toFixed(1)} days`;
  if (unit === "xrp") return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} XRP`;
  return String(Math.round(value));
}

/** "Recovery ratio below 60.0% and freezable share above 25.0%". */
export function describeRule(rule: Pick<AlertRule, "conditions" | "match">): string {
  const parts = rule.conditions.map((c) => {
    const label = METRICS.find((m) => m.id === c.metric)?.label ?? c.metric;
    return `${label.toLowerCase()} ${OP_WORDS[c.op]} ${formatMetric(c.metric, c.threshold)}`;
  });
  const text = parts.join(rule.match === "all" ? " and " : " or ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function holds(condition: Condition, facts: MetricFacts): boolean {
  const value = facts[condition.metric];
  if (!Number.isFinite(value)) return false; // an unmeasured figure never triggers anything
  switch (condition.op) {
    case "<": return value < condition.threshold;
    case "<=": return value <= condition.threshold;
    case ">": return value > condition.threshold;
    case ">=": return value >= condition.threshold;
  }
}

export function evaluate(rule: AlertRule, facts: MetricFacts): boolean {
  if (rule.conditions.length === 0) return false;
  return rule.match === "all" ? rule.conditions.every((c) => holds(c, facts)) : rule.conditions.some((c) => holds(c, facts));
}

export const inScope = (rule: AlertRule, address: string) => rule.scope === "all" || rule.scope.includes(address);

export type Firing = {
  ruleId: string;
  ruleName: string;
  address: string;
  label?: string;
  description: string;
  /** The measured value of every condition, for the message and the audit record. */
  values: Array<{ metric: Metric; value: number; threshold: number; op: Op }>;
  destinations: Destination[];
  at: number;
};

export const firingKey = (ruleId: string, address: string) => `${ruleId}|${address}`;

/**
 * The rules that fire for these wallets now. A rule that held at its last
 * firing stays quiet until its cooldown passes; once it stops holding, the
 * next time it holds it fires at once.
 */
export function dueFirings(
  rules: AlertRule[],
  wallets: Array<{ address: string; label?: string; facts: MetricFacts }>,
  lastFired: Record<string, number>,
  now: number
): { firings: Firing[]; lastFired: Record<string, number> } {
  const next: Record<string, number> = { ...lastFired };
  const firings: Firing[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const wallet of wallets) {
      if (!inScope(rule, wallet.address)) continue;
      const key = firingKey(rule.id, wallet.address);
      if (!evaluate(rule, wallet.facts)) {
        delete next[key]; // cleared: the next breach is news again
        continue;
      }
      const previous = lastFired[key];
      if (previous !== undefined && now - previous < rule.cooldownHours * 3_600_000) continue;
      next[key] = now;
      firings.push({
        ruleId: rule.id,
        ruleName: rule.name,
        address: wallet.address,
        label: wallet.label,
        description: describeRule(rule),
        values: rule.conditions.map((c) => ({ metric: c.metric, value: wallet.facts[c.metric], threshold: c.threshold, op: c.op })),
        destinations: rule.destinations,
        at: now,
      });
    }
  }
  return { firings, lastFired: next };
}

/** A stored rule list, cleaned: anything malformed is dropped rather than half-applied. */
export function sanitizeRules(raw: unknown): AlertRule[] {
  if (!Array.isArray(raw)) return [];
  const out: AlertRule[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    if (typeof x.id !== "string" || typeof x.name !== "string" || !x.name.trim()) continue;
    const conditions = Array.isArray(x.conditions)
      ? (x.conditions as unknown[]).flatMap((c): Condition[] => {
          const y = c as Record<string, unknown> | null;
          if (!y || !METRIC_IDS.has(String(y.metric)) || !OPS.has(String(y.op)) || typeof y.threshold !== "number" || !Number.isFinite(y.threshold)) return [];
          return [{ metric: y.metric as Metric, op: y.op as Op, threshold: y.threshold }];
        })
      : [];
    if (conditions.length === 0) continue;
    const scope = x.scope === "all" ? "all" : Array.isArray(x.scope) ? (x.scope as unknown[]).filter((a): a is string => typeof a === "string") : "all";
    const destinations = Array.isArray(x.destinations)
      ? (x.destinations as unknown[]).filter((d): d is Destination => typeof d === "string" && DESTINATIONS.has(d))
      : [];
    out.push({
      id: x.id,
      name: x.name.trim().slice(0, 80),
      conditions: conditions.slice(0, 6),
      match: x.match === "any" ? "any" : "all",
      scope: Array.isArray(scope) && scope.length === 0 ? "all" : scope,
      destinations: destinations.length ? [...new Set(destinations)] : ["console"],
      enabled: x.enabled !== false,
      cooldownHours: typeof x.cooldownHours === "number" && x.cooldownHours >= 0 && x.cooldownHours <= 720 ? x.cooldownHours : 24,
    });
  }
  return out;
}
