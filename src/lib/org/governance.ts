import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/client";
import { supabaseErrorMessage } from "@/lib/supabase/errors";
import {
  POLICY_ENGINE_VERSION,
  policyHash,
  type InstitutionalPolicy,
  type PolicyError,
  type PolicyParams,
  type PolicyRef,
} from "@/lib/desk/institutional";
import type { LedgerEntry } from "@/lib/desk/ledger";

/**
 * Organization governance: policies, their four-eyes activation, and
 * policy exceptions — against the live `noshashi` schema.
 *
 * Nothing here decides who may do what. Every rule is enforced by the
 * database (row level security, column grants, guard triggers) and by the
 * two Edge Functions that alone can activate a policy or decide an
 * exception. The role table below is used only to explain to a person why
 * a button is not offered; removing it would change what they SEE, never
 * what they can DO.
 *
 * The app shows a state change only after the server has confirmed it:
 * every write is followed by a fresh read, and nothing is set locally.
 */

export type MemberRole = "owner" | "admin" | "analyst" | "compliance" | "risk" | "viewer" | "api";

export type Membership = { organizationId: string; name: string; slug: string; role: MemberRole };

export type DirectoryEntry = { accountId: string; email: string; displayName: string | null; role: MemberRole };

export type OrgPolicyStatus = "draft" | "pending" | "active" | "archived";

export type OrgPolicy = {
  organizationId: string;
  id: string;
  version: number;
  name: string;
  status: OrgPolicyStatus;
  params: PolicyParams;
  hash: string;
  engine: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedBy: string | null;
  submittedAt: string | null;
  activatedBy: string | null;
  effectiveAt: string | null;
  archivedAt: string | null;
};

/** `needs_evidence`: a reviewer asked for more before deciding; the requester must add it. */
export type ExceptionStatus = "pending" | "needs_evidence" | "approved" | "rejected";

/** One reference a requester offers as further evidence. */
export type EvidenceReference =
  | { kind: "url"; value: string }
  | { kind: "transaction"; value: string }
  | { kind: "account"; value: string }
  | { kind: "digest"; value: string };

/** A step in an exception's review thread, as the server recorded it (append-only). */
export type ExceptionNote = {
  id: string;
  kind: "evidence_requested" | "evidence_added";
  author: string;
  note: string;
  evidence: { references: EvidenceReference[] } | null;
  createdAt: string;
};

export type ExceptionEvidence = {
  receiptDigest: string;
  verdict: string;
  domainCode: string;
  amountXrp: number;
  decidedAt: string;
  failedRules: string[];
  policy: PolicyRef | null;
  policyResults: Array<{ id: string; state: string; observed: string | null; configured: string; reason: string }>;
};

export type PolicyException = {
  id: string;
  organizationId: string;
  subject: string;
  receiptDigest: string;
  verdict: string;
  policyId: string | null;
  policyVersion: number | null;
  policyHash: string | null;
  caseId: string | null;
  reason: string;
  evidence: ExceptionEvidence;
  status: ExceptionStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Evidence requests and the supplements that answered them, oldest first. */
  notes: ExceptionNote[];
};

export type AuditRow = {
  id: number;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actor: string | null;
  at: string;
  newState: Record<string, unknown> | null;
};

/* ── What each role is offered (display only — the server decides) ─── */

const AUTHORS: MemberRole[] = ["owner", "admin", "compliance", "risk", "analyst"];
const APPROVERS: MemberRole[] = ["owner", "admin", "compliance"];

export const can = {
  editDraft: (r: MemberRole | null) => r !== null && AUTHORS.includes(r),
  simulate: (r: MemberRole | null) => r !== null && AUTHORS.includes(r),
  submit: (r: MemberRole | null) => r !== null && AUTHORS.includes(r),
  activate: (r: MemberRole | null) => r !== null && APPROVERS.includes(r),
  requestException: (r: MemberRole | null) => r !== null && AUTHORS.includes(r),
  approveException: (r: MemberRole | null) => r !== null && APPROVERS.includes(r),
  manageMembers: (r: MemberRole | null) => r === "owner" || r === "admin",
  readAudit: (r: MemberRole | null) => r !== null && [...APPROVERS, "risk"].includes(r),
};

/* ── Server outcomes ──────────────────────────────────────────────── */

/** A refusal or failure, with the exact words shown to the person. */
export type ServerFailure = { ok: false; code: string; title: string; message: string; errors?: PolicyError[] };

