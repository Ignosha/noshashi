import {
  describeParams,
  diffParams,
  validateParams,
  type InstitutionalPolicy,
  type ParamChange,
  type PolicyParams,
  type RuleKey,
} from "@/lib/desk/institutional";
import type { LedgerEntry } from "@/lib/desk/ledger";
import { simulatePolicy } from "@/lib/desk/simulate";
import type { Status } from "@/lib/xrpl/types";

/**
 * What the agent is told about institutional policy, and the one thing it
 * may run: a simulation. Everything handed to the model here is a record
 * or an engine output. The model explains; the engine decides.
 */

const WORD: Record<Status, string> = { go: "GO", hold: "HOLD", "no-go": "NO-GO", "insufficient-data": "INSUFFICIENT DATA" };

/** The active policy and the most recent recorded verdict, as facts for the prompt. */
export function buildPolicyBrief(active: InstitutionalPolicy | null, latest: LedgerEntry | null): string {
  const lines: string[] = [];
  if (active) {
    lines.push(`ACTIVE_POLICY: ${active.name} v${active.version} (id ${active.id}, SHA-256 ${active.hash}, effective ${active.effectiveAt ?? "unknown"})`);
    for (const p of describeParams(active.params)) lines.push(`  ${p.label}: ${p.value}`);
  } else {
    lines.push("ACTIVE_POLICY: none. Verdicts apply domain rules only and carry no institutional policy result.");
  }
  if (!latest) {
    lines.push("LATEST_VERDICT: none recorded on this workstation.");
    return lines.join("\n");
  }
  lines.push(
    `LATEST_VERDICT: ${WORD[latest.verdict]} for ${latest.subject}, ${latest.amountXrp} XRP, domain ${latest.domainCode}, at ${latest.at}, receipt ${latest.digest}`
  );
  lines.push(
    latest.policy
      ? `  decided under ${latest.policy.name} v${latest.policy.version} (SHA-256 ${latest.policy.hash})`
      : "  decided with no institutional policy active"
  );
  const failedDomain = (latest.checks ?? []).filter((c) => !c.passed && !c.id.startsWith("POLICY_") && !c.id.startsWith("EVIDENCE_POLICY_"));
  for (const c of failedDomain) lines.push(`  DOMAIN RULE ${c.id} ${c.severity === "block" ? "FAILED (blocking)" : "FAILED (advisory)"}: ${c.detail}`);
  for (const r of latest.policyResults ?? []) {
    lines.push(
      `  POLICY RULE ${r.label}: ${r.state} · observed ${r.observed ?? "n/a"} · configured ${r.configured}${r.delta ? ` · delta ${r.delta}` : ""} · ${r.reason} · calculation: ${r.calculation}`
    );
  }
  return lines.join("\n");
}

/* ── "What if…" → a real simulation ─────────────────────────────── */

const n = (s: string) => Number(s.replace(/,/g, ""));

/**
 * Read a hypothetical policy change out of a question, e.g. "what happens
 * if we raise the HHI limit to 3,000?". Only explicit numbers for named
 * rules are accepted; anything vaguer returns null and no simulation runs.
 */
export function parseWhatIf(question: string, base: PolicyParams): { candidate: PolicyParams; changes: ParamChange[] } | null {
  const q = question.toLowerCase();
  if (!/(what if|what happens|what would|simulate|if we|suppose|were to)/.test(q)) return null;
  const candidate: PolicyParams = structuredClone(base);
  let touched = false;

  const hhi = q.match(/\bhhi\b[^0-9%]{0,40}?(\d[\d,]*(?:\.\d+)?)/);
  if (hhi) { candidate.hhiLimit = n(hhi[1]); touched = true; }
  const cp = q.match(/counterparty(?: share)?[^0-9%]{0,40}?(\d+(?:\.\d+)?)\s*%?/);
  if (cp) { candidate.counterpartyShareLimitPct = n(cp[1]); touched = true; }
  const tr = q.match(/travel rule[^0-9]{0,40}?(\d[\d,]*(?:\.\d+)?)/);
  if (tr && candidate.travelRule) { candidate.travelRule = { ...candidate.travelRule, thresholdFiat: n(tr[1]) }; touched = true; }
  const rs = q.match(/(?:reserve|headroom)[^0-9]{0,40}?(\d[\d,]*(?:\.\d+)?)/);
  if (rs) { candidate.reserveHeadroomMinXrp = n(rs[1]); touched = true; }
  const fz = q.match(/strict freeze[^.?!]{0,30}?\b(on|off|enable[ds]?|disable[ds]?|turn(?:ed)? on|turn(?:ed)? off)\b/);
  if (fz) { candidate.strictFreeze = /on|enable/.test(fz[1]); touched = true; }

  if (!touched || validateParams(candidate).length) return null;
  const changes = diffParams(base, candidate);
  return changes.length ? { candidate, changes } : null;
}

const RULE_LABEL: Record<RuleKey, string> = { hhi: "HHI", counterparty: "Counterparty share", travelRule: "Travel Rule", reserve: "Reserve headroom", freeze: "Strict freeze" };

/** Run the deterministic simulation and state its result as a fact block. */
export function simulationFact(entries: LedgerEntry[], active: InstitutionalPolicy, parsed: { candidate: PolicyParams; changes: ParamChange[] }): string {
  const { summary: s } = simulatePolicy(entries, active.params, parsed.candidate);
  const lines = [
    "SIMULATION RESULT (computed by the NOSHASHI deterministic policy engine, not by the model)",
    `Current policy: ${active.name} v${active.version}`,
    `Proposed change: ${parsed.changes.map((c) => `${c.label} ${c.from} → ${c.to}`).join("; ")}`,
    `Dataset: ${s.evaluated} recorded verdicts re-decided from their stored facts${s.skipped ? ` (${s.skipped} recorded without facts excluded)` : ""}`,
  ];
  if (s.evaluated === 0) {
    lines.push("No recorded verdict carries the facts needed, so there is nothing to simulate yet.");
  } else {
    for (const v of ["go", "hold", "no-go", "insufficient-data"] as Status[]) {
      const d = s.candidate[v] - s.baseline[v];
      lines.push(`${WORD[v]}: current ${s.baseline[v]} → simulated ${s.candidate[v]}${d ? ` (${d > 0 ? "+" : ""}${d})` : ""}`);
    }
    for (const k of Object.keys(s.exceptions) as RuleKey[]) {
      const e = s.exceptions[k];
      if (e.baseline || e.candidate) lines.push(`${RULE_LABEL[k]} exceptions: ${e.baseline} → ${e.candidate}`);
    }
    lines.push(`Verdicts that would change: ${s.changed}`);
  }
  lines.push("This is a simulation over recorded data. It does not change the active policy and is not a prediction of future events.");
  return lines.join("\n");
}
