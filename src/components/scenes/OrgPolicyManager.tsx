import { useEffect, useMemo, useState } from "react";
import { Eyebrow } from "@/components/nova/Panel";
import { StatusDot } from "@/components/nova/StatusDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LedgerEntry } from "@/lib/desk/ledger";
import { DEFAULT_PROFILE, paramsFromRules } from "@/lib/desk/policyStore";
import { DEFAULT_RULES } from "@/lib/desk/rules";
import { describeParams, diffParams, validateParams, type PolicyError, type PolicyParams } from "@/lib/desk/institutional";
import { simulatePolicy } from "@/lib/desk/simulate";
import { useToast } from "@/lib/toast";
import { sendNativeNotification } from "@/lib/notifications";
import { shortAddress } from "@/lib/xrpl/client";
import { cn } from "@/lib/utils";
import {
  activatePolicy,
  addMember,
  can,
  createDraft,
  createOrganization,
  decideException,
  discardDraft,
  requestException,
  saveDraft,
  submitPolicy,
  withdrawPolicy,
  type MemberRole,
  type PolicyException,
  type ServerFailure,
} from "@/lib/org/governance";
import { nameOf, useOrg, type OrgData } from "@/lib/org/useOrg";
import {
  DiffTable,
  Field,
  GroupTitle,
  ParamGroups,
  RuleRow,
  SimulationResult,
  formOf,
  paramsOf,
  utc,
  type Form,
} from "./PolicyManager";

/**
 * The organization side of the Policy tab.
 *
 * DRAFT → SIMULATE → SUBMIT → PENDING ACTIVATION → a second authorized
 * person ACTIVATES → the server validates → ACTIVE.
 *
 * Every state shown here is the server's. After any action the tab
 * re-reads the organization; nothing is marked ACTIVE, APPROVED or
 * SUBMITTED until that read says so. Buttons are offered by role only as
 * a courtesy: the database and the Edge Functions decide, and their
 * refusal is shown in their own words.
 */

const ROLES: MemberRole[] = ["owner", "admin", "compliance", "risk", "analyst", "viewer"];

/** Server refusal or failure, shown exactly as the server worded it. */
function Refusal({ failure }: { failure: ServerFailure }) {
  return (
    <div role="alert" className="border border-no-go/60 p-2.5">
      <p className="stencil text-[8.5px] tracking-[0.2em] text-no-go">{failure.title}</p>
      <p className="mt-1 text-[10.5px] leading-snug text-foreground">{failure.message}</p>
      {failure.errors?.map((e) => (
        <p key={e.field} className="mono-font mt-0.5 text-[9.5px] text-no-go">{e.field} · {e.message}</p>
      ))}
    </div>
  );
}

/* ── Organization selector, shown above the Policy tab in every mode ── */