/** Messages for the database's result codes, where the app makes the call itself (RPC and table writes). */
const RPC_OUTCOMES: Record<string, { title: string; message: string }> = {
  NOT_AUTHENTICATED: { title: "AUTHORIZATION REQUIRED", message: "Sign in again to continue." },
  INSUFFICIENT_PERMISSIONS: { title: "AUTHORIZATION REQUIRED", message: "Your role does not allow this action." },
  NOT_FOUND: { title: "NOT FOUND", message: "No such record in an organization you belong to." },
  NOT_A_DRAFT: { title: "NOT A DRAFT", message: "Only a draft can be submitted for activation." },
  NOT_PENDING: { title: "NOT PENDING", message: "Only a policy awaiting activation can be withdrawn." },
  INVALID_INPUT: { title: "INVALID INPUT", message: "Check the name and the short identifier (lowercase letters, digits and hyphens)." },
  SLUG_TAKEN: { title: "IDENTIFIER TAKEN", message: "Another organization already uses that identifier." },
  NO_SUCH_ACCOUNT: { title: "NO SUCH ACCOUNT", message: "That person must create a NOSHASHI account before they can be added." },
  LAST_OWNER: { title: "LAST OWNER", message: "An organization must keep at least one owner." },
  NOT_REQUESTER: { title: "NOT THE REQUESTER", message: "Only the person who requested this exception can add evidence to it." },
  NOT_AWAITING_EVIDENCE: { title: "NOT AWAITING EVIDENCE", message: "No reviewer has asked for more evidence on this exception." },
  NOTE_REQUIRED: { title: "NOTE REQUIRED", message: "Explain what the evidence shows, in at least 10 characters." },
  EVIDENCE_REQUIRED: { title: "EVIDENCE REQUIRED", message: "Add at least one reference: a link, a transaction hash, an account or a document digest." },
};

export function failureOf(code: string, fallback: { title: string; message: string }): ServerFailure {
  const o = RPC_OUTCOMES[code] ?? fallback;
  return { ok: false, code, title: o.title, message: o.message };
}

export const ACTIVATION_FAILED: ServerFailure = {
  ok: false,
  code: "ACTIVATION_FAILED",
  title: "ACTIVATION FAILED",
  message: "The policy was not activated. No changes were committed.",
};

export const DECISION_FAILED: ServerFailure = {
  ok: false,
  code: "DECISION_FAILED",
  title: "DECISION FAILED",
  message: "The exception was not decided. No changes were committed.",
};

/**
 * Read an Edge Function's answer. Success is `ok: true` in a 2xx body and
 * nothing else: a network error, a non-JSON body, a 2xx without ok, or an
 * ok without 2xx are all failures, reported with `fallback`'s words.
 */
export async function readGovernedResponse<T extends Record<string, unknown>>(
  response: Response | null,
  fallback: ServerFailure
): Promise<({ ok: true } & T) | ServerFailure> {
  if (!response) return fallback;
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return fallback;
  }
  const b = body as Record<string, unknown> | null;
  if (response.ok && b && b.ok === true) return b as { ok: true } & T;
  if (b && b.ok === false && typeof b.code === "string" && typeof b.title === "string" && typeof b.message === "string") {
    return {
      ok: false,
      code: b.code,
      title: b.title,
      message: b.message,
      errors: Array.isArray(b.errors) ? (b.errors as PolicyError[]) : undefined,
    };
  }
  return fallback;
}

/**
 * Call a governance Edge Function directly rather than through
 * functions.invoke, which discards the body of a non-2xx response — and
 * with it the reason the server refused.
 */
async function invokeGoverned<T extends Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>,
  fallback: ServerFailure
): Promise<({ ok: true } & T) | ServerFailure> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ...fallback, code: "NOT_AUTHENTICATED", title: "AUTHORIZATION REQUIRED", message: "Sign in to continue. Nothing was changed." };
  let response: Response | null = null;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        "x-noshashi-client": "console",
      },
      body: JSON.stringify(body),
    });
  } catch {
    response = null;
  }
  return readGovernedResponse<T>(response, fallback);
}

/* ── Row mapping ──────────────────────────────────────────────────── */

type PolicyRow = {
  organization_id: string; policy_id: string; version: number; name: string; status: OrgPolicyStatus;
  params: PolicyParams; hash: string; engine: string; created_by: string; created_at: string; updated_at: string;
  submitted_by: string | null; submitted_at: string | null; activated_by: string | null;
  effective_at: string | null; archived_at: string | null;
};

