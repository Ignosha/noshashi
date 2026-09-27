import { fetchAmmPool, fetchIssuerPosture, fetchOrderBook, fetchTrustLines } from "@/lib/xrpl/client";
import type { IssuerPosture } from "@/lib/xrpl/types";
import type { MetricFacts } from "@/lib/alerts/rules";
import { analyseIssuers } from "./risk";
import { DEFAULT_STRESS_CONFIG, SCENARIOS, stressPortfolio, type PortfolioStress, type ScenarioId, type StressInput } from "./stress";

/**
 * Scheduled stress runs — the whole book re-tested on a timer.
 *
 * The Risk screen stresses one account when someone presses it. A book
 * that became unexitable overnight is only found that way if somebody
 * happens to look. This runs the same test (the same readers and the same
 * stressPortfolio as the Risk screen) for every wallet in the book on a
 * schedule, keeps the readings, and hands them to the organization's alert
 * rules (@/lib/alerts/rules).
 *
 * Nothing here is estimated to fill a gap: a market that cannot be read is
 * stressed as having no exit, as the Risk screen does, and counted in
 * `unreadMarkets` so the reading says how much of it rests on that.
 */

/** Positions stressed per wallet, as on the Risk screen. */
const MAX_POSITIONS = 12;
/** Issuers read per wallet, as on the Risk screen. */
const MAX_ISSUERS = 25;

export type StressSnapshot = {
  address: string;
  label?: string;
  at: string;
  scenario: ScenarioId;
  markXrp: number;
  recoverableXrp: number;
  recoveryRatio: number;
  freezableShare: number;
  daysToExit: number;
  trappedXrp: number;
  positions: number;
  frozenPositions: number;
  freezablePositions: number;
  severity: PortfolioStress["severity"];
  headline: string;
  /** Markets that could not be read and were stressed as having no exit. */
  unreadMarkets: number;
  /** Set when the wallet itself could not be read; every figure is then NaN. */
  error?: string;
};

export function snapshotOf(
  address: string,
  label: string | undefined,
  report: PortfolioStress,
  at: string,
  unreadMarkets: number
): StressSnapshot {
  const measured = report.positions.length > 0 && report.markXrp > 0;
  return {
    address,
    label,
    at,
    scenario: report.scenario.id,
    markXrp: report.markXrp,
    recoverableXrp: report.recoverableXrp,
    // With nothing to mark there is no ratio: NaN, which no rule treats as a breach.
    recoveryRatio: measured ? report.recoveryRatio : Number.NaN,
    freezableShare: measured ? report.freezableShare : Number.NaN,
    daysToExit: report.daysToExit,
    trappedXrp: report.positions.reduce((sum, p) => sum + p.trappedXrp, 0),
    positions: report.positions.length,
    frozenPositions: report.positions.filter((p) => p.alreadyFrozen).length,
    freezablePositions: report.positions.filter((p) => p.canBeFrozen).length,
    severity: report.severity,
    headline: report.headline,
    unreadMarkets,
  };
}

export function failedSnapshot(address: string, label: string | undefined, scenario: ScenarioId, at: string, error: string): StressSnapshot {
  return {
    address, label, at, scenario,
    markXrp: Number.NaN, recoverableXrp: Number.NaN, recoveryRatio: Number.NaN, freezableShare: Number.NaN,
    daysToExit: Number.NaN, trappedXrp: Number.NaN, positions: 0, frozenPositions: 0, freezablePositions: 0,
    severity: "info", headline: "Not read", unreadMarkets: 0, error,
  };
}

/** The figures alert rules test. */
export function factsOf(s: StressSnapshot): MetricFacts {
  return {
    recovery_ratio: s.recoveryRatio,
    freezable_share: s.freezableShare,
    days_to_exit: s.daysToExit,
    trapped_xrp: s.trappedXrp,
    mark_xrp: s.markXrp,
    frozen_positions: s.error ? Number.NaN : s.frozenPositions,
    freezable_positions: s.error ? Number.NaN : s.freezablePositions,
  };
}

/** Read one wallet from the live ledger and stress it. Never throws. */
export async function runStressFor(address: string, label: string | undefined, scenarioId: ScenarioId): Promise<StressSnapshot> {
  const at = new Date().toISOString();
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[1];
  try {
    const lines = await fetchTrustLines(address);
    const issuers = [...new Set(lines.filter((l) => l.balance > 0).map((l) => l.issuer))].slice(0, MAX_ISSUERS);
    const postures = new Map<string, IssuerPosture>();
    for (const issuer of issuers) postures.set(issuer, await fetchIssuerPosture(issuer));
    const exposures = analyseIssuers(lines, postures);

    const positions = exposures.flatMap((exposure) =>
      exposure.balance > 0 ? exposure.currencies.map((currency) => ({ exposure, currency })) : []
    ).slice(0, MAX_POSITIONS);

    let unread = 0;
    const inputs: StressInput[] = [];
    for (const { exposure, currency } of positions) {
      try {
        const [book, pool] = await Promise.all([fetchOrderBook(currency, exposure.issuer), fetchAmmPool(currency, exposure.issuer)]);
        inputs.push({ exposure, currency, book, pool });
      } catch {
        unread += 1;
        inputs.push({ exposure, currency, book: null, pool: null });
      }
    }
    const report = stressPortfolio(inputs, { ...DEFAULT_STRESS_CONFIG, scenario });
    return snapshotOf(address, label, report, at, unread);
  } catch (error) {
    return failedSnapshot(address, label, scenario.id, at, error instanceof Error ? error.message : "The wallet could not be read.");
  }
}

export type ScheduleConfig = { enabled: boolean; everyHours: number; scenario: ScenarioId };
export const DEFAULT_SCHEDULE: ScheduleConfig = { enabled: false, everyHours: 6, scenario: "stressed" };
export const SCHEDULE_HOURS = [1, 4, 6, 12, 24] as const;

export function sanitizeSchedule(raw: unknown): ScheduleConfig {
  const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const everyHours = SCHEDULE_HOURS.includes(x.everyHours as (typeof SCHEDULE_HOURS)[number]) ? (x.everyHours as number) : DEFAULT_SCHEDULE.everyHours;
  const scenario = SCENARIOS.some((s) => s.id === x.scenario) ? (x.scenario as ScenarioId) : DEFAULT_SCHEDULE.scenario;
  return { enabled: x.enabled === true, everyHours, scenario };
}

/** When the next run is due, given the last one (ISO) and the schedule. */
export function nextRunAt(lastRunAt: string | null, config: ScheduleConfig): number {
  if (!lastRunAt) return 0;
  const last = Date.parse(lastRunAt);
  return Number.isFinite(last) ? last + config.everyHours * 3_600_000 : 0;
}

/** Keep the most recent readings per wallet, oldest dropped first. */
export function appendHistory(history: StressSnapshot[], run: StressSnapshot[], perWallet = 30): StressSnapshot[] {
  const all = [...history, ...run];
  const byWallet = new Map<string, StressSnapshot[]>();
  for (const s of all) byWallet.set(s.address, [...(byWallet.get(s.address) ?? []), s]);
  return [...byWallet.values()].flatMap((list) => list.slice(-perWallet)).sort((a, b) => a.at.localeCompare(b.at));
}