export function OrgBar() {
  const org = useOrg();
  const { push } = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [failure, setFailure] = useState<ServerFailure | null>(null);
  const [busy, setBusy] = useState(false);

  if (org.state.status === "signed-out") {
    return (
      <p className="mx-4 mt-4 border-l-2 border-border pl-2 text-[10px] leading-relaxed text-muted-foreground">
        WORKSTATION POLICY · Sign in to govern verdicts with an organization policy, where a second
        authorized person must activate every change.
      </p>
    );
  }
  if (org.state.status === "loading") {
    return <p className="mono-font mx-4 mt-4 animate-pulse text-[9px] text-muted-foreground">LOADING ORGANIZATIONS…</p>;
  }
  if (org.state.status === "error") {
    return (
      <div className="mx-4 mt-4">
        <Refusal failure={{ ok: false, code: "LOAD_FAILED", title: "ORGANIZATIONS UNAVAILABLE", message: org.state.reason }} />
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void org.refresh()}>RETRY</Button>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const r = await createOrganization(name.trim(), slug.trim());
      if (!r.ok) return setFailure(r);
      const id = String(r.data?.organization_id ?? "");
      push({ title: "ORGANIZATION CREATED", body: `${name.trim()} · you are its owner`, tone: "go" });
      setCreating(false);
      setName("");
      setSlug("");
      await org.select(id || null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-4 mt-4 border border-border p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="stencil text-[8px] tracking-[0.2em] text-muted-foreground">GOVERNED BY</span>
        <select
          aria-label="Governing policy"
          value={org.selectedId ?? "workstation"}
          onChange={(e) => void org.select(e.target.value === "workstation" ? null : e.target.value)}
          className="mono-font h-7 rounded border border-border bg-background px-1.5 text-[10px] text-foreground"
        >
          {org.memberships.map((m) => (
            <option key={m.organizationId} value={m.organizationId}>
              {m.name} · {m.role.toUpperCase()}
            </option>
          ))}
          <option value="workstation">This workstation only (no four-eyes)</option>
        </select>
        {!creating && (
          <button onClick={() => setCreating(true)} className="stencil text-[8px] tracking-[0.2em] text-foreground underline underline-offset-2">
            CREATE ORGANIZATION
          </button>
        )}
      </div>
      {org.selectedId === null && (
        <p className="mt-1.5 text-[9.5px] leading-snug text-muted-foreground">
          Workstation policy: one operator, kept on this device, no second approval. Its verdicts are not
          organization decisions.
        </p>
      )}
      {creating && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="ORGANIZATION NAME">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 w-56 text-[11px]" maxLength={80} />
          </Field>
          <Field label="SHORT IDENTIFIER">
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="e.g. acme-treasury"
              className="mono-font h-7 w-44 text-[11px]"
              maxLength={63}
            />
          </Field>
          <Button size="sm" disabled={busy || !name.trim() || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)} onClick={() => void submit()}>
            CREATE
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>CANCEL</Button>
        </div>
      )}
      {failure && <div className="mt-2"><Refusal failure={failure} /></div>}
    </div>
  );
}

/* ── The organization Policy tab ──────────────────────────────────── */

export function OrgPolicyManager({ entries }: { entries: LedgerEntry[] }) {
  const org = useOrg();
  const { push } = useToast();
  const data = org.data;

  if (!data) {
    return (
      <div className="m-4 border border-no-go/50 p-4">
        <Eyebrow className="text-no-go">POLICY UNAVAILABLE</Eyebrow>
        <p className="mt-1.5 max-w-[620px] text-[11px] leading-relaxed text-muted-foreground">
          The organization's policy could not be loaded. No institutional verdict will be generated
          until it is available. NOSHASHI does not fall back to the workstation policy.
        </p>
        {org.dataError && <p className="mono-font mt-2 text-[10px] text-no-go">{org.dataError}</p>}
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void org.refresh()}>RETRY</Button>
      </div>
    );
  }
  return <OrgPolicyBody data={data} entries={entries} accountId={org.accountId!} refresh={org.refresh} push={push} />;
}

