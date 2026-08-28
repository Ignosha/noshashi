import { describe, it, expect } from "vitest";
import { simulateExit, bookDepth, assessExit } from "../liquidity";
import type { IssuerExposure } from "../risk";
import type { OrderBook, BookLevel } from "@/lib/xrpl/types";

/**
 * Exit liquidity.
 *
 * A paid Desk capability that answers "can I get out of this position",
 * and until now it had no tests at all — which is how its input stayed
 * wrong. Until the fix in the previous commit it summed the depth an order
 * book ADVERTISES rather than the depth an owner can deliver, and on a
 * measured mainnet book that overstated the exit by roughly fourteen
 * times. The arithmetic here was fine; it was being fed a fiction.
 *
 * So these tests pin both halves: that the verdict logic is right, and
 * that phantom depth cannot produce a reassuring answer.
 *
 * Every verdict fails dangerously in one direction. "Clear" on a position
 * that cannot be sold is the one that costs money, so the cases below lean
 * on what must NOT come back clear.
 */

const level = (price: number, quantity: number, listed = quantity): BookLevel => ({
  price,
  quantity,
  listedQuantity: listed,
  cumulative: 0,
});

/** Fill in cumulative the way toLevels does, so fixtures behave like reality. */
const withCumulative = (levels: BookLevel[]): BookLevel[] => {
  let running = 0;
  return levels.map((l) => {
    running += l.quantity;
    return { ...l, cumulative: running };
  });
};

/**
 * Build a book fixture.
 *
 * Derived fields are computed AFTER the override is applied, not before.
 * Spreading `over` last would replace the cumulative-annotated levels with
 * the raw ones the caller passed, leaving every cumulative at zero — which
 * is exactly what happened the first time this was written, and it failed
 * a test that was asserting correct behaviour.
 */
const book = (over: Partial<OrderBook> = {}): OrderBook => {
  const merged: OrderBook = {
    base: "USD",
    quote: "XRP",
    issuer: "rIssuer",
    bids: [level(0.5, 10_000)],
    asks: [level(0.52, 10_000)],
    mid: 0.51,
    spreadPct: 0.039,
    ledgerIndex: 106_599_989,
    ...over,
  };

  merged.bids = withCumulative(merged.bids);
  merged.asks = withCumulative(merged.asks);

  // Banded depth defaults to the full side, but an explicit value in
  // `over` — including undefined, to exercise the fallback — is honoured.
  if (!("depthBidBanded" in over)) {
    merged.depthBidBanded = merged.bids.reduce((s, l) => s + l.quantity, 0);
  }
  if (!("depthAskBanded" in over)) {
    merged.depthAskBanded = merged.asks.reduce((s, l) => s + l.quantity, 0);
  }
  return merged;
};

const exposure = (over: Partial<IssuerExposure> = {}): IssuerExposure => ({
  issuer: "rIssuer",
  currencies: ["USD"],
  balance: 1_000,
  posture: {
    address: "rIssuer",
    noFreeze: false,
    globalFreeze: false,
    requireAuth: false,
    masterDisabled: false,
    transferRateBps: 0,
  },
  severity: "ok",
  headline: "",
  ...over,
});

describe("simulateExit — filling into real depth", () => {
  it("fills completely when the book can absorb the position", () => {
    const fill = simulateExit(book(), 1_000);
    expect(fill.fillRate).toBe(1);
    expect(fill.filled).toBe(1_000);
  });

  it("reports a partial fill rather than pretending the rest cleared", () => {
    const fill = simulateExit(book({ bids: [level(0.5, 400)] }), 1_000);
    expect(fill.filled).toBe(400);
    expect(fill.fillRate).toBeCloseTo(0.4, 6);
  });

  it("refuses to fill into bids far below the market", () => {
    // The protection that matters: a bid at a thousandth of mid will
    // absorb any size on paper and report a 100% fill for a position
    // nobody would actually buy.
    const fill = simulateExit(
      book({ bids: [level(0.0005, 1_000_000)], mid: 0.51 }),
      1_000
    );
    expect(fill.filled).toBe(0);
    expect(fill.fillRate).toBe(0);
  });

  it("fills from phantom depth only up to what is funded", () => {
    // The bug this suite exists for: 1,000,000 advertised, 500 fundable.
    const fill = simulateExit(book({ bids: [level(0.5, 500, 1_000_000)] }), 1_000);
    expect(fill.filled).toBe(500);
    expect(fill.fillRate).toBeCloseTo(0.5, 6);
  });
});

