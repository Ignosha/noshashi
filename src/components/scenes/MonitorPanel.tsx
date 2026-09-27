import { useMemo, useState } from "react";
import { Eyebrow } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/useAuth";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useOrg } from "@/lib/org/useOrg";
import { can } from "@/lib/org/governance";
import { shortAddress } from "@/lib/xrpl/client";
import { SCENARIOS, type ScenarioId } from "@/lib/desk/stress";
import { SCHEDULE_HOURS, nextRunAt, type StressSnapshot } from "@/lib/desk/scheduledStress";
import { runMonitorNow, setRules, setSchedule, useMonitor } from "@/lib/desk/stressSchedule";
import {
  METRICS,
  OP_WORDS,
  describeRule,
  formatMetric,
  type AlertRule,
  type Condition,
  type Destination,
  type Metric,
  type Op,
} from "@/lib/alerts/rules";
import type { PortfolioWallet } from "@/lib/desk/portfolio";
import { cn } from "@/lib/utils";

/**
 * SCHEDULED MONITORING — the book re-stressed on a timer, and the
 * organization's own alert rules over the readings.
 *
 * Institutional: scheduled runs (bulk_monitoring) and custom alert logic
 * (custom_alert_logic). Pro sees what the tier adds rather than a dead
 * control.
 */

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");

function ratio(v: number) {
  return Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—";
}

