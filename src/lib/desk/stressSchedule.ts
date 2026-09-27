import { createElement, useEffect, useState } from "react";
import { readSetting, writeSetting } from "@/lib/store";
import { useAuth } from "@/lib/auth/useAuth";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useOrg } from "@/lib/org/useOrg";
import { appendOrgAudit, can } from "@/lib/org/governance";
import { sendNativeNotification } from "@/lib/notifications";
import { dueFirings, formatMetric, sanitizeRules, type AlertRule, type Firing } from "@/lib/alerts/rules";
import { readPortfolioWallets } from "./portfolio";
import { recordSettingsChange } from "@/lib/org/workstationContext";
import {
  appendHistory,
  DEFAULT_SCHEDULE,
  factsOf,
  nextRunAt,
  runStressFor,
  sanitizeSchedule,
  type ScheduleConfig,
  type StressSnapshot,
} from "./scheduledStress";

/**
 * The monitoring store: the schedule, the readings it has taken, the
 * organization's alert rules and what they have fired.
 *
 * Module-level, like useOrg, so the runner (mounted once in App) and the
 * Monitor tab read and change the same state. Everything is persisted as
 * settings on this device; what the organization needs to see as well
 * (each scheduled run, each alert) is also appended to its audit log, and
 * alerts sent to "webhook" reach its own systems as signed events.
 */

export type MonitorState = {
  hydrated: boolean;
  config: ScheduleConfig;
  history: StressSnapshot[];
  rules: AlertRule[];
  lastFired: Record<string, number>;
  firings: Firing[];
  lastRunAt: string | null;
  running: boolean;
  lastError: string | null;
};

let state: MonitorState = {
  hydrated: false,
  config: DEFAULT_SCHEDULE,
  history: [],
  rules: [],
  lastFired: {},
  firings: [],
  lastRunAt: null,
  running: false,
  lastError: null,
};
const listeners = new Set<(s: MonitorState) => void>();

function set(patch: Partial<MonitorState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

let hydrating: Promise<void> | null = null;
function hydrate() {
  hydrating ??= (async () => {
    const [config, history, rules, lastFired, firings, lastRunAt] = await Promise.all([
      readSetting<unknown>("monitor.schedule", DEFAULT_SCHEDULE),
      readSetting<unknown>("monitor.history", []),
      readSetting<unknown>("monitor.rules", []),
      readSetting<unknown>("monitor.lastFired", {}),
      readSetting<unknown>("monitor.firings", []),
      readSetting<unknown>("monitor.lastRunAt", null),
    ]);
    set({
      hydrated: true,
      config: sanitizeSchedule(config),
      history: Array.isArray(history) ? (history as StressSnapshot[]).filter((s) => s && typeof s.address === "string" && typeof s.at === "string") : [],
      rules: sanitizeRules(rules),
      lastFired: lastFired && typeof lastFired === "object" && !Array.isArray(lastFired) ? (lastFired as Record<string, number>) : {},
      firings: Array.isArray(firings) ? (firings as Firing[]).filter((f) => f && typeof f.ruleId === "string").slice(0, 50) : [],
      lastRunAt: typeof lastRunAt === "string" ? lastRunAt : null,
    });
  })();
  return hydrating;
}

export function useMonitor(): MonitorState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    void hydrate();
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

export function setSchedule(config: ScheduleConfig) {
  set({ config });
  void writeSetting("monitor.schedule", config);
  void recordSettingsChange("monitor.schedule", { ...config });
}

export function setRules(rules: AlertRule[]) {
  set({ rules });
  void writeSetting("monitor.rules", rules);
  void recordSettingsChange("monitor.rules", {
    rules: rules.map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, match: r.match, conditions: r.conditions, destinations: r.destinations })),
  });
}

export type RunContext = {
  accountId: string;
  /** The organization to record the run and alerts in, when the member may. */
  organizationId: string | null;
  alertsEnabled: boolean;
};

