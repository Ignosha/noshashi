import { useEffect, useMemo, useState } from "react";
import { Eyebrow } from "@/components/nova/Panel";
import { StatusDot } from "@/components/nova/StatusDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth/useAuth";
import type { LedgerEntry } from "@/lib/desk/ledger";
import { usePolicyStore, keyOf } from "@/lib/desk/policyStore";
import { useOrg } from "@/lib/org/useOrg";
import { OrgBar, OrgPolicyManager } from "./OrgPolicyManager";
import {
  describeParams,
  diffParams,
  validateParams,
  type InstitutionalPolicy,
  type PolicyError,
  type PolicyParams,
  type RuleKey,
  type RuleOutcome,
} from "@/lib/desk/institutional";
import { simulatePolicy } from "@/lib/desk/simulate";
import { useToast } from "@/lib/toast";
import { sendNativeNotification } from "@/lib/notifications";
import { shortAddress } from "@/lib/xrpl/client";
import type { Status } from "@/lib/xrpl/types";
import { cn } from "@/lib/utils";

/* ── Form model: strings while typing, validated params on save ──── */

export type Form = {
  name: string;
  hhiOn: boolean; hhi: string; hhiOut: RuleOutcome;
  cpOn: boolean; cp: string; cpOut: RuleOutcome;
  trOn: boolean; trThreshold: string; trCurrency: string; trRate: string; trOut: RuleOutcome;
  rsOn: boolean; rs: string; rsOut: RuleOutcome;
  freeze: boolean; freezeOut: RuleOutcome;
};

export function formOf(p: Pick<InstitutionalPolicy, "name" | "params">): Form {
  const x = p.params;
  return {
    name: p.name,
    hhiOn: x.hhiLimit !== null, hhi: String(x.hhiLimit ?? 2500), hhiOut: x.outcomes.hhi,
    cpOn: x.counterpartyShareLimitPct !== null, cp: String(x.counterpartyShareLimitPct ?? 25), cpOut: x.outcomes.counterparty,
    trOn: x.travelRule !== null,
    trThreshold: String(x.travelRule?.thresholdFiat ?? 1000),
    trCurrency: x.travelRule?.currency ?? "USD",
    trRate: x.travelRule?.xrpReferenceRate == null ? "" : String(x.travelRule.xrpReferenceRate),
    trOut: x.outcomes.travelRule,
    rsOn: x.reserveHeadroomMinXrp !== null, rs: String(x.reserveHeadroomMinXrp ?? 10), rsOut: x.outcomes.reserve,
    freeze: x.strictFreeze, freezeOut: x.outcomes.freeze,
  };
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function paramsOf(f: Form): PolicyParams {
  return {
    hhiLimit: f.hhiOn ? num(f.hhi) : null,
    counterpartyShareLimitPct: f.cpOn ? num(f.cp) : null,
    travelRule: f.trOn
      ? { thresholdFiat: num(f.trThreshold), currency: f.trCurrency.trim().toUpperCase(), xrpReferenceRate: f.trRate.trim() === "" ? null : num(f.trRate) }
      : null,
    reserveHeadroomMinXrp: f.rsOn ? num(f.rs) : null,
    strictFreeze: f.freeze,
    outcomes: { hhi: f.hhiOut, counterparty: f.cpOut, travelRule: f.trOut, reserve: f.rsOut, freeze: f.freezeOut },
  };
}

const VERDICT_WORD: Record<Status, string> = { go: "PASS · GO", hold: "REVIEW · HOLD", "no-go": "FAIL · NO-GO", "insufficient-data": "INSUFFICIENT DATA" };
const VERDICT_TONE: Record<Status, string> = { go: "text-go", hold: "text-hold", "no-go": "text-no-go", "insufficient-data": "text-muted-foreground" };
const RULE_NAMES: Record<RuleKey, string> = { hhi: "HHI", counterparty: "Counterparty share", travelRule: "Travel Rule", reserve: "Reserve headroom", freeze: "Strict freeze" };
export const utc = (iso?: string | null) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "—");