export function policyFromRow(r: PolicyRow): OrgPolicy {
  return {
    organizationId: r.organization_id, id: r.policy_id, version: r.version, name: r.name, status: r.status,
    params: r.params, hash: r.hash, engine: r.engine, createdBy: r.created_by, createdAt: r.created_at,
    updatedAt: r.updated_at, submittedBy: r.submitted_by, submittedAt: r.submitted_at,
    activatedBy: r.activated_by, effectiveAt: r.effective_at, archivedAt: r.archived_at,
  };
}

type ExceptionRow = {
  id: string; organization_id: string; subject: string; receipt_digest: string; verdict: string;
  policy_id: string | null; policy_version: number | null; policy_hash: string | null; case_id: string | null;
  reason: string; evidence: ExceptionEvidence; status: ExceptionStatus; requested_by: string; requested_at: string;
  decided_by: string | null; decided_at: string | null; decision_note: string | null;
};

function exceptionFromRow(r: ExceptionRow): PolicyException {
  return {
    id: r.id, organizationId: r.organization_id, subject: r.subject, receiptDigest: r.receipt_digest,
    verdict: r.verdict, policyId: r.policy_id, policyVersion: r.policy_version, policyHash: r.policy_hash,
    caseId: r.case_id, reason: r.reason, evidence: r.evidence, status: r.status, requestedBy: r.requested_by,
    requestedAt: r.requested_at, decidedBy: r.decided_by, decidedAt: r.decided_at, decisionNote: r.decision_note,
    notes: [],
  };
}

/**
 * Parse what a requester pastes as further evidence, one reference per
 * line, into typed references. A line that is none of the four kinds is
 * returned as rejected rather than stored as free text: a reviewer should
 * be able to follow every reference to the thing it names.
 */
export function evidenceReferences(text: string): { references: EvidenceReference[]; rejected: string[] } {
  const references: EvidenceReference[] = [];
  const rejected: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^https:\/\/[^\s]+$/i.test(line)) references.push({ kind: "url", value: line });
    else if (/^[0-9A-Fa-f]{64}$/.test(line)) {
      // A 64-hex line is either a transaction hash or a document's SHA-256.
      // "sha256:" marks the latter; bare hex is read as a transaction.
      references.push({ kind: "transaction", value: line.toUpperCase() });
    } else if (/^sha256:[0-9A-Fa-f]{64}$/i.test(line)) references.push({ kind: "digest", value: line.slice(7).toUpperCase() });
    else if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(line)) references.push({ kind: "account", value: line });
    else rejected.push(line);
  }
  return { references, rejected };
}

/**
 * The active version as the verification engine consumes it — only after
 * its hash has been recomputed here and matches. A mismatch means the
 * stored parameters are not the ones that were approved, so no verdict
 * may be issued under them.
 */
export async function verifiedActive(policies: OrgPolicy[]): Promise<
  { ok: true; policy: InstitutionalPolicy | null } | { ok: false; reason: string }
> {
  const active = policies.filter((p) => p.status === "active");
  if (active.length > 1) return { ok: false, reason: "More than one organization policy is marked active." };
  const p = active[0];
  if (!p) return { ok: true, policy: null };
  if (p.engine !== POLICY_ENGINE_VERSION) {
    return { ok: false, reason: `Active policy ${p.name} v${p.version} was written for engine ${p.engine}; this build runs engine ${POLICY_ENGINE_VERSION}.` };
  }
  const expected = await policyHash({ id: p.id, name: p.name, version: p.version, params: p.params }).catch(() => null);
  if (expected !== p.hash) {
    return { ok: false, reason: `Active policy ${p.name} v${p.version} does not match its recorded hash.` };
  }
  return {
    ok: true,
    policy: {
      id: p.id, name: p.name, version: p.version, status: "active", params: p.params, hash: p.hash,
      createdAt: p.createdAt, updatedAt: p.updatedAt, createdBy: p.createdBy,
      effectiveAt: p.effectiveAt ?? undefined, activatedBy: p.activatedBy ?? undefined,
    },
  };
}

/** What an exception request carries: the verdict exactly as recorded, never recomputed. */
export function evidenceOf(entry: LedgerEntry): ExceptionEvidence {
  return {
    receiptDigest: entry.digest,
    verdict: entry.verdict,
    domainCode: entry.domainCode,
    amountXrp: entry.amountXrp,
    decidedAt: entry.at,
    failedRules: entry.failedRules,
    policy: entry.policy ?? null,
    policyResults: (entry.policyResults ?? []).map((r) => ({
      id: r.id,
      state: r.state,
      observed: r.observed,
      configured: r.configured,
      reason: r.reason,
    })),
  };
}

