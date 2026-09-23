import { useEffect, useState } from "react";
import { readSetting, writeSetting } from "@/lib/store";
import { canonicalJson, type PolicyRef } from "@/lib/desk/institutional";
import type { LedgerEntry } from "@/lib/desk/ledger";
import type { Status } from "@/lib/xrpl/types";

/**
 * Investigations: a person's follow-up on a verdict.
 *
 * The verdict is the engine's and never changes. A case is where a human
 * records what they did about it: notes, who looked, what they concluded,
 * and — if they decided to proceed despite a HOLD — that they approved an
 * exception, why, and when. Only a person can close a case; the agent can
 * be asked about one but has no way to write to it.
 *
 * Each case is an append-only event log. Every event carries the SHA-256
 * of the one before it, so an edited or deleted event breaks the chain and
 * the case reports INTEGRITY FAILURE rather than a quietly different story.
 * Linked verdicts are copied into the case when linked (verdict, receipt
 * digest, policy), so the case still says what it rested on after the
 * ledger itself rolls over.
 */

export type CaseStatus = "open" | "in-review" | "escalated" | "closed";
export type CasePriority = "low" | "medium" | "high";
export type CaseOutcome = "cleared" | "exception-approved" | "blocked" | "reported" | "no-action";

export const OUTCOME_LABEL: Record<CaseOutcome, string> = {
  cleared: "Cleared — no issue found",
  "exception-approved": "Exception approved by a person",
  blocked: "Settlement blocked",
  reported: "Reported / escalated externally",
  "no-action": "Closed without action",
};

/** A verdict as it stood when linked. */
export type LinkedVerdict = {
  entryId: string;
  subject: string;
  verdict: Status;
  amountXrp: number;
  domainCode: string;
  at: string;
  digest: string;
  policy?: PolicyRef;
  /** Rules that did not pass, as recorded. */
  exceptions: string[];
};

export type CaseEventKind = "opened" | "note" | "status" | "priority" | "linked" | "assigned" | "closed" | "reopened";

export type CaseEvent = {
  seq: number;
  at: string;
  actor: string;
  kind: CaseEventKind;
  text?: string;
  from?: string;
  to?: string;
  linked?: LinkedVerdict;
  outcome?: CaseOutcome;
  /**
   * Organization cases only: the approved policy exception a closure as
   * "exception approved" rests on. The server refuses the closure unless
   * a second authorized person approved that exception.
   */
  exceptionId?: string;
  /** SHA-256 of the previous event ("GENESIS" for the first). */
  prev: string;
  /** SHA-256 over this event's canonical form, including `prev`. */
  hash: string;
};

export type Investigation = {
  id: string;
  title: string;
  subject: string;
  events: CaseEvent[];
};

