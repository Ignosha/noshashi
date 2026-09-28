import { supabase } from "@/lib/supabase/client";
import {
  CATEGORIES,
  PRIORITIES,
  STATUS_LABEL,
  findTicket,
  isSupportStaff,
  listMessages,
  listTickets,
  openTicket,
  replyToTicket,
  ticketRef,
  updateTicket,
  type Ticket,
  type TicketCategory,
  type TicketMessage,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support/tickets";
import { repairReportText, runSelfRepair, type RepairReport } from "@/lib/support/selfRepair";
import { searchKnowledge } from "./knowledge";
import { registerTools, type NoshxTool, type ToolContext } from "./tools";

/**
 * NOSHX and support tickets: read, answer, open, reply to, resolve and
 * reopen them, and run self-repair, from the conversation.
 *
 * Every ticket read and write goes through the same row-level security and
 * server functions as the Support screen, so NOSHX can see and change only
 * what the signed-in person could there: a customer their own tickets,
 * support staff every ticket. A write runs only when the person's own
 * words this turn asked for one (context.request), so a model can never
 * post, open or close a ticket on its own initiative.
 *
 * Kept apart from ./tools.ts so the website's NOSHX build, which has no
 * accounts, never bundles them: the desktop app calls registerTicketTools().
 */

export class TicketToolError extends Error {}

const REF = /\bNSH-?\s?(\d{1,9})\b/i;

/** Words that show the person asked for a ticket to be changed or sent. */
const WRITE_ASKED = /\b(ticket|tickets|NSH-?\s?\d|support|reply|respond|answer|send|post|close|resolve|reopen|open|file|report|escalate)\b/i;

function requireAsked(context: ToolContext, what: string) {
  if (!context.request || !WRITE_ASKED.test(context.request)) {
    throw new TicketToolError(`Not done: ${what} only when the operator asks for it in their own message. Ask them to confirm.`);
  }
}

async function requireSignIn(): Promise<string> {
  const { data } = await supabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new TicketToolError("Tickets need a signed-in account. Sign in from the account menu, then ask again.");
  return id;
}

async function ticketFrom(input: Record<string, unknown>): Promise<Ticket> {
  const raw = String(input.ticket ?? "").trim();
  const match = REF.exec(raw) ?? /^(\d{1,9})$/.exec(raw);
  if (!match) throw new TicketToolError("ticket must be a reference such as NSH-1042.");
  await requireSignIn();
  const ticket = await findTicket(Number(match[1]));
  if (!ticket) throw new TicketToolError(`NSH-${match[1]} was not found, or it is not yours to see.`);
  return ticket;
}

export type TicketSummary = {
  ref: string;
  subject: string;
  status: TicketStatus;
  statusLabel: string;
  priority: TicketPriority;
  category: TicketCategory;
  lastMessageAt: string;
  mine: boolean;
};

const summarize = (t: Ticket, me: string): TicketSummary => ({
  ref: ticketRef(t),
  subject: t.subject,
  status: t.status,
  statusLabel: STATUS_LABEL[t.status],
  priority: t.priority,
  category: t.category,
  lastMessageAt: t.lastMessageAt,
  mine: t.accountId === me,
});

export type TicketList = { staff: boolean; tickets: TicketSummary[]; total: number; filter: string };

export type TicketThread = {
  ticket: TicketSummary & { appVersion: string | null; platform: string | null; createdAt: string };
  staff: boolean;
  messages: Array<{ from: "customer" | "staff"; at: string; body: string }>;
  earlier: number;
  /** What NOSHASHI's own pages say about the latest customer message. */
  suggested: { text: string; sources: string[] } | null;
};

/** The most recent thing the customer asked, which an answer should address. */
function latestQuestion(ticket: Ticket, messages: TicketMessage[]): string {
  const customer = messages.filter((m) => m.authorRole === "customer");
  const last = customer[customer.length - 1]?.body ?? "";
  return `${ticket.subject}. ${last}`.slice(0, 600);
}

/**
 * An answer to a ticket from NOSHASHI's pages: the passages that best match
 * what the customer asked, quoted with their sources. Nothing is invented;
 * when nothing matches it says so.
 */
export async function suggestAnswer(ticket: Ticket, messages: TicketMessage[]): Promise<TicketThread["suggested"]> {
  const hits = await searchKnowledge(latestQuestion(ticket, messages), 3).catch(() => []);
  if (hits.length === 0) return null;
  const best = hits.slice(0, 2);
  const text = best
    .map((hit) => hit.text.replace(/^Q: .*\nA: /, "").trim().slice(0, 700))
    .join("\n\n");
  return { text, sources: best.map((hit) => `${hit.title} · ${hit.source}`) };
}

function draftReply(ticket: Ticket, suggested: NonNullable<TicketThread["suggested"]>): string {
  return [
    `Thanks for writing in about "${ticket.subject}".`,
    "",
    suggested.text,
    "",
    `More: ${suggested.sources.map((s) => s.split(" · ").pop()).join(", ")}`,
    "",
    "If this does not solve it, reply here with what you see and we will take it from there.",
  ].join("\n");
}

const enumOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

function guessCategory(text: string): TicketCategory {
  if (/bill|invoice|charge|refund|plan|subscription|upgrade|pay(ment)? method/i.test(text)) return "billing";
  if (/sign.?in|log.?in|password|account|email|sso|two.?factor|2fa/i.test(text)) return "account";
  if (/noshx|agent|model|ollama/i.test(text)) return "noshx";
  if (/verdict|verif|certificate|receipt|policy|go\/?no.?go|hold/i.test(text)) return "verification";
  if (/ledger|xrpl|balance|transaction|trust ?line|issuer|address|watch|deposit/i.test(text)) return "ledger-data";
  if (/secur|leak|phish|vulnerab|hack/i.test(text)) return "security";
  if (/feature|would like|could you add|request|suggest/i.test(text)) return "feature";
  if (/bug|broken|crash|error|not working|doesn'?t work|fail/i.test(text)) return "bug";
  return "other";
}

const text = (description: string) => ({ type: "string", description });

export const TICKET_TOOLS: NoshxTool[] = [
  {
    name: "list_tickets",
    description:
      "The signed-in person's support tickets (support staff see every customer's), newest activity first, with reference (NSH-…), subject, status and priority.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string", description: "Which tickets", enum: ["open", "answered", "resolved", "active", "any"] } },
      required: [],
      additionalProperties: false,
    },
    feature: null,
    screen: "Support",
    run: async (input): Promise<TicketList> => {
      const me = await requireSignIn();
      const filter = enumOf(input.status, ["open", "answered", "resolved", "active", "any"] as const, "active");
      const [all, staff] = await Promise.all([listTickets(), isSupportStaff()]);
      const kept = all.filter((t) => filter === "any" || (filter === "active" ? t.status !== "resolved" : t.status === filter));
      return { staff, filter, total: kept.length, tickets: kept.slice(0, 25).map((t) => summarize(t, me)) };
    },
  },
  {
    name: "read_ticket",
    description:
      "One ticket by reference (NSH-1042): its status, the whole thread, and the answer NOSHASHI's own pages give to what the customer asked.",
    input_schema: {
      type: "object",
      properties: { ticket: text("Ticket reference, e.g. NSH-1042") },
      required: ["ticket"],
      additionalProperties: false,
    },
    feature: null,
    screen: "Support",
    run: async (input): Promise<TicketThread> => {
      const ticket = await ticketFrom(input);
      const me = await requireSignIn();
      const [messages, staff] = await Promise.all([listMessages(ticket.id), isSupportStaff()]);
      const shown = messages.slice(-12);
      return {
        ticket: { ...summarize(ticket, me), appVersion: ticket.appVersion, platform: ticket.platform, createdAt: ticket.createdAt },
        staff,
        messages: shown.map((m) => ({ from: m.authorRole, at: m.createdAt, body: m.body })),
        earlier: messages.length - shown.length,
        suggested: ticket.status === "resolved" ? null : await suggestAnswer(ticket, messages),
      };
    },
  },
  {
    name: "answer_ticket",
    description:
      "Draft a reply to a ticket from NOSHASHI's own pages. With send true (support staff only, and only when asked), posts it to the customer.",
    input_schema: {
      type: "object",
      properties: {
        ticket: text("Ticket reference, e.g. NSH-1042"),
        send: { type: "boolean", description: "Post the draft to the ticket. Only when the operator asked to send it." },
      },
      required: ["ticket"],
      additionalProperties: false,
    },
    feature: null,
    screen: "Support",
    run: async (input, context) => {
      const ticket = await ticketFrom(input);
      const [messages, staff] = await Promise.all([listMessages(ticket.id), isSupportStaff()]);
      const suggested = await suggestAnswer(ticket, messages);
      if (!suggested) {
        return { ref: ticketRef(ticket), sent: false, draft: null, note: "NOSHASHI's pages have nothing that answers this ticket; it needs a person." };
      }
      const draft = draftReply(ticket, suggested);
      if (input.send === true) {
        if (!staff) throw new TicketToolError("Only NOSHASHI support posts answers to a ticket. Here is what the pages say instead.");
        requireAsked(context, "an answer is posted to a customer");
        await replyToTicket(ticket.id, draft);
        return { ref: ticketRef(ticket), sent: true, draft };
      }
      return { ref: ticketRef(ticket), sent: false, draft, sources: suggested.sources, staff };
    },
  },
  {
    name: "open_ticket",
    description:
      "Open a support ticket for the signed-in person, with the app version and platform attached. Only when the operator asked to open or file one.",
    input_schema: {
      type: "object",
      properties: {
        subject: text("A short subject, 4 to 160 characters"),
        body: text("What happened, at least 10 characters"),
        category: { type: "string", description: "Category", enum: CATEGORIES.map((c) => c.id) },
        priority: { type: "string", description: "Priority", enum: PRIORITIES.map((p) => p.id) },
      },
      required: ["subject", "body"],
      additionalProperties: false,
    },
    feature: null,
    screen: "Support",
    run: async (input, context) => {
      requireAsked(context, "a ticket is opened");
      await requireSignIn();
      const subject = String(input.subject ?? "").trim().slice(0, 160);
      const body = String(input.body ?? "").trim();
      const opened = await openTicket({
        subject,
        body,
        category: enumOf(input.category, CATEGORIES.map((c) => c.id), guessCategory(`${subject} ${body}`)),
        priority: enumOf(input.priority, PRIORITIES.map((p) => p.id), "normal"),
        includeEnvironment: true,
      });
      return { ref: `NSH-${opened.number}`, opened: true, subject };
    },
  },
  {
    name: "reply_ticket",
    description: "Add a message to a ticket's thread, in the signed-in person's name. Only when the operator asked to reply.",
    input_schema: {
      type: "object",
      properties: { ticket: text("Ticket reference, e.g. NSH-1042"), message: text("The reply, at least 10 characters") },
      required: ["ticket", "message"],
      additionalProperties: false,
    },
    feature: null,
    screen: "Support",
    run: async (input, context) => {
      requireAsked(context, "a reply is posted");
      const ticket = await ticketFrom(input);
      const message = String(input.message ?? "").trim();
      await replyToTicket(ticket.id, message);
      return { ref: ticketRef(ticket), replied: true, message };
    },
  },
  {
    name: "set_ticket_status",
    description:
      "Resolve or reopen a ticket (a customer their own; support staff any, and may also mark it answered). Only when the operator asked.",
    input_schema: {
      type: "object",
      properties: {
        ticket: text("Ticket reference, e.g. NSH-1042"),
        status: { type: "string", description: "New status", enum: ["resolved", "open", "answered"] },
      },
      required: ["ticket", "status"],
      additionalProperties: false,
    },
    feature: null,
    screen: "Support",
    run: async (input, context) => {
      requireAsked(context, "a ticket's status is changed");
      const ticket = await ticketFrom(input);
      const status = enumOf(input.status, ["resolved", "open", "answered"] as const, "resolved");
      if (ticket.status === status) return { ref: ticketRef(ticket), status, changed: false };
      await updateTicket(ticket.id, { status });
      return { ref: ticketRef(ticket), status, changed: true, was: ticket.status };
    },
  },
  {
    name: "self_repair",
    description:
      "Check and repair NOSHASHI on this computer: the mainnet link (reconnects to another server), the clock, sign-in (renews it), the NOSHASHI server, the plan (re-reads it), watched accounts, saved settings (clears damaged ones), the help index and the app version. Can post the report to a ticket or open one with it.",
    input_schema: {
      type: "object",
      properties: {
        post_to_ticket: text("Optional ticket reference to post the report to, e.g. NSH-1042"),
        open_ticket: { type: "boolean", description: "Open a new ticket with the report. Only when the operator asked." },
      },
      required: [],
      additionalProperties: false,
    },
    feature: null,
    screen: "Support › Self-repair",
    run: async (input, context) => {
      const report: RepairReport = await runSelfRepair({
        refreshPlan: context.refreshPlan,
        tier: context.tier,
        organizationId: context.organizationId ?? null,
      });
      const body = repairReportText(report);
      let posted: string | null = null;
      if (typeof input.post_to_ticket === "string" && input.post_to_ticket.trim()) {
        requireAsked(context, "the report is posted to a ticket");
        const ticket = await ticketFrom({ ticket: input.post_to_ticket });
        await replyToTicket(ticket.id, `Self-repair report from NOSHX:\n\n${body}`);
        posted = ticketRef(ticket);
      } else if (input.open_ticket === true) {
        requireAsked(context, "a ticket is opened");
        await requireSignIn();
        const failing = report.checks.filter((c) => c.state === "fail").map((c) => c.label);
        const opened = await openTicket({
          subject: failing.length ? `Self-repair: ${failing.join(", ")} failing`.slice(0, 160) : "Self-repair report",
          body: `${context.request && !/^\s*(open|file)/i.test(context.request) ? `${context.request.slice(0, 1500)}\n\n` : ""}Self-repair report from NOSHX:\n\n${body}`,
          category: "bug",
          priority: failing.length ? "high" : "normal",
          includeEnvironment: true,
        });
        posted = `NSH-${opened.number}`;
      }
      return { report, text: body, posted };
    },
  },
];

