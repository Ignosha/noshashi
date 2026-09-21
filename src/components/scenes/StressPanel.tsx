import { useMemo, useState } from "react";
import { Panel, DataRow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Signal } from "@/components/nova/Signal";
import { NovaVault } from "@/components/nova/NovaIcon";
import { shortAddress } from "@/lib/xrpl/client";
import type { AmmPool, OrderBook } from "@/lib/xrpl/types";
import type { IssuerExposure } from "@/lib/desk/risk";
import { key as marketKey } from "@/lib/desk/useLiquidity";
import {
  DEFAULT_STRESS_CONFIG,
  SCENARIOS,
  WATERFALL_COPY,
  stressPortfolio,
  type PortfolioStress,
  type ScenarioId,
  type StressInput,
} from "@/lib/desk/stress";
import { cn } from "@/lib/utils";

/**
 * Redemption stress test — the portfolio-level reading.
 *
 * The EXIT tab answers the question one position at a time. This answers
 * the one a risk committee actually asks, which is not the sum of those:
 * if the whole book had to be raised as cash, how much would arrive, and
 * where did the rest go.
 *
 * The design commitment here is that no number on this screen is
 * unexplained. The scenario parameters are shown as numbers, not as a
 * label; the waterfall reconciles to the mark rather than approximately
 * summing to it; and each leak carries the sentence explaining what it is.
 * A risk figure a compliance officer cannot interrogate in front of a
 * committee is not usable, however correct it is.
 */

function xrp(value: number, dp = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: dp });
}

const LEAK_TONE: Record<string, string> = {
  slippage: "bg-hold",
  contention: "bg-telemetry",
  freeze: "bg-no-go",
  // Not bg-muted: that is the bar's own track colour, so the residual
  // segment would be invisible against it.
  residual: "bg-faint",
};

export type StressController = {
  report: PortfolioStress;
  /** Positions the market read actually covered. Empty means nothing to stress. */
  inputs: StressInput[];
  scenarioId: ScenarioId;
  setScenarioId: (id: ScenarioId) => void;
  participation: number;
  setParticipation: (value: number) => void;
};

/**
 * Owns the scenario selection so the panel and the right-hand rail read
 * from one report.
 *
 * Lifted out of the panel because the two are rendered into different
 * cells of the scene's grid. Keeping the state inside the panel and
 * recomputing it in the rail would let the two disagree about which
 * scenario is selected — the rail would state parameters that did not
 * produce the number next to it, which is worse than showing nothing.
 */
export function useStressReport(
  exposures: IssuerExposure[],
  books: Map<string, OrderBook>,
  pools: Map<string, AmmPool>
): StressController {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("stressed");
  const [participation, setParticipation] = useState(
    DEFAULT_STRESS_CONFIG.participationCap
  );

  const inputs = useMemo<StressInput[]>(() => {
    const out: StressInput[] = [];
    for (const exposure of exposures) {
      if (exposure.balance <= 0) continue;
      for (const currency of exposure.currencies) {
        const id = marketKey(exposure.issuer, currency);
        // A market that was not read is passed through as null rather than
        // skipped. Dropping it would quietly shrink the mark and flatter
        // the recovery ratio; passing null prices it at no exit, which is
        // what the ledger currently supports.
        out.push({
          exposure,
          currency,
          book: books.get(id) ?? null,
          pool: pools.get(id) ?? null,
        });
      }
    }
    return out;
  }, [exposures, books, pools]);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[1];

  const report = useMemo<PortfolioStress>(
    () =>
      stressPortfolio(inputs, {
        ...DEFAULT_STRESS_CONFIG,
        scenario,
        participationCap: participation,
      }),
    [inputs, scenario, participation]
  );

  return {
    report,
    inputs,
    scenarioId,
    setScenarioId,
    participation,
    setParticipation,
  };
}

