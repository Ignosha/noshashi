import type { AmmPool, BookLevel, OrderBook } from "@/lib/xrpl/types";
import type { IssuerExposure, Severity } from "./risk";

/**
 * Exit liquidity.
 *
 * This is the join that makes the two halves of NOSHASHI one product.
 *
 * Compliance tooling answers "may this issuer immobilise my balance?" by
 * reading account flags. Market terminals answer "what is it worth?" by
 * reading the book. Neither answers the question an institution actually
 * carries, which is the conjunction:
 *
 *   I hold X of this asset.
 *   The issuer can freeze it.
 *   If I wanted out today, could I get out — and at what price?
 *
 * A position with clean freeze rights and no book is untradeable. A
 * position with deep liquidity behind an issuer who can freeze at will is
 * not owned. Both are invisible to tools that read only one side.
 *
 * Everything below is computed from validated ledger state. Where a number
 * depends on the operator's own input — the size they would need to exit —
 * that dependency is explicit and never guessed.
 */

export type ExitFill = {
  /** Size the operator asked to liquidate, in issued-currency units. */
  requested: number;
  /** How much the resting book could actually absorb. */
  filled: number;
  /** Fraction of `requested` that filled, 0–1. */
  fillRate: number;
  /** Volume-weighted average price achieved, in XRP per unit. */
  vwap?: number;
  /** Mid price at the touch, in XRP per unit. */
  mid?: number;
  /** Execution shortfall against mid, in basis points. Positive is worse. */
  slippageBps?: number;
  /** XRP the operator would actually receive. */
  proceedsXrp: number;
  /** How many price levels the order would have to eat through. */
  levelsConsumed: number;
};

/**
 * Walk the bid side and compute what a sale would really achieve.
 *
 * Deliberately pessimistic in one respect: it fills against resting
 * offers only. It does not assume anyone steps in, and it does not model
 * the AMM absorbing the remainder, because on a bad day neither happens.
 */
export function simulateExit(book: OrderBook, size: number): ExitFill {
  const requested = Math.max(0, size);

  // Fill only into offers within the usable band. A level bid at a
  // thousandth of the market will "fill" any size on paper and reports a
  // fill rate of 100% for a position nobody would buy.
  const floor = book.mid !== undefined ? book.mid * (1 - 0.1) : 0;
  const bids: BookLevel[] = book.bids.filter((l) => l.price >= floor);

  let remaining = requested;
  let proceedsXrp = 0;
  let levelsConsumed = 0;

  for (const level of bids) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.quantity);
    // `price` on the bid side is quote-per-XRP, so XRP received is
    // quantity divided by price.
    proceedsXrp += take / level.price;
    remaining -= take;
    levelsConsumed += 1;
  }

  const filled = requested - remaining;
  const vwap = proceedsXrp > 0 ? filled / proceedsXrp : undefined;
  const mid = book.mid;
  const slippageBps =
    vwap !== undefined && mid !== undefined && mid > 0
      ? ((mid - vwap) / mid) * 10_000
      : undefined;

  return {
    requested,
    filled,
    fillRate: requested > 0 ? filled / requested : 0,
    vwap,
    mid,
    slippageBps,
    proceedsXrp,
    levelsConsumed,
  };
}

/**
 * Depth that represents a real exit.
 *
 * Prefers the banded figure — offers within 10% of mid — and falls back to
 * total resting depth only when no mid could be established. Summing the
 * whole book counts bids at a thousandth of the market as an exit, which
 * is how a position gets marked liquid when nobody would pay for it.
 */
export function bookDepth(book: OrderBook): { bid: number; ask: number } {
  if (book.depthBidBanded !== undefined && book.depthAskBanded !== undefined) {
    return { bid: book.depthBidBanded, ask: book.depthAskBanded };
  }
  // Index access rather than Array.prototype.at — the project's TS target
  // predates ES2022 and this is not worth widening the lib for.
  const lastBid = book.bids[book.bids.length - 1];
  const lastAsk = book.asks[book.asks.length - 1];
  return { bid: lastBid?.cumulative ?? 0, ask: lastAsk?.cumulative ?? 0 };
}

export type ExitVerdict = "clear" | "constrained" | "trapped";

export type ExitAssessment = {
  issuer: string;
  currency: string;
  /** What the operator holds. */
  position: number;
  verdict: ExitVerdict;
  severity: Severity;
  headline: string;
  detail: string;
  /** The single action that follows from this assessment. */
  action?: string;

  /* Market facts */
  depthBid: number;
  /** Position as a multiple of the entire resting bid side. */
  depthRatio?: number;
  spreadBps?: number;
  fill?: ExitFill;
  ammDepthXrp?: number;
  ammFrozen?: boolean;

  /* Compliance facts */
  canBeFrozen: boolean;
  alreadyFrozen: boolean;
};

/** Position/depth above this and the operator *is* the market. */
const DOMINANT_RATIO = 0.25;
/** Slippage past this on a full exit is a constrained position. */
const SLIPPAGE_WARN_BPS = 500;
/**
 * Below this the position is dust and every ratio computed from it is
 * noise. Reporting "9,340 bps of slippage" on a hundredth of a dollar is
 * technically true and completely useless.
 */
const DUST_POSITION = 1;

/**
 * Combine one issuer exposure with its book and pool into a single verdict.
 *
 * The ordering matters and is deliberate. Frozen beats everything —
 * liquidity is irrelevant if the balance cannot move at all. Then absence
 * of a market, then the operator being too large for the market that
 * exists, then price impact. Freeze *rights* without a freeze are a
 * standing hazard rather than a present one, so they downgrade a clear
 * verdict but never on their own produce a trapped one.
 */