describe("bookDepth — what counts as an exit", () => {
  it("prefers banded depth over total resting depth", () => {
    const b = book({
      bids: [level(0.5, 100), level(0.0005, 900_000)],
      depthBidBanded: 100,
    });
    expect(bookDepth(b).bid).toBe(100);
  });

  it("falls back to total depth only when no band was established", () => {
    const b = book({
      bids: [level(0.5, 100)],
      depthBidBanded: undefined,
      depthAskBanded: undefined,
      mid: undefined,
    });
    expect(bookDepth(b).bid).toBe(100);
  });

  it("returns zero for an empty side rather than undefined", () => {
    const b = book({ bids: [], depthBidBanded: 0 });
    expect(bookDepth(b).bid).toBe(0);
  });
});

describe("assessExit — what must never come back clear", () => {
  it("calls a frozen position trapped whatever the book looks like", () => {
    // Freeze beats everything: depth is irrelevant if the balance cannot
    // move at all.
    const a = assessExit(
      exposure({ posture: { ...exposure().posture, globalFreeze: true } }),
      book(),
      null,
      "USD"
    );
    expect(a.verdict).toBe("trapped");
    expect(a.severity).toBe("critical");
  });

  it("calls a position with no bid side trapped", () => {
    const a = assessExit(exposure(), book({ bids: [], depthBidBanded: 0 }), null, "USD");
    expect(a.verdict).toBe("trapped");
  });

  it("calls a position the book cannot absorb trapped", () => {
    const a = assessExit(exposure({ balance: 10_000 }), book({ bids: [level(0.5, 100)], depthBidBanded: 100 }), null, "USD");
    expect(a.verdict).toBe("trapped");
    expect(a.headline).toMatch(/absorbs only/i);
  });

  it("does NOT call a position clear when its depth is phantom", () => {
    // 1,000,000 advertised at a good price, 500 actually fundable, against
    // a 1,000 position. Before the depth fix this read as a clean exit.
    const phantom = book({
      bids: [level(0.5, 500, 1_000_000)],
      depthBidBanded: 500,
    });
    const a = assessExit(exposure({ balance: 1_000 }), phantom, null, "USD");
    expect(a.verdict).not.toBe("clear");
  });

  it("flags a position that is most of the bid side", () => {
    const a = assessExit(
      exposure({ balance: 400 }),
      book({ bids: [level(0.5, 1_000)], depthBidBanded: 1_000 }),
      null,
      "USD"
    );
    expect(a.verdict).toBe("constrained");
    expect(a.headline).toMatch(/of the whole bid side/i);
  });
});

describe("assessExit — what must not raise noise", () => {
  it("treats a dust position as clear instead of reporting wild ratios", () => {
    // "9,340 bps of slippage" on a hundredth of a dollar is true and useless.
    const a = assessExit(exposure({ balance: 0.01 }), book({ bids: [level(0.5, 1)] }), null, "USD");
    expect(a.verdict).toBe("clear");
    expect(a.headline).toMatch(/dust/i);
  });

  it("does not make freeze rights alone produce a trapped verdict", () => {
    // A standing hazard downgrades a clear verdict; it is not a present
    // inability to sell.
    const a = assessExit(exposure({ balance: 100 }), book(), null, "USD");
    expect(a.canBeFrozen).toBe(true);
    expect(a.verdict).not.toBe("trapped");
  });

  it("records that an issuer has surrendered freeze", () => {
    const a = assessExit(
      exposure({ posture: { ...exposure().posture, noFreeze: true } }),
      book(),
      null,
      "USD"
    );
    expect(a.canBeFrozen).toBe(false);
  });
});