export function StressPanel({
  controller,
  loading,
  omitted,
}: {
  controller: StressController;
  loading: boolean;
  omitted: number;
}) {
  const {
    report,
    inputs,
    scenarioId,
    setScenarioId,
    participation,
    setParticipation,
  } = controller;
  const scenario = report.scenario;

  if (inputs.length === 0) {
    return (
      <EmptyState
        icon={<NovaVault size={16} />}
        title={loading ? "READING MARKETS…" : "NO ISSUED POSITIONS"}
        body="A redemption stress test needs issued-currency positions to stress. This account holds only XRP, which no issuer can immobilise and which has no exit book to walk."
      />
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Scenario controls ───────────────────────────────────────── */}
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {SCENARIOS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setScenarioId(option.id)}
              aria-pressed={option.id === scenarioId}
              className={cn(
                "stencil border px-2.5 py-1 text-[9px] tracking-[0.18em] transition-colors",
                option.id === scenarioId
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <label
              htmlFor="stress-participation"
              className="stencil text-[8.5px] tracking-[0.18em] text-faint"
            >
              DAILY PARTICIPATION
            </label>
            <input
              id="stress-participation"
              type="range"
              min={5}
              max={100}
              step={5}
              value={Math.round(participation * 100)}
              onChange={(event) =>
                setParticipation(Number(event.target.value) / 100)
              }
              className="h-1 w-24 accent-brand"
            />
            <span className="data-font w-9 text-right text-[11px] tabular-nums text-muted-foreground">
              {Math.round(participation * 100)}%
            </span>
          </div>
        </div>

        <p className="mt-2.5 text-[10px] leading-relaxed text-faint">
          {scenario.blurb}
          {" "}
          <span className="text-muted-foreground">
            Depth retention {(scenario.depthRetention * 100).toFixed(0)}% ·
            pool retention {(scenario.poolRetention * 100).toFixed(0)}% ·
            freeze haircut {((1 - scenario.freezeHaircut) * 100).toFixed(0)}%.
          </span>
          {" "}
          Every one of those is a stated parameter, not a forecast — the
          number you can defend, rather than one we assert.
          {omitted > 0 && (
            <span className="mt-1 block text-hold">
              {omitted} further position{omitted === 1 ? "" : "s"} not read
              this pass and not included in the mark.
            </span>
          )}
        </p>
      </div>

      {/* ── Headline ────────────────────────────────────────────────── */}
      <div className="border-b border-border/60 px-4 py-4">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              RECOVERABLE
            </p>
            <p
              className={cn(
                "data-font mt-1 text-[30px] font-[600] leading-none tabular-nums",
                report.severity === "critical"
                  ? "text-no-go"
                  : report.severity === "warn"
                    ? "text-hold"
                    : "text-go"
              )}
            >
              {xrp(report.recoverableXrp, 0)}
              <span className="ml-1.5 text-[13px] text-faint">XRP</span>
            </p>
          </div>
          <div>
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              MARK TO MID
            </p>
            <p className="data-font mt-1 text-[20px] leading-none tabular-nums text-muted-foreground">
              {xrp(report.markXrp, 0)}
              <span className="ml-1.5 text-[11px] text-faint">XRP</span>
            </p>
          </div>
          <div>
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              RECOVERY
            </p>
            <p className="data-font mt-1 text-[20px] leading-none tabular-nums text-foreground">
              {report.markXrp > 0
                ? `${(report.recoveryRatio * 100).toFixed(1)}%`
                : "—"}
            </p>
          </div>
          <div>
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              DAYS TO EXIT
            </p>
            <p className="data-font mt-1 text-[20px] leading-none tabular-nums text-foreground">
              {Number.isFinite(report.daysToExit) ? report.daysToExit : "NO EXIT"}
            </p>
          </div>
          <div>
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              FREEZABLE
            </p>
            <p
              className={cn(
                "data-font mt-1 text-[20px] leading-none tabular-nums",
                report.freezableShare > 0.5 ? "text-no-go" : "text-foreground"
              )}
            >
              {(report.freezableShare * 100).toFixed(0)}%
            </p>
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          {report.headline}
        </p>
      </div>

      {/* ── Waterfall ───────────────────────────────────────────────── */}
      {report.markXrp > 0 && (
        <div className="border-b border-border/60 px-4 py-4">
          <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
            MARK TO RECOVERABLE
          </p>

          {/*
            One bar, segmented, drawn to scale against the mark. A grouped
            bar chart would invite reading the leaks against each other;
            what matters is each one's share of the mark, and that they
            account for all of it.
          */}
          {/*
            `bg-muted` rather than the brand board's `elevated`: elevated
            is documented in the palette comment but was never declared as
            a `--color-*` token, so `bg-elevated` generates no utility and
            the track would render transparent.
          */}
          <div className="mt-2.5 flex h-[14px] w-full overflow-hidden rounded-[2px] bg-muted">
            {report.waterfall.map((row) => (
              <div
                key={row.id}
                className={cn(
                  "h-full",
                  row.kind === "value" ? "bg-go" : LEAK_TONE[row.id] ?? "bg-faint"
                )}
                style={{
                  width: `${Math.max(0, (row.xrp / report.markXrp) * 100)}%`,
                }}
                title={`${row.label}: ${xrp(row.xrp)} XRP`}
              />
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {report.waterfall.map((row) => (
              <div key={row.id} className="flex gap-2.5">
                <span
                  className={cn(
                    "mt-[5px] h-[7px] w-[7px] shrink-0 rounded-[1px]",
                    row.kind === "value" ? "bg-go" : LEAK_TONE[row.id] ?? "bg-faint"
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="flex items-baseline gap-2 text-[11px] text-foreground">
                    <span>{row.label}</span>
                    <span className="data-font ml-auto shrink-0 tabular-nums text-muted-foreground">
                      {xrp(row.xrp, 0)}
                    </span>
                    <span className="data-font shrink-0 text-[10px] tabular-nums text-faint">
                      {((row.xrp / report.markXrp) * 100).toFixed(1)}%
                    </span>
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-faint">
                    {WATERFALL_COPY[row.id]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Per position ────────────────────────────────────────────── */}
      <div className="divide-y divide-border/40">
        {[...report.positions]
          // Worst first by absolute value lost. A 2% leak on the largest
          // line matters more than a 40% leak on dust, and sorting by
          // ratio would put the dust at the top.
          .sort((a, b) => b.leakXrp - a.leakXrp)
          .map((position) => (
            <Signal
              key={`${position.currency}:${position.issuer}`}
              severity={position.severity}
              kicker={
                position.alreadyFrozen
                  ? "FROZEN"
                  : position.markXrp > 0
                    ? `${((position.recoverableXrp / position.markXrp) * 100).toFixed(0)}% RECOVERABLE`
                    : "UNPRICED"
              }
              headline={`${xrp(position.position)} ${position.currency}`}
              detail={position.note}
              source={`${shortAddress(position.issuer)} · ${
                Number.isFinite(position.daysToExit)
                  ? `${position.daysToExit}d exit`
                  : "no exit"
              }`}
              magnitude={
                position.markXrp > 0
                  ? `${xrp(position.recoverableXrp, 0)} / ${xrp(position.markXrp, 0)} XRP`
                  : undefined
              }
              className="rounded-none border-b border-border/30"
            >
              <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[10px] tabular-nums text-faint">
                <span>
                  ROUTED{" "}
                  <span className="text-muted-foreground">
                    {xrp(position.route.toBook, 0)} book ·{" "}
                    {xrp(position.route.toPool, 0)} pool
                  </span>
                </span>
                {position.route.unfilled > 0 && (
                  <span>
                    NO BID <span className="text-no-go">{xrp(position.route.unfilled, 0)}</span>
                  </span>
                )}
                {position.route.slippageBps !== undefined && (
                  <span>
                    SLIPPAGE{" "}
                    <span className="text-muted-foreground">
                      {Math.round(position.route.slippageBps)} bps
                    </span>
                  </span>
                )}
                {position.contentionShare < 1 && (
                  <span>
                    DEPTH SHARE{" "}
                    <span className="text-telemetry">
                      {(position.contentionShare * 100).toFixed(0)}%
                    </span>
                  </span>
                )}
                {position.route.bookOnlyProceedsXrp > 0 &&
                  position.route.proceedsXrp > position.route.bookOnlyProceedsXrp && (
                    <span>
                      POOL ADDS{" "}
                      <span className="text-go">
                        +{xrp(position.route.proceedsXrp - position.route.bookOnlyProceedsXrp, 0)} XRP
                      </span>
                    </span>
                  )}
              </div>
            </Signal>
          ))}
      </div>
    </div>
  );
}

/**
 * The right-hand rail for the stress tab: the parameters as numbers, and
 * the one paragraph that says what the whole reading is for.
 */
export function StressSidebar({ report }: { report: PortfolioStress | null }) {
  return (
    <>
      <Panel label="SCENARIO" corners className="shrink-0">
        {report ? (
          <div className="grid gap-0">
            <DataRow label="SCENARIO" value={report.scenario.label} />
            <DataRow
              label="DEPTH RETENTION"
              value={`${(report.scenario.depthRetention * 100).toFixed(0)}%`}
              tone={report.scenario.depthRetention < 1 ? "hold" : "default"}
            />
            <DataRow
              label="POOL RETENTION"
              value={`${(report.scenario.poolRetention * 100).toFixed(0)}%`}
              tone={report.scenario.poolRetention < 1 ? "hold" : "default"}
            />
            <DataRow
              label="FREEZE HAIRCUT"
              value={`${((1 - report.scenario.freezeHaircut) * 100).toFixed(0)}%`}
              tone={report.scenario.freezeHaircut < 1 ? "hold" : "default"}
            />
            <DataRow
              label="DAILY PARTICIPATION"
              value={`${(report.config.participationCap * 100).toFixed(0)}%`}
            />
            <DataRow
              label="SLIPPAGE BUDGET"
              value={`${report.config.slippageBudgetBps} bps`}
            />
          </div>
        ) : (
          <p className="text-[11px] text-faint">No positions to stress.</p>
        )}
        <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] leading-relaxed text-faint">
          These are inputs, not predictions. A committee that has agreed its
          own haircut should use theirs — the value of the number is that it
          can be argued with.
        </p>
      </Panel>

      <Panel
        label="WHAT THIS MEASURES"
        className="min-h-0 flex-1"
        bodyClassName="min-h-0 overflow-y-auto"
      >
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          A mark-to-mid portfolio value assumes two things that are false:
          that every unit sells at the touch, and that nobody can stop you
          selling.
        </p>
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
          This prices both. A full exit is routed across the resting DEX
          book <em>and</em> the AMM pool together, because a pool is real
          depth and a book-only simulation understates a thin market. Depth
          is then charged once rather than twice — two lines on one issuer
          are one market, and assessed separately they both look liquid
          against the same offers. What is left is discounted for balances
          the issuer retains the right to immobilise.
        </p>
        <p className="mt-2.5 text-[10px] leading-relaxed text-faint">
          Nothing here is a forecast of a price. It is what the ledger
          currently evidences a buyer for, under stated assumptions, at the
          ledger index the positions were read at.
        </p>
      </Panel>
    </>
  );
}
