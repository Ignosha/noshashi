import { verdictForChecks, type PolicyCheck } from "@/lib/policy";
import { judge, toChecks, type PolicyParams, type RuleKey, type RuleState } from "@/lib/desk/institutional";
import type { Status } from "@/lib/xrpl/types";
import type { LedgerEntry } from "@/lib/desk/ledger";

/**
 * Policy simulation: what would the verdicts already on the ledger have
 * been under a different policy?
 *
 * It works only from what each entry recorded — the result of every
 * rule, the amount and, where measured, the HHI — and re-decides with
 * the engine's own verdict rule (verdictForChecks). A change is only
 * offered when the recorded facts are enough to answer it:
 *
 *   - Severity: whether a rule blocks, advises or is switched off.
 *     A rule's pass/fail does not depend on its severity, so every
 *     entry with a check list can be re-decided exactly.
 *   - Transfer ceiling per domain: the rule compares the recorded
 *     amount to the ceiling, so it can be re-run exactly.
 *   - An institutional policy (simulatePolicy below): its rules are
 *     applied to the facts each verdict recorded.
 *
 * Nothing here writes to the ledger or touches a receipt.
 */

export type Severity = "block" | "warn" | "off";

export type Scenario = {
  /** Per rule id. Absent means as recorded. */
  severity: Record<string, Severity>;
  /** Per domain id, in XRP; 0 closes the domain. Absent means as recorded. */
  ceilings: Record<string, number>;
};

export const EMPTY_SCENARIO: Scenario = { severity: {}, ceilings: {} };

export type SimResult =
  | { entry: LedgerEntry; state: "skipped"; reason: string }
  | {
      entry: LedgerEntry;
      state: "evaluated";
      before: Status;
      after: Status;
      checks: PolicyCheck[];
      /** Rules whose effect on the outcome differs between the two policies. */
      drivers: string[];
    };

function failing(checks: PolicyCheck[]): Set<string> {
  return new Set(checks.filter((c) => !c.passed).map((c) => `${c.id}:${c.severity}`));
}

export function simulateEntry(entry: LedgerEntry, scenario: Scenario): SimResult {
  if (!entry.checks || !entry.domainId) {
    return {
      entry,
      state: "skipped",
      reason: "Recorded before the check list was stored with each verdict.",
    };
  }

  let checks: PolicyCheck[] = entry.checks.map((c) => ({ ...c }));

  const ceiling = scenario.ceilings[entry.domainId];
  if (ceiling !== undefined) {
    const rule: PolicyCheck =
      ceiling > 0
        ? {
            id: "TRANSFER_CEILING",
            label: "Within domain transfer ceiling",
            severity: "block",
            passed: entry.amountXrp <= ceiling,
            detail: `Simulated cap of ${ceiling.toLocaleString()} XRP against a ${entry.amountXrp.toLocaleString()} XRP settlement.`,
          }
        : {
            id: "TRANSFER_CEILING",
            label: "Domain accepts settlements",
            severity: "block",
            passed: false,
            detail: "Simulated with settlement closed.",
          };
    const at = checks.findIndex((c) => c.id === "TRANSFER_CEILING");
    if (at >= 0) checks[at] = rule;
    else checks.push(rule);
  }

  checks = checks.flatMap((c) => {
    const set = scenario.severity[c.id];
    if (set === "off") return [];
    return set ? [{ ...c, severity: set }] : [c];
  });

  const before = failing(entry.checks);
  const after = failing(checks);
  const drivers = [
    ...new Set(
      [...before, ...after]
        .filter((key) => before.has(key) !== after.has(key))
        .map((key) => key.split(":")[0])
    ),
  ];

  return {
    entry,
    state: "evaluated",
    before: entry.verdict,
    after: verdictForChecks(checks),
    checks,
    drivers,
  };
}

export type SimSummary = {
  evaluated: number;
  skipped: number;
  changed: number;
  before: Record<Status, number>;
  after: Record<Status, number>;
  /** "from>to" → count, changed entries only. */
  transitions: Record<string, number>;
};

const zero = (): Record<Status, number> => ({ go: 0, hold: 0, "no-go": 0, "insufficient-data": 0 } as Record<Status, number>);

export function simulate(entries: LedgerEntry[], scenario: Scenario) {
  const results = entries.map((e) => simulateEntry(e, scenario));
  const summary: SimSummary = {
    evaluated: 0,
    skipped: 0,
    changed: 0,
    before: zero(),
    after: zero(),
    transitions: {},
  };
  for (const r of results) {
    if (r.state === "skipped") {
      summary.skipped += 1;
      continue;
    }
    summary.evaluated += 1;
    summary.before[r.before] = (summary.before[r.before] ?? 0) + 1;
    summary.after[r.after] = (summary.after[r.after] ?? 0) + 1;
    if (r.before !== r.after) {
      summary.changed += 1;
      const key = `${r.before}>${r.after}`;
      summary.transitions[key] = (summary.transitions[key] ?? 0) + 1;
    }
  }
  return { results, summary };
}

