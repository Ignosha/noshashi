import type { Lab, LabStep } from "@/lib/learn/labs";
import { screenName } from "@/lib/learn/labs";
import { stepKey, type LabProgress } from "@/lib/learn/labProgress";

/**
 * The lab workstation's assessment, in the manner of a Packet Tracer
 * activity: each step has objectives the trainee meets by doing them in
 * the workstation (NOSHASHI's training copy, embedded in the Academy), and
 * CHECK RESULTS scores them.
 *
 *   open    the step's screen was shown
 *   read    a read went to the ledger naming the step's address, hash or token
 *   answer  the step's question was answered right
 *
 * "open" and "read" come from what the workstation reports
 * (src/lib/training/protocol.ts); "answer" is the lab progress the course
 * already keeps. Nothing is inferred from a screenshot or a click: a step's
 * reading counts only when the ledger was actually asked.
 */

export type ObjectiveId = "open" | "read" | "answer";
export type Objective = { id: ObjectiveId; label: string };

/** When each lab step's open and read objectives were met. Kept on this computer. */
export type ObjectiveLog = Record<string, Partial<Record<"open" | "read", number>>>;

const ID = /^(r[1-9A-HJ-NP-Za-km-z]{24,34}|[0-9A-F]{64})$/i;

/** The addresses, hashes and token ids a step hands to its screen, upper-cased. */
export function stepIdentifiers(step: LabStep): string[] {
  const out = new Set<string>();
  for (const value of [step.subject, ...(step.copy ?? []).map((c) => c.value)]) {
    for (const part of (value ?? "").split(/[^0-9A-Za-z]+/)) if (ID.test(part)) out.add(part.toUpperCase());
  }
  return [...out];
}

export function objectivesFor(step: LabStep): Objective[] {
  // NOSHX reads the ledger only through the model the trainee has set up
  // (on-device or their own key), which the workstation cannot assume. Its
  // steps are scored on opening it and answering.
  const ids = step.scene === "agent" ? [] : stepIdentifiers(step);
  const what = step.subjectLabel ?? step.copy?.find((c) => ID.test(c.value))?.label ?? "the lab's value";
  return [
    { id: "open", label: `Open ${screenName(step.scene)}` },
    ...(ids.length ? [{ id: "read" as const, label: `Read ${what} from the ledger` }] : []),
    { id: "answer", label: "Answer the step's question" },
  ];
}

/** What the workstation reported, applied to every step of the lab it satisfies. */
export function recordEvent(
  log: ObjectiveLog,
  lab: Lab,
  event: { type: "scene"; scene: string } | { type: "read"; values: string[] },
  now: number
): ObjectiveLog {
  let next = log;
  for (const step of lab.steps) {
    const key = stepKey(lab.id, step.id);
    const met = next[key] ?? {};
    let objective: "open" | "read" | null = null;
    if (event.type === "scene" && event.scene === step.scene && !met.open) objective = "open";
    if (event.type === "read" && !met.read) {
      const ids = new Set(stepIdentifiers(step));
      if (event.values.some((v) => ids.has(v.toUpperCase()))) objective = "read";
    }
    if (objective) next = { ...next, [key]: { ...met, [objective]: now } };
  }
  return next;
}

export type ResultItem = { step: LabStep; index: number; objective: Objective; met: boolean };
export type Results = { items: ResultItem[]; met: number; total: number; percent: number };

/** The CHECK RESULTS sheet: every objective of every step, met or not. */
export function results(lab: Lab, log: ObjectiveLog, progress: LabProgress): Results {
  const items: ResultItem[] = [];
  lab.steps.forEach((step, index) => {
    const key = stepKey(lab.id, step.id);
    for (const objective of objectivesFor(step)) {
      const met = objective.id === "answer" ? !!progress.done[key] : !!log[key]?.[objective.id];
      items.push({ step, index, objective, met });
    }
  });
  const met = items.filter((i) => i.met).length;
  return { items, met, total: items.length, percent: items.length ? Math.round((100 * met) / items.length) : 0 };
}

/** Forget the open and read objectives of one lab (answers are course progress and stay). */
export function resetLab(log: ObjectiveLog, lab: Lab): ObjectiveLog {
  const keys = new Set(lab.steps.map((s) => stepKey(lab.id, s.id)));
  return Object.fromEntries(Object.entries(log).filter(([k]) => !keys.has(k)));
}

/** Stored logs come from browser storage: keep only well-formed entries. */
export function sanitizeLog(raw: unknown): ObjectiveLog {
  if (!raw || typeof raw !== "object") return {};
  const out: ObjectiveLog = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const entry: Partial<Record<"open" | "read", number>> = {};
    if (typeof v.open === "number") entry.open = v.open;
    if (typeof v.read === "number") entry.read = v.read;
    out[key] = entry;
  }
  return out;
}
