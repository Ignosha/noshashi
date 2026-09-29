import { useCallback, useEffect, useMemo, useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Eyebrow } from "@/components/nova/Panel";
import { Gated } from "@/components/nova/Gated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useOrg } from "@/lib/org/useOrg";
import type { MemberRole } from "@/lib/org/governance";
import { isValidAddress, shortAddress } from "@/lib/xrpl/client";
import { saveTextFile } from "@/lib/export";
import {
  EVENT_TYPES,
  formatAmount,
  sanitizeDepositConfig,
  screenTransaction,
  type Amount,
  type DepositConfig,
  type EventType,
  type OnDemandScreening,
  type ScreeningFinding,
} from "@/lib/xrpl/deposit";
import {
  addWatch,
  deleteEmbed,
  deleteSchema,
  embedSnippet,
  listEmbeds,
  readSanctionsStatus,
  saveEmbed,
  type Embed,
  type EmbedWidget,
  FEED_ENDPOINT,
  listEvents,
  listSchemas,
  listWatches,
  readDataset,
  readRetention,
  removeWatch,
  saveSchema,
  setRetention,
  updateWatch,
  type ExportSchema,
  type LedgerEvent,
  type Watch,
} from "@/lib/xrpl/ledgerWatch";
import {
  applySchema,
  AUDIT_PATHS,
  CONTENT_TYPES,
  EVENT_PATHS,
  serialize,
  type ExportFormat,
  type SchemaField,
} from "../../../supabase/functions/_shared/exportSchema.ts";
import { cn } from "@/lib/utils";
import { openOrgCase } from "@/lib/org/cases";
import type { LedgerEntry } from "@/lib/desk/ledger";

const TABS = [
  { id: "screen", label: "SCREEN A DEPOSIT" },
  { id: "watches", label: "WATCHED ACCOUNTS" },
  { id: "events", label: "EVENT FEED" },
  { id: "export", label: "SCHEMAS & EXPORT" },
  { id: "embed", label: "WEBSITE WIDGET" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const WATCH_ROLES: MemberRole[] = ["owner", "admin", "compliance", "risk"];
const SCHEMA_ROLES: MemberRole[] = ["owner", "admin", "compliance"];

const utc = (iso?: string | null) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "—");
const VERDICT_TONE: Record<string, string> = { clear: "text-go", review: "text-hold", hold: "text-no-go" };
const SEVERITY_TONE: Record<ScreeningFinding["severity"], string> = { critical: "text-no-go", warn: "text-hold", info: "text-muted-foreground" };

export function LedgerWatchScene({ onUpgrade, onSignIn }: { onUpgrade: () => void; onSignIn: () => void }) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="32"
        kicker="LEDGER WATCH · DEPOSIT SCREENING · EVENT FEEDS"
        title="LEDGER WATCH"
        sub="Every incoming payment to your deposit addresses judged before you credit it, and every account you watch read from validated ledgers each minute, delivered to your systems as signed webhooks and a feed you pull."
        status="go"
        statusLabel="ENTERPRISE"
      />
      <Gated feature="deposit_screening" onUpgrade={onUpgrade} onSignIn={onSignIn} className="min-h-0 flex-1">
        <LedgerWatchBody />
      </Gated>
    </div>
  );
}

function LedgerWatchBody() {
  const [tab, setTab] = useState<Tab>("screen");
  const org = useOrg();
  const membership = org.state.status === "ready" && org.state.data ? org.state.data.membership : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "stencil border px-2 py-1 text-[10.5px] tracking-[0.14em]",
              tab === t.id ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === "screen" ? (
          <ScreenTab organizationId={membership?.organizationId ?? null} />
        ) : !membership ? (
          <p className="max-w-[640px] text-[11px] text-muted-foreground">
            Watched accounts, the event feed and export schemas belong to an organization. Create or join one in the WORKSTATION, then
            come back. Screening a single deposit works without one.
          </p>
        ) : tab === "watches" ? (
          <WatchesTab organizationId={membership.organizationId} role={membership.role} />
        ) : tab === "events" ? (
          <EventsTab organizationId={membership.organizationId} role={membership.role} accountId={org.accountId} />
        ) : tab === "embed" ? (
          <EmbedTab organizationId={membership.organizationId} role={membership.role} />
        ) : (
          <ExportTab organizationId={membership.organizationId} role={membership.role} />
        )}
      </div>
    </div>
  );
}

/* ── Screen one deposit ─────────────────────────────────────────────── */