/**
 * The Policy tab: the active policy (read-only), a draft to edit and
 * simulate against recorded facts, activation behind a confirmation,
 * every version kept, and an audit trail.
 */
export function PolicyManager({ entries }: { entries: LedgerEntry[] }) {
  const org = useOrg();
  const orgMode = org.state.status === "ready" && org.selectedId !== null;
  return (
    <>
      <OrgBar />
      {org.state.status === "loading" || org.authLoading ? (
        <p className="mono-font animate-pulse p-4 text-[10px] text-muted-foreground">LOADING POLICY…</p>
      ) : orgMode ? (
        <OrgPolicyManager entries={entries} />
      ) : (
        <WorkstationPolicyManager entries={entries} />
      )}
    </>
  );
}

/** The single-operator policy kept on this workstation (no organization). */
function WorkstationPolicyManager({ entries }: { entries: LedgerEntry[] }) {
  const store = usePolicyStore();
  const { user } = useAuth();
  const { push } = useToast();
  const actor = user?.email ?? "local operator";

  const draft = store.drafts[0] ?? null;
  const active = store.active;
  const [form, setForm] = useState<Form | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the draft into the form whenever a different draft version appears.
  useEffect(() => {
    setForm(draft ? formOf(draft) : null);
  }, [draft?.id, draft?.version, draft?.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  const formParams = form ? paramsOf(form) : null;
  const errors: PolicyError[] = formParams ? validateParams(formParams) : [];
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const dirty = Boolean(draft && form && (form.name !== draft.name || JSON.stringify(formParams) !== JSON.stringify(draft.params)));

  // SIMULATION: active policy vs the draft as currently edited, over recorded facts.
  const sim = useMemo(
    () => (formParams && errors.length === 0 ? simulatePolicy(entries, active?.params ?? null, formParams) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, active?.hash, JSON.stringify(formParams), errors.length]
  );
  const diff = draft && formParams ? (active ? diffParams(active.params, formParams) : null) : null;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      push({ title: `${label} FAILED`, body: error instanceof Error ? error.message : String(error), tone: "no-go" });
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () =>
    guard("SAVE", async () => {
      if (!draft || !form || !formParams) return;
      await store.saveDraft(keyOf(draft), { name: form.name, params: formParams }, actor);
      push({ title: "DRAFT SAVED", body: `${form.name} v${draft.version} · not active`, tone: "info" });
    });

  const activateDraft = () =>
    guard("ACTIVATION", async () => {
      if (!draft || !form || !formParams) return;
      if (dirty) await store.saveDraft(keyOf(draft), { name: form.name, params: formParams }, actor);
      const errs = await store.activate(keyOf(draft), actor);
      if (errs.length) {
        push({ title: "INVALID POLICY VALUE", body: errs.map((e) => e.message).join(" "), tone: "no-go" });
        return;
      }
      setConfirming(false);
      push({ title: "POLICY CHANGE", body: `${form.name} v${draft.version} is now active for new verdicts.`, tone: "go" });
      void sendNativeNotification({ title: "NOSHASHI · POLICY CHANGE", body: `${form.name} v${draft.version} is now active.` });
    });

  if (store.state.status === "loading") {
    return <p className="mono-font animate-pulse p-4 text-[10px] text-muted-foreground">LOADING POLICY…</p>;
  }
  if (store.state.status === "unavailable") {
    return (
      <div className="m-4 border border-no-go/50 p-4">
        <Eyebrow className="text-no-go">POLICY UNAVAILABLE</Eyebrow>
        <p className="mt-1.5 max-w-[620px] text-[11px] leading-relaxed text-muted-foreground">
          A verified policy configuration could not be loaded. No institutional verdict will be
          generated until the policy is available. NOSHASHI does not fall back to defaults.
        </p>
        <p className="mono-font mt-2 text-[10px] text-no-go">{store.state.reason}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4">
      <p className="max-w-[720px] text-[11px] leading-relaxed text-muted-foreground">
        These are <span className="text-foreground">active decision parameters</span>. The active version is
        applied to every new gate verdict in Verification, is named on its receipt, and is bound into
        the receipt's digest. Change them through a draft: simulate it against the facts your recorded
        verdicts were decided on, then activate it. Recorded verdicts never change. Thresholds are your
        institution's policy — not legal advice, a regulatory requirement or XRPL policy.
      </p>

      {/* ── Active ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="border border-border p-3">
          <div className="flex items-center justify-between">
            <Eyebrow>ACTIVE POLICY</Eyebrow>
            {active && (
              <span className="stencil flex items-center gap-1.5 text-[8px] tracking-[0.2em] text-go">
                <StatusDot status="go" size={6} pulse /> ACTIVE
              </span>
            )}
          </div>
          {active ? (
            <>
              <p className="display mt-1.5 text-[15px] font-[600] text-foreground">
                {active.name} <span className="mono-font text-[12px] text-muted-foreground">v{active.version}</span>
              </p>
              <p className="mono-font mt-1 text-[9px] leading-relaxed text-muted-foreground">
                EFFECTIVE {utc(active.effectiveAt)} · ACTIVATED BY {active.activatedBy}
                <br />
                <span className="selectable break-all">SHA-256 {active.hash}</span>
              </p>
              <ParamGroups params={active.params} />
            </>
          ) : (
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              No policy is active. Gate verdicts apply the domain's rules only and carry no
              institutional policy result. Review the draft and activate it to put thresholds into force.
            </p>
          )}
        </div>

        {/* ── Draft ────────────────────────────────────────────── */}
        <div className="border border-dashed border-border p-3">
          <div className="flex items-center justify-between">
            <Eyebrow>DRAFT</Eyebrow>
            {draft && (
              <span className="stencil text-[8px] tracking-[0.2em] text-hold">
                ● DRAFT v{draft.version} · DOES NOT AFFECT VERDICTS
              </span>
            )}
          </div>
          {!draft || !form ? (
            <div className="mt-2">
              <p className="text-[10px] text-muted-foreground">No open draft.</p>
              <Button
                size="sm"
                className="mt-2"
                disabled={busy || !active}
                onClick={() =>
                  guard("DRAFT", () =>
                    store.createDraft({ id: active!.id, name: active!.name, params: active!.params, actor, now: new Date().toISOString() })
                  )
                }
              >
                NEW DRAFT FROM v{active?.version ?? "—"}
              </Button>
            </div>
          ) : (
            <>
              {draft.origin && <p className="mt-1.5 border-l-2 border-hold/60 pl-2 text-[9.5px] leading-relaxed text-hold">{draft.origin}</p>}
              <Field label="POLICY NAME">
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} className="h-7 text-[11px]" maxLength={60} />
              </Field>

              <GroupTitle>CONCENTRATION</GroupTitle>
              <RuleRow label="HHI LIMIT" hint="0–10,000. Triggered when observed HHI is above it." on={form.hhiOn} setOn={(v) => set("hhiOn", v)} outcome={form.hhiOut} setOutcome={(v) => set("hhiOut", v)} error={errorFor("hhiLimit")}>
                <Input inputMode="numeric" value={form.hhi} onChange={(e) => set("hhi", e.target.value)} className="mono-font h-7 w-28 text-[11px]" aria-label="HHI limit" />
              </RuleRow>
              <RuleRow label="COUNTERPARTY SHARE %" hint="Triggered when one counterparty carries more than this share of volume." on={form.cpOn} setOn={(v) => set("cpOn", v)} outcome={form.cpOut} setOutcome={(v) => set("cpOut", v)} error={errorFor("counterpartyShareLimitPct")}>
                <Input inputMode="decimal" value={form.cp} onChange={(e) => set("cp", e.target.value)} className="mono-font h-7 w-28 text-[11px]" aria-label="Counterparty share limit" />
              </RuleRow>

              <GroupTitle>COMPLIANCE</GroupTitle>
              <RuleRow label="TRAVEL RULE THRESHOLD" hint="Transfers valued at or above it trigger a Travel Rule review under your policy. Valued at your reference rate; there is no price feed." on={form.trOn} setOn={(v) => set("trOn", v)} outcome={form.trOut} setOutcome={(v) => set("trOut", v)} error={errorFor("travelRule.thresholdFiat") ?? errorFor("travelRule.currency") ?? errorFor("travelRule.xrpReferenceRate")}>
                <div className="flex gap-1.5">
                  <Input inputMode="decimal" value={form.trThreshold} onChange={(e) => set("trThreshold", e.target.value)} className="mono-font h-7 w-24 text-[11px]" aria-label="Travel Rule threshold" />
                  <Input value={form.trCurrency} onChange={(e) => set("trCurrency", e.target.value)} className="mono-font h-7 w-14 text-[11px]" maxLength={3} aria-label="Currency" />
                  <Input inputMode="decimal" placeholder="rate / XRP" value={form.trRate} onChange={(e) => set("trRate", e.target.value)} className="mono-font h-7 w-24 text-[11px]" aria-label="XRP reference rate" />
                </div>
              </RuleRow>

              <GroupTitle>LIQUIDITY</GroupTitle>
              <RuleRow label="RESERVE HEADROOM (XRP)" hint="Spendable XRP that must remain above the live reserve after the settlement." on={form.rsOn} setOn={(v) => set("rsOn", v)} outcome={form.rsOut} setOutcome={(v) => set("rsOut", v)} error={errorFor("reserveHeadroomMinXrp")}>
                <Input inputMode="decimal" value={form.rs} onChange={(e) => set("rs", e.target.value)} className="mono-font h-7 w-28 text-[11px]" aria-label="Reserve headroom" />
              </RuleRow>

              <GroupTitle>ISSUER RISK</GroupTitle>
              <RuleRow label="STRICT FREEZE" hint="When on, an issuer that can freeze a held balance triggers the outcome. When off, the fact is still shown but has no verdict impact." on={form.freeze} setOn={(v) => set("freeze", v)} outcome={form.freezeOut} setOutcome={(v) => set("freezeOut", v)} />

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={busy || !dirty} onClick={() => void saveDraft()}>
                  {dirty ? "SAVE DRAFT" : "SAVED"}
                </Button>
                <Button size="sm" disabled={busy || errors.length > 0} onClick={() => setConfirming(true)}>
                  ACTIVATE…
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => guard("DISCARD", () => store.discardDraft(keyOf(draft), actor))}
                >
                  DISCARD DRAFT
                </Button>
                {errors.length > 0 && (
                  <span className="stencil text-[8px] tracking-[0.18em] text-no-go">INVALID POLICY VALUE · FIX TO ACTIVATE</span>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Diff + simulation ───────────────────────────────────── */}
      {draft && formParams && (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div>
            <Eyebrow className="mb-2">POLICY DIFF · {active ? `v${active.version} → v${draft.version}` : `none → v${draft.version}`}</Eyebrow>
            <DiffTable from={active?.params ?? null} to={formParams} fromLabel={active ? `v${active.version}` : "none"} toLabel={`v${draft.version}${dirty ? " (unsaved)" : ""}`} />
          </div>
          <div>
            <Eyebrow className="mb-2">SIMULATION · DRAFT v{draft.version}{dirty ? " (UNSAVED)" : ""} vs {active ? `ACTIVE v${active.version}` : "NO POLICY"}</Eyebrow>
            {!sim ? (
              <p className="text-[10px] text-no-go">Fix the invalid values to simulate.</p>
            ) : sim.summary.evaluated === 0 ? (
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                No recorded verdicts carry the facts these rules need yet
                {sim.summary.skipped ? ` (${sim.summary.skipped} were recorded before facts were stored)` : ""}. Run a gate check in
                Verification; every verdict from now on records them.
              </p>
            ) : (
              <SimulationResult sim={sim} showChanges={showChanges} setShowChanges={setShowChanges} />
            )}
          </div>
        </section>
      )}

      {/* ── Versions ────────────────────────────────────────────── */}
      <section>
        <Eyebrow className="mb-2">VERSION HISTORY · {store.versions.length}</Eyebrow>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              {["VERSION", "STATUS", "EFFECTIVE", "ARCHIVED", "ACTIVATED BY", "SHA-256", ""].map((h) => (
                <th key={h} className="stencil px-2 py-1.5 text-[8px] font-medium tracking-[0.2em] text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...store.versions].sort((a, b) => b.version - a.version || a.id.localeCompare(b.id)).map((v) => (
              <VersionRow key={keyOf(v)} v={v} active={active} open={viewing === keyOf(v)} toggle={() => setViewing(viewing === keyOf(v) ? null : keyOf(v))} />
            ))}
          </tbody>
        </table>
      </section>

      {/* ── Audit ───────────────────────────────────────────────── */}
      <section>
        <Eyebrow className="mb-2">POLICY AUDIT TRAIL · {store.audit.length}</Eyebrow>
        {store.audit.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No policy changes recorded.</p>
        ) : (
          <div className="space-y-1.5">
            {store.audit.slice(0, 50).map((e, i) => (
              <div key={`${e.at}-${i}`} className="border-b border-border/30 pb-1.5">
                <p className="mono-font text-[9.5px] text-foreground">
                  {utc(e.at)} · {e.actor} · {e.action.replace("-", " ").toUpperCase()} {e.name} v{e.version}
                  {e.fromVersion ? ` (from v${e.fromVersion})` : ""} · <span className="text-go">{e.status.toUpperCase()}</span>
                </p>
                {e.changes.length > 0 && (
                  <p className="mono-font text-[9px] text-muted-foreground">
                    {e.changes.map((c) => `${c.label} ${c.from} → ${c.to}`).join(" · ")}
                  </p>
                )}
                <p className="mono-font text-[8.5px] text-muted-foreground/70">SHA-256 {e.hash.slice(0, 16)}…</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Activation confirmation ─────────────────────────────── */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ACTIVATE {form?.name.toUpperCase()} v{draft?.version}?</DialogTitle>
            <DialogDescription>
              This policy will become the active configuration for new verdicts
              {active ? `, replacing v${active.version}, which will be archived` : ""}. Existing historical
              verdicts will NOT change.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[260px] overflow-y-auto">
            <Eyebrow className="mb-1.5">CHANGES</Eyebrow>
            {diff === null ? (
              <p className="text-[10px] text-muted-foreground">First activation — every parameter below comes into force.</p>
            ) : diff.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No parameter changes from the active version.</p>
            ) : null}
            {(diff ?? (formParams ? describeParams(formParams).map((r) => ({ label: r.label, from: "—", to: r.value, field: r.field })) : [])).map((c) => (
              <p key={c.field} className="mono-font text-[10px] text-foreground">
                {c.label}: <span className="text-muted-foreground">{c.from}</span> → {c.to}
              </p>
            ))}
            {sim && sim.summary.evaluated > 0 && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                Simulated on {sim.summary.evaluated} recorded verdicts: {sim.summary.changed} would have been decided differently.
              </p>
            )}
            {dirty && <p className="mt-2 text-[10px] text-hold">Unsaved edits will be saved to the draft first.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>CANCEL</Button>
            <Button size="sm" disabled={busy} onClick={() => void activateDraft()}>ACTIVATE POLICY</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function GroupTitle({ children }: { children: React.ReactNode }) {
  return <p className="stencil mb-1 mt-3 border-b border-border pb-1 text-[8px] tracking-[0.24em] text-muted-foreground">{children}</p>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <p className="stencil mb-1 text-[8px] tracking-[0.2em] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function RuleRow({
  label, hint, on, setOn, outcome, setOutcome, error, children,
}: {
  label: string; hint: string; on: boolean; setOn: (v: boolean) => void;
  outcome: RuleOutcome; setOutcome: (v: RuleOutcome) => void; error?: string; children?: React.ReactNode;
}) {
  return (
    <div className="py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Switch checked={on} onCheckedChange={(v) => setOn(Boolean(v))} aria-label={`${label} enabled`} />
        <span className="stencil w-40 text-[8.5px] tracking-[0.16em] text-foreground">{label}</span>
        {on && children}
        {on && (
          <select
            aria-label={`${label} outcome`}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as RuleOutcome)}
            className="mono-font h-7 rounded border border-border bg-background px-1 text-[9.5px] text-foreground"
          >
            <option value="review">→ REVIEW (HOLD)</option>
            <option value="fail">→ FAIL (NO-GO)</option>
          </select>
        )}
      </div>
      <p className="mt-0.5 pl-11 text-[9px] leading-snug text-muted-foreground">{hint}</p>
      {error && <p className="mt-0.5 pl-11 text-[9.5px] text-no-go">INVALID POLICY VALUE · {error}</p>}
    </div>
  );
}

export function ParamGroups({ params }: { params: PolicyParams }) {
  const rows = describeParams(params);
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4">
      {rows.map((r) => (
        <div key={r.field} className="flex justify-between gap-2 border-b border-border/30 py-1">
          <span className="stencil text-[7.5px] tracking-[0.18em] text-muted-foreground">{r.label.toUpperCase()}</span>
          <span className="mono-font text-[9.5px] text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DiffTable({ from, to, fromLabel, toLabel }: { from: PolicyParams | null; to: PolicyParams; fromLabel: string; toLabel: string }) {
  const b = describeParams(to);
  const a = from ? describeParams(from) : null;
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-border">
          {["", fromLabel.toUpperCase(), toLabel.toUpperCase()].map((h, i) => (
            <th key={i} className="stencil px-2 py-1 text-[8px] font-medium tracking-[0.2em] text-muted-foreground">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {b.map((row, i) => {
          const was = a ? a[i].value : "—";
          const changed = was !== row.value;
          return (
            <tr key={row.field} className={cn("border-b border-border/30", changed && "bg-hold/10")}>
              <td className="px-2 py-1 text-[9.5px] text-muted-foreground">{row.label}</td>
              <td className="mono-font px-2 py-1 text-[9.5px] text-muted-foreground">{was}</td>
              <td className={cn("mono-font px-2 py-1 text-[9.5px]", changed ? "text-hold" : "text-foreground")}>{row.value}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SimulationResult({
  sim, showChanges, setShowChanges,
}: {
  sim: ReturnType<typeof simulatePolicy>; showChanges: boolean; setShowChanges: (v: boolean) => void;
}) {
  const s = sim.summary;
  const changed = sim.rows.filter((r) => r.baseline !== r.candidate);
  const statuses: Status[] = ["go", "hold", "no-go", "insufficient-data"];
  return (
    <div>
      <p className="stencil mb-1.5 text-[8px] tracking-[0.2em] text-hold">
        SIMULATION · RECORDED FACTS · DOES NOT CHANGE THE ACTIVE POLICY OR ANY RECORDED VERDICT
      </p>
      <table className="w-full max-w-[420px] text-left">
        <thead>
          <tr className="border-b border-border">
            {["", "CURRENT", "SIMULATED", "IMPACT"].map((h) => (
              <th key={h} className="stencil px-2 py-1 text-[8px] font-medium tracking-[0.2em] text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {statuses.map((v) => {
            const d = s.candidate[v] - s.baseline[v];
            return (
              <tr key={v} className="border-b border-border/30">
                <td className={cn("stencil px-2 py-1 text-[8.5px] tracking-[0.16em]", VERDICT_TONE[v])}>{VERDICT_WORD[v]}</td>
                <td className="mono-font px-2 py-1 text-[10px] tabular-nums text-muted-foreground">{s.baseline[v]}</td>
                <td className="mono-font px-2 py-1 text-[10px] tabular-nums text-foreground">{s.candidate[v]}</td>
                <td className={cn("mono-font px-2 py-1 text-[10px] tabular-nums", d ? "text-hold" : "text-muted-foreground")}>{d > 0 ? `+${d}` : d}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-[9.5px] text-muted-foreground">
        {s.evaluated} recorded verdicts re-decided from their stored facts{s.skipped ? `; ${s.skipped} recorded without facts left out` : ""}.
        {" "}{s.changed} would change.
      </p>
      <div className="mt-2">
        <p className="stencil mb-1 text-[8px] tracking-[0.2em] text-muted-foreground">EXCEPTIONS BY RULE · CURRENT → SIMULATED</p>
        {(Object.keys(s.exceptions) as RuleKey[]).map((k) => (
          <p key={k} className="mono-font text-[9.5px] text-muted-foreground">
            {RULE_NAMES[k]}: {s.exceptions[k].baseline} → <span className={s.exceptions[k].candidate !== s.exceptions[k].baseline ? "text-hold" : ""}>{s.exceptions[k].candidate}</span>
          </p>
        ))}
      </div>
      {changed.length > 0 && (
        <>
          <button onClick={() => setShowChanges(!showChanges)} className="stencil mt-2 text-[8px] tracking-[0.2em] text-foreground underline underline-offset-2">
            {showChanges ? "HIDE CHANGES" : `VIEW CHANGES (${changed.length})`}
          </button>
          {showChanges && (
            <div className="mt-1.5 space-y-0.5">
              {changed.slice(0, 50).map((r) => (
                <p key={r.entry.id} className="mono-font text-[9px] text-muted-foreground">
                  {shortAddress(r.entry.subject)} · {r.entry.amountXrp.toLocaleString()} XRP · {new Date(r.entry.at).toLocaleDateString()} ·{" "}
                  <span className={VERDICT_TONE[r.baseline]}>{VERDICT_WORD[r.baseline]}</span> → <span className={VERDICT_TONE[r.candidate]}>{VERDICT_WORD[r.candidate]}</span>
                  {r.drivers.length ? ` · ${r.drivers.join(", ")}` : ""}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VersionRow({ v, active, open, toggle }: { v: InstitutionalPolicy; active: InstitutionalPolicy | null; open: boolean; toggle: () => void }) {
  const tone = v.status === "active" ? "text-go" : v.status === "draft" ? "text-hold" : "text-muted-foreground";
  return (
    <>
      <tr className="border-b border-border/30">
        <td className="mono-font px-2 py-1.5 text-[10px] text-foreground">{v.name} v{v.version}</td>
        <td className={cn("stencil px-2 py-1.5 text-[8.5px] tracking-[0.16em]", tone)}>● {v.status.toUpperCase()}</td>
        <td className="mono-font px-2 py-1.5 text-[9px] text-muted-foreground">{utc(v.effectiveAt)}</td>
        <td className="mono-font px-2 py-1.5 text-[9px] text-muted-foreground">{utc(v.archivedAt)}</td>
        <td className="mono-font px-2 py-1.5 text-[9px] text-muted-foreground">{v.activatedBy ?? "—"}</td>
        <td className="mono-font selectable px-2 py-1.5 text-[9px] text-muted-foreground">{v.hash.slice(0, 12)}…</td>
        <td className="px-2 py-1.5">
          <button onClick={toggle} className="stencil text-[8px] tracking-[0.2em] text-foreground underline underline-offset-2">
            {open ? "HIDE" : "VIEW"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="px-2 pb-3">
            <p className="mono-font selectable break-all text-[9px] text-muted-foreground">SHA-256 {v.hash}</p>
            {active && active !== v ? (
              <DiffTable from={v.params} to={active.params} fromLabel={`v${v.version}`} toLabel={`active v${active.version}`} />
            ) : (
              <ParamGroups params={v.params} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}
