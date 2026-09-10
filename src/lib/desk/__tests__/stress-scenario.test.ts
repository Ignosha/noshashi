import { describe, expect, it } from "vitest";
import type { AmmPool, OrderBook } from "@/lib/xrpl/types";
import type { IssuerExposure } from "../risk";
import {
  DEFAULT_STRESS_CONFIG,
  SCENARIOS,
  stressPortfolio,
  stressSummaryLines,
  type StressInput,
} from "../stress";

/**
 * A realistic book, run through the engine, with the output pinned.
 *
 * The unit tests in stress.test.ts pin properties — routing beats the
 * book, contention is charged once, the waterfall reconciles. They do not
 * establish that the numbers a desk actually sees are *usable*: an engine
 * can satisfy every invariant and still report 0.2% recovery on every
 * position, or 99.9% on all of them, and either would make the screen
 * worthless while every property test passed.
 *
 * So this is a shaped fixture — one deep line, one thin line, two lines
 * sharing an issuer, one frozen — checked for the thing that is hard to
 * get right: that the readings are *differentiated*, ordered sensibly,
 * and land in ranges a risk committee would recognise.
 */

function book(
  levels: Array<[price: number, qty: number]>,
  mid: number,
  issuer: string
): OrderBook {
  let cumulative = 0;
  const bids = levels.map(([price, quantity]) => {
    cumulative += quantity;
    return { price, quantity, listedQuantity: quantity * 4, cumulative };
  });
  return {
    base: "USD",
    quote: "XRP",
    issuer,
    bids,
    asks: [],
    mid,
    spreadPct: 0.004,
    depthBidBanded: cumulative,
    depthAskBanded: 0,
    ledgerIndex: 94_812_004,
  };
}

function pool(xrp: number, asset: number, feeBps: number): AmmPool {
  return {
    exists: true,
    amountXrp: xrp,
    amount2: asset,
    currency2: "USD",
    tradingFeeBps: feeBps,
    impliedPrice: asset / xrp,
  };
}

function exposure(
  issuer: string,
  balance: number,
  posture: Partial<IssuerExposure["posture"]> = {}
): IssuerExposure {
  return {
    issuer,
    currencies: ["USD"],
    balance,
    posture: {
      address: issuer,
      noFreeze: false,
      globalFreeze: false,
      requireAuth: false,
      masterDisabled: false,
      transferRateBps: 0,
      ...posture,
    },
    severity: "ok",
    headline: "",
  };
}

/**
 * Prices are quote-per-XRP throughout, matching the convention in
 * liquidity.ts: a mid of 0.5 means one XRP buys half a unit, so a
 * 100,000-unit position marks at 200,000 XRP.
 */
const portfolio: StressInput[] = [
  // 1. Deep, clean issuer. Should recover almost everything.
  {
    exposure: exposure("rDeepClean", 100_000, { noFreeze: true }),
    currency: "USD",
    book: book([[0.5, 900_000], [0.52, 900_000]], 0.5, "rDeepClean"),
    pool: pool(400_000, 200_000, 30),
  },
  // 2. Thin book, live freeze rights. Should be visibly worse.
  {
    exposure: exposure("rThinFreezable", 80_000),
    currency: "USD",
    book: book([[0.5, 20_000], [0.75, 30_000]], 0.5, "rThinFreezable"),
    pool: pool(30_000, 15_000, 100),
  },
  // 3 & 4. Two lines on one issuer — they contend for one book.
  {
    exposure: exposure("rShared", 60_000, { noFreeze: true }),
    currency: "USD",
    book: book([[0.5, 100_000], [0.55, 60_000]], 0.5, "rShared"),
    pool: pool(90_000, 45_000, 50),
  },
  {
    exposure: exposure("rShared", 60_000, { noFreeze: true }),
    currency: "USD",
    book: book([[0.5, 100_000], [0.55, 60_000]], 0.5, "rShared"),
    pool: pool(90_000, 45_000, 50),
  },
  // 5. Frozen. Worth zero regardless of the book behind it.
  {
    exposure: exposure("rFrozen", 25_000, { globalFreeze: true }),
    currency: "USD",
    book: book([[0.5, 500_000]], 0.5, "rFrozen"),
    pool: null,
  },
];

