import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The ticket client, minus the network: the Supabase client is replaced by
 * a recorder, so these tests check what the app sends and how it reads the
 * server's answers. The server-side rules (who may read and write what)
 * live in supabase/migrations/20260927130000_support_tickets.sql.
 */

const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const invoked: Array<{ name: string; body: unknown }> = [];
let nextRpc: unknown = { ok: true };

vi.mock("@/lib/supabase/client", () => {
  const chain = () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
    q.then = (resolve: (v: unknown) => void) => resolve({ data: [{ id: 41 }], error: null });
    return q;
  };
  return {
    supabase: () => ({
      schema: () => ({
        rpc: async (fn: string, args: Record<string, unknown>) => {
          calls.push({ fn, args });
          return { data: nextRpc, error: null };
        },
        from: () => chain(),
      }),
      functions: {
        invoke: async (name: string, options: { body: unknown }) => {
          invoked.push({ name, body: options.body });
          return { data: { ok: true, sent: false }, error: null };
        },
      },
    }),
  };
});

const { TicketError, openTicket, replyToTicket, ticketFromRow, ticketRef, updateTicket } = await import("../tickets");

// A published XRPL documentation vector (the genesis seed); it holds nothing.
const SEED = "snoPBrXtMeMyMHUVTgbuqAfg1SUTb";

beforeEach(() => {
  calls.length = 0;
  invoked.length = 0;
  nextRpc = { ok: true };
});

describe("support tickets", () => {
  it("are quoted as NSH-<number>", () => {
    expect(ticketRef({ number: 1042 })).toBe("NSH-1042");
  });

  it("are read from the server's rows", () => {
    const t = ticketFromRow({
      id: "c8ea00cf-47cf-4561-852b-4def9b419368",
      number: 7,
      account_id: "11111111-1111-1111-1111-111111111111",
      subject: "NOSHX will not open",
      category: "noshx",
      priority: "high",
      status: "answered",
      app_version: "1.0.10",
      platform: "macOS 12.7 · desktop",
      created_at: "2026-09-27T12:00:00Z",
      last_message_at: "2026-09-27T12:05:00Z",
    });
    expect(t).toMatchObject({ number: 7, accountId: "11111111-1111-1111-1111-111111111111", status: "answered", appVersion: "1.0.10" });
  });

  it("open with trimmed text, the chosen topic and priority, and the app version when allowed", async () => {
    nextRpc = { ok: true, id: "c8ea00cf-47cf-4561-852b-4def9b419368", number: 12 };
    const opened = await openTicket({ subject: "  Export fails  ", category: "bug", priority: "high", body: "  The CSV export writes an empty file.  ", includeEnvironment: true });
    expect(opened).toEqual({ id: "c8ea00cf-47cf-4561-852b-4def9b419368", number: 12 });
    expect(calls[0]).toMatchObject({
      fn: "open_support_ticket",
      args: { p_subject: "Export fails", p_category: "bug", p_priority: "high", p_body: "The CSV export writes an empty file." },
    });
    expect(String(calls[0].args.p_app_version)).toMatch(/\S/);
  });

  it("send no app version or platform when the customer unticks it", async () => {
    nextRpc = { ok: true, id: "x", number: 1 };
    await openTicket({ subject: "Question", category: "other", priority: "low", body: "How are verdicts signed?", includeEnvironment: false });
    expect(calls[0].args).toMatchObject({ p_app_version: null, p_platform: null });
  });

  it("refuse a secret seed before anything leaves the app", async () => {
    await expect(
      openTicket({ subject: "Help", category: "account", priority: "urgent", body: `my seed is ${SEED} please check`, includeEnvironment: false })
    ).rejects.toThrow(/secret key or seed/);
    await expect(replyToTicket("x", `here: ${SEED}`)).rejects.toBeInstanceOf(TicketError);
    expect(calls).toHaveLength(0);
  });

  it("turn a server refusal into a plain sentence", async () => {
    nextRpc = { ok: false, code: "RATE_LIMITED" };
    await expect(replyToTicket("x", "one more thing")).rejects.toThrow(/10 tickets today/);
    nextRpc = { ok: false, code: "INSUFFICIENT_PERMISSIONS" };
    await expect(updateTicket("x", { priority: "urgent" })).rejects.toThrow(/Only NOSHASHI support/);
  });

  it("email the other side after a reply, without making the reply wait on it", async () => {
    nextRpc = { ok: true, message_id: 88 };
    await replyToTicket("x", "Thanks, that fixed it.");
    await new Promise((r) => setTimeout(r, 0));
    expect(invoked).toEqual([{ name: "noshashi-support-notify", body: { message_id: 88 } }]);
  });
});