function ScreenTab({ organizationId }: { organizationId: string | null }) {
  const [hash, setHash] = useState("");
  const [address, setAddress] = useState("");
  const [watches, setWatches] = useState<Watch[]>([]);
  const [config, setConfig] = useState<DepositConfig>(sanitizeDepositConfig({}));
  const [result, setResult] = useState<OnDemandScreening | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    listWatches(organizationId).then((w) => setWatches(w.filter((x) => x.purpose === "deposit"))).catch(() => setWatches([]));
  }, [organizationId]);

  // A watched deposit address screens with its own configuration.
  useEffect(() => {
    const w = watches.find((x) => x.address === address.trim());
    if (w) setConfig(sanitizeDepositConfig(w.depositConfig));
  }, [address, watches]);

  const run = async () => {
    setError(null);
    setResult(null);
    if (!/^[0-9A-Fa-f]{64}$/.test(hash.trim())) return setError("Paste the 64-character transaction hash.");
    if (!isValidAddress(address.trim())) return setError("Enter the deposit address the payment was sent to.");
    setBusy(true);
    try {
      const known = organizationId ? (await listWatches(organizationId).catch(() => [])).map((w) => w.address) : [];
      setResult(await screenTransaction(hash.trim().toUpperCase(), address.trim(), config, known));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="space-y-2">
        <Eyebrow>INCOMING PAYMENT</Eyebrow>
        <p className="max-w-[560px] text-[11px] leading-snug text-muted-foreground">
          Read live from the ledger: the transaction, what it actually delivered, the issuer of any token, and who created the sender,
          who created them, and who created them. Nothing is estimated; what cannot be read is said to be unknown and holds the deposit.
        </p>
        <Input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Transaction hash" className="mono-font h-7 text-[11px]" />
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Deposit address (r…)" className="mono-font h-7 text-[11px]" list="deposit-watches" />
        <datalist id="deposit-watches">
          {watches.map((w) => (
            <option key={w.id} value={w.address}>{w.label ?? w.address}</option>
          ))}
        </datalist>
        <DepositConfigEditor value={config} onChange={setConfig} />
        <Button size="sm" onClick={() => void run()} disabled={busy}>{busy ? "READING THE LEDGER…" : "SCREEN"}</Button>
        {error && <p className="text-[11px] text-no-go">{error}</p>}
      </section>
      <section>{result ? <ScreeningView result={result} /> : <p className="text-[11px] text-muted-foreground">The verdict appears here.</p>}</section>
    </div>
  );
}