/* ── Reads ────────────────────────────────────────────────────────── */

const db = () => supabase().schema("noshashi");

export async function listMemberships(accountId: string): Promise<Membership[]> {
  const { data, error } = await db()
    .from("organization_members")
    .select("organization_id, role, organizations(name, slug)")
    .eq("account_id", accountId);
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map((row) => {
    const r = row as unknown as { organization_id: string; role: MemberRole; organizations: { name: string; slug: string } | null };
    return { organizationId: r.organization_id, role: r.role, name: r.organizations?.name ?? "—", slug: r.organizations?.slug ?? "" };
  });
}

export async function listPolicies(organizationId: string): Promise<OrgPolicy[]> {
  const { data, error } = await db()
    .from("org_policies")
    .select("*")
    .eq("organization_id", organizationId)
    .order("version", { ascending: false });
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data as PolicyRow[]).map(policyFromRow);
}

export async function listDirectory(organizationId: string): Promise<DirectoryEntry[]> {
  const { data, error } = await db().rpc("org_member_directory", { p_org: organizationId });
  if (error) throw new Error(supabaseErrorMessage(error));
  return ((data ?? []) as Array<{ account_id: string; email: string; display_name: string | null; role: MemberRole }>).map((r) => ({
    accountId: r.account_id, email: r.email, displayName: r.display_name, role: r.role,
  }));
}

