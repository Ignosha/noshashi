import { supabase } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";
import { containsLedgerSeed } from "@/lib/agent/secrets";

/**
 * Support tickets: the client side of noshashi.support_tickets.
 *
 * A signed-in customer opens a ticket and follows its thread; NOSHASHI's
 * support staff answer every ticket from the same screen. Reads use row
 * level security (a customer sees only their own tickets, staff see all);
 * every write goes through a server function that checks the caller, so
 * nothing here can write under another name or into another ticket.
 * After each write the other side is emailed, when the project has email
 * configured (supabase/functions/noshashi-support-notify).
 */

export type TicketStatus = "open" | "answered" | "resolved";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketCategory =
  | "account"
  | "billing"
  | "ledger-data"
  | "verification"
  | "noshx"
  | "bug"
  | "security"
  | "feature"
  | "other";

export const CATEGORIES: Array<{ id: TicketCategory; label: string }> = [
  { id: "bug", label: "Something is broken" },
  { id: "noshx", label: "NOSHX" },
  { id: "verification", label: "Verification and verdicts" },
  { id: "ledger-data", label: "Ledger data" },
  { id: "account", label: "Account and sign-in" },
  { id: "billing", label: "Billing and plans" },
  { id: "security", label: "Security" },
  { id: "feature", label: "Feature request" },
  { id: "other", label: "Other" },
];

export const PRIORITIES: Array<{ id: TicketPriority; label: string }> = [
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
  { id: "urgent", label: "Urgent (work is blocked)" },
];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "WAITING ON SUPPORT",
  answered: "SUPPORT REPLIED",
  resolved: "RESOLVED",
};

export type Ticket = {
  id: string;
  number: number;
  accountId: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  appVersion: string | null;
  platform: string | null;
  createdAt: string;
  lastMessageAt: string;
};

export type TicketMessage = {
  id: number;
  ticketId: string;
  authorId: string;
  authorRole: "customer" | "staff";
  body: string;
  createdAt: string;
};

/** The reference people quote: NSH-1042. */
export const ticketRef = (t: Pick<Ticket, "number">) => `NSH-${t.number}`;

const REFUSALS: Record<string, string> = {
  NOT_AUTHENTICATED: "Sign in to open or answer a ticket.",
  NOT_FOUND: "That ticket was not found, or it is not yours.",
  SUBJECT_INVALID: "Give the ticket a subject of 4 to 160 characters.",
  BODY_INVALID: "Describe the problem in at least 10 characters (up to 8,000).",
  MALFORMED: "The ticket was not in the expected form. Nothing was sent.",
  SECRET_IN_MESSAGE:
    "That text contains what looks like an XRP Ledger secret key or seed, so it was not sent. Support never needs it. Remove it, and move the funds to a new wallet if it was ever shared.",
  RATE_LIMITED: "That was sent a moment ago, or you have opened 10 tickets today. Try again shortly.",
  INSUFFICIENT_PERMISSIONS: "Only NOSHASHI support can make that change.",
};

export class TicketError extends Error {
  constructor(public code: string) {
    super(REFUSALS[code] ?? `The ticket was not changed (${code}).`);
  }
}

type TicketRow = {
  id: string;
  number: number;
  account_id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  app_version: string | null;
  platform: string | null;
  created_at: string;
  last_message_at: string;
};

type MessageRow = { id: number; ticket_id: string; author_id: string; author_role: "customer" | "staff"; body: string; created_at: string };

export const ticketFromRow = (r: TicketRow): Ticket => ({
  id: r.id,
  number: r.number,
  accountId: r.account_id,
  subject: r.subject,
  category: r.category,
  priority: r.priority,
  status: r.status,
  appVersion: r.app_version,
  platform: r.platform,
  createdAt: r.created_at,
  lastMessageAt: r.last_message_at,
});

export const messageFromRow = (r: MessageRow): TicketMessage => ({
  id: r.id,
  ticketId: r.ticket_id,
  authorId: r.author_id,
  authorRole: r.author_role,
  body: r.body,
  createdAt: r.created_at,
});