function ScreeningView({ result }: { result: OnDemandScreening }) {
  const { screening, event, chain } = result;
  const data = event.data as { amount: Amount | null; delivered: Amount | null; destinationTag: number | null; memos?: string[] };
  const exportIt = () =>
    void saveTextFile(
      `deposit-screening-${event.hash.slice(0, 12)}.json`,
      JSON.stringify({ source: `XRPL mainnet, validated ledger ${result.ledger}`, event, screening, fundingChain: chain }, null, 2),
      "application/json"
    );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={cn("stencil text-[18px] tracking-[0.14em]", VERDICT_TONE[screening.verdict])}>{screening.verdict.toUpperCase()}</p>
        <Button size="sm" variant="outline" onClick={exportIt}>EXPORT JSON</Button>
      </div>
      <p className="text-[11px] text-foreground">
        Credit: <span className="mono-font">{screening.credit ? formatAmount(screening.credit) : "nothing"}</span>
        {data.amount && data.delivered && data.amount.value !== data.delivered.value && (
          <span className="text-muted-foreground"> · asked {formatAmount(data.amount)}</span>
        )}
      </p>
      <p className="mono-font text-[10.5px] text-muted-foreground">
        {event.txType} · {event.result} · ledger {event.ledgerIndex.toLocaleString("en-US")} · tag {data.destinationTag ?? "none"} · read at ledger{" "}
        {result.ledger.toLocaleString("en-US")}
      </p>
      <div className="space-y-1">
        {screening.findings.length === 0 && <p className="text-[11px] text-go">No findings.</p>}
        {screening.findings.map((f) => (
          <div key={f.id} className="border border-border p-1.5">
            <p className={cn("stencil text-[10px] tracking-[0.14em]", SEVERITY_TONE[f.severity])}>{f.severity.toUpperCase()} · {f.title}</p>
            <p className="selectable mt-0.5 break-words text-[11px] leading-snug text-muted-foreground">{f.detail}</p>
          </div>
        ))}
      </div>
      {chain.length > 0 && (
        <div>
          <Eyebrow className="mb-1">SOURCE OF FUNDS</Eyebrow>
          {chain.map((h, i) => (
            <p key={h.account} className="mono-font selectable text-[10.5px] text-muted-foreground">
              {i === 0 ? "sender" : `${i} back`} · {h.account} · {h.activatedLedger ? `created in ledger ${h.activatedLedger.toLocaleString("en-US")}` : "creation not read"}
              {h.fundedBy ? ` · funded by ${h.fundedBy}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Accepted issuers, deny list, tag and Travel Rule threshold, edited as text. */
function DepositConfigEditor({ value, onChange, disabled }: { value: DepositConfig; onChange: (c: DepositConfig) => void; disabled?: boolean }) {
  const [issuers, setIssuers] = useState(() => issuersText(value));
  const [deny, setDeny] = useState(() => value.denylist.join("\n"));
  const [trusted, setTrusted] = useState(() => (value.trustedCounterparties ?? []).join("\n"));
  useEffect(() => {
    setIssuers(issuersText(value));
    setDeny(value.denylist.join("\n"));
    setTrusted((value.trustedCounterparties ?? []).join("\n"));
  }, [value]);
  const commit = (nextIssuers = issuers, nextDeny = deny, patch: Partial<DepositConfig> = {}) => {
    const acceptedIssuers: Record<string, string[]> = {};
    for (const line of nextIssuers.split("\n")) {
      const [code, issuer] = line.trim().split(/\s+/);
      if (code && issuer) acceptedIssuers[code.toUpperCase()] = [...(acceptedIssuers[code.toUpperCase()] ?? []), issuer];
    }
    onChange(sanitizeDepositConfig({
      ...value,
      ...patch,
      acceptedIssuers,
      denylist: nextDeny.split(/[\s,]+/).filter(Boolean),
      trustedCounterparties: trusted.split(/[\s,]+/).filter(Boolean),
    }));
  };
  return (
    <div className="space-y-1.5 border border-dashed border-border p-2">
      <p className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">RULES FOR THIS DEPOSIT ADDRESS</p>
      <label className="block text-[10.5px] text-muted-foreground">
        Accepted issuers, one per line: <span className="mono-font">USD rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B</span>
        <textarea disabled={disabled} value={issuers} onChange={(e) => setIssuers(e.target.value)} onBlur={() => commit()} rows={2} className="mono-font mt-0.5 w-full resize-y border border-border bg-transparent p-1 text-[11px] text-foreground" />
      </label>
      <label className="block text-[10.5px] text-muted-foreground">
        Deny list: addresses you will not take funds from, directly or up to three hops back
        <textarea disabled={disabled} value={deny} onChange={(e) => setDeny(e.target.value)} onBlur={() => commit()} rows={2} className="mono-font mt-0.5 w-full resize-y border border-border bg-transparent p-1 text-[11px] text-foreground" />
      </label>
      <label className="block text-[10.5px] text-muted-foreground">
        Trusted counterparties: addresses you pay or are paid by. A sender that starts and ends like one of these (or like any address
        you watch) is flagged as address poisoning.
        <textarea disabled={disabled} value={trusted} onChange={(e) => setTrusted(e.target.value)} onBlur={() => commit()} rows={2} className="mono-font mt-0.5 w-full resize-y border border-border bg-transparent p-1 text-[11px] text-foreground" />
      </label>
      <p className="text-[10.5px] text-muted-foreground">
        Every sender and its funders three hops back are also checked against the US Treasury's OFAC SDN list, refreshed daily from
        treasury.gov. A listed address holds the deposit.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-foreground">
        <label className="flex items-center gap-1">
          <input type="checkbox" disabled={disabled} checked={value.requireTag} onChange={(e) => commit(issuers, deny, { requireTag: e.target.checked })} />
          Require a destination tag
        </label>
        <label className="flex items-center gap-1">
          Travel Rule from
          <Input
            disabled={disabled}
            type="number"
            min={0}
            value={value.travelRuleXrp || ""}
            placeholder="off"
            onChange={(e) => commit(issuers, deny, { travelRuleXrp: Number(e.target.value) })}
            className="mono-font h-6 w-24 text-[11px]"
          />
          XRP
        </label>
      </div>
    </div>
  );
}

const issuersText = (c: DepositConfig) =>
  Object.entries(c.acceptedIssuers).flatMap(([code, list]) => list.map((a) => `${code} ${a}`)).join("\n");

/* ── Watched accounts ───────────────────────────────────────────────── */

function WatchesTab({ organizationId, role }: { organizationId: string; role: MemberRole }) {
  const { has } = useBilling();
  const [watches, setWatches] = useState<Watch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [purpose, setPurpose] = useState<"deposit" | "monitor">("deposit");
  const [open, setOpen] = useState<string | null>(null);
  const canEdit = WATCH_ROLES.includes(role);
  const feeds = has("event_feeds");

  const load = useCallback(async () => {
    try {
      setWatches(await listWatches(organizationId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [organizationId]);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <Eyebrow>WATCHED ACCOUNTS · READ EVERY MINUTE</Eyebrow>
      <p className="max-w-[720px] text-[11px] leading-snug text-muted-foreground">
        The server reads each account's new validated transactions once a minute, from the ledger the watch was added onward. Deposit
        addresses have every incoming payment screened; monitored accounts ({feeds ? "Strategic" : "Strategic plan"}) record payments,
        trust-line freezes, settings and issuer flag changes. Each event reaches your webhooks signed, and the feed API.
      </p>
      {error && <p className="text-[11px] text-no-go">{error}</p>}
      {watches === null && !error && <p className="mono-font animate-pulse text-[10.5px] text-muted-foreground">LOADING…</p>}
      {watches?.length === 0 && <p className="text-[11px] text-muted-foreground">No accounts watched yet.</p>}
      {watches?.map((w) => (
        <div key={w.id} className="border border-border p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-foreground">
              <span className="stencil mr-1.5 text-[10px] tracking-[0.14em] text-muted-foreground">{w.purpose.toUpperCase()}</span>
              {w.label ?? shortAddress(w.address)} <span className="mono-font selectable text-muted-foreground">{w.address}</span>
            </p>
            <span className={cn("stencil text-[10px] tracking-[0.14em]", w.lastError ? "text-no-go" : w.active ? "text-go" : "text-muted-foreground")}>
              ● {w.lastError ? "READ FAILED" : w.active ? "WATCHING" : "PAUSED"}
            </span>
          </div>
          <p className="mono-font text-[10.5px] text-muted-foreground">
            read to ledger {w.lastLedger?.toLocaleString("en-US") ?? "— (first read pending)"} · last read {utc(w.lastPolledAt)} · {w.eventTypes.length} event types
          </p>
          {w.lastError && <p className="text-[10.5px] text-no-go">{w.lastError}</p>}
          {canEdit && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => updateWatch(w.id, { active: !w.active }))}>{w.active ? "PAUSE" : "RESUME"}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(open === w.id ? null : w.id)}>{open === w.id ? "CLOSE" : "SETTINGS"}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => removeWatch(w.id))}>STOP WATCHING</Button>
            </div>
          )}
          {open === w.id && <WatchSettings watch={w} busy={busy} onSave={(patch) => void run(() => updateWatch(w.id, patch))} />}
        </div>
      ))}
      {canEdit ? (
        <div className="border border-dashed border-border p-2">
          <p className="stencil mb-1 text-[10px] tracking-[0.14em] text-muted-foreground">WATCH AN ACCOUNT</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="r… address" className="mono-font h-7 w-80 text-[11px]" />
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" maxLength={80} className="h-7 w-48 text-[11px]" />
            <select value={purpose} onChange={(e) => setPurpose(e.target.value as "deposit" | "monitor")} className="h-7 border border-border bg-transparent px-1 text-[11px] text-foreground">
              <option value="deposit">Deposit address (screen incoming)</option>
              <option value="monitor" disabled={!feeds}>Monitor all activity{feeds ? "" : " — Strategic"}</option>
            </select>
            <Button size="sm" disabled={busy || !isValidAddress(address.trim())} onClick={() => void run(async () => { await addWatch(organizationId, address, label, purpose); setAddress(""); setLabel(""); })}>WATCH</Button>
          </div>
        </div>
      ) : (
        <p className="text-[10.5px] text-muted-foreground">Owners, admins, compliance and risk manage watched accounts.</p>
      )}
    </section>
  );
}

function WatchSettings({ watch, busy, onSave }: { watch: Watch; busy: boolean; onSave: (p: { eventTypes?: EventType[]; depositConfig?: DepositConfig; label?: string }) => void }) {
  const [types, setTypes] = useState<EventType[]>(watch.eventTypes);
  const [config, setConfig] = useState<DepositConfig>(() => sanitizeDepositConfig(watch.depositConfig));
  const [label, setLabel] = useState(watch.label ?? "");
  return (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" maxLength={80} className="h-7 w-64 text-[11px]" />
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {EVENT_TYPES.map((t) => (
          <label key={t} className="mono-font flex items-center gap-1 text-[10.5px] text-foreground">
            <input type="checkbox" checked={types.includes(t)} onChange={(e) => setTypes((cur) => (e.target.checked ? [...cur, t] : cur.filter((x) => x !== t)))} />
            {t}
          </label>
        ))}
      </div>
      {watch.purpose === "deposit" && <DepositConfigEditor value={config} onChange={setConfig} />}
      <Button size="sm" disabled={busy || types.length === 0} onClick={() => onSave({ label, eventTypes: types, depositConfig: watch.purpose === "deposit" ? config : undefined })}>SAVE</Button>
    </div>
  );
}

/* ── Event feed ─────────────────────────────────────────────────────── */

const CASE_ROLES: MemberRole[] = ["owner", "admin", "compliance", "risk", "analyst"];

/** A held deposit as the verdict a case links to: the sender is the subject, the transaction hash the digest. */
export function heldDepositEntry(e: LedgerEvent): LedgerEntry {
  const delivered = (e.data as { delivered?: Amount | null }).delivered;
  const findings = e.screening?.findings ?? [];
  return {
    id: `xrpl-event-${e.id}`,
    subject: e.counterparty ?? e.address,
    label: `Deposit to ${e.address}`,
    domainCode: "DEPOSIT",
    verdict: "hold",
    digest: e.txHash,
    amountXrp: delivered && delivered.currency === "XRP" ? delivered.value : 0,
    failedRules: findings.filter((f) => f.severity !== "info").map((f) => f.id),
    checksPassed: findings.filter((f) => f.severity === "info").length,
    checksTotal: findings.length,
    latencyMs: 0,
    at: e.createdAt,
    offline: false,
  };
}

function EventsTab({ organizationId, role, accountId }: { organizationId: string; role: MemberRole; accountId: string | null }) {
  const [events, setEvents] = useState<LedgerEvent[] | null>(null);
  const [cased, setCased] = useState<Record<number, string>>({});
  const [verdict, setVerdict] = useState<"" | "clear" | "review" | "hold">("");
  const [type, setType] = useState<"" | EventType>("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setEvents(await listEvents(organizationId, { verdict: verdict || undefined, type: type || undefined }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [organizationId, verdict, type]);

  useEffect(() => {
    void load();
    // The watcher records every minute; the list follows it while open.
    const every = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(every);
  }, [load]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Eyebrow>EVENTS · NEWEST FIRST</Eyebrow>
        <select value={verdict} onChange={(e) => setVerdict(e.target.value as typeof verdict)} className="h-6 border border-border bg-transparent px-1 text-[11px] text-foreground">
          <option value="">Any verdict</option>
          <option value="hold">Hold</option>
          <option value="review">Review</option>
          <option value="clear">Clear</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="mono-font h-6 border border-border bg-transparent px-1 text-[11px] text-foreground">
          <option value="">Any event</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button size="sm" variant="ghost" onClick={() => void load()}>REFRESH</Button>
      </div>
      {error && <p className="text-[11px] text-no-go">{error}</p>}
      {events === null && !error && <p className="mono-font animate-pulse text-[10.5px] text-muted-foreground">LOADING…</p>}
      {events?.length === 0 && <p className="text-[11px] text-muted-foreground">No events recorded yet. A new watch reports what happens from the ledger it was added at.</p>}
      <div className="space-y-1">
        {events?.map((e) => {
          const delivered = (e.data as { delivered?: Amount | null }).delivered;
          return (
            <div key={e.id} className="border border-border p-1.5">
              <button className="w-full text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                <p className="mono-font text-[11px] text-foreground">
                  {e.verdict && <span className={cn("stencil mr-1.5 tracking-[0.14em]", VERDICT_TONE[e.verdict])}>{e.verdict.toUpperCase()}</span>}
                  {e.type} · {shortAddress(e.address)}
                  {e.counterparty ? ` ⇄ ${shortAddress(e.counterparty)}` : ""}
                  {delivered ? ` · ${formatAmount(delivered)}` : ""} · {utc(e.ledgerTime)}
                </p>
              </button>
              {open === e.id && (
                <div className="mt-1 space-y-1">
                  <p className="mono-font selectable break-all text-[10.5px] text-muted-foreground">
                    {e.txHash} · ledger {e.ledgerIndex.toLocaleString("en-US")} · {e.txType} · {e.txResult}
                  </p>
                  {e.screening?.findings.map((f) => (
                    <p key={f.id} className="text-[11px] leading-snug text-muted-foreground">
                      <span className={cn("stencil mr-1 text-[10px] tracking-[0.14em]", SEVERITY_TONE[f.severity])}>{f.severity.toUpperCase()}</span>
                      {f.title}. {f.detail}
                    </p>
                  ))}
                  {!e.screening && <pre className="mono-font selectable whitespace-pre-wrap break-all text-[10px] text-muted-foreground">{JSON.stringify(e.data, null, 1)}</pre>}
                  {e.verdict === "hold" && accountId && CASE_ROLES.includes(role) && (
                    cased[e.id] ? (
                      <p className="mono-font text-[10.5px] text-go">Case {cased[e.id]} opened. It is in CASES for every member.</p>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void openOrgCase(organizationId, { entry: heldDepositEntry(e), actor: accountId })
                            .then((id) => setCased((c) => ({ ...c, [e.id]: id })))
                            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                        }
                      >
                        OPEN INVESTIGATION CASE
                      </Button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Schemas, bulk export, retention ────────────────────────────────── */

function ExportTab({ organizationId, role }: { organizationId: string; role: MemberRole }) {
  const { has } = useBilling();
  const [schemas, setSchemas] = useState<ExportSchema[] | null>(null);
  const [retention, setRetentionDays] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ id?: string; name: string; dataset: "events" | "audit"; format: ExportFormat; fields: SchemaField[] }>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = SCHEMA_ROLES.includes(role) && has("custom_schemas");

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([listSchemas(organizationId), readRetention(organizationId)]);
      setSchemas(s);
      setRetentionDays(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [organizationId]);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      await load();
      if (done) setNote(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportWith = (schema: Pick<ExportSchema, "name" | "dataset" | "format" | "fields">) =>
    run(async () => {
      const records = await readDataset(organizationId, schema.dataset);
      const rows = applySchema(records, schema.fields);
      const ext = schema.format === "ndjson" ? "ndjson" : schema.format;
      const file = `${schema.name.replace(/[^A-Za-z0-9_-]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.${ext}`;
      await saveTextFile(file, serialize(rows, schema.fields.map((f) => f.as), schema.format), CONTENT_TYPES[schema.format]);
      setNote(`${rows.length.toLocaleString("en-US")} records written to ${file}. The export is recorded in the audit log with its SHA-256.`);
    });

  const paths = draft.dataset === "events" ? EVENT_PATHS : AUDIT_PATHS;

  if (!has("custom_schemas")) {
    return (
      <p className="max-w-[640px] text-[11px] text-muted-foreground">
        Custom export schemas, bulk export and event retention are part of the Strategic plan. Screened deposits can still be pulled as
        they are from the feed API with an organization key.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <Eyebrow className="mb-1">YOUR SCHEMAS</Eyebrow>
        {error && <p className="text-[11px] text-no-go">{error}</p>}
        {note && <p className="text-[11px] text-go">{note}</p>}
        {schemas?.length === 0 && <p className="text-[11px] text-muted-foreground">No schemas yet.</p>}
        {schemas?.map((s) => (
          <div key={s.id} className="mb-1 border border-border p-2">
            <p className="text-[11px] text-foreground">
              {s.name} <span className="mono-font text-muted-foreground">· {s.dataset} · {s.format} · {s.fields.length} fields · id {s.id}</span>
            </p>
            <p className="mono-font text-[10.5px] text-muted-foreground">{s.fields.map((f) => `${f.path}→${f.as}`).join("  ")}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void exportWith(s)}>EXPORT ALL</Button>
              {canEdit && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft({ id: s.id, name: s.name, dataset: s.dataset, format: s.format, fields: s.fields })}>EDIT</Button>}
              {canEdit && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => deleteSchema(s.id))}>DELETE</Button>}
            </div>
            {s.dataset === "events" && (
              <p className="mono-font selectable mt-1 break-all text-[10px] text-muted-foreground">
                curl -H "Authorization: Bearer $NOSHASHI_KEY" "{FEED_ENDPOINT}/events?schema={s.id}&amp;after=0&amp;limit=1000"
              </p>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="border border-dashed border-border p-2">
          <p className="stencil mb-1 text-[10px] tracking-[0.14em] text-muted-foreground">{draft.id ? "EDIT SCHEMA" : "NEW SCHEMA"}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" maxLength={80} className="h-7 w-56 text-[11px]" />
            <select value={draft.dataset} onChange={(e) => setDraft({ ...draft, dataset: e.target.value as "events" | "audit", fields: [] })} className="h-7 border border-border bg-transparent px-1 text-[11px] text-foreground">
              <option value="events">Ledger events and screenings</option>
              <option value="audit">Audit log (adjudications, exports, settings)</option>
            </select>
            <select value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value as ExportFormat })} className="h-7 border border-border bg-transparent px-1 text-[11px] text-foreground">
              <option value="csv">CSV</option>
              <option value="ndjson">NDJSON</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <FieldEditor fields={draft.fields} paths={paths} onChange={(fields) => setDraft({ ...draft, fields })} />
          <div className="mt-1.5 flex gap-1.5">
            <Button size="sm" disabled={busy || !draft.name.trim() || draft.fields.length === 0} onClick={() => void run(() => saveSchema(organizationId, draft), "Schema saved.").then(() => setDraft(BLANK))}>SAVE</Button>
            <Button size="sm" variant="outline" disabled={busy || draft.fields.length === 0} onClick={() => void exportWith({ ...draft, name: draft.name || "export" })}>EXPORT WITH THIS</Button>
            {draft.id && <Button size="sm" variant="ghost" onClick={() => setDraft(BLANK)}>NEW</Button>}
          </div>
        </div>
      )}

      <div>
        <Eyebrow className="mb-1">EVENT RETENTION</Eyebrow>
        <RetentionEditor days={retention} disabled={busy || !(role === "owner" || role === "admin")} onSave={(d) => void run(() => setRetention(organizationId, d), `Event history is now kept for ${d} days.`)} />
      </div>
    </section>
  );
}

const BLANK = { name: "", dataset: "events" as const, format: "csv" as ExportFormat, fields: [] as SchemaField[] };

function FieldEditor({ fields, paths, onChange }: { fields: SchemaField[]; paths: string[]; onChange: (f: SchemaField[]) => void }) {
  const [path, setPath] = useState(paths[0]);
  const [as, setAs] = useState("");
  useEffect(() => setPath(paths[0]), [paths]);
  const column = as.trim() || path.split(".").pop() || path;
  return (
    <div className="mt-1.5 space-y-1">
      {fields.map((f, i) => (
        <p key={`${f.path}-${i}`} className="mono-font flex items-center gap-2 text-[11px] text-foreground">
          {f.path} → {f.as}
          <button className="text-muted-foreground hover:text-no-go" onClick={() => onChange(fields.filter((_, j) => j !== i))} aria-label={`Remove ${f.as}`}>×</button>
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <Input value={path} onChange={(e) => setPath(e.target.value)} list="schema-paths" className="mono-font h-7 w-64 text-[11px]" />
        <datalist id="schema-paths">{paths.map((p) => <option key={p} value={p} />)}</datalist>
        <Input value={as} onChange={(e) => setAs(e.target.value)} placeholder={`column (${column})`} maxLength={63} className="h-7 w-40 text-[11px]" />
        <Button size="sm" variant="ghost" onClick={() => { onChange([...fields, { path: path.trim(), as: column }]); setAs(""); }}>ADD FIELD</Button>
      </div>
    </div>
  );
}

function RetentionEditor({ days, disabled, onSave }: { days: number | null; disabled: boolean; onSave: (d: number) => void }) {
  const [value, setValue] = useState<string>("");
  useEffect(() => setValue(days ? String(days) : ""), [days]);
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 7 && n <= 3650;
  const years = useMemo(() => (valid && n >= 365 ? ` (${(n / 365).toFixed(1)} years)` : ""), [n, valid]);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      Keep ledger events for
      <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" min={7} max={3650} disabled={disabled} className="mono-font h-7 w-24 text-[11px]" />
      days{years}. Older events are removed daily. The audit log is never removed.
      <Button size="sm" variant="outline" disabled={disabled || !valid || n === days} onClick={() => onSave(n)}>SET</Button>
    </div>
  );
}

/* ── Website widget ─────────────────────────────────────────────────── */

const EMBED_ROLES: MemberRole[] = ["owner", "admin", "compliance"];
const WIDGETS: Array<{ id: EmbedWidget; label: string; blurb: string }> = [
  { id: "verify", label: "Verify address", blurb: "A customer pastes the address they are about to pay; it says whether it is really yours, and names a lookalike (address poisoning)." },
  { id: "check", label: "Check an address", blurb: "Any address's ledger facts and whether the US Treasury lists it (OFAC SDN)." },
  { id: "deposit", label: "Deposit status", blurb: "A customer pastes their transaction hash and sees whether it arrived. A deposit under review says only that, never why." },
];

function EmbedTab({ organizationId, role }: { organizationId: string; role: MemberRole }) {
  const { has } = useBilling();
  const [embeds, setEmbeds] = useState<Embed[] | null>(null);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [sanctions, setSanctions] = useState<{ listed: number; asOf: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ id?: string; label: string; widgets: EmbedWidget[]; origins: string; depositAddress: string; theme: Embed["theme"]; active: boolean }>({
    label: "", widgets: ["verify", "check"], origins: "", depositAddress: "", theme: "auto", active: true,
  });
  const canEdit = EMBED_ROLES.includes(role) && has("embedded_delivery");
  const deposits = watches.filter((w) => w.purpose === "deposit");

  const load = useCallback(async () => {
    try {
      const [e, w] = await Promise.all([listEmbeds(organizationId), listWatches(organizationId)]);
      setEmbeds(e);
      setWatches(w);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    readSanctionsStatus().then(setSanctions).catch(() => setSanctions(null));
  }, [organizationId]);
  useEffect(() => void load(), [load]);

  const save = async () => {
    setBusy(true);
    try {
      await saveEmbed(organizationId, {
        id: draft.id,
        label: draft.label,
        widgets: draft.widgets,
        allowedOrigins: draft.origins.split(/[\s,]+/).filter(Boolean),
        depositAddress: draft.depositAddress || null,
        theme: draft.theme,
        active: draft.active,
      });
      setDraft({ label: "", widgets: ["verify", "check"], origins: "", depositAddress: "", theme: "auto", active: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!has("embedded_delivery")) {
    return (
      <p className="max-w-[640px] text-[11px] text-muted-foreground">
        The website widget is part of the Enterprise and Strategic plans: address verification against poisoning, sanctions checks and
        deposit status for your customers, on your own site, with no key in the browser.
      </p>
    );
  }

  return (
    <section className="max-w-[760px] space-y-3">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Put NOSHASHI's checks on your own website with one script tag. The widget answers only on the sites you list, holds no key, and
        renders in its own shadow root so it cannot touch your page.
        {sanctions && ` Sanctions: ${sanctions.listed.toLocaleString("en-US")} XRP address${sanctions.listed === 1 ? "" : "es"} on the OFAC SDN list${sanctions.asOf ? `, read from treasury.gov ${utc(sanctions.asOf)}` : ""}.`}
      </p>
      {error && <p className="text-[11px] text-no-go">{error}</p>}

      {embeds?.map((e) => (
        <div key={e.id} className="space-y-1 border border-border p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11.5px] text-foreground">
              {e.label} <span className={cn("stencil ml-1 text-[10px] tracking-[0.14em]", e.active ? "text-go" : "text-muted-foreground")}>{e.active ? "LIVE" : "OFF"}</span>
            </p>
            {canEdit && (
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setDraft({ id: e.id, label: e.label, widgets: e.widgets, origins: e.allowedOrigins.join("\n"), depositAddress: e.depositAddress ?? "", theme: e.theme, active: e.active })}>EDIT</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void deleteEmbed(e.id).then(load).catch((err) => setError(String(err?.message ?? err)))}>DELETE</Button>
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {e.widgets.map((w) => WIDGETS.find((x) => x.id === w)?.label).join(" · ")} · allowed on {e.allowedOrigins.length ? e.allowedOrigins.join(", ") : "no site yet (add one to switch it on)"}
          </p>
          <pre className="mono-font selectable whitespace-pre-wrap break-all border border-dashed border-border p-1.5 text-[10.5px] text-foreground">{embedSnippet(e.id)}</pre>
          <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(embedSnippet(e.id))}>COPY SNIPPET</Button>
        </div>
      ))}
      {embeds?.length === 0 && <p className="text-[11px] text-muted-foreground">No widget yet.</p>}

      {canEdit && (
        <div className="space-y-2 border border-border p-2">
          <Eyebrow>{draft.id ? "EDIT WIDGET" : "NEW WIDGET"}</Eyebrow>
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Name customers see, e.g. Acme Exchange" className="h-7 text-[11px]" />
          <div className="space-y-1">
            {WIDGETS.map((w) => (
              <label key={w.id} className="flex items-start gap-1.5 text-[11px] text-foreground">
                <input
                  type="checkbox"
                  checked={draft.widgets.includes(w.id)}
                  onChange={(e) => setDraft({ ...draft, widgets: e.target.checked ? [...draft.widgets, w.id] : draft.widgets.filter((x) => x !== w.id) })}
                />
                <span>
                  {w.label} <span className="text-muted-foreground">— {w.blurb}</span>
                </span>
              </label>
            ))}
          </div>
          {(draft.widgets.includes("verify") || draft.widgets.includes("deposit")) && (
            <select value={draft.depositAddress} onChange={(e) => setDraft({ ...draft, depositAddress: e.target.value })} className="mono-font h-7 w-full border border-border bg-transparent px-1 text-[11px] text-foreground">
              <option value="">{deposits.length ? "Choose your deposit address" : "Watch a deposit address first (WATCHED ACCOUNTS)"}</option>
              {deposits.map((w) => <option key={w.id} value={w.address}>{w.label ? `${w.label} · ` : ""}{w.address}</option>)}
            </select>
          )}
          <label className="block text-[10.5px] text-muted-foreground">
            Sites it may appear on, one origin per line: <span className="mono-font">https://www.example.com</span>
            <textarea value={draft.origins} onChange={(e) => setDraft({ ...draft, origins: e.target.value })} rows={2} className="mono-font mt-0.5 w-full resize-y border border-border bg-transparent p-1 text-[11px] text-foreground" />
          </label>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-foreground">
            <label className="flex items-center gap-1">
              Theme
              <select value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value as Embed["theme"] })} className="h-6 border border-border bg-transparent px-1 text-[11px]">
                <option value="auto">Follows the visitor</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Live
            </label>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" disabled={busy || !draft.label.trim() || draft.widgets.length === 0} onClick={() => void save()}>{draft.id ? "SAVE" : "CREATE WIDGET"}</Button>
            {draft.id && <Button size="sm" variant="ghost" onClick={() => setDraft({ label: "", widgets: ["verify", "check"], origins: "", depositAddress: "", theme: "auto", active: true })}>CANCEL</Button>}
          </div>
        </div>
      )}
    </section>
  );
}