export async function listExceptions(organizationId: string): Promise<PolicyException[]> {
  const { data, error } = await db()
    .from("policy_exceptions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("requested_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(supabaseErrorMessage(error));
  const exceptions = (data as ExceptionRow[]).map(exceptionFromRow);
  if (!exceptions.length) return exceptions;
  const { data: notes, error: notesError } = await db()
    .from("policy_exception_notes")
    .select("id, exception_id, kind, author, note, evidence, created_at")
    .in("exception_id", exceptions.map((x) => x.id))
    .order("created_at", { ascending: true });
  if (notesError) throw new Error(supabaseErrorMessage(notesError));
  const byId = new Map(exceptions.map((x) => [x.id, x]));
  for (const n of (notes ?? []) as Array<Record<string, unknown>>) {
    byId.get(String(n.exception_id))?.notes.push({
      id: String(n.id),
      kind: n.kind as ExceptionNote["kind"],
      author: String(n.author),
      note: String(n.note),
      evidence: (n.evidence as ExceptionNote["evidence"]) ?? null,
      createdAt: String(n.created_at),
    });
  }
  return exceptions;
}

/** Policy and exception events. Readable by owner, admin, compliance and risk only (RLS). */
export async function listGovernanceAudit(organizationId: string): Promise<AuditRow[]> {
  const { data, error } = await db()
    .from("audit_log")
    .select("id, action, entity_type, entity_id, actor_account_id, occurred_at, new_state")
    .eq("organization_id", organizationId)
    .in("entity_type", ["policy", "policy_exception", "organization"])
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map((r) => ({
    id: r.id as number,
    action: r.action as string,
    entityType: r.entity_type as string | null,
    entityId: r.entity_id as string | null,
    actor: r.actor_account_id as string | null,
    at: r.occurred_at as string,
    newState: r.new_state as Record<string, unknown> | null,
  }));
}

/* ── Writes (each confirmed by the server, then re-read by the caller) ── */

type Done = { ok: true } | ServerFailure;

const writeFailed = (error: { message?: string; code?: string }): ServerFailure => ({
  ok: false,
  code: error.code === "42501" ? "INSUFFICIENT_PERMISSIONS" : "WRITE_FAILED",
  title: error.code === "42501" ? "AUTHORIZATION REQUIRED" : "NOT SAVED",
  message: error.code === "42501" ? "Your role does not allow this action. Nothing was changed." : `${supabaseErrorMessage(error)} Nothing was changed.`,
});

export async function createDraft(input: {
  organizationId: string; policyId: string; name: string; params: PolicyParams; version: number; author: string;
}): Promise<Done> {
  const name = input.name.trim().slice(0, 60);
  const hash = await policyHash({ id: input.policyId, name, version: input.version, params: input.params });
  const { error } = await db().from("org_policies").insert({
    organization_id: input.organizationId, policy_id: input.policyId, version: input.version,
    name, status: "draft", params: input.params, hash, engine: POLICY_ENGINE_VERSION, created_by: input.author,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, code: "VERSION_EXISTS", title: "VERSION EXISTS", message: `Version ${input.version} already exists. Refresh and try again.` };
    return writeFailed(error);
  }
  return { ok: true };
}

export async function saveDraft(p: OrgPolicy, patch: { name: string; params: PolicyParams }): Promise<Done> {
  const name = patch.name.trim().slice(0, 60);
  const hash = await policyHash({ id: p.id, name, version: p.version, params: patch.params });
  const { data, error } = await db()
    .from("org_policies")
    .update({ name, params: patch.params, hash })
    .eq("organization_id", p.organizationId).eq("policy_id", p.id).eq("version", p.version).eq("status", "draft")
    .select("version");
  if (error) return writeFailed(error);
  if (!data?.length) return { ok: false, code: "NOT_A_DRAFT", title: "NOT SAVED", message: "This version is no longer a draft, or your role cannot edit it. Nothing was changed." };
  return { ok: true };
}

export async function discardDraft(p: OrgPolicy): Promise<Done> {
  const { data, error } = await db()
    .from("org_policies")
    .delete()
    .eq("organization_id", p.organizationId).eq("policy_id", p.id).eq("version", p.version).eq("status", "draft")
    .select("version");
  if (error) return writeFailed(error);
  if (!data?.length) return { ok: false, code: "NOT_A_DRAFT", title: "NOT DISCARDED", message: "This version is no longer a draft, or your role cannot discard it." };
  return { ok: true };
}

async function rpcDone(fn: string, args: Record<string, unknown>, label: string): Promise<Done & { data?: Record<string, unknown> }> {
  const { data, error } = await db().rpc(fn, args);
  if (error) return writeFailed(error);
  const r = data as { ok?: boolean; code?: string } | null;
  if (r?.ok === true) return { ok: true, data: r as Record<string, unknown> };
  return failureOf(String(r?.code ?? "FAILED"), { title: `${label} FAILED`, message: "Nothing was changed." });
}

export const submitPolicy = (p: OrgPolicy) =>
  rpcDone("submit_org_policy", { p_org: p.organizationId, p_policy: p.id, p_version: p.version }, "SUBMIT");

export const withdrawPolicy = (p: OrgPolicy) =>
  rpcDone("withdraw_org_policy", { p_org: p.organizationId, p_policy: p.id, p_version: p.version }, "WITHDRAW");

export type ActivationSuccess = { status: "active"; policy_id: string; version: number; hash: string; author: string; activated_by: string; archived_version: number | null };

/** The only path to ACTIVE: noshashi-policy-activate, which re-checks everything server-side. */
export const activatePolicy = (p: OrgPolicy) =>
  invokeGoverned<ActivationSuccess>(
    "noshashi-policy-activate",
    { organizationId: p.organizationId, policyId: p.id, version: p.version },
    ACTIVATION_FAILED
  );

export async function requestException(input: {
  organizationId: string; entry: LedgerEntry; reason: string; caseId?: string; requester: string;
}): Promise<Done> {
  const e = input.entry;
  const { error } = await db().from("policy_exceptions").insert({
    organization_id: input.organizationId,
    subject: e.subject,
    receipt_digest: e.digest,
    verdict: e.verdict,
    policy_id: e.policy?.id ?? null,
    policy_version: e.policy?.version ?? null,
    policy_hash: e.policy?.hash ?? null,
    case_id: input.caseId ?? null,
    reason: input.reason.trim(),
    evidence: evidenceOf(e),
    status: "pending",
    requested_by: input.requester,
  });
  if (error) return writeFailed(error);
  return { ok: true };
}

/**
 * The only path to an approved or rejected exception, or to one sent back
 * for more evidence: noshashi-exception-decide.
 */
export const decideException = (x: PolicyException, decision: "approve" | "reject" | "request_evidence", note: string) =>
  invokeGoverned<{ status: ExceptionStatus; requested_by: string; decided_by?: string; reviewer?: string }>(
    "noshashi-exception-decide",
    { exceptionId: x.id, decision, note },
    DECISION_FAILED
  );

/** The requester answers an evidence request; the exception returns to pending. */
export const addExceptionEvidence = (x: PolicyException, note: string, references: EvidenceReference[]) =>
  rpcDone("add_exception_evidence", { p_exception: x.id, p_note: note.trim(), p_evidence: { references } }, "EVIDENCE");

export const createOrganization = (name: string, slug: string) =>
  rpcDone("create_organization", { p_name: name, p_slug: slug }, "CREATE");

export const addMember = (organizationId: string, email: string, role: MemberRole) =>
  rpcDone("add_org_member_by_email", { p_org: organizationId, p_email: email, p_role: role }, "ADD MEMBER");