const db = () => supabase().schema("noshashi");

async function callSupport<T extends Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message || "The support service did not answer. Check your connection and try again.");
  const result = (data ?? {}) as { ok?: boolean; code?: string } & T;
  if (!result.ok) throw new TicketError(result.code ?? "UNKNOWN");
  return result;
}

/** Whether the signed-in person answers tickets. */
export async function isSupportStaff(): Promise<boolean> {
  const { data, error } = await db().rpc("is_support_staff");
  return !error && data === true;
}

/**
 * Tickets the caller may see: their own, or (for staff) everyone's. Row
 * level security decides which; `mine` narrows a staff member's view to
 * the tickets they opened themselves.
 */
export async function listTickets(options: { mine?: string } = {}): Promise<Ticket[]> {
  let query = db()
    .from("support_tickets")
    .select("id, number, account_id, subject, category, priority, status, app_version, platform, created_at, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (options.mine) query = query.eq("account_id", options.mine);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as TicketRow[]).map(ticketFromRow);
}

export async function listMessages(ticketId: string): Promise<TicketMessage[]> {
  const { data, error } = await db()
    .from("support_messages")
    .select("id, ticket_id, author_id, author_role, body, created_at")
    .eq("ticket_id", ticketId)
    .order("id", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as MessageRow[]).map(messageFromRow);
}

/** The app version and platform sent with a ticket, so support knows what it is looking at. */
export function environmentLine(): { appVersion: string; platform: string } {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const os = /Mac OS X ([\d_]+)/.exec(ua)?.[1]?.replace(/_/g, ".");
  const platform = /Windows NT/.test(ua)
    ? "Windows"
    : os
      ? `macOS ${os}`
      : /Mac/.test(ua)
        ? "macOS"
        : /Linux/.test(ua)
          ? "Linux"
          : "Unknown";
  return { appVersion: BRAND.version, platform: `${platform}${"__TAURI_INTERNALS__" in globalThis ? " · desktop" : " · browser"}` };
}

/** Email the other side about a new message. Never blocks or fails the write itself. */
async function notify(messageId: number | undefined): Promise<void> {
  if (!messageId) return;
  try {
    await supabase().functions.invoke("noshashi-support-notify", { body: { message_id: messageId } });
  } catch {
    // The ticket is written and visible in the app either way.
  }
}

async function firstMessageId(ticketId: string): Promise<number | undefined> {
  const { data } = await db().from("support_messages").select("id").eq("ticket_id", ticketId).order("id").limit(1);
  return (data as Array<{ id: number }> | null)?.[0]?.id;
}

export async function openTicket(input: {
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  body: string;
  includeEnvironment: boolean;
}): Promise<{ id: string; number: number }> {
  if ((await containsLedgerSeed(input.subject)) || (await containsLedgerSeed(input.body))) throw new TicketError("SECRET_IN_MESSAGE");
  const env = input.includeEnvironment ? environmentLine() : { appVersion: null, platform: null };
  const result = await callSupport<{ id: string; number: number }>("open_support_ticket", {
    p_subject: input.subject.trim(),
    p_category: input.category,
    p_priority: input.priority,
    p_body: input.body.trim(),
    p_app_version: env.appVersion,
    p_platform: env.platform,
  });
  void firstMessageId(result.id).then(notify);
  return { id: result.id, number: result.number };
}

export async function replyToTicket(ticketId: string, body: string): Promise<void> {
  if (await containsLedgerSeed(body)) throw new TicketError("SECRET_IN_MESSAGE");
  const result = await callSupport<{ message_id: number }>("reply_support_ticket", { p_ticket: ticketId, p_body: body.trim() });
  void notify(result.message_id);
}

export async function updateTicket(
  ticketId: string,
  change: { status?: TicketStatus; priority?: TicketPriority }
): Promise<void> {
  await callSupport("update_support_ticket", { p_ticket: ticketId, p_status: change.status ?? null, p_priority: change.priority ?? null });
}
