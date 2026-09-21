import type { AmmPool, OrderBook } from "@/lib/xrpl/types";
import type { IssuerExposure, Severity } from "./risk";
import { bookDepth, simulateExit } from "./liquidity";

/**
 * Redemption stress testing.
 *
 * assessExit (liquidity.ts) answers the question for ONE position: could
 * I get out of this, and can the issuer stop me. This module answers the
 * question a desk or a treasurer actually has to answer to a risk
 * committee, which is the portfolio-level version of it:
 *
 *   If I had to raise cash across this whole book tomorrow, how much
 *   would I actually get — and how much of the gap between that and my
 *   mark is market depth, how much is somebody else's discretion, and
 *   how much is me competing with myself?
 *
 * Three things make that different from summing per-position exits, and
 * all three are the reason a mark-to-mid portfolio value is wrong:
 *
 *   1. THE AMM IS A SECOND VENUE. simulateExit deliberately fills only
 *      into resting DEX offers, which is the right pessimism for a single
 *      position. But when a pool exists it is real depth, priced by a
 *      constant product rather than by a queue, and a seller working an
 *      exit properly uses both. Routing across the two recovers value the
 *      book-only figure says is not there — and, on thin books, it is
 *      most of the recoverable value.
 *
 *   2. FREEZE RIGHTS ARE NOT A WARNING, THEY ARE A HAIRCUT. A balance an
 *      issuer can immobilise in one transaction is not worth the same as
 *      one they cannot. Compliance tools flag the flag; valuation tools
 *      ignore it. Neither prices it. Here it is priced explicitly, with a
 *      stated haircut the operator sets, so the number is arguable rather
 *      than magic.
 *
 *   3. POSITIONS SHARING AN ISSUER SHARE A BOOK. Two lines on the same
 *      issuer cannot both exit into the full depth of that issuer's
 *      market, because they are the same market. Summing independent
 *      exits double-counts the depth. Contention is what turns a book
 *      that looks liquid position-by-position into one that cannot
 *      absorb the portfolio.
 *
 * Everything is computed from validated ledger state plus parameters the
 * operator states. Where a number is a judgement — the freeze haircut,
 * the depth shock, the participation cap — it is a named input with a
 * default, never a constant buried in a formula. A risk number nobody
 * can interrogate is not usable in front of a committee.
 */

/* ------------------------------------------------------------------ */
/* Scenario parameters                                                 */
/* ------------------------------------------------------------------ */

export type ScenarioId = "orderly" | "stressed" | "crisis";

export type Scenario = {
  id: ScenarioId;
  label: string;
  /**
   * Fraction of observed depth assumed still there when you arrive.
   *
   * Resting depth is an option the maker holds, not a commitment. In a
   * stressed tape makers widen or pull, so adjudicating an exit against
   * the depth visible on a calm afternoon overstates what is reachable.
   * 1.0 is "the book as measured".
   */
  depthRetention: number;
  /**
   * Fraction of AMM depth assumed usable. Pools do not pull — the
   * invariant is mechanical — so this stays higher than depthRetention.
   * It is below 1 only because arriving late in a rush means the pool has
   * already moved against you.
   */
  poolRetention: number;
  /**
   * Probability weight applied to balances the issuer could freeze.
   *
   * NOT a forecast. It is the haircut the operator is willing to defend:
   * "we value freezable paper at 85 cents of its exitable value". Stating
   * it as a parameter is the point — the alternative is a valuation that
   * silently assumes the number is 1.00.
   */
  freezeHaircut: number;
  blurb: string;
};

export const SCENARIOS: Scenario[] = [
  {
    id: "orderly",
    label: "ORDERLY",
    depthRetention: 1,
    poolRetention: 1,
    freezeHaircut: 0.97,
    blurb:
      "The book as measured, right now. A planned unwind with nobody else in a hurry.",
  },
  {
    id: "stressed",
    label: "STRESSED",
    depthRetention: 0.5,
    poolRetention: 0.85,
    freezeHaircut: 0.85,
    blurb:
      "Half the resting depth has stepped away and pool prices have already moved. The tape a desk unwinds into on a bad week.",
  },
  {
    id: "crisis",
    label: "CRISIS",
    depthRetention: 0.2,
    poolRetention: 0.7,
    freezeHaircut: 0.5,
    blurb:
      "Makers gone, pools the only bid, and issuer discretion a live question rather than a theoretical one.",
  },
];