export function assessExit(
  exposure: IssuerExposure,
  book: OrderBook | null,
  amm: AmmPool | null,
  currency: string
): ExitAssessment {
  const position = exposure.balance;
  const depth = book ? bookDepth(book) : { bid: 0, ask: 0 };
  const fill = book && position > 0 ? simulateExit(book, position) : undefined;
  const depthRatio = depth.bid > 0 ? position / depth.bid : undefined;
  const spreadBps =
    book?.spreadPct !== undefined ? book.spreadPct * 10_000 : undefined;

  const alreadyFrozen = exposure.posture.globalFreeze;
  const canBeFrozen = !exposure.posture.noFreeze && !alreadyFrozen;
  const ammFrozen = amm?.asset2Frozen ?? false;

  const base = {
    issuer: exposure.issuer,
    currency,
    position,
    depthBid: depth.bid,
    depthRatio,
    spreadBps,
    fill,
    ammDepthXrp: amm?.exists ? amm.amountXrp : undefined,
    ammFrozen,
    canBeFrozen,
    alreadyFrozen,
  };

  if (position < DUST_POSITION) {
    return {
      ...base,
      verdict: "clear",
      severity: "ok",
      headline: "Dust position",
      detail: `${position.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${currency} is below the threshold where exit risk means anything. Slippage and depth ratios are not reported because they would be arithmetic on noise.`,
    };
  }

  if (alreadyFrozen) {
    return {
      ...base,
      verdict: "trapped",
      severity: "critical",
      headline: "Frozen — no exit at any price",
      detail:
        "The issuer has set lsfGlobalFreeze. This balance cannot be sold, sent or redeemed while the flag stands, so the order book below is unreachable. Book depth is shown for context only; it is not available to you.",
      action: "Treat as immobilised, not as a holding. Contact the issuer.",
    };
  }

  if (!book || book.empty || depth.bid <= 0) {
    return {
      ...base,
      verdict: "trapped",
      severity: "critical",
      headline: "No bid side — nothing to sell into",
      detail:
        "There are no resting offers to buy this asset on the XRPL DEX. Marking this position at any price implies a buyer that the ledger does not show.",
      action: amm?.exists
        ? "The AMM pool is the only exit. Size against pool depth, not against a mark."
        : "No DEX book and no AMM pool. There is no on-ledger exit.",
    };
  }

  if (fill && fill.fillRate < 0.995) {
    return {
      ...base,
      verdict: "trapped",
      severity: "critical",
      headline: `Book absorbs only ${(fill.fillRate * 100).toFixed(1)}% of the position`,
      detail: `The entire resting bid side is ${depth.bid.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency} against a position of ${position.toLocaleString(undefined, { maximumFractionDigits: 2 })}. Selling everything would exhaust the book and leave the remainder with no counterparty.`,
      action: "Reduce over time, or treat the unfillable remainder as illiquid.",
    };
  }

  if (depthRatio !== undefined && depthRatio > DOMINANT_RATIO) {
    return {
      ...base,
      verdict: "constrained",
      severity: "warn",
      headline: `Position is ${(depthRatio * 100).toFixed(0)}% of the whole bid side`,
      detail: `Exiting would consume ${fill?.levelsConsumed ?? 0} price levels and move the market against you. At this ratio the exit price is set by your own selling, not by the market.${canBeFrozen ? " The issuer also retains the right to freeze this balance." : ""}`,
      action: "Work the position out in tranches rather than in one clip.",
    };
  }

  if (book.crossed) {
    return {
      ...base,
      verdict: "constrained",
      severity: "warn",
      headline: "Book is crossed at the touch",
      detail:
        "The best bid sits above the best ask, which cannot be true of a market anyone is actually working. It usually means a stale or mispriced offer is resting at the top of the book. Depth and slippage below are measured from the tenth percentile of real depth, not from the touch, so they remain usable — but treat the quoted touch as unreliable.",
      action: "Verify against a second venue before sizing off this book.",
    };
  }

  if (fill?.slippageBps !== undefined && fill.slippageBps > SLIPPAGE_WARN_BPS) {
    return {
      ...base,
      verdict: "constrained",
      severity: "warn",
      headline: `Full exit costs ${Math.round(fill.slippageBps)} bps of slippage`,
      detail: `The book fills the position but at a volume-weighted ${fill.vwap?.toFixed(6)} against a mid of ${fill.mid?.toFixed(6)}. That shortfall is a real cost and is not reflected in a mark-to-mid valuation.`,
      action: "Mark this position to achievable exit, not to mid.",
    };
  }

  if (canBeFrozen) {
    return {
      ...base,
      verdict: "constrained",
      severity: "warn",
      headline: "Exitable today, but the issuer can freeze it",
      detail:
        "The book is deep enough to absorb the position at an acceptable cost. The exposure is not market risk but issuer discretion: lsfGlobalFreeze can be set in a single transaction, and the exit disappears the moment it lands.",
      action: "Monitor the issuer's flags. Size against how much you trust them.",
    };
  }

  return {
    ...base,
    verdict: "clear",
    severity: "ok",
    headline: "Exitable, and the issuer has surrendered freeze",
    detail: `The bid side holds ${depth.bid.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency} against a position of ${position.toLocaleString(undefined, { maximumFractionDigits: 2 })}, and lsfNoFreeze is set, so the issuer has permanently given up the right to immobilise it.`,
  };
}

export const EXIT_COPY: Record<ExitVerdict, { label: string; blurb: string }> = {
  clear: {
    label: "CLEAR",
    blurb: "Liquid enough to exit, and nobody can stop you.",
  },
  constrained: {
    label: "CONSTRAINED",
    blurb: "An exit exists but it costs something, or somebody else controls it.",
  },
  trapped: {
    label: "TRAPPED",
    blurb: "No exit at a price the ledger can evidence.",
  },
};
