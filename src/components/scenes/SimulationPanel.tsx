import { useMemo, useState } from "react";
import { EmptyState } from "@/components/nova/EmptyState";
import { Eyebrow } from "@/components/nova/Panel";
import { StatusDot } from "@/components/nova/StatusDot";
import { NovaTerminal } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DOMAIN_REGISTRY } from "@/lib/policy";
import { shortAddress } from "@/lib/xrpl/client";
import { saveTextFile } from "@/lib/export";
import { signContent, type LedgerEntry } from "@/lib/desk/ledger";
import {
  EMPTY_SCENARIO,
  HHI_RULE_ID,
  recordedRules,
  simulate,
  simulationToCsv,
  type Scenario,
  type Severity,
} from "@/lib/desk/simulate";
import { useToast } from "@/lib/toast";
import type { Status } from "@/lib/xrpl/types";
import { cn } from "@/lib/utils";

const SHOWN = 100;
const VERDICTS: Status[] = ["go", "hold", "no-go", "insufficient-data"];
const LABEL: Record<Status, string> = {
  go: "GO",
  hold: "HOLD",
  "no-go": "NO-GO",
  "insufficient-data": "INSUFFICIENT",
};
const TONE: Record<Status, string> = {
  go: "text-go",
  hold: "text-hold",
  "no-go": "text-no-go",
  "insufficient-data": "text-hold",
};

/**
 * Re-decide the verdicts already on the ledger under a changed policy,
 * from what each entry recorded. Read-only: nothing is written and no
 * receipt changes.
 */