export type StressConfig = {
  scenario: Scenario;
  /**
   * Largest share of a venue's usable depth the operator is willing to
   * take in one day, 0–1. This is what converts a size into a number of
   * days rather than pretending an exit is instantaneous.
   */
  participationCap: number;
  /**
   * Slippage the operator will accept on a day's tranche, in basis
   * points. Depth reachable only past this is not depth they will use.
   */
  slippageBudgetBps: number;
};

export const DEFAULT_STRESS_CONFIG: Omit<StressConfig, "scenario"> = {
  participationCap: 0.2,
  slippageBudgetBps: 300,
};

/* ------------------------------------------------------------------ */
/* AMM routing                                                         */
/* ------------------------------------------------------------------ */

/**
 * XRP received for selling `size` of the issued asset into a constant
 * product pool, after the trading fee.
 *
 * For a pool holding X XRP against Y of the asset, selling x of the asset
 * leaves the invariant X·Y unchanged, so the XRP paid out is
 *
 *     X − (X·Y) / (Y + x·(1 − fee))
 *
 * The fee is taken on the way in, which is why it scales the input
 * rather than the output. Monotonic and concave in x: every additional
 * unit sold gets a worse price, which is what makes the marginal-price
 * routing below well behaved.
 */
export function ammProceeds(pool: AmmPool, size: number): number {
  if (!pool.exists || pool.asset2Frozen) return 0;
  const x = pool.amountXrp ?? 0;
  const y = pool.amount2 ?? 0;
  if (x <= 0 || y <= 0 || size <= 0) return 0;
  const fee = Math.min(0.5, Math.max(0, (pool.tradingFeeBps ?? 0) / 10_000));
  const effective = size * (1 - fee);
  return x - (x * y) / (y + effective);
}

export type RoutedExit = {
  requested: number;
  /** Units sent to resting DEX offers. */
  toBook: number;
  /** Units sent to the AMM pool. */
  toPool: number;
  /** Units nothing would absorb at an acceptable price. */
  unfilled: number;
  proceedsXrp: number;
  /** Volume-weighted average price achieved across both venues. */
  vwap?: number;
  /** Shortfall against the book's mid, in basis points. */
  slippageBps?: number;
  /** Proceeds the book alone would have produced, for comparison. */
  bookOnlyProceedsXrp: number;
};

/**
 * Split a sale across the resting book and the AMM pool.
 *
 * The split is found by bisecting on the fraction sent to the pool and
 * keeping the allocation with the highest total proceeds. That works
 * because both venues are concave in size — each next unit gets a worse
 * price at either — so total proceeds is concave in the split and has a
 * single maximum. Twenty-eight iterations is well past the point where
 * the interval is narrower than the smallest tradeable unit.
 *
 * Bisection rather than closed form deliberately: the book is a step
 * function of discrete levels, not something to differentiate, and the
 * closed-form marginal-price match would have to be corrected at every
 * level boundary anyway.
 */
