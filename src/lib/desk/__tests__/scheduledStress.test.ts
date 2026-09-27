import { describe, it, expect } from "vitest";
import type { OrderBook } from "@/lib/xrpl/types";
import type { IssuerExposure } from "../risk";
import { DEFAULT_STRESS_CONFIG, SCENARIOS, stressPortfolio } from "../stress";
import { appendHistory, factsOf, failedSnapshot, nextRunAt, sanitizeSchedule, snapshotOf, type StressSnapshot } from "../scheduledStress";

function exposure(balance: number, posture: Partial<IssuerExposure["posture"]> = {}): IssuerExposure {
  return {
    issuer: "rIssuerOne",
    currencies: ["USD"],
    balance,
    posture: { address: "rIssuerOne", noFreeze: false, globalFreeze: false, requireAuth: false, masterDisabled: false, transferRateBps: 0, ...posture },
    severity: "ok",
    headline: "",
  };
}

function book(levels: Array<[number, number]>, mid: number): OrderBook {
  let cumulative = 0;
  const bids = levels.map(([price, quantity]) => {
    cumulative += quantity;
    return { price, quantity, listedQuantity: quantity, cumulative };
  });
  return { base: "USD", quote: "XRP", issuer: "rIssuerOne", bids, asks: [], mid, depthBidBanded: cumulative, depthAskBanded: 0, ledgerIndex: 90_000_000 };
}

const config = { ...DEFAULT_STRESS_CONFIG, scenario: SCENARIOS[1] };

describe("snapshotOf", () => {
  it("carries the stress report's own figures, which the Risk screen shows", () => {
    const report = stressPortfolio([{ exposure: exposure(1_000), currency: "USD", book: book([[2, 400], [1.9, 400]], 2.05), pool: null }], config);
    const s = snapshotOf("rWallet", "Treasury", report, "2026-09-27T12:00:00.000Z", 0);
    expect(s.markXrp).toBe(report.markXrp);
    expect(s.recoveryRatio).toBe(report.recoveryRatio);
    expect(s.freezableShare).toBe(report.freezableShare);
    expect(s.positions).toBe(1);
    expect(s.freezablePositions).toBe(1);
    expect(s.frozenPositions).toBe(0);
    const f = factsOf(s);
    expect(f.recovery_ratio).toBe(report.recoveryRatio);
    expect(f.trapped_xrp).toBe(report.positions[0].trappedXrp);
  });

  it("reports no ratio for a book with nothing to mark, so no rule can fire on it", () => {
    const s = snapshotOf("rXrpOnly", undefined, stressPortfolio([], config), "2026-09-27T12:00:00.000Z", 0);
    expect(Number.isNaN(s.recoveryRatio)).toBe(true);
    expect(Number.isNaN(factsOf(s).freezable_share)).toBe(true);
  });

  it("counts a frozen position", () => {
    const report = stressPortfolio([{ exposure: exposure(500, { globalFreeze: true }), currency: "USD", book: book([[2, 400]], 2.05), pool: null }], config);
    expect(snapshotOf("r", undefined, report, "t", 0).frozenPositions).toBe(1);
  });

  it("marks an unreadable wallet as unmeasured", () => {
    const f = factsOf(failedSnapshot("r", undefined, "stressed", "t", "actNotFound"));
    expect(Object.values(f).every((v) => Number.isNaN(v))).toBe(true);
  });
});

describe("schedule", () => {
  it("is due at once without a previous run, then every N hours", () => {
    const cfg = { enabled: true, everyHours: 6, scenario: "stressed" as const };
    expect(nextRunAt(null, cfg)).toBe(0);
    expect(nextRunAt("2026-09-27T00:00:00.000Z", cfg)).toBe(Date.parse("2026-09-27T06:00:00.000Z"));
  });

  it("sanitizes what was stored", () => {
    expect(sanitizeSchedule({ enabled: true, everyHours: 5, scenario: "nope" })).toEqual({ enabled: true, everyHours: 6, scenario: "stressed" });
    expect(sanitizeSchedule({ enabled: "yes", everyHours: 24, scenario: "crisis" })).toEqual({ enabled: false, everyHours: 24, scenario: "crisis" });
    expect(sanitizeSchedule(null).enabled).toBe(false);
  });

  it("keeps the latest readings per wallet", () => {
    const s = (address: string, i: number) => ({ address, at: `2026-09-27T00:${String(i).padStart(2, "0")}:00.000Z` }) as StressSnapshot;
    const history = Array.from({ length: 40 }, (_, i) => s("rA", i % 60));
    const out = appendHistory(history, [s("rB", 59)], 30);
    expect(out.filter((x) => x.address === "rA")).toHaveLength(30);
    expect(out.filter((x) => x.address === "rB")).toHaveLength(1);
  });
});
