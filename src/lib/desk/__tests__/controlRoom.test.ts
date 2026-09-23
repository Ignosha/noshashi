import { describe, it, expect } from "vitest";
import { controlRoom, hasPolicyException, type ControlRoomInput } from "@/lib/desk/controlRoom";
import { openCase, mutate } from "@/lib/desk/investigations";
import type { LedgerEntry } from "@/lib/desk/ledger";
import type { WalletSnapshot } from "@/lib/desk/portfolio";
import type { DriftAlert } from "@/lib/desk/watch";
import type { PolicyException } from "@/lib/org/governance";

const NOW = Date.parse("2026-09-24T12:00:00Z");
const A = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

const entry = (over: Partial<LedgerEntry>): LedgerEntry =>
  ({
    id: Math.random().toString(36).slice(2),
    subject: A,
    domainCode: "SETL",
    verdict: "go",
    digest: "A".repeat(64),
    amountXrp: 100,
    failedRules: [],
    checksPassed: 8,
    checksTotal: 8,
    latencyMs: 2,
    at: "2026-09-24T10:00:00Z",
    offline: false,
    ...over,
  }) as LedgerEntry;

const snap = (over: Partial<WalletSnapshot>): WalletSnapshot => ({
  address: A,
  label: null,
  account: { balanceXrp: "100" } as WalletSnapshot["account"],
  credentials: [],
  verdict: "go",
  failing: 0,
  error: null,
  loading: false,
  ...over,
});

const base = (over: Partial<ControlRoomInput> = {}): ControlRoomInput => ({
  now: NOW,
  portfolio: { snapshots: [], alerts: [] },
  entries: [],
  drift: [],
  watchedIssuers: [],
  cases: [],
  orgExceptions: null,
  ...over,
});

describe("control room — exposure is live or explicitly unavailable, never a guess", () => {
  it("sums live balances of readable wallets only, and says how many were left out", () => {
    const r = controlRoom(base({ portfolio: { snapshots: [snap({ account: { balanceXrp: "1250.5" } as never }), snap({ address: "rB", account: null, error: "actNotFound" })], alerts: [] } }));
    expect(r.exposure).toEqual({
      state: "ok",
      value: { xrp: 1250.5, wallets: 1, unreadable: 1 },
      note: "1 wallet could not be read and is not included.",
    });
  });

  it("no access, no wallets, or still reading → unavailable with the reason, not 0", () => {
    expect(controlRoom(base({ portfolio: { unavailable: "Sign in." } })).exposure).toEqual({ state: "unavailable", reason: "Sign in." });
    expect(controlRoom(base()).exposure.state).toBe("unavailable");
    expect(controlRoom(base({ portfolio: { snapshots: [snap({ loading: true })], alerts: [] } })).exposure.state).toBe("unavailable");
  });

  it("monitored entities: wallets plus distinct watched issuers; wallets unknown without the portfolio", () => {
    expect(controlRoom(base({ portfolio: { snapshots: [snap({}), snap({ address: "rB" })], alerts: [] }, watchedIssuers: ["rI1", "rI2", "rI1"] })).monitored).toEqual({ wallets: 2, issuers: 2, total: 4 });
    expect(controlRoom(base({ portfolio: { unavailable: "x" }, watchedIssuers: ["rI1"] })).monitored).toEqual({ wallets: null, issuers: 1, total: null });
  });
});

describe("control room — exceptions and critical items come from recorded verdicts and alerts", () => {
  const review = entry({ verdict: "hold", policyResults: [{ key: "hhi", id: "POLICY_HHI_LIMIT", label: "HHI limit", state: "REVIEW" }] as never });
  const noGo = entry({ verdict: "no-go", at: "2026-09-23T09:00:00Z" });
  const old = entry({ verdict: "no-go", at: "2026-07-01T00:00:00Z", policyResults: [{ state: "FAIL", label: "Reserve" }] as never });

  it("counts policy exceptions and NO-GO verdicts in the last 30 days only", () => {
    const r = controlRoom(base({ entries: [review, noGo, old, entry({})] }));
    expect(r.exceptions).toEqual({ recorded30d: 1, noGo30d: 1, pendingOrg: null });
    expect(hasPolicyException(review)).toBe(true);
    expect(hasPolicyException(entry({}))).toBe(false);
  });

  it("the feed carries each item's source and puts critical first; acknowledged drift is left out", () => {
    const drift: DriftAlert[] = [
      { id: "d1", at: "2026-09-24T08:00:00Z", issuer: "rI1", severity: "critical", field: "freeze", from: "off", to: "on", headline: "Issuer enabled global freeze", detail: "…" },
      { id: "d2", at: "2026-09-24T09:00:00Z", issuer: "rI2", severity: "warn", field: "x", from: "a", to: "b", headline: "seen", detail: "…", acknowledged: true },
    ];
    const r = controlRoom(base({ entries: [review, noGo], drift }));
    expect(r.feed.map((f) => [f.source, f.severity])).toEqual([
      ["issuer-watch", "critical"],
      ["verdict", "critical"],
      ["verdict", "warn"],
    ]);
    expect(r.critical).toBe(2);
    expect(r.feed[2].body).toContain("HHI limit");
  });

  it("pending organization exceptions are counted and listed", () => {
    const x = { id: "x1", status: "pending", requestedAt: "2026-09-24T11:00:00Z", reason: "Desk confirmed.", subject: A } as PolicyException;
    const r = controlRoom(base({ orgExceptions: [x, { ...x, id: "x2", status: "approved" }] }));
    expect(r.exceptions.pendingOrg).toBe(1);
    expect(r.feed.filter((f) => f.source === "exception")).toHaveLength(1);
  });
});

describe("control room — investigation queue", () => {
  it("open cases only, high priority first", async () => {
    const e1 = entry({ verdict: "no-go", digest: "B".repeat(64) });
    const e2 = entry({ verdict: "hold", digest: "C".repeat(64), subject: "rB" + "x".repeat(30) });
    let d = (await openCase({ schema: 1, cases: [] }, { entry: e2, actor: "a", now: "2026-09-24T10:00:00Z" })).data; // hold → medium
    const hi = await openCase(d, { entry: e1, actor: "a", now: "2026-09-24T10:01:00Z" }); // no-go → high
    d = hi.data;
    const closed = await openCase(d, { entry: entry({ digest: "D".repeat(64) }), actor: "a", now: "2026-09-24T10:02:00Z" });
    d = await mutate(closed.data, closed.id, { kind: "close", outcome: "cleared", rationale: "Nothing found on review." }, "a", "2026-09-24T10:03:00Z");
    const r = controlRoom(base({ cases: d.cases }));
    expect(r.queue.open).toBe(2);
    expect(r.queue.high).toBe(1);
    expect(r.queue.items[0].id).toBe(hi.id);
  });
});