export function routeExit(
  book: OrderBook | null,
  pool: AmmPool | null,
  size: number,
  retention: { book: number; pool: number } = { book: 1, pool: 1 }
): RoutedExit {
  const requested = Math.max(0, size);
  const usablePool =
    pool?.exists && !pool.asset2Frozen
      ? {
          ...pool,
          amountXrp: (pool.amountXrp ?? 0) * retention.pool,
          amount2: (pool.amount2 ?? 0) * retention.pool,
        }
      : null;

  // Depth retention is applied by scaling each level's fillable quantity.
  // Scaling the cumulative totals instead would leave the levels and the
  // running total disagreeing, and simulateExit walks the levels.
  const usableBook: OrderBook | null =
    book && retention.book < 1
      ? {
          ...book,
          bids: book.bids.map((level) => ({
            ...level,
            quantity: level.quantity * retention.book,
            cumulative: level.cumulative * retention.book,
          })),
          depthBidBanded:
            book.depthBidBanded !== undefined
              ? book.depthBidBanded * retention.book
              : undefined,
        }
      : book;

  const bookOnly = usableBook ? simulateExit(usableBook, requested) : null;
  const bookOnlyProceedsXrp = bookOnly?.proceedsXrp ?? 0;

  if (requested === 0) {
    return {
      requested: 0,
      toBook: 0,
      toPool: 0,
      unfilled: 0,
      proceedsXrp: 0,
      bookOnlyProceedsXrp: 0,
    };
  }

  const proceedsFor = (poolShare: number) => {
    const toPool = requested * poolShare;
    const toBook = requested - toPool;
    const bookFill = usableBook ? simulateExit(usableBook, toBook) : null;
    const poolTake = usablePool ? ammProceeds(usablePool, toPool) : 0;
    return {
      poolShare,
      toPool,
      // simulateExit reports what the book could actually absorb, which
      // may be less than it was handed.
      toBook: bookFill?.filled ?? 0,
      proceeds: (bookFill?.proceedsXrp ?? 0) + poolTake,
    };
  };

  let best = proceedsFor(usablePool ? 0.5 : 0);
  if (usablePool && usableBook) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 28; i += 1) {
      const mid = (low + high) / 2;
      const step = (high - low) / 4;
      const left = proceedsFor(Math.max(0, mid - step));
      const right = proceedsFor(Math.min(1, mid + step));
      if (left.proceeds >= right.proceeds) high = mid;
      else low = mid;
      const candidate = left.proceeds >= right.proceeds ? left : right;
      if (candidate.proceeds > best.proceeds) best = candidate;
    }
    // The interior optimum can still be beaten by a corner when one venue
    // is empty or the position is small enough to clear the touch.
    for (const corner of [0, 1]) {
      const candidate = proceedsFor(corner);
      if (candidate.proceeds > best.proceeds) best = candidate;
    }
  } else if (usablePool) {
    best = proceedsFor(1);
  } else {
    best = proceedsFor(0);
  }

  const filled = best.toBook + best.toPool;
  const vwap = filled > 0 && best.proceeds > 0 ? filled / best.proceeds : undefined;
  const mid = book?.mid;
  const slippageBps =
    vwap !== undefined && mid !== undefined && mid > 0
      ? ((mid - vwap) / mid) * 10_000
      : undefined;

  return {
    requested,
    toBook: best.toBook,
    toPool: best.toPool,
    unfilled: Math.max(0, requested - filled),
    proceedsXrp: best.proceeds,
    vwap,
    slippageBps,
    bookOnlyProceedsXrp,
  };
}

/* ------------------------------------------------------------------ */
/* Portfolio stress                                                    */
/* ------------------------------------------------------------------ */

export type StressInput = {
  exposure: IssuerExposure;
  currency: string;
  book: OrderBook | null;
  pool: AmmPool | null;
};

export type PositionStress = {
  issuer: string;
  currency: string;
  position: number;
  /** Mark at the book's mid — the number a naive valuation reports. */
  markXrp: number;
  /**
   * What the position would actually realise, after routing, depth
   * shock, contention and the freeze haircut. The headline.
   */
  recoverableXrp: number;
  /** markXrp − recoverableXrp, decomposed below. */
  leakXrp: number;
  /** Value lost to walking the book and moving the pool. */
  slippageLeakXrp: number;
  /** Value lost because other positions want the same depth. */
  contentionLeakXrp: number;
  /** Value discounted because the issuer can immobilise the balance. */
  freezeLeakXrp: number;
  /** Value with no bid at any acceptable price. */
  trappedXrp: number;
  /** Days to exit at the participation cap. */
  daysToExit: number;
  /** Share of this issuer's usable depth this position is competing for. */
  contentionShare: number;
  route: RoutedExit;
  canBeFrozen: boolean;
  alreadyFrozen: boolean;
  severity: Severity;
  note: string;
};