/** Current state, derived from the log — never stored separately. */
export function stateOf(c: Investigation) {
  let status: CaseStatus = "open";
  let priority: CasePriority = "medium";
  let assignee: string | undefined;
  let outcome: CaseOutcome | undefined;
  let rationale: string | undefined;
  let closedAt: string | undefined;
  const linked: LinkedVerdict[] = [];
  for (const e of c.events) {
    if (e.kind === "status" && e.to) status = e.to as CaseStatus;
    if (e.kind === "priority" && e.to) priority = e.to as CasePriority;
    if (e.kind === "assigned") assignee = e.to;
    if (e.kind === "linked" && e.linked) linked.push(e.linked);
    if (e.kind === "opened" && e.linked) linked.push(e.linked);
    if (e.kind === "opened" && e.to) priority = e.to as CasePriority;
    if (e.kind === "closed") { status = "closed"; outcome = e.outcome; rationale = e.text; closedAt = e.at; }
    if (e.kind === "reopened") { status = "open"; outcome = undefined; rationale = undefined; closedAt = undefined; }
  }
  const first = c.events[0];
  const last = c.events[c.events.length - 1];
  return { status, priority, assignee, outcome, rationale, closedAt, linked, openedAt: first?.at, openedBy: first?.actor, updatedAt: last?.at };
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** The exact text an event's hash is taken over: its canonical JSON without `hash`. */
export const eventBody = (e: Omit<CaseEvent, "hash">) => canonicalJson({ ...e });
const body = eventBody;

async function append(c: Investigation, e: Omit<CaseEvent, "seq" | "prev" | "hash">): Promise<Investigation> {
  const prev = c.events.length ? c.events[c.events.length - 1].hash : "GENESIS";
  const draft: Omit<CaseEvent, "hash"> = { ...e, seq: c.events.length, prev };
  return { ...c, events: [...c.events, { ...draft, hash: await sha256(body(draft)) }] };
}

/** Recompute the chain. Any edit, removal or reordering is detected. */
export async function verifyCase(c: Investigation): Promise<{ ok: true; head: string } | { ok: false; at: number; reason: string }> {
  let prev = "GENESIS";
  for (let i = 0; i < c.events.length; i++) {
    const { hash, ...rest } = c.events[i];
    if (rest.seq !== i) return { ok: false, at: i, reason: `Event ${i} is out of sequence.` };
    if (rest.prev !== prev) return { ok: false, at: i, reason: `Event ${i} does not follow the event before it.` };
    if ((await sha256(body(rest))) !== hash) return { ok: false, at: i, reason: `Event ${i} was changed after it was written.` };
    prev = hash;
  }
  return { ok: true, head: prev };
}

export function linkOf(entry: LedgerEntry): LinkedVerdict {
  return {
    entryId: entry.id,
    subject: entry.subject,
    verdict: entry.verdict,
    amountXrp: entry.amountXrp,
    domainCode: entry.domainCode,
    at: entry.at,
    digest: entry.digest,
    ...(entry.policy ? { policy: { ...entry.policy } } : {}),
    exceptions: (entry.checks ?? []).filter((c) => !c.passed).map((c) => c.id),
  };
}

/* ── Transitions (pure apart from hashing; tested directly) ─────── */

export type CaseData = { schema: 1; cases: Investigation[] };

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

export async function openCase(
  data: CaseData,
  input: { entry: LedgerEntry; title?: string; priority?: CasePriority; actor: string; now: string }
): Promise<{ data: CaseData; id: string }> {
  const link = linkOf(input.entry);
  const id = `case-${Date.parse(input.now).toString(36)}-${link.digest.slice(0, 6).toLowerCase()}`;
  const title =
    clean(input.title ?? "", 120) ||
    `${link.verdict.toUpperCase()} on ${link.subject.slice(0, 10)}… · ${link.amountXrp.toLocaleString("en-US")} XRP ${link.domainCode}`;
  const c = await append({ id, title, subject: link.subject, events: [] }, {
    at: input.now,
    actor: input.actor,
    kind: "opened",
    text: title,
    to: input.priority ?? (link.verdict === "no-go" ? "high" : "medium"),
    linked: link,
  });
  return { data: { ...data, cases: [c, ...data.cases] }, id };
}

export type Mutation =
  | { kind: "note"; text: string }
  | { kind: "status"; to: Exclude<CaseStatus, "closed"> }
  | { kind: "priority"; to: CasePriority }
  | { kind: "assign"; to: string }
  | { kind: "link"; entry: LedgerEntry }
  | { kind: "close"; outcome: CaseOutcome; rationale: string; exceptionId?: string }
  | { kind: "reopen"; reason: string };

export class CaseError extends Error {}

export async function mutate(data: CaseData, id: string, m: Mutation, actor: string, now: string): Promise<CaseData> {
  const c = data.cases.find((x) => x.id === id);
  if (!c) throw new CaseError("Case not found.");
  const integrity = await verifyCase(c);
  if (!integrity.ok) throw new CaseError(`This case failed its integrity check and cannot be changed: ${integrity.reason}`);
  const s = stateOf(c);
  if (s.status === "closed" && m.kind !== "reopen") throw new CaseError("A closed case is fixed. Reopen it, with a reason, to change it.");

  let next: Investigation;
  switch (m.kind) {
    case "note": {
      const text = m.text.trim().slice(0, 4000);
      if (!text) throw new CaseError("A note cannot be empty.");
      next = await append(c, { at: now, actor, kind: "note", text });
      break;
    }
    case "status":
      if (m.to === s.status) return data;
      next = await append(c, { at: now, actor, kind: "status", from: s.status, to: m.to });
      break;
    case "priority":
      if (m.to === s.priority) return data;
      next = await append(c, { at: now, actor, kind: "priority", from: s.priority, to: m.to });
      break;
    case "assign": {
      const to = clean(m.to, 120);
      if (!to) throw new CaseError("Name who the case is assigned to.");
      next = await append(c, { at: now, actor, kind: "assigned", from: s.assignee, to });
      break;
    }
    case "link":
      if (s.linked.some((l) => l.entryId === m.entry.id)) throw new CaseError("That verdict is already linked to this case.");
      next = await append(c, { at: now, actor, kind: "linked", linked: linkOf(m.entry) });
      break;
    case "close": {
      const rationale = m.rationale.trim().slice(0, 4000);
      if (rationale.length < 10) throw new CaseError("Closing a case needs a written rationale of at least 10 characters.");
      next = await append(c, {
        at: now, actor, kind: "closed", from: s.status, outcome: m.outcome, text: rationale,
        ...(m.exceptionId ? { exceptionId: m.exceptionId } : {}),
      });
      break;
    }
    case "reopen": {
      const reason = m.reason.trim().slice(0, 4000);
      if (s.status !== "closed") throw new CaseError("Only a closed case can be reopened.");
      if (reason.length < 10) throw new CaseError("Reopening a case needs a reason of at least 10 characters.");
      next = await append(c, { at: now, actor, kind: "reopened", text: reason });
      break;
    }
  }
  return { ...data, cases: data.cases.map((x) => (x.id === id ? next : x)) };
}

/** The whole case as a portable, self-verifying JSON document. */
export async function exportCase(c: Investigation): Promise<string> {
  const integrity = await verifyCase(c);
  return JSON.stringify(
    {
      format: "noshashi.investigation/1",
      exportedAt: new Date().toISOString(),
      integrity: integrity.ok ? { chain: "intact", head: integrity.head } : { chain: "BROKEN", at: integrity.at, reason: integrity.reason },
      verification:
        "Each event's hash is SHA-256 over its canonical JSON (keys sorted, `hash` omitted); each event's `prev` is the previous event's hash, starting from GENESIS.",
      case: c,
    },
    null,
    2
  );
}

/* ── Shared store ─────────────────────────────────────────────────── */

const KEY = "desk.investigations";
let data: CaseData | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<(d: CaseData) => void>();

async function load() {
  const stored = await readSetting<CaseData | null>(KEY, null);
  data = stored && stored.schema === 1 && Array.isArray(stored.cases) ? stored : { schema: 1, cases: [] };
  for (const l of listeners) l(data);
}

async function commit(next: CaseData) {
  await writeSetting(KEY, next);
  data = next;
  for (const l of listeners) l(next);
}

export function useInvestigations() {
  const [d, setD] = useState<CaseData | null>(data);
  useEffect(() => {
    listeners.add(setD);
    if (!loading) loading = load();
    setD(data);
    return () => {
      listeners.delete(setD);
    };
  }, []);
  const need = () => {
    if (!data) throw new CaseError("Investigations are still loading.");
    return data;
  };
  return {
    loaded: d !== null,
    cases: d?.cases ?? [],
    open: async (input: Parameters<typeof openCase>[1]) => {
      const r = await openCase(need(), input);
      await commit(r.data);
      return r.id;
    },
    mutate: async (id: string, m: Mutation, actor: string) => commit(await mutate(need(), id, m, actor, new Date().toISOString())),
  };
}
