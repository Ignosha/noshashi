import { describe, expect, it } from "vitest";
import type { AmmPool, OrderBook } from "@/lib/xrpl/types";
import type { IssuerExposure } from "../risk";
import {
  DEFAULT_STRESS_CONFIG,
  SCENARIOS,
  ammProceeds,
  routeExit,
  stressPortfolio,
  stressSummaryLines,
  type StressInput,
} from "../stress";

/**
 * The stress engine produces the number a desk would put in front of a
 * risk committee, so the properties that matter are not "does it run" but
 * "can the arithmetic be defended". These tests pin the four claims the
 * module makes: routing never does worse than the book alone, contention
 * is not double-counted, a frozen balance is worth zero rather than
 * discounted, and the waterfall reconciles to the measured total.
 */

const orderly = SCENARIOS[0];
const stressed = SCENARIOS[1];
const crisis = SCENARIOS[2];

function book(levels: Array<[price: number, qty: number]>, mid: number): OrderBook {
  let cumulative = 0;
  const bids = levels.map(([price, quantity]) => {
    cumulative += quantity;
    return { price, quantity, listedQuantity: quantity, cumulative };
  });
  return {
    base: "USD",
    quote: "XRP",
    issuer: "rIssuerOne",
    bids,
    asks: [],
    mid,
    // Banded depth is what bookDepth prefers; keep it equal to the total
    // here so the fixtures say exactly what they mean.
    depthBidBanded: cumulative,
    depthAskBanded: 0,
    ledgerIndex: 90_000_000,
  };
}