export type PortfolioStress = {
  scenario: Scenario;
  config: StressConfig;
  positions: PositionStress[];
  markXrp: number;
  recoverableXrp: number;
  /** recoverableXrp / markXrp, 0–1. The single number for a committee. */
  recoveryRatio: number;
  /** Waterfall from mark to recoverable. Sums to markXrp. */
  waterfall: Array<{ id: string; label: string; xrp: number; kind: "value" | "leak" }>;
  /** Longest position-level exit — the book is not out until this clears. */
  daysToExit: number;
  /** Share of mark sitting behind an issuer who could freeze it. */
  freezableShare: number;
  headline: string;
  severity: Severity;
};

/**
 * Positions that share an issuer share that issuer's liquidity.
 *
 * Depth is allocated pro rata by position size. Pro rata rather than
 * first-come because there is no defensible ordering: an operator
 * unwinding a book does not get to declare which of their own lines gets
 * the good fills, and any priority rule would flatter whichever position
 * it put first.
 */
function contentionWeights(inputs: StressInput[]): Map<number, number> {
  const byIssuer = new Map<string, number[]>();
  inputs.forEach((input, index) => {
    const key = `${input.exposure.issuer}|${input.currency}`;
    const list = byIssuer.get(key) ?? [];
    list.push(index);
    byIssuer.set(key, list);
  });

  const weights = new Map<number, number>();
  for (const indices of byIssuer.values()) {
    const total = indices.reduce(
      (sum, index) => sum + Math.max(0, inputs[index].exposure.balance),
      0
    );
    for (const index of indices) {
      const size = Math.max(0, inputs[index].exposure.balance);
      // A single position on an issuer gets the whole book: weight 1.
      weights.set(index, total > 0 ? size / total : indices.length === 1 ? 1 : 0);
    }
  }
  return weights;
}

