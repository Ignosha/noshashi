import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Self-repair's decisions: what it repairs, what it only reports, and
 * that "repaired" is claimed only after a second probe succeeded.
 */

const s = vi.hoisted(() => ({
  connected: true,
  reconnects: 0,
  ledgerFailures: 0,
  closeOffset: 5,
  session: null as null | { expires_at: number; user: { email: string } },
  refreshed: 0,
}));

vi.mock("@/lib/env", () => ({ isTauri: false }));
vi.mock("@/lib/updates", () => ({ checkForUpdate: async () => null }));
vi.mock("@/lib/agent/client", () => ({ autodetect: async () => null }));
vi.mock("@/lib/noshx/knowledge", () => ({ searchKnowledge: async () => [{ title: "Pricing", text: "…" }] }));
vi.mock("@/lib/xrpl/link", () => ({
  xrplLink: {
    isConnected: () => s.connected,
    reconnect: async () => {
      s.reconnects += 1;
      s.connected = true;
      return true;
    },
  },
}));
vi.mock("@/lib/xrpl/client", () => ({
  rpc: async () => {
    if (s.ledgerFailures > 0) {
      s.ledgerFailures -= 1;
      throw new Error("Request timed out");
    }
    return { ledger: { ledger_index: "100000000", close_time: Math.floor(Date.now() / 1000) - 946684800 - s.closeOffset } };
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: s.session } }),
      refreshSession: async () => {
        s.refreshed += 1;
        return { error: null };
      },
    },
    schema: () => ({ rpc: async () => ({ data: false, error: null }) }),
  }),
}));

const { runSelfRepair, repairReportText } = await import("../selfRepair");

beforeEach(() => {
  Object.assign(s, { connected: true, reconnects: 0, ledgerFailures: 0, closeOffset: 5, session: null, refreshed: 0 });
});

const byId = (report: Awaited<ReturnType<typeof runSelfRepair>>, id: string) => report.checks.find((c) => c.id === id);

describe("self-repair", () => {
  it("reports a healthy app as healthy", async () => {
    const report = await runSelfRepair();
    expect(report.failing).toBe(0);
    expect(report.repaired).toBe(0);
    expect(byId(report, "ledger")?.state).toBe("pass");
    expect(repairReportText(report)).toMatch(/^Everything NOSHX can check is working\./);
  });

  it("reconnects a dropped link and a silent one, and says so", async () => {
    s.connected = false;
    expect(byId(await runSelfRepair(), "ledger")?.state).toBe("repaired");
    s.ledgerFailures = 1;
    const silent = await runSelfRepair();
    expect(byId(silent, "ledger")).toMatchObject({ state: "repaired", detail: expect.stringMatching(/not answering/) });
  });

  it("fails, with the fix, when no server answers after switching", async () => {
    s.ledgerFailures = 2;
    const report = await runSelfRepair();
    expect(byId(report, "ledger")).toMatchObject({ state: "fail", action: expect.stringMatching(/firewall/) });
    expect(byId(report, "clock")).toBeUndefined();
  });

  it("catches a wrong system clock against the ledger's close time", async () => {
    s.closeOffset = 600;
    const report = await runSelfRepair();
    expect(byId(report, "clock")).toMatchObject({ state: "fail", action: expect.stringMatching(/automatic date and time/) });
  });

  it("renews a sign-in about to expire and re-reads the plan", async () => {
    s.session = { expires_at: Math.floor(Date.now() / 1000) + 30, user: { email: "someone@example.com" } };
    let tier = "operator";
    const report = await runSelfRepair({ refreshPlan: async () => void (tier = "strategic"), tier: () => tier });
    expect(s.refreshed).toBe(1);
    expect(byId(report, "session")?.state).toBe("repaired");
    expect(byId(report, "plan")).toMatchObject({ state: "repaired", detail: expect.stringContaining("the server says strategic") });
  });

  it("removes saved settings that no longer parse", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        get length() {
          return store.size;
        },
        key: (i: number) => [...store.keys()][i] ?? null,
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    window.localStorage.setItem("noshashi:broken", "{not json");
    window.localStorage.setItem("noshashi:fine", '{"a":1}');
    const report = await runSelfRepair();
    expect(byId(report, "storage")?.state).toBe("repaired");
    expect(window.localStorage.getItem("noshashi:broken")).toBeNull();
    expect(window.localStorage.getItem("noshashi:fine")).toBe('{"a":1}');
    vi.unstubAllGlobals();
  });
});
