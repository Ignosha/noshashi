import { verdictForChecks, type PolicyCheck } from "@/lib/policy";
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
 *   - A proposed HHI limit: the gate does not enforce one today. It is
 *     applied only to entries that recorded an HHI; the rest are counted
 *     as unmeasured, never assumed to pass.
 *
 * Nothing here writes to the ledger or touches a receipt.
 */

export type Severity = "block" | "warn" | "off";

export type Scenario = {
  /** Per rule id. Absent means as recorded. */
  severity: Record<string, Severity>;
  /** Per domain id, in XRP; 0 closes the domain. Absent means as recorded. */
  ceilings: Record<string, number>;
  /** Proposed HOLD above this HHI. Null leaves it out. */
  hhiLimit: number | null;
};

export const EMPTY_SCENARIO: Scenario = { severity: {}, ceilings: {}, hhiLimit: null };

export const HHI_RULE_ID = "PROPOSED_HHI_LIMIT";

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
      /** A proposed HHI limit was set but this entry has no HHI reading. */
      hhiUnmeasured: boolean;
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

  let hhiUnmeasured = false;
  if (scenario.hhiLimit !== null) {
    if (typeof entry.hhi === "number") {
      checks.push({
        id: HHI_RULE_ID,
        label: "Concentration within proposed limit",
        severity: "warn",
        passed: entry.hhi <= scenario.hhiLimit,
        detail: `Recorded HHI ${entry.hhi.toLocaleString()} against a proposed limit of ${scenario.hhiLimit.toLocaleString()}.`,
      });
    } else {
      hhiUnmeasured = true;
    }
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
    hhiUnmeasured,
  };
}

export type SimSummary = {
  evaluated: number;
  skipped: number;
  changed: number;
  hhiUnmeasured: number;
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
    hhiUnmeasured: 0,
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
    if (r.hhiUnmeasured) summary.hhiUnmeasured += 1;
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