export function MonitorPanel({ wallets }: { wallets: PortfolioWallet[] }) {
  const m = useMonitor();
  const { user } = useAuth();
  const { has } = useBilling();
  const org = useOrg();
  const scheduled = has("bulk_monitoring");
  const alerting = has("custom_alert_logic");
  const membership = org.data?.membership ?? null;
  const organizationId = membership && can.recordAudit(membership.role) ? membership.organizationId : null;

  const latest = useMemo(() => {
    const byWallet = new Map<string, StressSnapshot[]>();
    for (const s of m.history) byWallet.set(s.address, [...(byWallet.get(s.address) ?? []), s]);
    return wallets.map((w) => ({ wallet: w, readings: byWallet.get(w.address) ?? [] }));
  }, [m.history, wallets]);

  if (!scheduled) {
    return (
      <div className="p-4 text-[11.5px] leading-relaxed text-muted-foreground">
        <Eyebrow className="mb-2">INSTITUTIONAL</Eyebrow>
        <p>
          Scheduled monitoring re-runs the redemption stress test for every wallet in this book on a timer (every 1 to 24 hours),
          keeps each reading, and tests your organization's own alert rules against them: recovery ratio, freezable share, days to
          exit, trapped value and frozen positions, combined with ALL or ANY, sent to the console, the desktop, or your webhooks as a
          signed <span className="font-mono text-[10.5px]">custom_alert</span> event. Every run is written to the organization's
          audit log.
        </p>
        <p className="mt-2">It is part of the Institutional plan. The stress test itself is on the Risk screen.</p>
      </div>
    );
  }

  const next = m.config.enabled ? nextRunAt(m.lastRunAt, m.config) : null;

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Schedule */}
      <section>
        <Eyebrow className="mb-2">SCHEDULE</Eyebrow>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={m.config.enabled ? "default" : "outline"}
            onClick={() => setSchedule({ ...m.config, enabled: !m.config.enabled })}
            aria-pressed={m.config.enabled}
          >
            {m.config.enabled ? "SCHEDULE ON" : "SCHEDULE OFF"}
          </Button>
          <label className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
            EVERY{" "}
            <select
              className="ml-1 rounded-[3px] border border-border bg-background px-1.5 py-1 text-[10px] text-foreground"
              value={m.config.everyHours}
              onChange={(e) => setSchedule({ ...m.config, everyHours: Number(e.target.value) })}
            >
              {SCHEDULE_HOURS.map((h) => (
                <option key={h} value={h}>{h} H</option>
              ))}
            </select>
          </label>
          <label className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
            SCENARIO{" "}
            <select
              className="ml-1 rounded-[3px] border border-border bg-background px-1.5 py-1 text-[10px] text-foreground"
              value={m.config.scenario}
              onChange={(e) => setSchedule({ ...m.config, scenario: e.target.value as ScenarioId })}
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={m.running || !user || wallets.length === 0}
            onClick={() => user && void runMonitorNow({ accountId: user.id, organizationId, alertsEnabled: alerting })}
          >
            {m.running ? "RUNNING…" : "RUN NOW"}
          </Button>
        </div>
        <p className="mt-2 font-mono text-[9px] tracking-[0.12em] text-faint">
          LAST RUN {when(m.lastRunAt).toUpperCase()}
          {next !== null && ` · NEXT ${next === 0 ? "WITHIN A MINUTE" : new Date(next).toLocaleString().toUpperCase()}`}
          {organizationId ? ` · RECORDED IN ${membership?.name.toUpperCase()}'S AUDIT LOG` : ""}
        </p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
          Runs while NOSHASHI is open (including in the menu bar), with the same readers and stress model as the Risk screen.
        </p>
        {m.lastError && <p className="mt-1 text-[10.5px] text-hold">{m.lastError}</p>}
      </section>

      {/* Readings */}
      <section>
        <Eyebrow className="mb-2">LATEST READINGS · {m.config.scenario.toUpperCase()}</Eyebrow>
        {wallets.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Add wallets to the book to monitor them.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                {["WALLET", "RECOVERY", "FREEZABLE", "DAYS OUT", "TRAPPED", "TREND", "READ"].map((h) => (
                  <th key={h} className="stencil px-2 py-1.5 text-[8px] tracking-[0.18em] text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {latest.map(({ wallet, readings }) => {
                const last = readings[readings.length - 1];
                return (
                  <tr key={wallet.address} className="border-b border-border/30">
                    <td className="px-2 py-1.5 text-[10.5px] text-foreground">
                      {wallet.label ?? <span className="font-mono text-[10px]">{shortAddress(wallet.address)}</span>}
                    </td>
                    {last?.error ? (
                      <td colSpan={5} className="px-2 py-1.5 text-[10px] text-hold">{last.error}</td>
                    ) : (
                      <>
                        <td className="px-2 py-1.5 font-mono text-[10px] tabular-nums">{last ? ratio(last.recoveryRatio) : "—"}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px] tabular-nums">{last ? ratio(last.freezableShare) : "—"}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px] tabular-nums">{last && Number.isFinite(last.daysToExit) ? last.daysToExit.toFixed(1) : "—"}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px] tabular-nums">{last ? formatMetric("trapped_xrp", last.trappedXrp) : "—"}</td>
                        <td className="px-2 py-1.5"><Trend readings={readings} /></td>
                      </>
                    )}
                    <td className="px-2 py-1.5 font-mono text-[9px] text-faint">{last ? new Date(last.at).toLocaleTimeString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Rules */}
      <section>
        <Eyebrow className="mb-2">ALERT RULES · {m.rules.length}</Eyebrow>
        {!alerting ? (
          <p className="text-[11px] text-muted-foreground">Custom alert logic is part of the Institutional plan.</p>
        ) : (
          <RulesEditor rules={m.rules} wallets={wallets} webhookAvailable={Boolean(organizationId)} />
        )}
      </section>

      {/* Fired */}
      {alerting && (
        <section>
          <Eyebrow className="mb-2">RECENT ALERTS · {m.firings.length}</Eyebrow>
          {m.firings.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No rule has fired yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {m.firings.slice(0, 12).map((f) => (
                <li key={`${f.ruleId}-${f.address}-${f.at}`} className="border-l-2 border-l-hold pl-2.5 text-[10.5px]">
                  <span className="font-medium text-foreground">{f.ruleName}</span>{" "}
                  <span className="text-muted-foreground">· {f.label ?? shortAddress(f.address)} · {new Date(f.at).toLocaleString()}</span>
                  <div className="text-muted-foreground">
                    {f.values.map((v) => `${METRICS.find((x) => x.id === v.metric)?.label}: ${formatMetric(v.metric, v.value)}`).join(" · ")}
                    {" "}→ {f.destinations.join(", ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** The last ten recovery ratios as bars, oldest first. */
function Trend({ readings }: { readings: StressSnapshot[] }) {
  const points = readings.slice(-10).map((r) => r.recoveryRatio).filter((v) => Number.isFinite(v));
  if (points.length < 2) return <span className="font-mono text-[9px] text-faint">—</span>;
  return (
    <span className="flex h-3 items-end gap-px" aria-label={`Recovery ratio over the last ${points.length} runs`}>
      {points.map((v, i) => (
        <span
          key={i}
          className={cn("w-1 rounded-[1px]", v < 0.5 ? "bg-no-go" : v < 0.8 ? "bg-hold" : "bg-go")}
          style={{ height: `${Math.max(12, Math.min(100, v * 100))}%` }}
        />
      ))}
    </span>
  );
}

const newId = () => crypto.randomUUID();

const UNIT_INPUT: Record<string, { toValue: (n: number) => number; fromValue: (n: number) => number; suffix: string }> = {
  ratio: { toValue: (n) => n / 100, fromValue: (n) => n * 100, suffix: "%" },
  days: { toValue: (n) => n, fromValue: (n) => n, suffix: "days" },
  xrp: { toValue: (n) => n, fromValue: (n) => n, suffix: "XRP" },
  count: { toValue: (n) => n, fromValue: (n) => n, suffix: "" },
};

function RulesEditor({ rules, wallets, webhookAvailable }: { rules: AlertRule[]; wallets: PortfolioWallet[]; webhookAvailable: boolean }) {
  const [draft, setDraft] = useState<AlertRule | null>(null);

  const blank = (): AlertRule => ({
    id: newId(),
    name: "",
    conditions: [{ metric: "recovery_ratio", op: "<", threshold: 0.6 }],
    match: "all",
    scope: "all",
    destinations: ["console", "desktop"],
    enabled: true,
    cooldownHours: 24,
  });

  const save = () => {
    if (!draft || !draft.name.trim() || draft.conditions.length === 0) return;
    const clean = { ...draft, name: draft.name.trim() };
    setRules(rules.some((r) => r.id === clean.id) ? rules.map((r) => (r.id === clean.id ? clean : r)) : [...rules, clean]);
    setDraft(null);
  };

  return (
    <div className="flex flex-col gap-2">
      {rules.map((r) => (
        <div key={r.id} className={cn("inset-row flex items-start gap-2 px-3 py-2", !r.enabled && "opacity-60")}>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-medium text-foreground">{r.name}</p>
            <p className="text-[10.5px] text-muted-foreground">{describeRule(r)}</p>
            <p className="mt-0.5 font-mono text-[9px] tracking-[0.12em] text-faint">
              {r.scope === "all" ? "EVERY WALLET" : `${r.scope.length} WALLET${r.scope.length === 1 ? "" : "S"}`} · {r.destinations.join(" + ").toUpperCase()} · AGAIN AFTER {r.cooldownHours} H
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setRules(rules.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))}>
            {r.enabled ? "PAUSE" : "RESUME"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(r)}>EDIT</Button>
          <Button size="sm" variant="ghost" onClick={() => setRules(rules.filter((x) => x.id !== r.id))}>DELETE</Button>
        </div>
      ))}

      {draft ? (
        <div className="flex flex-col gap-2.5 border border-border p-3">
          <Input placeholder="Rule name, e.g. Book cannot be raised" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          {draft.conditions.map((c, i) => (
            <ConditionRow
              key={i}
              condition={c}
              onChange={(next) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? next : x)) })}
              onRemove={draft.conditions.length > 1 ? () => setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) }) : undefined}
            />
          ))}
          <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] tracking-[0.12em] text-muted-foreground">
            {draft.conditions.length < 6 && (
              <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, { metric: "freezable_share", op: ">", threshold: 0.25 }] })}>
                + CONDITION
              </Button>
            )}
            {draft.conditions.length > 1 && (
              <label>
                FIRE WHEN{" "}
                <select className="rounded-[3px] border border-border bg-background px-1.5 py-1 text-[10px] text-foreground" value={draft.match} onChange={(e) => setDraft({ ...draft, match: e.target.value as "all" | "any" })}>
                  <option value="all">ALL HOLD</option>
                  <option value="any">ANY HOLDS</option>
                </select>
              </label>
            )}
            <label>
              AGAIN AFTER{" "}
              <input type="number" min={0} max={720} className="w-14 rounded-[3px] border border-border bg-background px-1.5 py-1 text-[10px] text-foreground" value={draft.cooldownHours} onChange={(e) => setDraft({ ...draft, cooldownHours: Math.max(0, Math.min(720, Number(e.target.value) || 0)) })} /> H
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10.5px] text-muted-foreground">
            <span className="font-mono text-[9px] tracking-[0.14em]">SEND TO</span>
            {(["console", "desktop", "webhook"] as Destination[]).map((d) => (
              <label key={d} className={cn("flex items-center gap-1", d === "webhook" && !webhookAvailable && "opacity-50")}>
                <input
                  type="checkbox"
                  disabled={d === "webhook" && !webhookAvailable}
                  checked={draft.destinations.includes(d)}
                  onChange={(e) => setDraft({ ...draft, destinations: e.target.checked ? [...draft.destinations, d] : draft.destinations.filter((x) => x !== d) })}
                />
                {d === "console" ? "Console" : d === "desktop" ? "Desktop notification" : "Organization webhooks (custom_alert)"}
              </label>
            ))}
          </div>
          {!webhookAvailable && (
            <p className="text-[10px] text-faint">Webhook delivery needs an organization in which your role records to the audit log.</p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
            <span className="font-mono text-[9px] tracking-[0.14em]">WALLETS</span>
            <label className="flex items-center gap-1">
              <input type="radio" checked={draft.scope === "all"} onChange={() => setDraft({ ...draft, scope: "all" })} /> Every wallet
            </label>
            {wallets.map((w) => (
              <label key={w.address} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={draft.scope !== "all" && draft.scope.includes(w.address)}
                  onChange={(e) => {
                    const current = draft.scope === "all" ? [] : draft.scope;
                    const next = e.target.checked ? [...current, w.address] : current.filter((a) => a !== w.address);
                    setDraft({ ...draft, scope: next.length ? next : "all" });
                  }}
                />
                {w.label ?? shortAddress(w.address)}
              </label>
            ))}
          </div>
          <p className="text-[10.5px] text-foreground">{describeRule(draft)}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={!draft.name.trim() || draft.destinations.length === 0}>SAVE RULE</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>CANCEL</Button>
          </div>
        </div>
      ) : (
        <div>
          <Button size="sm" variant="outline" onClick={() => setDraft(blank())}>NEW RULE</Button>
        </div>
      )}
    </div>
  );
}