describe("stress engine on a shaped portfolio", () => {
  const config = { ...DEFAULT_STRESS_CONFIG, scenario: SCENARIOS[1] }; // STRESSED

  it("produces a recovery ratio in a range a committee would recognise", () => {
    const report = stressPortfolio(portfolio, config);

    // The whole point is that this is neither ~0 nor ~1. A book with one
    // frozen line, one thin line and two contending lines should lose a
    // real but not catastrophic share of its mark.
    expect(report.recoveryRatio).toBeGreaterThan(0.35);
    expect(report.recoveryRatio).toBeLessThan(0.9);

    // Mark is the sum of position/mid: (100k + 80k + 60k + 60k + 25k)/0.5
    expect(report.markXrp).toBeCloseTo(650_000, 0);
  });

  it("differentiates the positions rather than reporting one number five times", () => {
    const report = stressPortfolio(portfolio, config);
    const ratios = report.positions.map((p) =>
      p.markXrp > 0 ? p.recoverableXrp / p.markXrp : 0
    );

    // Five positions, and the spread between best and worst must be wide.
    // A narrow spread would mean the model is dominated by one term and
    // the per-position detail on screen is decoration.
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeGreaterThan(0.5);

    const byIssuer = new Map(
      report.positions.map((p) => [p.issuer, p.recoverableXrp / Math.max(1, p.markXrp)])
    );
    // Deep and clean beats thin and freezable, by a lot.
    expect(byIssuer.get("rDeepClean")!).toBeGreaterThan(byIssuer.get("rThinFreezable")!);
    // Frozen is exactly zero, not merely low.
    expect(byIssuer.get("rFrozen")).toBe(0);
  });

  it("attributes the leak across all three named causes", () => {
    const report = stressPortfolio(portfolio, config);
    const leak = (id: string) =>
      report.waterfall.find((row) => row.id === id)?.xrp ?? 0;

    // Every mechanism the model claims to price must actually show up on
    // a portfolio built to exercise all three. A zero here would mean a
    // term is dead code that the property tests happened not to catch.
    expect(leak("slippage")).toBeGreaterThan(0);
    expect(leak("contention")).toBeGreaterThan(0);
    expect(leak("freeze")).toBeGreaterThan(0);

    // And no single cause should swamp the others to the point where the
    // breakdown stops being informative.
    const total = leak("slippage") + leak("contention") + leak("freeze");
    for (const id of ["slippage", "contention", "freeze"]) {
      expect(leak(id) / total).toBeLessThan(0.95);
    }
  });

  it("charges the shared issuer's two lines identically", () => {
    const report = stressPortfolio(portfolio, config);
    const shared = report.positions.filter((p) => p.issuer === "rShared");
    expect(shared).toHaveLength(2);
    // Equal size, so pro-rata allocation must give them the same answer.
    // Any asymmetry would mean an ordering crept into the allocation.
    expect(shared[0].contentionShare).toBeCloseTo(0.5, 9);
    expect(shared[1].recoverableXrp).toBeCloseTo(shared[0].recoverableXrp, 6);
  });

  it("gives a finite, plausible time to exit", () => {
    const report = stressPortfolio(portfolio, config);
    // Nothing here is unexitable except the frozen line, which has depth
    // behind it — so the book as a whole clears in a countable number of
    // days rather than reporting no exit.
    expect(Number.isFinite(report.daysToExit)).toBe(true);
    expect(report.daysToExit).toBeGreaterThan(0);
    expect(report.daysToExit).toBeLessThan(60);
  });

  it("moves monotonically and materially across the three scenarios", () => {
    const ratios = SCENARIOS.map(
      (scenario) =>
        stressPortfolio(portfolio, { ...DEFAULT_STRESS_CONFIG, scenario })
          .recoveryRatio
    );
    expect(ratios[0]).toBeGreaterThan(ratios[1]);
    expect(ratios[1]).toBeGreaterThan(ratios[2]);
    // If the scenarios barely differ, the selector on screen is a placebo.
    expect(ratios[0] - ratios[2]).toBeGreaterThan(0.15);
  });

  it("summarises into lines fit to paste into a committee note", () => {
    const lines = stressSummaryLines(stressPortfolio(portfolio, config));
    expect(lines.some((l) => l.startsWith("Mark:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Recoverable:"))).toBe(true);
    expect(lines.filter((l) => l.trimStart().startsWith("−")).length).toBeGreaterThanOrEqual(3);
    for (const line of lines) expect(line).not.toContain("NaN");
  });
});