/** Every rule id recorded across the ledger, with how often it failed. */
export function recordedRules(entries: LedgerEntry[]) {
  const rules = new Map<string, { id: string; label: string; severities: Set<string>; seen: number; failed: number }>();
  for (const e of entries) {
    for (const c of e.checks ?? []) {
      const r = rules.get(c.id) ?? { id: c.id, label: c.label, severities: new Set(), seen: 0, failed: 0 };
      r.severities.add(c.severity);
      r.seen += 1;
      if (!c.passed) r.failed += 1;
      rules.set(c.id, r);
    }
  }
  return [...rules.values()].sort((a, b) => b.failed - a.failed || a.id.localeCompare(b.id));
}

/** The simulation as CSV, the scenario it ran on in the header. */
export function simulationToCsv(scenario: Scenario, results: SimResult[]): string {
  const esc = (v: unknown) => {
    const t = String(v ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [
    `# scenario=${JSON.stringify(scenario)}`,
    "at,subject,domain,amount_xrp,recorded_verdict,simulated_verdict,changed,drivers,receipt_sha256",
    ...results.map((r) =>
      r.state === "skipped"
        ? [r.entry.at, r.entry.subject, r.entry.domainCode, r.entry.amountXrp, r.entry.verdict, "", "skipped", "", r.entry.digest]
            .map(esc)
            .join(",")
        : [
            r.entry.at,
            r.entry.subject,
            r.entry.domainCode,
            r.entry.amountXrp,
            r.before,
            r.after,
            r.before !== r.after ? "yes" : "no",
            r.drivers.join(" "),
            r.entry.digest,
          ]
            .map(esc)
            .join(",")
    ),
  ];
  return lines.join("\n");
}

/* ── Institutional policy simulation ─────────────────────────────── */

const isPolicyCheck = (id: string) => id.startsWith("POLICY_") || id.startsWith("EVIDENCE_POLICY_");

/** A recorded verdict re-decided under a policy (or none), from its recorded facts. */
export function decideUnder(entry: LedgerEntry, params: PolicyParams | null) {
  const domainChecks = (entry.checks ?? []).filter((c) => !isPolicyCheck(c.id));
  const results = params && entry.measurements ? judge(entry.measurements, params) : [];
  const checks = [...domainChecks, ...(params ? toChecks(results, params) : [])];
  return { verdict: verdictForChecks(checks), results };
}

export type PolicySimRow = {
  entry: LedgerEntry;
  baseline: Status;
  candidate: Status;
  /** Rules whose state differs between the two policies. */
  drivers: string[];
};

export type PolicySimSummary = {
  evaluated: number;
  /** Recorded without the facts the policy rules need. */
  skipped: number;
  changed: number;
  baseline: Record<Status, number>;
  candidate: Record<Status, number>;
  transitions: Record<string, number>;
  /** Per rule: how many verdicts it put in REVIEW or FAIL under each policy. */
  exceptions: Record<RuleKey, { baseline: number; candidate: number }>;
};

/**
 * Re-decide every recorded verdict that kept its facts, once under the
 * baseline policy (normally the active one) and once under the candidate
 * (a draft). Both come from the same recorded facts, so the difference is
 * the policy change alone. Nothing is written.
 */
export function simulatePolicy(
  entries: LedgerEntry[],
  baseline: PolicyParams | null,
  candidate: PolicyParams | null
): { rows: PolicySimRow[]; summary: PolicySimSummary } {
  const exceptions = Object.fromEntries(
    (["hhi", "counterparty", "travelRule", "reserve", "freeze"] as RuleKey[]).map((k) => [k, { baseline: 0, candidate: 0 }])
  ) as PolicySimSummary["exceptions"];
  const summary: PolicySimSummary = { evaluated: 0, skipped: 0, changed: 0, baseline: zero(), candidate: zero(), transitions: {}, exceptions };
  const rows: PolicySimRow[] = [];
  const flagged = (s: RuleState) => s === "REVIEW" || s === "FAIL";

  for (const entry of entries) {
    if (!entry.checks || !entry.measurements) {
      summary.skipped += 1;
      continue;
    }
    const a = decideUnder(entry, baseline);
    const b = decideUnder(entry, candidate);
    summary.evaluated += 1;
    summary.baseline[a.verdict] += 1;
    summary.candidate[b.verdict] += 1;
    for (const r of a.results) if (flagged(r.state)) exceptions[r.key].baseline += 1;
    for (const r of b.results) if (flagged(r.state)) exceptions[r.key].candidate += 1;
    const stateOf = (rs: typeof a.results, key: RuleKey) => rs.find((r) => r.key === key)?.state ?? "NOT_APPLICABLE";
    const drivers = (["hhi", "counterparty", "travelRule", "reserve", "freeze"] as RuleKey[])
      .filter((k) => stateOf(a.results, k) !== stateOf(b.results, k))
      .map((k) => (a.results.find((r) => r.key === k) ?? b.results.find((r) => r.key === k))!.label);
    if (a.verdict !== b.verdict) {
      summary.changed += 1;
      const key = `${a.verdict}>${b.verdict}`;
      summary.transitions[key] = (summary.transitions[key] ?? 0) + 1;
    }
    rows.push({ entry, baseline: a.verdict, candidate: b.verdict, drivers });
  }
  return { rows, summary };
}
