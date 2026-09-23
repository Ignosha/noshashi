import { supabase } from "@/lib/supabase/client";
import { supabaseErrorMessage } from "@/lib/supabase/errors";
import {
  eventBody,
  mutate,
  openCase,
  type CaseEvent,
  type Investigation,
  type Mutation,
} from "@/lib/desk/investigations";
import type { LedgerEntry } from "@/lib/desk/ledger";

/**
 * Organization investigations: the workstation's case log, held by the
 * server so every member sees one record.
 *
 * Events are built by exactly the same pure functions the workstation uses
 * (openCase / mutate in src/lib/desk/investigations.ts), so a shared case
 * is hashed and verified exactly like a local one. The server stores each
 * event's canonical JSON and its SHA-256, and refuses any event whose hash,
 * sequence, previous hash, author or time does not check out. Nothing is
 * shown as written until the server confirms it and a re-read returns it.
 */

const db = () => supabase().schema("noshashi");

const REFUSALS: Record<string, string> = {
  NOT_AUTHENTICATED: "Sign in again to continue. Nothing was written.",
  INSUFFICIENT_PERMISSIONS: "Your role can read cases but not write to them.",
  NOT_FOUND: "No such case in an organization you belong to.",
  CONFLICT: "Someone else changed this case a moment ago. It has been refreshed; try again.",
  HASH_MISMATCH: "The server could not verify this entry's fingerprint. Nothing was written.",
  ACTOR_MISMATCH: "An entry can only be written under your own name. Nothing was written.",
  CLOCK_SKEW: "This computer's clock is more than five minutes out. Correct it and try again.",
  CASE_CLOSED: "A closed case is fixed. Reopen it, with a reason, to change it.",
  NOT_CLOSED: "Only a closed case can be reopened.",
  RATIONALE_REQUIRED: "A written reason of at least 10 characters is required.",
  EXCEPTION_NOT_APPROVED:
    "Closing as an approved exception needs a policy exception that an owner, admin or compliance member other than the requester has approved.",
  MALFORMED: "The entry was not in the expected form. Nothing was written.",
};

export class OrgCaseError extends Error {
  constructor(public code: string) {
    super(REFUSALS[code] ?? `The case was not changed (${code}).`);
  }
}

type EventRow = { case_id: string; seq: number; hash: string; body: string };
type CaseRow = { id: string; title: string; subject: string; created_at: string };

/** Rebuild an event from the stored text. Unparseable text yields an event that fails verification. */
export function eventFromRow(r: EventRow): CaseEvent {
  try {
    const parsed = JSON.parse(r.body) as Omit<CaseEvent, "hash">;
    return { ...parsed, hash: r.hash };
  } catch {
    return { seq: r.seq, at: "", actor: "", kind: "note", text: "[unreadable entry]", prev: "", hash: r.hash };
  }
}

export async function listOrgCases(organizationId: string): Promise<Investigation[]> {
  const [cases, events] = await Promise.all([
    db().from("org_cases").select("id, title, subject, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(500),
    db().from("org_case_events").select("case_id, seq, hash, body").eq("organization_id", organizationId).order("seq", { ascending: true }).limit(10_000),
  ]);
  if (cases.error) throw new Error(supabaseErrorMessage(cases.error));
  if (events.error) throw new Error(supabaseErrorMessage(events.error));
  const byCase = new Map<string, CaseEvent[]>();
  for (const r of events.data as EventRow[]) {
    const list = byCase.get(r.case_id) ?? [];
    list.push(eventFromRow(r));
    byCase.set(r.case_id, list);
  }
  return (cases.data as CaseRow[]).map((c) => ({ id: c.id, title: c.title, subject: c.subject, events: byCase.get(c.id) ?? [] }));
}

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(`${supabaseErrorMessage(error)} Nothing was written.`);
  const r = data as { ok?: boolean; code?: string } | null;
  if (r?.ok !== true) throw new OrgCaseError(String(r?.code ?? "FAILED"));
}

/** The request the server receives for an event: its canonical text and fingerprint. */
export function wireOf(e: CaseEvent): { body: string; hash: string } {
  const { hash, ...rest } = e;
  return { body: eventBody(rest), hash };
}

export async function openOrgCase(organizationId: string, input: { entry: LedgerEntry; actor: string }): Promise<string> {
  const { data, id } = await openCase({ schema: 1, cases: [] }, { entry: input.entry, actor: input.actor, now: new Date().toISOString() });
  const c = data.cases[0];
  const w = wireOf(c.events[0]);
  await call("open_org_case", { p_org: organizationId, p_case: id, p_title: c.title, p_subject: c.subject, p_body: w.body, p_hash: w.hash });
  return id;
}

export async function appendOrgCase(c: Investigation, m: Mutation, actor: string): Promise<void> {
  const next = await mutate({ schema: 1, cases: [c] }, c.id, m, actor, new Date().toISOString());
  const updated = next.cases[0];
  if (updated.events.length === c.events.length) return; // nothing changed (e.g. same status)
  const w = wireOf(updated.events[updated.events.length - 1]);
  await call("append_org_case_event", { p_case: c.id, p_body: w.body, p_hash: w.hash });
}