export function SimulationPanel({
  entries,
  loaded,
  hhiDefault,
}: {
  entries: LedgerEntry[];
  loaded: boolean;
  hhiDefault: number;
}) {
  const { push } = useToast();
  const [scenario, setScenario] = useState<Scenario>(EMPTY_SCENARIO);
  const [hhiDraft, setHhiDraft] = useState(hhiDefault);

  const rules = useMemo(() => {
    const recorded = recordedRules(entries);
    if (scenario.hhiLimit === null) return recorded;
    // The proposed rule is not on any record; list it so its severity can be set too.
    const measured = entries.filter((e) => e.checks && typeof e.hhi === "number");
    return [
      ...recorded,
      {
        id: HHI_RULE_ID,
        label: "Concentration within proposed limit",
        severities: new Set(["warn"]),
        seen: measured.length,
        failed: measured.filter((e) => (e.hhi as number) > (scenario.hhiLimit as number)).length,
      },
    ];
  }, [entries, scenario.hhiLimit]);
  const domains = useMemo(() => {
    const ids = new Set(entries.filter((e) => e.domainId).map((e) => e.domainId!));
    return DOMAIN_REGISTRY.filter((d) => ids.has(d.id));
  }, [entries]);
  const { results, summary } = useMemo(() => simulate(entries, scenario), [entries, scenario]);
  const changed = useMemo(
    () => results.filter((r) => r.state === "evaluated" && r.before !== r.after),
    [results]
  );

  const touched =
    Object.keys(scenario.severity).length > 0 ||
    Object.keys(scenario.ceilings).length > 0 ||
    scenario.hhiLimit !== null;

  const setSeverity = (id: string, value: Severity | "") =>
    setScenario((s) => {
      const severity = { ...s.severity };
      if (value) severity[id] = value;
      else delete severity[id];
      return { ...s, severity };
    });

  const setCeiling = (id: string, raw: string) =>
    setScenario((s) => {
      const ceilings = { ...s.ceilings };
      const n = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(n) || n < 0) delete ceilings[id];
      else ceilings[id] = n;
      return { ...s, ceilings };
    });

  const exportRun = async () => {
    try {
      const csv = simulationToCsv(scenario, results);
      const sig = await signContent(csv);
      const body = `${csv}\n# NOSHASHI policy simulation · not a record of any decision\n# entries=${entries.length} evaluated=${summary.evaluated} changed=${summary.changed} skipped=${summary.skipped}\n# generated=${new Date().toISOString()}\n# sha256(body)=${sig}\n`;
      const dest = await saveTextFile(`noshashi-simulation-${new Date().toISOString().slice(0, 10)}.csv`, body);
      push({ title: "SIMULATION EXPORTED", body: `Written to ${dest}`, tone: "go" });
    } catch (error) {
      push({
        title: "EXPORT FAILED",
        body: error instanceof Error ? error.message : "Unable to write file",
        tone: "no-go",
      });
    }
  };

  if (!loaded) {
    return <p className="mono-font animate-pulse p-4 text-[10px] text-muted-foreground">LOADING LEDGER…</p>;
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<NovaTerminal size={16} />}
        title="NOTHING TO SIMULATE YET"
        body="The simulation re-decides verdicts you have already recorded. Run a gate check in Verification and it appears here."
      />
    );
  }

  return (
    <div className="grid min-h-full grid-cols-1 xl:grid-cols-[minmax(320px,420px)_1fr]">
      {/* ── Policy changes ───────────────────────────────────── */}
      <div className="border-b border-border p-4 xl:border-b-0 xl:border-r">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Re-decides the verdicts on this ledger under a changed policy, from what each entry
          recorded, using the engine's own verdict rule. Nothing is written and no receipt changes.
        </p>

        <Eyebrow className="mb-2 mt-4">RULE SEVERITY</Eyebrow>
        <div className="space-y-1">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center gap-2 border-b border-border/30 py-1">
              <div className="min-w-0 flex-1">
                <p className="mono-font truncate text-[9.5px] text-foreground">{r.id}</p>
                <p className="mono-font text-[8.5px] text-muted-foreground">
                  failed {r.failed.toLocaleString()} of {r.seen.toLocaleString()} ·{" "}
                  {[...r.severities].map((sev) => (sev === "block" ? "blocking" : "advisory")).join(" / ")}
                  {r.id === HHI_RULE_ID && " · proposed"}
                </p>
              </div>
              <select
                aria-label={`Severity for ${r.id}`}
                value={scenario.severity[r.id] ?? ""}
                onChange={(e) => setSeverity(r.id, e.target.value as Severity | "")}
                className="mono-font h-6 rounded border border-border bg-background px-1 text-[9px] text-foreground"
              >
                <option value="">AS RECORDED</option>
                <option value="block">BLOCKING</option>
                <option value="warn">ADVISORY</option>
                <option value="off">OFF</option>
              </select>
            </div>
          ))}
        </div>

        {domains.length > 0 && (
          <>
            <Eyebrow className="mb-2 mt-5">TRANSFER CEILING (XRP)</Eyebrow>
            {domains.map((d) => (
              <div key={d.id} className="flex items-center gap-2 py-1">
                <span className="mono-font w-20 shrink-0 text-[9.5px] text-foreground">{d.code}</span>
                <Input
                  inputMode="numeric"
                  aria-label={`Transfer ceiling for ${d.code}`}
                  placeholder={`as recorded · ${d.transferCeilingXrp > 0 ? d.transferCeilingXrp.toLocaleString() : "closed"}`}
                  value={scenario.ceilings[d.id] ?? ""}
                  onChange={(e) => setCeiling(d.id, e.target.value)}
                  className="mono-font h-6 text-[9.5px]"
                />
              </div>
            ))}
            <p className="mt-1 text-[9px] text-muted-foreground/80">0 closes the domain to settlement.</p>
          </>
        )}

        <Eyebrow className="mb-2 mt-5">PROPOSED HHI LIMIT</Eyebrow>
        <div className="flex items-center gap-2">
          <Switch
            checked={scenario.hhiLimit !== null}
            onCheckedChange={(on) => setScenario((s) => ({ ...s, hhiLimit: on ? hhiDraft : null }))}
            aria-label="Apply a proposed HHI limit"
          />
          <Input
            inputMode="numeric"
            aria-label="Proposed HHI limit"
            value={hhiDraft}
            onChange={(e) => {
              const n = Math.min(10_000, Math.max(0, Number(e.target.value) || 0));
              setHhiDraft(n);
              setScenario((s) => (s.hhiLimit === null ? s : { ...s, hhiLimit: n }));
            }}
            className="mono-font h-6 w-24 text-[9.5px]"
          />
        </div>
        <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground/80">
          The gate does not enforce an HHI limit today. This adds one as an advisory rule ({HHI_RULE_ID})
          to entries that recorded an HHI; its severity can be changed in the list above. Entries without
          a reading are counted as unmeasured, not passed.
        </p>

        <Button
          size="sm"
          variant="outline"
          className="mt-5"
          disabled={!touched}
          onClick={() => setScenario(EMPTY_SCENARIO)}
        >
          RESET TO RECORDED POLICY
        </Button>
      </div>

      {/* ── Outcome ──────────────────────────────────────────── */}
      <div className="min-w-0 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { k: "RE-DECIDED", v: summary.evaluated },
            { k: "CHANGED", v: summary.changed, tone: summary.changed ? "text-hold" : "" },
            { k: "NOT RE-DECIDABLE", v: summary.skipped },
            { k: "HHI UNMEASURED", v: summary.hhiUnmeasured },
          ].map((t) => (
            <div key={t.k}>
              <p className="stencil text-[8px] tracking-[0.22em] text-muted-foreground">{t.k}</p>
              <p className={cn("data-font mt-1 text-[20px] font-[600] leading-none text-foreground", t.tone)}>
                {t.v.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        {summary.skipped > 0 && (
          <p className="mt-2 text-[9.5px] leading-relaxed text-muted-foreground">
            {summary.skipped.toLocaleString()} entries were recorded before the full check list was stored
            with each verdict, so they cannot be re-decided and are left out.
          </p>
        )}

        <Eyebrow className="mb-2 mt-5">VERDICTS · RECORDED → SIMULATED</Eyebrow>
        <table className="w-full max-w-[420px] text-left">
          <tbody>
            {VERDICTS.map((v) => (
              <tr key={v} className="border-b border-border/30">
                <td className={cn("stencil py-1.5 text-[9px] tracking-[0.18em]", TONE[v])}>{LABEL[v]}</td>
                <td className="mono-font py-1.5 text-right text-[10px] tabular-nums text-muted-foreground">
                  {summary.before[v].toLocaleString()}
                </td>
                <td className="mono-font px-2 py-1.5 text-center text-[10px] text-muted-foreground">→</td>
                <td
                  className={cn(
                    "mono-font py-1.5 text-[10px] tabular-nums",
                    summary.after[v] !== summary.before[v] ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {summary.after[v].toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {Object.keys(summary.transitions).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(summary.transitions).map(([k, n]) => {
              const [from, to] = k.split(">") as [Status, Status];
              return (
                <span key={k} className="mono-font border border-border px-1.5 py-0.5 text-[9px]">
                  <span className={TONE[from]}>{LABEL[from]}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className={TONE[to]}>{LABEL[to]}</span>
                  <span className="text-muted-foreground"> × {n.toLocaleString()}</span>
                </span>
              );
            })}
          </div>
        )}

        <div className="mb-2 mt-5 flex items-center justify-between gap-2">
          <Eyebrow>CHANGED VERDICTS</Eyebrow>
          <Button size="sm" variant="outline" disabled={!touched} onClick={() => void exportRun()}>
            EXPORT SIGNED CSV
          </Button>
        </div>
        {!touched ? (
          <p className="text-[10px] text-muted-foreground">
            Change a rule, a ceiling or the HHI limit to see which recorded verdicts would move.
          </p>
        ) : changed.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No recorded verdict changes under this policy.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  {["", "SUBJECT", "DOMAIN", "AMOUNT", "RECORDED", "SIMULATED", "BECAUSE OF", "RECORDED ON"].map((h, i) => (
                    <th key={i} className="stencil px-2 py-1.5 text-[8px] font-medium tracking-[0.2em] text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {changed.slice(0, SHOWN).map((r) =>
                  r.state !== "evaluated" ? null : (
                    <tr key={r.entry.id} className="border-b border-border/30">
                      <td className="px-2 py-1.5"><StatusDot status={r.after} size={6} /></td>
                      <td className="mono-font selectable px-2 py-1.5 text-[9.5px] text-foreground">
                        {r.entry.label ?? shortAddress(r.entry.subject)}
                      </td>
                      <td className="mono-font px-2 py-1.5 text-[9.5px] text-muted-foreground">{r.entry.domainCode}</td>
                      <td className="mono-font px-2 py-1.5 text-[9.5px] tabular-nums text-muted-foreground">
                        {r.entry.amountXrp.toLocaleString()}
                      </td>
                      <td className={cn("mono-font px-2 py-1.5 text-[9.5px]", TONE[r.before])}>{LABEL[r.before]}</td>
                      <td className={cn("mono-font px-2 py-1.5 text-[9.5px]", TONE[r.after])}>{LABEL[r.after]}</td>
                      <td className="mono-font px-2 py-1.5 text-[9px] text-muted-foreground">{r.drivers.join(", ")}</td>
                      <td className="mono-font px-2 py-1.5 text-[9px] text-muted-foreground/80">
                        {new Date(r.entry.at).toLocaleString()}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
            {changed.length > SHOWN && (
              <p className="stencil mt-2 text-[8px] tracking-[0.18em] text-muted-foreground">
                SHOWING {SHOWN} OF {changed.length.toLocaleString()} · EXPORT FOR ALL
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