export function stressPortfolio(
  inputs: StressInput[],
  config: StressConfig
): PortfolioStress {
  const { scenario } = config;
  const weights = contentionWeights(inputs);

  const positions: PositionStress[] = inputs.map((input, index) => {
    const { exposure, currency, book, pool } = input;
    const position = Math.max(0, exposure.balance);
    const share = weights.get(index) ?? 1;

    const alreadyFrozen = exposure.posture.globalFreeze;
    const canBeFrozen = !exposure.posture.noFreeze && !alreadyFrozen;

    // Mark at mid. Where there is no book, an AMM pool's implied price is
    // the only price the ledger evidences; where there is neither, the
    // position has no mark, and reporting one would be inventing it.
    //
    // An empty book's mid is discarded rather than used. A book flagged
    // `empty` can still carry a mid — from a single stale offer, or from
    // a reference price computed before the side emptied — and marking
    // against it prices the position at a level nobody is quoting. That
    // is precisely the mark this module exists to refuse: it would report
    // a full mark and a total leak, when the honest answer is that there
    // is no price here at all.
    const bookMid = book && !book.empty ? book.mid : undefined;
    const mid = bookMid ?? (pool?.exists && !pool.asset2Frozen ? pool.impliedPrice : undefined);
    const markXrp = mid !== undefined && mid > 0 ? position / mid : 0;

    // Uncontended: the whole venue to itself. Contended: its pro-rata
    // slice. The difference between the two is what contention costs,
    // which is how it gets its own line in the waterfall instead of
    // being blended into slippage.
    const solo = routeExit(book, pool, position, {
      book: scenario.depthRetention,
      pool: scenario.poolRetention,
    });
    const contended = routeExit(book, pool, position, {
      book: scenario.depthRetention * share,
      pool: scenario.poolRetention * share,
    });

    const grossXrp = contended.proceedsXrp;
    const slippageLeakXrp = Math.max(0, markXrp - solo.proceedsXrp);
    const contentionLeakXrp = Math.max(0, solo.proceedsXrp - grossXrp);

    // A frozen balance is not a haircut, it is a zero: it cannot be sold
    // at any price while the flag stands.
    const freezeLeakXrp = alreadyFrozen
      ? grossXrp
      : canBeFrozen
        ? grossXrp * (1 - scenario.freezeHaircut)
        : 0;

    const recoverableXrp = Math.max(0, grossXrp - freezeLeakXrp);

    // Trapped value is the part of the leak that has no bid at all, as
    // distinct from the part that has a bad one.
    const trappedXrp =
      contended.requested > 0
        ? markXrp * (contended.unfilled / contended.requested)
        : 0;

    // Days at the participation cap. Depth is a stock, not a flow — the
    // book refills, but nothing on-ledger says how fast — so this is
    // stated as tranches of usable depth, which is what a trader would
    // actually work to.
    const usableDepth =
      (book ? bookDepth(book).bid * scenario.depthRetention * share : 0) +
      (pool?.exists && !pool.asset2Frozen
        ? (pool.amount2 ?? 0) * scenario.poolRetention * share
        : 0);
    const dailyCapacity = usableDepth * config.participationCap;
    const daysToExit =
      position <= 0
        ? 0
        : dailyCapacity > 0
          ? Math.ceil(position / dailyCapacity)
          : Number.POSITIVE_INFINITY;

    const severity: Severity = alreadyFrozen
      ? "critical"
      : contended.unfilled / Math.max(1e-9, contended.requested) > 0.05
        ? "critical"
        : markXrp > 0 && recoverableXrp / markXrp < 0.8
          ? "warn"
          : canBeFrozen
            ? "warn"
            : "ok";

    const note = alreadyFrozen
      ? "Frozen on-ledger. Recoverable value is zero while lsfGlobalFreeze stands, whatever the book shows."
      : contended.unfilled > 0
        ? `${((contended.unfilled / contended.requested) * 100).toFixed(1)}% of the position has no bid at an acceptable price under ${scenario.label}.`
        : contended.toPool > contended.toBook
          ? "The AMM pool, not the resting book, is the main exit for this position."
          : share < 1
            ? `Sharing this issuer's depth with other lines in the book; only ${(share * 100).toFixed(0)}% of it is attributable here.`
            : canBeFrozen
              ? "Exitable, but the balance is held at the issuer's discretion."
              : "Exitable, and the issuer has surrendered freeze.";

    return {
      issuer: exposure.issuer,
      currency,
      position,
      markXrp,
      recoverableXrp,
      leakXrp: Math.max(0, markXrp - recoverableXrp),
      slippageLeakXrp,
      contentionLeakXrp,
      freezeLeakXrp,
      trappedXrp,
      daysToExit,
      contentionShare: share,
      route: contended,
      canBeFrozen,
      alreadyFrozen,
      severity,
      note,
    };
  });

  const markXrp = positions.reduce((sum, p) => sum + p.markXrp, 0);
  const recoverableXrp = positions.reduce((sum, p) => sum + p.recoverableXrp, 0);
  const slippage = positions.reduce((sum, p) => sum + p.slippageLeakXrp, 0);
  const contention = positions.reduce((sum, p) => sum + p.contentionLeakXrp, 0);
  const freeze = positions.reduce((sum, p) => sum + p.freezeLeakXrp, 0);

  // The three leaks are computed independently and then reconciled to the
  // measured total, rather than the total being taken as their sum. They
  // can drift apart: slippage is measured against an uncontended route
  // and contention against a contended one, so rounding and the discrete
  // book levels leave a small residual. Showing the residual as an
  // explicit line is honest; silently absorbing it into one of the named
  // leaks is not, because it would make that line wrong.
  const named = slippage + contention + freeze;
  const residual = Math.max(0, markXrp - recoverableXrp) - named;

  const waterfall: PortfolioStress["waterfall"] = [
    { id: "recoverable", label: "Recoverable", xrp: recoverableXrp, kind: "value" },
    { id: "slippage", label: "Depth and slippage", xrp: slippage, kind: "leak" },
    { id: "contention", label: "Shared-book contention", xrp: contention, kind: "leak" },
    { id: "freeze", label: "Issuer discretion", xrp: freeze, kind: "leak" },
  ];
  if (Math.abs(residual) > markXrp * 1e-6) {
    waterfall.push({ id: "residual", label: "Unattributed", xrp: residual, kind: "leak" });
  }

  const recoveryRatio = markXrp > 0 ? recoverableXrp / markXrp : 0;
  const freezableShare =
    markXrp > 0
      ? positions
          .filter((p) => p.canBeFrozen || p.alreadyFrozen)
          .reduce((sum, p) => sum + p.markXrp, 0) / markXrp
      : 0;

  const finiteDays = positions
    .map((p) => p.daysToExit)
    .filter((d) => Number.isFinite(d));
  const anyInfinite = positions.some((p) => !Number.isFinite(p.daysToExit) && p.position > 0);
  const daysToExit = anyInfinite
    ? Number.POSITIVE_INFINITY
    : finiteDays.length > 0
      ? Math.max(...finiteDays)
      : 0;

  const severity: Severity =
    positions.some((p) => p.severity === "critical") || recoveryRatio < 0.6
      ? "critical"
      : recoveryRatio < 0.85
        ? "warn"
        : "ok";

  // A portfolio with no mark has two very different causes, and reporting
  // both as "nothing to stress" would hide the worse one. An empty book
  // has nothing in it. A book of positions that no venue quotes has
  // everything in it and no way out — the recovery ratio cannot be
  // computed because the denominator is missing, not because the answer
  // is good.
  const unpriced = positions.filter((p) => p.position > 0 && p.markXrp <= 0);

  const headline =
    markXrp <= 0
      ? unpriced.length > 0
        ? `${unpriced.length} position${unpriced.length === 1 ? "" : "s"} carry no on-ledger price and no exit at all. There is no mark to recover against.`
        : "No marked position to stress."
      : `${(recoveryRatio * 100).toFixed(1)}% of mark is recoverable under ${scenario.label}` +
        (Number.isFinite(daysToExit)
          ? ` over ${daysToExit} trading day${daysToExit === 1 ? "" : "s"}.`
          : ", and part of the book has no exit at all.");

  return {
    scenario,
    config,
    positions,
    markXrp,
    recoverableXrp,
    recoveryRatio,
    waterfall,
    daysToExit,
    freezableShare,
    headline,
    severity,
  };
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

export const WATERFALL_COPY: Record<string, string> = {
  recoverable:
    "Proceeds the ledger evidences a buyer for, after routing across the book and the pool, after this scenario's depth shock, after competing with your own other lines, and after discounting balances the issuer could immobilise.",
  slippage:
    "The cost of size. Walking down the resting book and moving the pool against yourself. Invisible in a mark-to-mid valuation, which prices every unit at the touch.",
  contention:
    "Depth counted twice. Two lines on one issuer are one market, so the depth each of them looks liquid against is the same depth. This is the part a per-position view double-counts.",
  freeze:
    "Somebody else's discretion, priced. A balance behind lsfGlobalFreeze rights can be immobilised in a single transaction; this is the scenario's haircut on holding it anyway.",
  residual:
    "Reconciliation between the independently measured leaks and the measured total. Shown rather than absorbed, so no named line is quietly inflated to make the arithmetic close.",
};

/** Compact, deterministic summary for an export or an audit note. */
export function stressSummaryLines(report: PortfolioStress): string[] {
  const xrp = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : "—";
  return [
    `Scenario: ${report.scenario.label} (depth retention ${(report.scenario.depthRetention * 100).toFixed(0)}%, pool retention ${(report.scenario.poolRetention * 100).toFixed(0)}%, freeze haircut ${((1 - report.scenario.freezeHaircut) * 100).toFixed(0)}%)`,
    `Participation cap ${(report.config.participationCap * 100).toFixed(0)}% of usable depth per day`,
    `Mark: ${xrp(report.markXrp)} XRP`,
    `Recoverable: ${xrp(report.recoverableXrp)} XRP (${(report.recoveryRatio * 100).toFixed(1)}%)`,
    ...report.waterfall
      .filter((row) => row.kind === "leak")
      .map((row) => `  − ${row.label}: ${xrp(row.xrp)} XRP`),
    `Days to exit: ${Number.isFinite(report.daysToExit) ? report.daysToExit : "no exit for part of the book"}`,
    `Freezable share of mark: ${(report.freezableShare * 100).toFixed(1)}%`,
  ];
}
