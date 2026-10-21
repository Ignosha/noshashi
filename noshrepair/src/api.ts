import { db } from "./client";
import { messageFromRow, ticketFromRow, type Ticket, type TicketMessage, type TicketPriority, type TicketStatus } from "@/lib/support/tickets";
import {
  RepairError,
  eventFromRow,
  requestFromRow,
  type AccessEvent,
  type AccessGrant,
  type RepairActionId,
  type RepairRequest,
} from "@/lib/support/repairCatalog";

/**
 * Everything NOSHREPAIR reads and does. Reads go through row level security
 * (staff with two-factor see support data; nobody sees customer accounts
 * directly); every action is a database function that checks the employee,
 * the two-factor level and, for account data, the customer's grant, and
 * writes the access log the customer can read.
 */

async function call<T extends Record<string, unknown>>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message || "NOSHASHI did not answer. Check the connection and try again.");
  const result = (data ?? {}) as { ok?: boolean; code?: string } & T;
  if (result.ok === false) throw new RepairError(result.code ?? "UNKNOWN");
  return result;
}

export async function isRepairStaff(): Promise<boolean> {
  const { data, error } = await db().rpc("is_repair_staff");
  return !error && data === true;
}

export async function queue(filters: { status?: TicketStatus | "all"; search?: string }): Promise<Ticket[]> {
  let query = db()
    .from("support_tickets")
    .select("id, number, account_id, subject, category, priority, status, app_version, platform, created_at, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const tickets = (data ?? []).map(ticketFromRow);
  const term = filters.search?.trim().toLowerCase();
  if (!term) return tickets;
  return tickets.filter((t) => t.subject.toLowerCase().includes(term) || `nsh-${t.number}`.includes(term) || t.category.includes(term));
}

export async function ticket(id: string): Promise<Ticket | null> {
  const { data, error } = await db()
    .from("support_tickets")
    .select("id, number, account_id, subject, category, priority, status, app_version, platform, created_at, last_message_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ticketFromRow(data) : null;
}

export async function messages(ticketId: string): Promise<TicketMessage[]> {
  const { data, error } = await db().from("support_messages").select("id, ticket_id, author_id, author_role, body, created_at").eq("ticket_id", ticketId).order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map(messageFromRow);
}

export async function reply(ticketId: string, body: string): Promise<void> {
  await call("reply_support_ticket", { p_ticket: ticketId, p_body: body });
}

export async function setTicket(ticketId: string, change: { status?: TicketStatus; priority?: TicketPriority }): Promise<void> {
  await call("update_support_ticket", { p_ticket: ticketId, p_status: change.status ?? null, p_priority: change.priority ?? null });
}

export type Diagnostic = { id: number; kind: string; payload: Record<string, unknown>; createdAt: string };

export async function diagnostics(ticketId: string): Promise<Diagnostic[]> {
  const { data, error } = await db().from("support_diagnostics").select("id, kind, payload, created_at").eq("ticket_id", ticketId).order("id", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { id: number; kind: string; payload: Record<string, unknown>; created_at: string }) => ({ id: r.id, kind: r.kind, payload: r.payload, createdAt: r.created_at }));
}

export async function grantFor(ticketId: string): Promise<AccessGrant | null> {
  const { data } = await db()
    .from("support_access_grants")
    .select("id, granted_at, expires_at, revoked_at")
    .eq("ticket_id", ticketId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { id: string; granted_at: string; expires_at: string; revoked_at: string | null } | undefined;
  return row ? { id: row.id, grantedAt: row.granted_at, expiresAt: row.expires_at, revokedAt: row.revoked_at } : null;
}

export async function requestAccess(ticketId: string, reason: string): Promise<void> {
  await call("request_support_access", { p_ticket: ticketId, p_reason: reason });
}

export type AccountView = {
  grant: { granted_at: string; expires_at: string };
  account: { email: string | null; display_name: string | null; created_at: string } | null;
  entitlement: { tier: string; seats: number | null; valid_until: string | null; features: number; updated_at: string } | null;
  subscriptions: Array<{ tier: string; status: string; seats: number | null; current_period_end: string | null; cancel_at_period_end: boolean | null }>;
  api_keys: Array<{ name: string; prefix: string; scopes: string[] | null; created_at: string; last_used_at: string | null; revoked: boolean; expires_at: string | null }>;
  organizations: number;
  portfolio_wallets: number;
  open_tickets: number;
};

/** The customer's account, read-only. Logged in their access log every time. */
export async function accountView(ticketId: string): Promise<AccountView> {
  return (await call<AccountView & Record<string, unknown>>("support_account_view", { p_ticket: ticketId })) as AccountView;
}

export async function proposeRepair(ticketId: string, action: RepairActionId, note: string): Promise<void> {
  await call("request_support_repair", { p_ticket: ticketId, p_action: action, p_note: note.trim() || null });
}

export async function repairsFor(ticketId: string): Promise<RepairRequest[]> {
  const { data, error } = await db()
    .from("support_repair_actions")
    .select("id, ticket_id, action, note, status, result, requested_at, decided_at")
    .eq("ticket_id", ticketId)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(requestFromRow);
}

export async function accessLogFor(ticketId: string): Promise<AccessEvent[]> {
  const { data, error } = await db().from("support_access_log").select("id, event, actor_role, detail, at").eq("ticket_id", ticketId).order("id", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map(eventFromRow);
}

export type Signature = { message: string; reports: number; tickets: number; last_seen: string; versions: string[] | null; latest_ticket: string };

export async function errorSignatures(days: number): Promise<Signature[]> {
  const result = await call<{ signatures: Signature[] }>("support_error_signatures", { p_days: days });
  return result.signatures ?? [];
}

/** A prefilled GitHub issue for a recurring error. Opens in the browser; nothing is posted by NOSHREPAIR. */
export function issueUrl(sig: Signature): string {
  const title = `Crash: ${sig.message.slice(0, 90)}`;
  const body = [
    "Reported through NOSHREPAIR.",
    "",
    `- Message: \`${sig.message}\``,
    `- Reports: ${sig.reports} across ${sig.tickets} ticket(s)`,
    `- Versions: ${(sig.versions ?? []).join(", ") || "unknown"}`,
    `- Last seen: ${sig.last_seen}`,
    "",
    "Customer details are not included. Look the tickets up in NOSHREPAIR.",
  ].join("\n");
  return `https://github.com/Ignosha/noshashi/issues/new?${new URLSearchParams({ title, body, labels: "bug,noshrepair" }).toString()}`;
}