for (const tool of TICKET_TOOLS) tool.compose = (value) => composeTicketTool(tool.name, value);

/** Makes the support tools available to NOSHX (Core and models alike). */
export function registerTicketTools() {
  registerTools(TICKET_TOOLS);
}

// ————— In sentences, for NOSHX Core —————

const when = (iso: string) => iso.slice(0, 16).replace("T", " ") + " UTC";

export function composeTicketTool(tool: string, value: unknown): string {
  switch (tool) {
    case "list_tickets": {
      const r = value as TicketList;
      const scope = r.staff ? "Tickets across all customers" : "Your tickets";
      const which = r.filter === "active" ? "not yet resolved" : r.filter === "any" ? "in total" : STATUS_LABEL[r.filter as TicketStatus].toLowerCase();
      if (r.total === 0) {
        return `${scope}: none ${which}.${r.staff ? "" : " To open one, say: open a ticket: what happened."}`;
      }
      const lines = r.tickets.map(
        (t) => `· ${t.ref} ${t.statusLabel} · ${t.priority} · ${t.subject} (last message ${when(t.lastMessageAt)})`
      );
      return [
        `${scope}, ${r.total} ${which}${r.total > r.tickets.length ? `, newest ${r.tickets.length} shown` : ""}:`,
        ...lines,
        `Say "show ${r.tickets[0].ref}" to read one${r.staff ? `, or "answer ${r.tickets[0].ref}" for a reply drafted from NOSHASHI's pages` : ""}.`,
      ].join("\n");
    }
    case "read_ticket": {
      const r = value as TicketThread;
      const t = r.ticket;
      const thread = r.messages.map((m) => `${m.from === "staff" ? "Support" : "Customer"}, ${when(m.at)}:\n${m.body.slice(0, 900)}`);
      const lines = [
        `${t.ref}: ${t.subject}`,
        `${t.statusLabel} · ${t.priority} priority · ${t.category} · opened ${when(t.createdAt)}${t.appVersion ? ` · NOSHASHI ${t.appVersion}` : ""}${t.platform ? ` on ${t.platform}` : ""}`,
        r.earlier ? `(${r.earlier} earlier message${r.earlier === 1 ? "" : "s"} not shown)` : "",
        ...thread,
      ];
      if (r.suggested) {
        lines.push(
          `What NOSHASHI's pages say about this:\n${r.suggested.text}\nSource${r.suggested.sources.length > 1 ? "s" : ""}: ${r.suggested.sources.join("; ")}`
        );
      }
      lines.push(
        r.staff
          ? `Say "answer ${t.ref} and send" to post that as the reply, "reply to ${t.ref}: …" to write your own, or "resolve ${t.ref}".`
          : t.status === "resolved"
            ? `Say "reopen ${t.ref}" if it is not solved.`
            : `Say "reply to ${t.ref}: …" to add to it, or "resolve ${t.ref}" if it is solved.`
      );
      return lines.filter(Boolean).join("\n\n");
    }
    case "answer_ticket": {
      const r = value as { ref: string; sent: boolean; draft: string | null; note?: string; staff?: boolean };
      if (!r.draft) return `${r.ref}: ${r.note}`;
      if (r.sent) return `Posted to ${r.ref}; the customer sees it under Support and is emailed when email is set up:\n\n${r.draft}`;
      return `Suggested answer for ${r.ref}, from NOSHASHI's pages (not sent):\n\n${r.draft}${r.staff ? `\n\nSay "answer ${r.ref} and send" to post it.` : ""}`;
    }
    case "open_ticket": {
      const r = value as { ref: string; subject: string };
      return `Opened ${r.ref}: "${r.subject}", with this app's version and platform attached. Support sees it at once, and replies appear under Support (ask me "show ${r.ref}" any time).`;
    }
    case "reply_ticket": {
      const r = value as { ref: string };
      return `Replied on ${r.ref}. The other side sees it under Support and is emailed when email is set up.`;
    }
    case "set_ticket_status": {
      const r = value as { ref: string; status: TicketStatus; changed: boolean };
      return r.changed ? `${r.ref} is now ${STATUS_LABEL[r.status].toLowerCase()}.` : `${r.ref} was already ${STATUS_LABEL[r.status].toLowerCase()}; nothing changed.`;
    }
    case "self_repair": {
      const r = value as { report: RepairReport; text: string; posted: string | null };
      const tail = r.posted
        ? `\n\nThe report was sent with ${r.posted}.`
        : r.report.failing
          ? `\n\nSay "open a ticket with this report" to send it to support.`
          : "";
      return `${r.text}${tail}`;
    }
    default:
      return "";
  }
}
