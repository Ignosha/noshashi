import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAmmPool, fetchOrderBook } from "@/lib/xrpl/client";
import type { AmmPool, OrderBook } from "@/lib/xrpl/types";
import { assessExit, type ExitAssessment } from "./liquidity";
import type { IssuerExposure } from "./risk";

/**
 * Read the market side for every issuer the operator is actually exposed
 * to, then join it to the compliance side.
 *
 * Each position costs three round trips (two book sides plus the pool), so
 * this is capped and sequenced rather than fired all at once: the shared
 * WebSocket is the same link the rest of the console depends on, and
 * flooding it to populate one tab would stall live telemetry everywhere
 * else.
 */

const MAX_POSITIONS = 12;

export type LiquidityState = {
  assessments: ExitAssessment[];
  books: Map<string, OrderBook>;
  pools: Map<string, AmmPool>;
  loading: boolean;
  error: string | null;
  /** Positions dropped by the cap, so the UI can say so rather than lie. */
  omitted: number;
  reload: () => void;
};

export function key(issuer: string, currency: string) {
  return `${currency}:${issuer}`;
}

export function useExitLiquidity(exposures: IssuerExposure[]): LiquidityState {
  const [assessments, setAssessments] = useState<ExitAssessment[]>([]);
  const [books, setBooks] = useState<Map<string, OrderBook>>(new Map());
  const [pools, setPools] = useState<Map<string, AmmPool>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [omitted, setOmitted] = useState(0);

  // A run token: if the exposures change mid-flight, the older run's
  // results must not overwrite the newer one's.
  const runRef = useRef(0);

  const load = useCallback(async () => {
    const run = ++runRef.current;

    // One row per issuer/currency pair actually holding a balance.
    const positions: Array<{ exposure: IssuerExposure; currency: string }> = [];
    for (const exposure of exposures) {
      for (const currency of exposure.currencies) {
        if (exposure.balance > 0) positions.push({ exposure, currency });
      }
    }

    if (positions.length === 0) {
      setAssessments([]);
      setOmitted(0);
      return;
    }

    const scoped = positions.slice(0, MAX_POSITIONS);
    setOmitted(positions.length - scoped.length);
    setLoading(true);
    setError(null);

    const nextBooks = new Map<string, OrderBook>();
    const nextPools = new Map<string, AmmPool>();
    const out: ExitAssessment[] = [];
    let failures = 0;

    for (const { exposure, currency } of scoped) {
      if (run !== runRef.current) return; // superseded
      try {
        const [book, pool] = await Promise.all([
          fetchOrderBook(currency, exposure.issuer),
          fetchAmmPool(currency, exposure.issuer),
        ]);
        nextBooks.set(key(exposure.issuer, currency), book);
        nextPools.set(key(exposure.issuer, currency), pool);
        out.push(assessExit(exposure, book, pool, currency));
      } catch {
        failures += 1;
        // A market we could not read is not a market we can vouch for, so
        // it is assessed with no book rather than silently skipped.
        out.push(assessExit(exposure, null, null, currency));
      }
    }

    if (run !== runRef.current) return;

    // Worst first — a trapped position is the only thing on this screen
    // that changes what somebody does today.
    const rank = { trapped: 0, constrained: 1, clear: 2 } as const;
    out.sort((a, b) => {
      const d = rank[a.verdict] - rank[b.verdict];
      return d !== 0 ? d : b.position - a.position;
    });

    setBooks(nextBooks);
    setPools(nextPools);
    setAssessments(out);
    if (failures > 0) {
      setError(
        `${failures} of ${scoped.length} markets could not be read. Those positions are shown as having no evidenced exit, which is what the ledger currently supports.`
      );
    }
    setLoading(false);
  }, [exposures]);

  useEffect(() => {
    void load();
  }, [load]);

  return { assessments, books, pools, loading, error, omitted, reload: load };
}
