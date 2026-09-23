import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Eyebrow } from "@/components/nova/Panel";
import type { PolicyRef, RuleResult, RuleState } from "@/lib/desk/institutional";
import { cn } from "@/lib/utils";

export const RULE_STATE_LABEL: Record<RuleState, string> = {
  PASS: "PASS",
  REVIEW: "REVIEW REQUIRED",
  FAIL: "FAIL",
  NOT_APPLICABLE: "NOT APPLICABLE",
  INSUFFICIENT_DATA: "INSUFFICIENT DATA",
};

export const RULE_STATE_TONE: Record<RuleState, string> = {
  PASS: "text-go",
  REVIEW: "text-hold",
  FAIL: "text-no-go",
  NOT_APPLICABLE: "text-muted-foreground",
  INSUFFICIENT_DATA: "text-muted-foreground",
};

/** One sentence naming every rule that moved the verdict, from the results only. */
export function policyReason(results: RuleResult[]): string {
  const fails = results.filter((r) => r.state === "FAIL");
  const reviews = results.filter((r) => r.state === "REVIEW");
  const missing = results.filter((r) => r.state === "INSUFFICIENT_DATA");
  const parts: string[] = [];
  if (fails.length) parts.push(`${fails.map((r) => r.label).join(", ")} failed the configured policy`);
  if (reviews.length) parts.push(`${reviews.map((r) => r.label).join(", ")} require${reviews.length === 1 ? "s" : ""} review under the configured policy`);
  if (missing.length) parts.push(`${missing.map((r) => r.label).join(", ")} could not be evaluated`);
  return parts.length ? `${parts.join("; ")}.` : "Every applicable institutional policy rule passed.";
}

export function PolicyRefLine({ policy, className }: { policy: PolicyRef; className?: string }) {
  return (
    <div className={cn("mono-font text-[9px] leading-relaxed text-muted-foreground", className)}>
      <span className="text-foreground">{policy.name} v{policy.version}</span>
      <span> · id {policy.id} · engine {policy.engine}</span>
      <br />
      <span className="selectable break-all">policy SHA-256 {policy.hash}</span>
    </div>
  );
}

/**
 * The institutional policy part of a verdict: for each rule, the ledger
 * FACT, the configured POLICY and the RESULT, kept in separate columns,
 * with the calculation one click away. Rendered from stored results, so
 * a historical verdict shows exactly what decided it at the time.
 */
export function PolicyResults({ results }: { results: RuleResult[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-b border-border pb-1">
        {["RULE", "FACT · OBSERVED", "POLICY · CONFIGURED", "RESULT"].map((h) => (
          <span key={h} className="stencil text-[7.5px] tracking-[0.2em] text-muted-foreground">
            {h}
          </span>
        ))}
      </div>
      {results.map((r) => (
        <div key={r.id} className="border-b border-border/30 py-1.5 last:border-0">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3">
            <span className="text-[10px] text-foreground">{r.label}</span>
            <span className="mono-font text-right text-[9.5px] tabular-nums text-foreground">
              {r.observed ?? "—"}
              {r.delta && <span className="ml-1 text-muted-foreground">({r.delta})</span>}
            </span>
            <span className="mono-font text-right text-[9.5px] tabular-nums text-muted-foreground">{r.configured}</span>
            <span className={cn("stencil text-right text-[8px] tracking-[0.16em]", RULE_STATE_TONE[r.state])}>
              {RULE_STATE_LABEL[r.state]}
            </span>
          </div>
          <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">{r.reason}</p>
          <button
            onClick={() => setOpen(open === r.id ? null : r.id)}
            aria-expanded={open === r.id}
            className="stencil mt-0.5 text-[7.5px] tracking-[0.2em] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {open === r.id ? "HIDE CALCULATION" : "WHY? · VIEW CALCULATION"}
          </button>
          {open === r.id && (
            <p className="mono-font selectable mt-1 border-l border-border pl-2 text-[9px] leading-relaxed text-muted-foreground">
              {r.calculation}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Policy part of a verdict, with its header and reason. */
export function PolicyVerdictBlock({
  policy,
  results,
  verdict,
}: {
  policy: PolicyRef | undefined;
  results: RuleResult[] | undefined;
  /** When given, the decision is also drawn as a tree. */
  verdict?: { label: string; tone: string };
}) {
  if (!policy || !results) {
    return (
      <div className="border border-border p-2.5">
        <Eyebrow>NO ACTIVE INSTITUTIONAL POLICY</Eyebrow>
        <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">
          This verdict applied the domain's rules only. No institutional thresholds were evaluated,
          so it carries no institutional policy result. Activate a policy in Ledger &amp; Policy → POLICY.
        </p>
      </div>
    );
  }
  return (
    <div>
      <Eyebrow className="mb-1">INSTITUTIONAL POLICY</Eyebrow>
      <PolicyRefLine policy={policy} />
      <p className="mb-2 mt-1.5 text-[10px] leading-relaxed text-foreground">{policyReason(results)}</p>
      {verdict && (
        <div className="mb-3 border border-border/60 p-2">
          <DecisionGarden verdict={verdict.label} verdictTone={verdict.tone} policy={policy} results={results} />
        </div>
      )}
      <PolicyResults results={results} />
    </div>
  );
}

type TreeLine = { text: string; tone?: string; depth: number };

/**
 * The decision as a garden: an ASCII tree from the verdict down through
 * each rule to the fact it read, the threshold it applied and what it
 * found. Built from the recorded results only. Lines appear fact first,
 * then threshold, then result — quickly (under half a second in total)
 * and not at all under reduced motion.
 */
export function DecisionGarden({
  verdict,
  verdictTone,
  policy,
  results,
}: {
  verdict: string;
  verdictTone: string;
  policy: PolicyRef;
  results: RuleResult[];
}) {
  const reduce = useReducedMotion();
  const lines: TreeLine[] = [{ text: `VERDICT ${verdict} · ${policy.name} v${policy.version}`, tone: verdictTone, depth: 0 }];
  results.forEach((r, i) => {
    const last = i === results.length - 1;
    const branch = last ? "└── " : "├── ";
    const stem = last ? "    " : "│   ";
    lines.push({ text: `${branch}${r.label.toUpperCase()} ── ${RULE_STATE_LABEL[r.state]}`, tone: RULE_STATE_TONE[r.state], depth: 1 });
    const leaves: Array<[string, string]> = [["fact  ", r.observed ?? "not measured"]];
    leaves.push(["policy", r.configured]);
    if (r.delta) leaves.push(["delta ", r.delta]);
    leaves.forEach(([k, v], j) => {
      lines.push({ text: `${stem}${j === leaves.length - 1 ? "└── " : "├── "}${k} ${v}`, depth: 2 });
    });
  });
  const step = Math.min(0.02, 0.45 / Math.max(1, lines.length));
  return (
    <pre className="mono-font selectable overflow-x-auto whitespace-pre text-[9.5px] leading-[1.55] text-muted-foreground" aria-label="Decision tree">
      {lines.map((l, i) => (
        <motion.span
          key={i}
          className={cn("block", l.tone ?? (l.depth === 2 ? "text-muted-foreground" : "text-foreground"))}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : i * step, duration: 0.12 }}
        >
          {l.text}
        </motion.span>
      ))}
    </pre>
  );
}