function OrgPolicyBody({
  data, entries, accountId, refresh, push,
}: {
  data: OrgData; entries: LedgerEntry[]; accountId: string;
  refresh: () => Promise<void>; push: ReturnType<typeof useToast>["push"];
}) {
  const role = data.membership.role;
  const dir = data.directory;
  const active = data.policies.find((p) => p.status === "active") ?? null;
  const pending = data.policies.find((p) => p.status === "pending") ?? null;
  const draft = data.policies.find((p) => p.status === "draft") ?? null;

  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ServerFailure | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [activationFailure, setActivationFailure] = useState<ServerFailure | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    setForm(draft ? formOf(draft) : null);
  }, [draft?.version, draft?.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = Boolean(draft && can.editDraft(role));
  const formParams = form ? paramsOf(form) : null;
  const errors: PolicyError[] = formParams ? validateParams(formParams) : [];
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const dirty = Boolean(draft && form && (form.name !== draft.name || JSON.stringify(formParams) !== JSON.stringify(draft.params)));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const candidate = formParams ?? pending?.params ?? null;
  const sim = useMemo(
    () => (candidate && validateParams(candidate).length === 0 ? simulatePolicy(entries, active?.params ?? null, candidate) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, active?.hash, JSON.stringify(candidate)]
  );

  /** Run a server action; on success re-read the organization before saying anything. */
  const act = async (fn: () => Promise<{ ok: true } | ServerFailure>, success?: { title: string; body: string }) => {
    setBusy(true);
    setFailure(null);
    try {
      const r = await fn();
      if (!r.ok) {
        setFailure(r);
        return false;
      }
      await refresh();
      if (success) push({ ...success, tone: "info" });
      return true;
    } catch (error) {
      setFailure({ ok: false, code: "FAILED", title: "NOT SAVED", message: `${error instanceof Error ? error.message : String(error)} Nothing was changed.` });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const nextVersion = (id: string) => Math.max(0, ...data.policies.filter((p) => p.id === id).map((p) => p.version)) + 1;

  const newDraft = () => {
    const base: { id: string; name: string; params: PolicyParams } = active
      ? { id: active.id, name: active.name, params: active.params }
      : { id: DEFAULT_PROFILE.id, name: DEFAULT_PROFILE.name, params: paramsFromRules(DEFAULT_RULES, false) };
    return act(
      () => createDraft({ organizationId: data.membership.organizationId, policyId: base.id, name: base.name, params: base.params, version: nextVersion(base.id), author: accountId }),
      { title: "DRAFT CREATED", body: `${base.name} v${nextVersion(base.id)} · does not affect verdicts` }
    );
  };

  const submit = async () => {
    if (!draft || !form || !formParams) return;
    if (dirty && !(await act(() => saveDraft(draft, { name: form.name, params: formParams })))) return;
    await act(() => submitPolicy(draft), { title: "SUBMITTED FOR ACTIVATION", body: `${form.name} v${draft.version} · awaiting a second authorized person` });
  };

  const activate = async () => {
    if (!pending) return;
    setBusy(true);
    setActivationFailure(null);
    try {
      const r = await activatePolicy(pending);
      if (!r.ok) {
        setActivationFailure(r);
        await refresh();
        return;
      }
      // The server said ACTIVE; show it once the re-read agrees.
      await refresh();
      setConfirming(false);
      push({ title: "POLICY ACTIVE", body: `${pending.name} v${pending.version} is now active for new verdicts. Author ${nameOf(dir, r.author)} · activated by ${nameOf(dir, r.activated_by)}.`, tone: "go" });
      void sendNativeNotification({ title: "NOSHASHI · POLICY CHANGE", body: `${pending.name} v${pending.version} is now active.` });
    } catch {
      setActivationFailure({ ok: false, code: "ACTIVATION_FAILED", title: "ACTIVATION FAILED", message: "The policy was not activated. No changes were committed." });
    } finally {
      setBusy(false);
    }
  };

  const iAmAuthor = pending?.createdBy === accountId;

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          <span className="text-foreground">{data.membership.name}</span> · your role{" "}
          <span className="stencil text-[9px] tracking-[0.18em] text-foreground">{role.toUpperCase()}</span> · four-eyes activation ·
          read {utc(data.loadedAt)}
        </p>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void refresh()}>REFRESH</Button>
      </div>

      {failure && <Refusal failure={failure} />}
      {!data.active.ok && <Refusal failure={{ ok: false, code: "UNAVAILABLE", title: "POLICY UNAVAILABLE", message: `${data.active.reason} No institutional verdict will be generated until this is resolved.` }} />}

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* ── Active ── */}
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
                AUTHOR {nameOf(dir, active.createdBy)} · CREATED {utc(active.createdAt)}
                <br />
                ACTIVATED BY {nameOf(dir, active.activatedBy)} · EFFECTIVE {utc(active.effectiveAt)}
                <br />
                <span className="selectable break-all">SHA-256 {active.hash}</span>
              </p>
              <ParamGroups params={active.params} />
            </>
          ) : (
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              No organization policy is active. Gate verdicts apply the domain's rules only and carry no
              institutional policy result.
            </p>
          )}
        </div>

        {/* ── Pending / draft ── */}
        <div className="border border-dashed border-border p-3">
          {pending ? (
            <>
              <div className="flex items-center justify-between">
                <Eyebrow>PENDING ACTIVATION</Eyebrow>
                <span className="stencil text-[8px] tracking-[0.2em] text-hold">● v{pending.version} · DOES NOT AFFECT VERDICTS</span>
              </div>
              <p className="display mt-1.5 text-[14px] font-[600] text-foreground">{pending.name} <span className="mono-font text-[12px] text-muted-foreground">v{pending.version}</span></p>
              <p className="mono-font mt-1 text-[9px] leading-relaxed text-muted-foreground">
                AUTHOR {nameOf(dir, pending.createdBy)} · CREATED {utc(pending.createdAt)}
                <br />
                SUBMITTED BY {nameOf(dir, pending.submittedBy)} · {utc(pending.submittedAt)}
                <br />
                <span className="selectable break-all">SHA-256 {pending.hash}</span>
              </p>
              <ParamGroups params={pending.params} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {can.activate(role) ? (
                  <Button size="sm" disabled={busy} onClick={() => { setActivationFailure(null); setConfirming(true); }}>ACTIVATE…</Button>
                ) : null}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => withdrawPolicy(pending), { title: "WITHDRAWN", body: `v${pending.version} is a draft again` })}>
                  WITHDRAW TO DRAFT
                </Button>
              </div>
              {!can.activate(role) && (
                <p className="mt-2 text-[9.5px] leading-snug text-muted-foreground">
                  Activation needs an owner, admin or compliance member who did not author this version.
                </p>
              )}
              {can.activate(role) && iAmAuthor && (
                <p className="mt-2 text-[9.5px] leading-snug text-hold">
                  You authored this version. A second authorized person must activate it; the server refuses an author's activation.
                </p>
              )}
            </>
          ) : draft && form ? (
            <>
              <div className="flex items-center justify-between">
                <Eyebrow>DRAFT</Eyebrow>
                <span className="stencil text-[8px] tracking-[0.2em] text-hold">● DRAFT v{draft.version} · DOES NOT AFFECT VERDICTS</span>
              </div>
              <p className="mono-font mt-1 text-[9px] text-muted-foreground">AUTHOR {nameOf(dir, draft.createdBy)} · CREATED {utc(draft.createdAt)}</p>
              {!editable ? (
                <ParamGroups params={draft.params} />
              ) : (
                <fieldset disabled={busy}>
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
                  <RuleRow label="TRAVEL RULE THRESHOLD" hint="Valued at your reference rate; there is no price feed." on={form.trOn} setOn={(v) => set("trOn", v)} outcome={form.trOut} setOutcome={(v) => set("trOut", v)} error={errorFor("travelRule.thresholdFiat") ?? errorFor("travelRule.currency") ?? errorFor("travelRule.xrpReferenceRate")}>
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
                  <RuleRow label="STRICT FREEZE" hint="When on, an issuer that can freeze a held balance triggers the outcome." on={form.freeze} setOn={(v) => set("freeze", v)} outcome={form.freezeOut} setOutcome={(v) => set("freezeOut", v)} />
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" disabled={busy || !dirty || errors.length > 0} onClick={() => void act(() => saveDraft(draft, { name: form.name, params: formParams! }), { title: "DRAFT SAVED", body: `v${draft.version} · not active` })}>
                      {dirty ? "SAVE DRAFT" : "SAVED"}
                    </Button>
                    <Button size="sm" disabled={busy || errors.length > 0} onClick={() => void submit()}>SUBMIT FOR ACTIVATION</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => discardDraft(draft), { title: "DRAFT DISCARDED", body: `v${draft.version}` })}>
                      DISCARD DRAFT
                    </Button>
                    {errors.length > 0 && <span className="stencil text-[8px] tracking-[0.18em] text-no-go">INVALID POLICY VALUE · FIX TO SUBMIT</span>}
                  </div>
                </fieldset>
              )}
            </>
          ) : (
            <div>
              <Eyebrow>DRAFT</Eyebrow>
              <p className="mt-1.5 text-[10px] text-muted-foreground">No open draft or pending version.</p>
              {can.editDraft(role) ? (
                <>
                  <Button size="sm" className="mt-2" disabled={busy} onClick={() => void newDraft()}>
                    {active ? `NEW DRAFT FROM v${active.version}` : "NEW DRAFT"}
                  </Button>
                  {!active && (
                    <p className="mt-1.5 text-[9.5px] leading-snug text-hold">
                      Pre-filled with the product's shipped defaults. These are placeholders, not recommendations,
                      legal requirements or XRPL policy.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1.5 text-[9.5px] text-muted-foreground">Your role can view policies but not author them.</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Diff + simulation ── */}
      {candidate && (draft || pending) && (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div>
            <Eyebrow className="mb-2">POLICY DIFF · {active ? `v${active.version}` : "none"} → v{(draft ?? pending)!.version}</Eyebrow>
            <DiffTable from={active?.params ?? null} to={candidate} fromLabel={active ? `v${active.version}` : "none"} toLabel={`v${(draft ?? pending)!.version}${dirty ? " (unsaved)" : ""}`} />
          </div>
          <div>
            <Eyebrow className="mb-2">SIMULATION · v{(draft ?? pending)!.version} vs {active ? `ACTIVE v${active.version}` : "NO POLICY"}</Eyebrow>
            {!sim ? (
              <p className="text-[10px] text-no-go">Fix the invalid values to simulate.</p>
            ) : sim.summary.evaluated === 0 ? (
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                No verdicts recorded on this workstation carry the facts these rules need yet. Run a gate check in Verification.
              </p>
            ) : (
              <SimulationResult sim={sim} showChanges={showChanges} setShowChanges={setShowChanges} />
            )}
          </div>
        </section>
      )}

      {/* ── Versions ── */}
      <section>
        <Eyebrow className="mb-2">VERSION HISTORY · {data.policies.length}</Eyebrow>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                {["VERSION", "STATUS", "AUTHOR", "ACTIVATED BY", "EFFECTIVE", "ARCHIVED", "SHA-256", ""].map((h) => (
                  <th key={h} className="stencil px-2 py-1.5 text-[8px] font-medium tracking-[0.2em] text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.policies.map((v) => {
                const k = `${v.id}@${v.version}`;
                const tone = v.status === "active" ? "text-go" : v.status === "archived" ? "text-muted-foreground" : "text-hold";
                return (
                  <FragmentRow key={k} open={viewing === k}>
                    <tr className="border-b border-border/30">
                      <td className="mono-font px-2 py-1.5 text-[10px] text-foreground">{v.name} v{v.version}</td>
                      <td className={cn("stencil px-2 py-1.5 text-[8.5px] tracking-[0.16em]", tone)}>● {v.status.toUpperCase()}</td>
                      <td className="mono-font px-2 py-1.5 text-[9px] text-muted-foreground">{nameOf(dir, v.createdBy)}</td>
                      <td className="mono-font px-2 py-1.5 text-[9px] text-muted-foreground">{v.activatedBy ? nameOf(dir, v.activatedBy) : "—"}</td>
                      <td className="mono-font px-2 py-1.5 text-[9px] text-muted-foreground">{utc(v.effectiveAt)}</td>
                      <td className="mono-font px-2 py-1.5 text-[9px] text-muted-foreground">{utc(v.archivedAt)}</td>
                      <td className="mono-font selectable px-2 py-1.5 text-[9px] text-muted-foreground">{v.hash.slice(0, 12)}…</td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => setViewing(viewing === k ? null : k)} className="stencil text-[8px] tracking-[0.2em] text-foreground underline underline-offset-2">
                          {viewing === k ? "HIDE" : "VIEW"}
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={8} className="px-2 pb-3">
                        <p className="mono-font selectable break-all text-[9px] text-muted-foreground">SHA-256 {v.hash}</p>
                        <ParamGroups params={v.params} />
                      </td>
                    </tr>
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ExceptionsPanel data={data} accountId={accountId} refresh={refresh} push={push} />
      <MembersPanel data={data} refresh={refresh} push={push} />
      <AuditPanel data={data} />

      {/* ── Activation confirmation ── */}
      <Dialog open={confirming} onOpenChange={(o) => { if (!busy) setConfirming(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ACTIVATE {pending?.name.toUpperCase()} v{pending?.version}?</DialogTitle>
            <DialogDescription>
              Authored by {nameOf(dir, pending?.createdBy)}. On activation the server records you as the activator
              {active ? `, archives v${active.version}` : ""} and writes an audit event. Existing verdicts will NOT change.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[260px] overflow-y-auto">
            <Eyebrow className="mb-1.5">CHANGES</Eyebrow>
            {pending && (active ? diffParams(active.params, pending.params) : describeParams(pending.params).map((r) => ({ field: r.field, label: r.label, from: "—", to: r.value }))).map((c) => (
              <p key={c.field} className="mono-font text-[10px] text-foreground">
                {c.label}: <span className="text-muted-foreground">{c.from}</span> → {c.to}
              </p>
            ))}
            {pending && active && diffParams(active.params, pending.params).length === 0 && (
              <p className="text-[10px] text-muted-foreground">No parameter changes from the active version.</p>
            )}
            {sim && sim.summary.evaluated > 0 && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                Simulated on {sim.summary.evaluated} recorded verdicts: {sim.summary.changed} would have been decided differently.
              </p>
            )}
          </div>
          {busy && <p className="mono-font animate-pulse text-[9.5px] text-muted-foreground">SERVER VALIDATION…</p>}
          {activationFailure && <Refusal failure={activationFailure} />}
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(false)}>CANCEL</Button>
            <Button size="sm" disabled={busy} onClick={() => void activate()}>ACTIVATE POLICY</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FragmentRow({ open, children }: { open: boolean; children: [React.ReactNode, React.ReactNode] }) {
  return <>{children[0]}{open && children[1]}</>;
}

/* ── Exceptions ───────────────────────────────────────────────────── */

function ExceptionsPanel({
  data, accountId, refresh, push,
}: {
  data: OrgData; accountId: string; refresh: () => Promise<void>; push: ReturnType<typeof useToast>["push"];
}) {
  const role = data.membership.role;
  const dir = data.directory;
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ id: string; f: ServerFailure } | null>(null);
  const rows = data.exceptions.filter((x) => filter === "all" || x.status === "pending");

  const decide = async (x: PolicyException, decision: "approve" | "reject") => {
    setBusy(true);
    setFailure(null);
    try {
      const r = await decideException(x, decision, note);
      if (!r.ok) {
        setFailure({ id: x.id, f: r });
        await refresh();
        return;
      }
      await refresh();
      setNote("");
      push({ title: decision === "approve" ? "EXCEPTION APPROVED" : "EXCEPTION REJECTED", body: `Requested by ${nameOf(dir, r.requested_by)} · decided by ${nameOf(dir, r.decided_by)}`, tone: decision === "approve" ? "go" : "info" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>POLICY EXCEPTIONS · {data.exceptions.filter((x) => x.status === "pending").length} PENDING</Eyebrow>
        <select aria-label="Exception filter" value={filter} onChange={(e) => setFilter(e.target.value as "pending" | "all")} className="mono-font h-6 rounded border border-border bg-background px-1 text-[9px] text-foreground">
          <option value="pending">Pending</option>
          <option value="all">All</option>
        </select>
      </div>
      <p className="mb-2 max-w-[720px] text-[9.5px] leading-snug text-muted-foreground">
        An exception is a person's decision recorded beside a verdict. The verdict and its receipt never change.
        Requested from a verdict in Verification or Evidence; decided by an owner, admin or compliance member who did not request it.
      </p>
      {rows.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">
          {filter === "pending" && data.exceptions.length > 0 ? `No pending exceptions. ` : "No exceptions requested."}
          {filter === "pending" && data.exceptions.length > 0 && (
            <button onClick={() => setFilter("all")} className="underline underline-offset-2">Show all {data.exceptions.length}</button>
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((x) => (
            <div key={x.id} className="border border-border p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="mono-font text-[10px] text-foreground">
                  {x.verdict.toUpperCase()} · {shortAddress(x.subject)} · {x.evidence.amountXrp.toLocaleString("en-US")} XRP
                  {x.policyId ? ` · ${x.policyId} v${x.policyVersion}` : " · no institutional policy"}
                </p>
                <span className={cn("stencil text-[8px] tracking-[0.2em]", x.status === "approved" ? "text-go" : x.status === "rejected" ? "text-no-go" : "text-hold")}>
                  ● {x.status.toUpperCase()}
                </span>
              </div>
              <p className="mono-font mt-1 text-[9px] leading-relaxed text-muted-foreground">
                REQUESTED BY {nameOf(dir, x.requestedBy)} · {utc(x.requestedAt)}
                {x.decidedBy && <> · {x.status === "approved" ? "APPROVED" : "REJECTED"} BY {nameOf(dir, x.decidedBy)} · {utc(x.decidedAt)}</>}
                <br />
                RECEIPT <span className="selectable">{x.receiptDigest}</span>
                {x.policyHash && <><br />POLICY SHA-256 <span className="selectable">{x.policyHash}</span></>}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[10.5px] text-foreground">{x.reason}</p>
              {x.evidence.failedRules.length > 0 && (
                <p className="mono-font mt-0.5 text-[9px] text-muted-foreground">FAILED RULES · {x.evidence.failedRules.join(", ")}</p>
              )}
              {x.decisionNote && <p className="mt-0.5 text-[10px] text-muted-foreground">Decision note: {x.decisionNote}</p>}
              {x.status === "pending" && can.approveException(role) && (
                open === x.id ? (
                  <div className="mt-2">
                    {x.requestedBy === accountId && (
                      <p className="mb-1 text-[9.5px] text-hold">You requested this exception. A second authorized person must decide it; the server refuses your decision.</p>
                    )}
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Decision note (required to reject, at least 10 characters)" className="w-full rounded border border-border bg-background p-2 text-[10.5px] text-foreground" />
                    <div className="mt-1.5 flex gap-1.5">
                      <Button size="sm" disabled={busy} onClick={() => void decide(x, "approve")}>APPROVE</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide(x, "reject")}>REJECT</Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(null)}>CANCEL</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => { setOpen(x.id); setNote(""); setFailure(null); }}>DECIDE…</Button>
                )
              )}
              {failure?.id === x.id && <div className="mt-2"><Refusal failure={failure.f} /></div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Members ──────────────────────────────────────────────────────── */

function MembersPanel({ data, refresh, push }: { data: OrgData; refresh: () => Promise<void>; push: ReturnType<typeof useToast>["push"] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("analyst");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ServerFailure | null>(null);
  const manage = can.manageMembers(data.membership.role);

  const add = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const r = await addMember(data.membership.organizationId, email.trim(), role);
      if (!r.ok) return setFailure(r);
      await refresh();
      push({ title: "MEMBER UPDATED", body: `${email.trim()} · ${role.toUpperCase()}`, tone: "info" });
      setEmail("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <Eyebrow className="mb-2">MEMBERS · {data.directory.length}</Eyebrow>
      <div className="space-y-0.5">
        {data.directory.map((m) => (
          <p key={m.accountId} className="mono-font text-[9.5px] text-muted-foreground">
            <span className="text-foreground">{m.displayName || m.email}</span>
            {m.displayName ? ` · ${m.email}` : ""} · <span className="stencil text-[8px] tracking-[0.18em]">{m.role.toUpperCase()}</span>
          </p>
        ))}
      </div>
      <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">
        Owner, admin and compliance may activate policies and decide exceptions. Analysts and risk may draft,
        simulate, submit and request. Viewers read only. Enforced by the server.
      </p>
      {manage && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="ADD OR CHANGE MEMBER · EMAIL">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@institution.com" className="h-7 w-60 text-[11px]" />
          </Field>
          <Field label="ROLE">
            <select aria-label="Member role" value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className="mono-font h-7 rounded border border-border bg-background px-1 text-[10px] text-foreground">
              {ROLES.map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
            </select>
          </Field>
          <Button size="sm" variant="outline" disabled={busy || !/.+@.+\..+/.test(email.trim())} onClick={() => void add()}>SAVE MEMBER</Button>
        </div>
      )}
      {failure && <div className="mt-2"><Refusal failure={failure} /></div>}
    </section>
  );
}

/* ── Audit ────────────────────────────────────────────────────────── */

const AUDIT_WORDS: Record<string, string> = {
  "policy.draft_created": "DRAFT CREATED",
  "policy.submitted": "SUBMITTED FOR ACTIVATION",
  "policy.withdrawn": "WITHDRAWN TO DRAFT",
  "policy.activated": "ACTIVATED",
  "policy.archived": "ARCHIVED",
  "exception.requested": "EXCEPTION REQUESTED",
  "exception.approved": "EXCEPTION APPROVED",
  "exception.rejected": "EXCEPTION REJECTED",
  "organization.created": "ORGANIZATION CREATED",
};

function AuditPanel({ data }: { data: OrgData }) {
  if (data.audit === null) {
    return (
      <section>
        <Eyebrow className="mb-2">GOVERNANCE AUDIT TRAIL</Eyebrow>
        <p className="text-[10px] text-muted-foreground">The audit trail is readable by owner, admin, compliance and risk members.</p>
      </section>
    );
  }
  return (
    <section>
      <Eyebrow className="mb-2">GOVERNANCE AUDIT TRAIL · SERVER RECORD · {data.audit.length}</Eyebrow>
      {data.audit.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No governance events recorded.</p>
      ) : (
        <div className="space-y-1">
          {data.audit.map((e) => (
            <p key={e.id} className="mono-font border-b border-border/30 pb-1 text-[9.5px] text-foreground">
              {utc(e.at)} · {nameOf(data.directory, e.actor)} · {AUDIT_WORDS[e.action] ?? e.action.toUpperCase()} {e.entityId ?? ""}
              {typeof e.newState?.hash === "string" && <span className="text-muted-foreground"> · SHA-256 {(e.newState.hash as string).slice(0, 12)}…</span>}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Request an exception from a verdict ──────────────────────────── */

export function RequestExceptionButton({ entry, caseId, className }: { entry: LedgerEntry; caseId?: string; className?: string }) {
  const org = useOrg();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ServerFailure | null>(null);
  const data = org.data;
  if (!data || !can.requestException(data.membership.role) || !org.accountId) return null;
  if (!/^[0-9A-F]{64}$/.test(entry.digest)) return null;
  const existing = data.exceptions.find((x) => x.receiptDigest === entry.digest && x.status !== "rejected");

  if (existing) {
    return (
      <span className={cn("stencil border border-border px-2 py-1 text-[8px] tracking-[0.2em]", existing.status === "approved" ? "text-go" : "text-hold", className)}>
        EXCEPTION {existing.status.toUpperCase()}
      </span>
    );
  }

  const submit = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const r = await requestException({ organizationId: data.membership.organizationId, entry, reason, caseId, requester: org.accountId! });
      if (!r.ok) return setFailure(r);
      await org.refresh();
      setOpen(false);
      setReason("");
      push({ title: "EXCEPTION REQUESTED", body: `${data.membership.name} · awaiting an owner, admin or compliance decision`, tone: "info" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setFailure(null); }}
        className={cn("stencil border border-border px-2 py-1 text-[8px] tracking-[0.2em] text-muted-foreground hover:border-foreground/40 hover:text-foreground", className)}
      >
        REQUEST EXCEPTION
      </button>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>REQUEST A POLICY EXCEPTION</DialogTitle>
            <DialogDescription>
              {data.membership.name} · the verdict stays {entry.verdict.toUpperCase()} and its receipt is unchanged. A second
              person with the owner, admin or compliance role decides.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <p className="mono-font text-[9.5px] text-muted-foreground">SUBJECT <span className="selectable text-foreground">{entry.subject}</span></p>
            <p className="mono-font text-[9.5px] text-muted-foreground">RECEIPT <span className="selectable text-foreground">{entry.digest}</span></p>
            <p className="mono-font text-[9.5px] text-muted-foreground">
              POLICY {entry.policy ? `${entry.policy.name} v${entry.policy.version} · ${entry.policy.hash.slice(0, 12)}…` : "none active when decided"}
            </p>
            {entry.failedRules.length > 0 && <p className="mono-font text-[9.5px] text-muted-foreground">FAILED RULES {entry.failedRules.join(", ")}</p>}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why this verdict should be excepted (at least 10 characters)" className="mt-1.5 w-full rounded border border-border bg-background p-2 text-[10.5px] text-foreground" />
          </div>
          {failure && <Refusal failure={failure} />}
          <DialogFooter>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(false)}>CANCEL</Button>
            <Button size="sm" disabled={busy || reason.trim().length < 10} onClick={() => void submit()}>SUBMIT REQUEST</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