/** Run the whole book now. Safe to call while a run is in progress (it is ignored). */
export async function runMonitorNow(ctx: RunContext): Promise<void> {
  if (state.running) return;
  await hydrate();
  set({ running: true, lastError: null });
  try {
    const wallets = await readPortfolioWallets(ctx.accountId);
    const scenario = state.config.scenario;
    const run: StressSnapshot[] = [];
    // Two at a time: the public servers are shared and free.
    for (let i = 0; i < wallets.length; i += 2) {
      const batch = wallets.slice(i, i + 2);
      run.push(...(await Promise.all(batch.map((w) => runStressFor(w.address, w.label ?? undefined, scenario)))));
    }
    const at = new Date().toISOString();
    const history = appendHistory(state.history, run);
    set({ history, lastRunAt: at });
    void writeSetting("monitor.history", history);
    void writeSetting("monitor.lastRunAt", at);

    let fired: Firing[] = [];
    if (ctx.alertsEnabled && state.rules.length) {
      const due = dueFirings(
        state.rules,
        run.filter((s) => !s.error).map((s) => ({ address: s.address, label: s.label, facts: factsOf(s) })),
        state.lastFired,
        Date.now()
      );
      fired = due.firings;
      const firings = [...fired, ...state.firings].slice(0, 50);
      set({ lastFired: due.lastFired, firings });
      void writeSetting("monitor.lastFired", due.lastFired);
      void writeSetting("monitor.firings", firings);
      for (const f of fired) await deliver(f, ctx);
    }

    if (ctx.organizationId) {
      const measured = run.filter((s) => !s.error && Number.isFinite(s.recoveryRatio));
      await appendOrgAudit(ctx.organizationId, "stress.scheduled_run", { type: "portfolio", id: ctx.accountId }, {
        scenario,
        wallets: run.length,
        unreadable: run.filter((s) => s.error).length,
        worst_recovery_ratio: measured.length ? Math.min(...measured.map((s) => s.recoveryRatio)) : null,
        alerts_fired: fired.length,
      });
    }
    const unreadable = run.filter((s) => s.error).length;
    if (unreadable) set({ lastError: `${unreadable} of ${run.length} wallets could not be read on this run.` });
  } catch (error) {
    set({ lastError: error instanceof Error ? error.message : "The run did not complete." });
  } finally {
    set({ running: false });
  }
}

async function deliver(f: Firing, ctx: RunContext) {
  const who = f.label ? `${f.label} (${f.address})` : f.address;
  const detail = f.values.map((v) => formatMetric(v.metric, v.value)).join(" · ");
  if (f.destinations.includes("desktop")) {
    await sendNativeNotification({ title: `NOSHASHI · ${f.ruleName}`, body: `${who}: ${detail}` });
  }
  if (f.destinations.includes("webhook") && ctx.organizationId) {
    await appendOrgAudit(ctx.organizationId, "alert.triggered", { type: "alert_rule", id: f.ruleId }, {
      rule: f.ruleName,
      condition: f.description,
      address: f.address,
      label: f.label ?? null,
      values: f.values,
      scenario: state.config.scenario,
    });
  }
}

/**
 * Mounted once in App. Runs the book when the schedule says so, only for a
 * signed-in account whose plan includes bulk monitoring.
 */
export function StressScheduleRunner() {
  const s = useMonitor();
  const { user } = useAuth();
  const { has } = useBilling();
  const active = s.hydrated && s.config.enabled && Boolean(user) && has("bulk_monitoring");
  return active && user ? createElement(ScheduledLoop, { accountId: user.id, alertsEnabled: has("custom_alert_logic") }) : null;
}

function ScheduledLoop({ accountId, alertsEnabled }: { accountId: string; alertsEnabled: boolean }) {
  const s = useMonitor();
  const org = useOrg();
  const membership = org.state.status === "ready" && org.state.data ? org.state.data.membership : null;
  const organizationId = membership && can.recordAudit(membership.role) ? membership.organizationId : null;

  useEffect(() => {
    const ctx: RunContext = { accountId, organizationId, alertsEnabled };
    const tick = () => {
      if (Date.now() >= nextRunAt(state.lastRunAt, state.config)) void runMonitorNow(ctx);
    };
    // First check shortly after start, then every minute against the schedule.
    const first = window.setTimeout(tick, 10_000);
    const every = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [accountId, organizationId, alertsEnabled, s.config.everyHours, s.config.scenario]);
  return null;
}