function pool(xrp: number, asset: number, feeBps = 0): AmmPool {
  return {
    exists: true,
    amountXrp: xrp,
    amount2: asset,
    currency2: "USD",
    issuer2: "rIssuerOne",
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

const config = { ...DEFAULT_STRESS_CONFIG, scenario: orderly };

describe("ammProceeds", () => {
  it("follows the constant product invariant", () => {
    // Pool of 1,000 XRP against 1,000 USD. Selling 100 USD leaves the
    // product unchanged: 1000*1000 / 1100 = 909.09 XRP in the pool, so
    // 90.909 XRP comes out.
    const proceeds = ammProceeds(pool(1_000, 1_000), 100);
    expect(proceeds).toBeCloseTo(1_000 - 1_000_000 / 1_100, 6);
    expect(proceeds).toBeCloseTo(90.909_09, 4);
  });

  it("charges the trading fee on the way in", () => {
    const free = ammProceeds(pool(1_000, 1_000, 0), 100);
    const fee = ammProceeds(pool(1_000, 1_000, 100), 100); // 1%
    expect(fee).toBeLessThan(free);
  });

  it("is zero for a frozen or absent pool", () => {
    expect(ammProceeds({ exists: false }, 100)).toBe(0);
    expect(ammProceeds({ ...pool(1_000, 1_000), asset2Frozen: true }, 100)).toBe(0);
  });

  it("is concave — each extra unit gets a worse price", () => {
    const p = pool(1_000, 1_000);
    const first = ammProceeds(p, 100);
    const second = ammProceeds(p, 200) - first;
    expect(second).toBeLessThan(first);
  });
});

describe("routeExit", () => {
  it("never realises less than the resting book alone", () => {
    // This is the whole justification for routing. If the split could do
    // worse than the book by itself, the optimiser is broken and the
    // recoverable figure would understate rather than sharpen.
    const b = book([[1, 500], [1.05, 500]], 1);
    const p = pool(400, 400);
    const routed = routeExit(b, p, 900);
    expect(routed.proceedsXrp).toBeGreaterThanOrEqual(routed.bookOnlyProceedsXrp);
  });

  it("uses the pool when the book cannot absorb the size", () => {
    const b = book([[1, 100]], 1);
    const p = pool(5_000, 5_000);
    const routed = routeExit(b, p, 1_000);
    expect(routed.toPool).toBeGreaterThan(0);
    // The book alone leaves 900 unfilled; with the pool almost nothing is.
    expect(routed.unfilled).toBeLessThan(1);
  });

  it("reports the whole position unfilled when there is no venue", () => {
    const routed = routeExit(null, null, 250);
    expect(routed.unfilled).toBe(250);
    expect(routed.proceedsXrp).toBe(0);
  });

  it("applies depth retention to the book", () => {
    const b = book([[1, 1_000]], 1);
    const full = routeExit(b, null, 1_000, { book: 1, pool: 1 });
    const half = routeExit(b, null, 1_000, { book: 0.5, pool: 1 });
    expect(full.unfilled).toBeCloseTo(0, 6);
    expect(half.unfilled).toBeCloseTo(500, 6);
  });

  it("routes entirely to the pool when the book is empty", () => {
    const empty = { ...book([], 1), empty: true, depthBidBanded: 0 };
    const routed = routeExit(empty, pool(1_000, 1_000), 100);
    expect(routed.toBook).toBe(0);
    expect(routed.toPool).toBeGreaterThan(0);
  });
});

describe("stressPortfolio", () => {
  const oneDeepPosition: StressInput[] = [
    {
      exposure: exposure("rIssuerOne", 100, { noFreeze: true }),
      currency: "USD",
      book: book([[1, 100_000]], 1),
      pool: null,
    },
  ];

  it("recovers essentially all of mark for a small position in a deep book", () => {
    const report = stressPortfolio(oneDeepPosition, config);
    expect(report.recoveryRatio).toBeGreaterThan(0.99);
    expect(report.severity).toBe("ok");
    expect(report.freezableShare).toBe(0);
  });

  it("prices freeze rights as a haircut, not a warning", () => {
    const freezable: StressInput[] = [
      { ...oneDeepPosition[0], exposure: exposure("rIssuerOne", 100) },
    ];
    const report = stressPortfolio(freezable, config);
    const clean = stressPortfolio(oneDeepPosition, config);

    expect(report.recoverableXrp).toBeLessThan(clean.recoverableXrp);
    expect(report.freezableShare).toBe(1);
    // Orderly haircut is 3%, so the freeze line must be non-trivial and
    // must be the only leak that separates the two runs.
    const freezeLeak = report.waterfall.find((row) => row.id === "freeze");
    expect(freezeLeak?.xrp).toBeGreaterThan(0);
  });

  it("values an already-frozen balance at zero", () => {
    const frozen: StressInput[] = [
      {
        ...oneDeepPosition[0],
        exposure: exposure("rIssuerOne", 100, { globalFreeze: true }),
      },
    ];
    const report = stressPortfolio(frozen, config);
    expect(report.recoverableXrp).toBe(0);
    expect(report.positions[0].severity).toBe("critical");
    expect(report.positions[0].note).toContain("lsfGlobalFreeze");
  });

  it("does not double-count depth shared by two lines on one issuer", () => {
    // Two 5,000-unit lines on the same issuer, against a book that holds
    // 6,000. Assessed independently each one looks almost fillable; the
    // portfolio cannot fill both, and that has to show up.
    const shared: StressInput[] = [
      {
        exposure: exposure("rShared", 5_000, { noFreeze: true }),
        currency: "USD",
        book: book([[1, 6_000]], 1),
        pool: null,
      },
      {
        exposure: exposure("rShared", 5_000, { noFreeze: true }),
        currency: "USD",
        book: book([[1, 6_000]], 1),
        pool: null,
      },
    ];
    const report = stressPortfolio(shared, config);
    const contention = report.waterfall.find((row) => row.id === "contention");

    expect(contention?.xrp ?? 0).toBeGreaterThan(0);
    expect(report.positions[0].contentionShare).toBeCloseTo(0.5, 6);
    // 10,000 of position against 6,000 of depth cannot come out whole.
    expect(report.recoveryRatio).toBeLessThan(1);
  });

  it("gives a lone position on an issuer the whole book", () => {
    const report = stressPortfolio(oneDeepPosition, config);
    expect(report.positions[0].contentionShare).toBe(1);
    expect(report.positions[0].contentionLeakXrp).toBeCloseTo(0, 6);
  });

  it("reconciles the waterfall to the measured total", () => {
    // The claim the waterfall makes on screen is that recoverable plus
    // every leak equals mark. If that does not hold the chart is a lie,
    // whatever the individual numbers say.
    const mixed: StressInput[] = [
      {
        exposure: exposure("rA", 4_000),
        currency: "USD",
        book: book([[1, 3_000], [1.2, 2_000]], 1),
        pool: pool(1_000, 1_000, 50),
      },
      {
        exposure: exposure("rA", 2_000, { noFreeze: true }),
        currency: "USD",
        book: book([[1, 3_000], [1.2, 2_000]], 1),
        pool: pool(1_000, 1_000, 50),
      },
      {
        exposure: exposure("rB", 500, { globalFreeze: true }),
        currency: "EUR",
        book: book([[2, 5_000]], 2),
        pool: null,
      },
    ];

    for (const scenario of SCENARIOS) {
      const report = stressPortfolio(mixed, { ...DEFAULT_STRESS_CONFIG, scenario });
      const total = report.waterfall.reduce((sum, row) => sum + row.xrp, 0);
      expect(total).toBeCloseTo(report.markXrp, 4);
    }
  });

  it("recovers less as the scenario worsens", () => {
    const positions: StressInput[] = [
      {
        exposure: exposure("rA", 5_000),
        currency: "USD",
        book: book([[1, 4_000], [1.3, 4_000]], 1),
        pool: pool(2_000, 2_000, 30),
      },
    ];
    const ratios = SCENARIOS.map(
      (scenario) =>
        stressPortfolio(positions, { ...DEFAULT_STRESS_CONFIG, scenario }).recoveryRatio
    );
    expect(ratios[0]).toBeGreaterThan(ratios[1]);
    expect(ratios[1]).toBeGreaterThan(ratios[2]);
  });

  it("reports no exit rather than a long one when there is no venue", () => {
    const nothing: StressInput[] = [
      {
        exposure: exposure("rDead", 1_000),
        currency: "USD",
        book: { ...book([], 1), empty: true, depthBidBanded: 0 },
        pool: null,
      },
    ];
    const report = stressPortfolio(nothing, config);
    expect(report.daysToExit).toBe(Number.POSITIVE_INFINITY);
    expect(report.headline).toContain("no exit at all");
    // With no book and no pool there is no price the ledger evidences, so
    // there is no mark either — inventing one is the failure mode.
    expect(report.markXrp).toBe(0);
  });

  it("counts days to exit against the participation cap", () => {
    const positions: StressInput[] = [
      {
        exposure: exposure("rA", 1_000, { noFreeze: true }),
        currency: "USD",
        book: book([[1, 1_000]], 1),
        pool: null,
      },
    ];
    // 1,000 of depth, 20% cap = 200 a day, so 5 days.
    const report = stressPortfolio(positions, {
      ...DEFAULT_STRESS_CONFIG,
      participationCap: 0.2,
      scenario: orderly,
    });
    expect(report.daysToExit).toBe(5);

    // Crisis retains 20% of depth, so the same position takes 5x longer.
    const harder = stressPortfolio(positions, {
      ...DEFAULT_STRESS_CONFIG,
      participationCap: 0.2,
      scenario: crisis,
    });
    expect(harder.daysToExit).toBe(25);
  });

  it("handles an empty portfolio without dividing by zero", () => {
    const report = stressPortfolio([], config);
    expect(report.markXrp).toBe(0);
    expect(report.recoveryRatio).toBe(0);
    expect(report.freezableShare).toBe(0);
    expect(report.daysToExit).toBe(0);
    expect(report.headline).toBe("No marked position to stress.");
  });

  it("summarises deterministically", () => {
    const report = stressPortfolio(oneDeepPosition, { ...config, scenario: stressed });
    const lines = stressSummaryLines(report);
    expect(lines[0]).toContain("STRESSED");
    expect(lines.join("\n")).toContain("Recoverable:");
    expect(stressSummaryLines(report)).toEqual(lines);
  });
});