function ConditionRow({ condition, onChange, onRemove }: { condition: Condition; onChange: (c: Condition) => void; onRemove?: () => void }) {
  const spec = METRICS.find((m) => m.id === condition.metric)!;
  const unit = UNIT_INPUT[spec.unit];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded-[3px] border border-border bg-background px-1.5 py-1 text-[10.5px] text-foreground"
        value={condition.metric}
        onChange={(e) => {
          const metric = e.target.value as Metric;
          const nextUnit = METRICS.find((m) => m.id === metric)!.unit;
          onChange({ ...condition, metric, threshold: nextUnit === spec.unit ? condition.threshold : nextUnit === "ratio" ? 0.5 : 1 });
        }}
        title={spec.help}
      >
        {METRICS.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
      <select
        className="rounded-[3px] border border-border bg-background px-1.5 py-1 text-[10.5px] text-foreground"
        value={condition.op}
        onChange={(e) => onChange({ ...condition, op: e.target.value as Op })}
      >
        {(Object.keys(OP_WORDS) as Op[]).map((op) => (
          <option key={op} value={op}>{OP_WORDS[op]}</option>
        ))}
      </select>
      <input
        type="number"
        step="any"
        className="w-24 rounded-[3px] border border-border bg-background px-1.5 py-1 text-[10.5px] text-foreground"
        value={Number(unit.fromValue(condition.threshold).toFixed(4))}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange({ ...condition, threshold: unit.toValue(n) });
        }}
      />
      <span className="font-mono text-[9px] text-faint">{unit.suffix}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="font-mono text-[9px] text-muted-foreground hover:text-no-go">REMOVE</button>
      )}
    </div>
  );
}
