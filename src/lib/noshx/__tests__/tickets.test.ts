import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * NOSHX and support tickets. The planner is pure and tested on its own;
 * the tools run against a stand-in for the ticket service (the server
 * functions themselves are tested against the live database in the
 * migration's rollback run), so what is checked here is what NOSHX asks
 * for, when it refuses, and what it says.
 */

const state = vi.hoisted(() => ({
  signedIn: true,
  staff: false,
  replies: [] as Array<{ id: string; body: string }>,
  updates: [] as Array<{ id: string; status?: string }>,
  opened: [] as Array<{ subject: string; body: string; category: string; priority: string }>,
}));

const TICKET = {
  id: "7d8b2c4e-0000-4000-8000-000000000001",
  number: 1042,
  accountId: "acct-1",
  subject: "How do I rotate a webhook signing secret?",
  category: "other" as const,
  priority: "normal" as const,
  status: "open" as "open" | "answered" | "resolved",
  appVersion: "1.0.13",
  platform: "macOS 14.6 · desktop",
  createdAt: "2026-09-27T10:00:00.000Z",
  lastMessageAt: "2026-09-27T10:00:00.000Z",
};

vi.mock("@/lib/supabase/client", () => ({
  supabase: () => ({
    auth: { getSession: async () => ({ data: { session: state.signedIn ? { user: { id: "acct-1" } } : null } }) },
  }),
}));

vi.mock("@/lib/support/tickets", async (original) => {
  const real = await original<typeof import("@/lib/support/tickets")>();
  return {
    ...real,
    isSupportStaff: async () => state.staff,
    listTickets: async () => [TICKET, { ...TICKET, id: "t2", number: 1043, subject: "Invoice question", status: "resolved" }],
    findTicket: async (n: number) => (n === 1042 ? TICKET : null),
    listMessages: async () => [
      { id: 1, ticketId: TICKET.id, authorId: "acct-1", authorRole: "customer", body: "Our webhook secret leaked in a log. How do I rotate the signing secret for webhooks?", createdAt: TICKET.createdAt },
    ],
    replyToTicket: async (id: string, body: string) => {
      state.replies.push({ id, body });
    },
    updateTicket: async (id: string, change: { status?: string }) => {
      state.updates.push({ id, ...change });
    },
    openTicket: async (input: { subject: string; body: string; category: string; priority: string }) => {
      state.opened.push(input);
      return { id: "new", number: 1044 };
    },
  };
});

vi.mock("@/lib/support/selfRepair", async (original) => {
  const real = await original<typeof import("@/lib/support/selfRepair")>();
  return {
    ...real,
    runSelfRepair: async () => ({
      at: "2026-09-28T09:00:00.000Z",
      version: "1.0.14",
      platform: "macOS · desktop",
      checks: [
        { id: "ledger", label: "Mainnet link", state: "repaired", detail: "Was disconnected; reconnected to another public server." },
        { id: "clock", label: "System clock", state: "fail", detail: "This computer's clock is 400 seconds ahead of the ledger.", action: "Turn on automatic date and time." },
      ],
      repaired: 1,
      failing: 1,
    }),
  };
});

const { planTickets, plan } = await import("../core/plan");
const { answerWithCore } = await import("../core/engine");
const { registerTicketTools } = await import("../ticketTools");
const { findTool, runToolRaw } = await import("../tools");

registerTicketTools();

const ctx = (request: string) => ({ has: () => true, spendFreeCheck: () => true, request });

beforeEach(() => {
  state.signedIn = true;
  state.staff = false;
  state.replies = [];
  state.updates = [];
  state.opened = [];
  TICKET.status = "open";
});

describe("planning ticket requests", () => {
  const tools = (q: string) => planTickets(q).calls.map((c) => [c.tool, c.input]);

  it("reads, lists, resolves and reopens by reference", () => {
    expect(tools("show NSH-1042")).toEqual([["read_ticket", { ticket: "NSH-1042" }]]);
    expect(tools("what's the status of nsh 1042?")).toEqual([["read_ticket", { ticket: "NSH-1042" }]]);
    expect(tools("close NSH-1042, it's fixed")).toEqual([["set_ticket_status", { ticket: "NSH-1042", status: "resolved" }]]);
    expect(tools("reopen NSH-1042")).toEqual([["set_ticket_status", { ticket: "NSH-1042", status: "open" }]]);
    expect(tools("show my tickets")).toEqual([["list_tickets", { status: "active" }]]);
    expect(tools("list all tickets")).toEqual([["list_tickets", { status: "any" }]]);
  });

  it("takes everything after the reference as the reply, and plans nothing from its words", () => {
    const q = "reply to NSH-1042: thanks, is rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe safe to pay?";
    expect(tools(q)).toEqual([["reply_ticket", { ticket: "NSH-1042", message: "thanks, is rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe safe to pay?" }]]);
    // The address inside the message is not checked.
    expect(plan(q, { tickets: true }).calls.map((c) => c.tool)).toEqual(["reply_ticket"]);
  });

  it("drafts, and only sends when told to", () => {
    expect(tools("answer NSH-1042")).toEqual([["answer_ticket", { ticket: "NSH-1042", send: false }]]);
    expect(tools("answer NSH-1042 and send it")).toEqual([["answer_ticket", { ticket: "NSH-1042", send: true }]]);
  });

  it("opens a ticket with the text given, or says what it needs", () => {
    expect(tools("open a ticket: Ledger Watch shows no events since this morning. The watch is active.")).toEqual([
      ["open_ticket", { subject: "Ledger Watch shows no events since this morning", body: "Ledger Watch shows no events since this morning. The watch is active." }],
    ]);
    const bare = planTickets("open a ticket");
    expect(bare.calls).toEqual([]);
    expect(bare.note).toMatch(/say what happened/);
  });

  it("repairs, and sends the report where asked", () => {
    expect(tools("the app is not working, can you fix it?")).toEqual([["self_repair", {}]]);
    expect(tools("open a ticket with this report")).toEqual([["self_repair", { open_ticket: true }]]);
    expect(tools("run a repair and post the report to NSH-1042")).toEqual([["self_repair", { post_to_ticket: "NSH-1042" }]]);
  });

  it("leaves ledger questions alone, and the website plans no tickets", () => {
    expect(planTickets("Who controls rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe?").calls).toEqual([]);
    expect(plan("show my tickets").calls).toEqual([]);
  });
});

describe("ticket tools", () => {
  it("reads a thread and answers it from NOSHASHI's own pages", async () => {
    const result = await answerWithCore("show NSH-1042", ctx("show NSH-1042"));
    expect(result.text).toContain("NSH-1042: How do I rotate a webhook signing secret?");
    expect(result.text).toContain("WAITING ON SUPPORT");
    expect(result.text).toContain("Our webhook secret leaked");
    expect(result.text).toMatch(/What NOSHASHI's pages say about this:[\s\S]*Source/);
    expect(result.text).toMatch(/secret/i);
  });

  it("lists the person's tickets", async () => {
    const result = await answerWithCore("my tickets", ctx("my tickets"));
    expect(result.text).toContain("Your tickets, 1 not yet resolved");
    expect(result.text).toContain("NSH-1042");
    expect(result.text).not.toContain("NSH-1043");
  });

  it("replies, resolves and opens only when asked, and says what it did", async () => {
    const reply = await answerWithCore("reply to NSH-1042: rotating it now, thank you", ctx("reply to NSH-1042: rotating it now, thank you"));
    expect(reply.text).toContain("Replied on NSH-1042");
    expect(state.replies).toEqual([{ id: TICKET.id, body: "rotating it now, thank you" }]);

    await answerWithCore("resolve NSH-1042", ctx("resolve NSH-1042"));
    expect(state.updates).toEqual([{ id: TICKET.id, status: "resolved" }]);

    const opened = await answerWithCore(
      "open a ticket: my invoice shows two charges for September.",
      ctx("open a ticket: my invoice shows two charges for September.")
    );
    expect(opened.text).toContain("Opened NSH-1044");
    expect(state.opened[0]).toMatchObject({ category: "billing", priority: "normal" });
  });

  it("refuses a write the person did not ask for", async () => {
    const r = await runToolRaw("reply_ticket", { ticket: "NSH-1042", message: "A reply nobody asked for." }, ctx("what is the reference fee?"));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/only when the operator asks/) });
    expect(state.replies).toEqual([]);
  });

  it("lets only support staff send an answer", async () => {
    const customer = await runToolRaw("answer_ticket", { ticket: "NSH-1042", send: true }, ctx("answer NSH-1042 and send it"));
    expect(customer).toMatchObject({ ok: false, error: expect.stringMatching(/Only NOSHASHI support/) });
    state.staff = true;
    const staff = await runToolRaw("answer_ticket", { ticket: "NSH-1042", send: true }, ctx("answer NSH-1042 and send it"));
    expect(staff.ok).toBe(true);
    expect(state.replies[0].body).toMatch(/^Thanks for writing in about/);
  });

  it("says a ticket it cannot see is not there, and asks for sign-in", async () => {
    expect(await runToolRaw("read_ticket", { ticket: "NSH-9" }, ctx("show NSH-9"))).toMatchObject({ ok: false, error: expect.stringMatching(/NSH-9 was not found/) });
    state.signedIn = false;
    const r = await answerWithCore("my tickets", ctx("my tickets"));
    expect(r.text).toMatch(/Support: Tickets need a signed-in account/);
  });

  it("runs self-repair and files the report on request", async () => {
    const repair = await answerWithCore("nothing is working, fix it", ctx("nothing is working, fix it"));
    expect(repair.text).toContain("NOSHX repaired 1 thing. 1 still needs attention.");
    expect(repair.text).toContain("✕ System clock");
    expect(repair.text).toContain('Say "open a ticket with this report"');

    const filed = await answerWithCore("open a ticket with this report", ctx("open a ticket with this report"));
    expect(filed.text).toContain("The report was sent with NSH-1044.");
    expect(state.opened[0]).toMatchObject({ subject: "Self-repair: System clock failing", category: "bug", priority: "high" });
  });

  it("keeps the website build free of ticket tools until the app registers them", () => {
    expect(findTool("self_repair")?.screen).toBe("Support › Self-repair");
  });
});
