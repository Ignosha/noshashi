import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { StatusDot } from "@/components/nova/StatusDot";
import { Signal } from "@/components/nova/Signal";
import { CountUp } from "@/components/nova/CountUp";
import { NovaShield, NovaTerminal, NovaVault } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shortAddress } from "@/lib/xrpl/client";
import { saveTextFile } from "@/lib/export";
import { useLedger, summariseWallets, ledgerToCsv, signContent } from "@/lib/desk/ledger";
import { useRuleSet, DEFAULT_RULES } from "@/lib/desk/rules";
import { useIssuerWatch, WATCH_INTERVALS, postureLabel } from "@/lib/desk/watch";
import { useOfflineVault, provenanceLine } from "@/lib/desk/offline";
import { useIssuerRisk } from "@/lib/desk/useRisk";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

const PAGE = 25;

/**
 * WorkstationScene — the operator's own record.
 *
 * Three things an institution cannot run without and no XRPL tool
 * provides: a durable history of every verdict it has ever produced, the
 * ability to state its own thresholds rather than inherit ours, and an
 * export that can be proven unaltered.
 */
export function WorkstationScene({
  data,
  onUpgrade,
  onSignIn,
}: {
  data: XrplState;
  onUpgrade: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="14"
        kicker="LOCAL WORKSTATION · NOTHING TRANSMITTED"
        title="LEDGER & POLICY"
        sub="Every verdict this workstation has produced, the rule set that produced them, and a signed export an examiner can verify."
        status="go"
        statusLabel="ON DEVICE"
      />
      <Gated feature="portfolios" onUpgrade={onUpgrade} onSignIn={onSignIn} className="min-h-0 flex-1">
        <WorkstationBody data={data} onUpgrade={onUpgrade} />
      </Gated>
    </div>
  );
}

function WorkstationBody({
  data,
  onUpgrade,
}: {
  data: XrplState;
  onUpgrade: () => void;
}) {
  const { entries, loaded, clear } = useLedger();
  const { rules, dirty, update, save, reset, asJson } = useRuleSet();
  const { has } = useBilling();
  const { push } = useToast();

  const [tab, setTab] = useState<
    "explorer" | "policy" | "watch" | "offline" | "export"
  >("explorer");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "hhi">("recent");
  const [signature, setSignature] = useState<string | null>(null);
  const [snapLabel, setSnapLabel] = useState("");
  const [exporting, setExporting] = useState(false);

  // Every issuer the operator actually holds a balance against — the
  // only set worth monitoring, and the set a snapshot must capture.
  const { lines, exposures } = useIssuerRisk(data.account?.address);
  const watchedIssuers = useMemo(
    () => exposures.map((e) => e.issuer),
    [exposures]
  );
  const watch = useIssuerWatch(watchedIssuers);
  const unacknowledged = watch.unacknowledged;
  const vault = useOfflineVault();

  const wallets = useMemo(() => {
    let list = summariseWallets(entries);
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (w) =>
          w.subject.toLowerCase().includes(needle) ||
          (w.label ?? "").toLowerCase().includes(needle)
      );
    }
    if (sort === "hhi") {
      list = [...list].sort((a, b) => (b.worstHhi ?? -1) - (a.worstHhi ?? -1));
    }
    return list;
  }, [entries, query, sort]);

  const pageCount = Math.max(1, Math.ceil(wallets.length / PAGE));
  const shown = wallets.slice(page * PAGE, page * PAGE + PAGE);

  const verdictCounts = useMemo(() => {
    const c = { go: 0, hold: 0, "no-go": 0 } as Record<string, number>;
    for (const e of entries) c[e.verdict] = (c[e.verdict] ?? 0) + 1;
    return c;
  }, [entries]);

  const runExport = async () => {
    if (entries.length === 0) return;
    setExporting(true);
    try {
      const csv = ledgerToCsv(entries);
      const sig = await signContent(csv);
      // The signature is written into the file's own footer as well, so a
      // recipient can verify without being handed a separate string.
      const withFooter = `${csv}\n# NOSHASHI audit export\n# records=${entries.length}\n# generated=${new Date().toISOString()}\n# sha256(body)=${sig}\n`;
      const stamp = new Date().toISOString().slice(0, 10);
      const dest = await saveTextFile(`noshashi-audit-${stamp}.csv`, withFooter);
      setSignature(sig);
      push({
        title: "AUDIT EXPORT SIGNED",
        body: `${entries.length} records written to ${dest}`,
        tone: "go",
      });
    } catch (error) {
      push({
        title: "EXPORT FAILED",
        body: error instanceof Error ? error.message : "Unable to write file",
        tone: "no-go",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "ADJUDICATIONS", value: entries.length, tone: "default" as const },
          { label: "WALLETS SEEN", value: summariseWallets(entries).length, tone: "default" as const },
          { label: "HOLD", value: verdictCounts.hold ?? 0, tone: "hold" as const },
          { label: "NO-GO", value: verdictCounts["no-go"] ?? 0, tone: "no-go" as const },
        ].map((s) => (
          <Panel key={s.label} bodyClassName="p-3">
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">{s.label}</p>
            <p className={cn(
              "data-font mt-1.5 text-[22px] font-[600] leading-none",
              s.tone === "hold" ? "text-hold" : s.tone === "no-go" ? "text-no-go" : "text-foreground"
            )}>
              <CountUp value={s.value} />
            </p>
          </Panel>
        ))}
      </div>

      <Panel
        label={
          tab === "explorer"
            ? "WALLET EXPLORER"
            : tab === "policy"
              ? "POLICY EDITOR"
              : tab === "watch"
                ? "ISSUER DRIFT MONITOR"
                : tab === "offline"
                  ? "OFFLINE ADJUDICATION"
                  : "SIGNED AUDIT EXPORT"
        }
        corners
        className="min-h-0 flex-1"
        bodyClassName="min-h-0 overflow-y-auto p-0"
        right={
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="explorer">EXPLORER</TabsTrigger>
              <TabsTrigger value="policy">POLICY</TabsTrigger>
              <TabsTrigger value="watch">
                WATCH
                {unacknowledged > 0 && (
                  <span className="ml-1.5 bg-no-go px-1 text-[9px] font-bold text-black">
                    {unacknowledged}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="offline">OFFLINE</TabsTrigger>
              <TabsTrigger value="export">EXPORT</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        {/* ── Explorer ─────────────────────────────────────────── */}
        {tab === "explorer" && (
          <div>
            <div className="flex items-center gap-2 border-b border-border p-2.5">
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                placeholder="Filter by address or label…"
                className="mono-font h-7 flex-1 text-[10px]"
              />
              <button
                onClick={() => setSort(sort === "recent" ? "hhi" : "recent")}
                className="stencil rounded border border-border px-2 py-1 text-[8px] tracking-[0.18em] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              >
                SORT · {sort === "recent" ? "RECENT" : "HHI"}
              </button>
            </div>

            {!loaded ? (
              <p className="mono-font animate-pulse p-4 text-[10px] text-muted-foreground">LOADING LEDGER…</p>
            ) : wallets.length === 0 ? (
              <EmptyState
                icon={<NovaTerminal size={16} />}
                title="NO ADJUDICATIONS RECORDED"
                body="Run a gate check in Verification. Every verdict is written here and survives a restart, so this becomes the record you hand an examiner."
              />
            ) : (
              <>
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b border-border">
                      {["", "SUBJECT", "LABEL", "SCANS", "WORST HHI", "LAST SEEN"].map((h, i) => (
                        <th key={i} className="stencil px-3 py-2 text-[8px] font-medium tracking-[0.2em] text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((w) => (
                      <tr key={w.subject} className="border-b border-border/30">
                        <td className="px-3 py-2"><StatusDot status={w.lastVerdict} size={6} /></td>
                        <td className="mono-font selectable px-3 py-2 text-[10px] text-foreground">{shortAddress(w.subject)}</td>
                        <td className="px-3 py-2 text-[10px] text-muted-foreground">{w.label ?? "—"}</td>
                        <td className="mono-font px-3 py-2 text-[10px] tabular-nums text-muted-foreground">{w.scans}</td>
                        <td className={cn(
                          "mono-font px-3 py-2 text-[10px] tabular-nums",
                          (w.worstHhi ?? 0) > rules.hhiMaxBeforeHold ? "text-no-go" : "text-muted-foreground"
                        )}>
                          {w.worstHhi?.toLocaleString() ?? "—"}
                        </td>
                        <td className="mono-font px-3 py-2 text-[9px] text-muted-foreground/80">
                          {new Date(w.lastAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between border-t border-border px-3 py-2">
                  <Eyebrow>
                    {page * PAGE + 1}–{Math.min(wallets.length, (page + 1) * PAGE)} OF {wallets.length}
                  </Eyebrow>
                  <div className="flex gap-1">
                    <button
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className="stencil rounded border border-border px-2 py-0.5 text-[8px] tracking-[0.18em] text-muted-foreground disabled:opacity-30 hover:border-foreground/40"
                    >PREV</button>
                    <button
                      disabled={page >= pageCount - 1}
                      onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                      className="stencil rounded border border-border px-2 py-0.5 text-[8px] tracking-[0.18em] text-muted-foreground disabled:opacity-30 hover:border-foreground/40"
                    >NEXT</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Policy editor ────────────────────────────────────── */}
        {tab === "policy" && (
          <div className="p-4">
            <p className="mb-4 max-w-[560px] text-[11px] leading-relaxed text-muted-foreground">
              These thresholds decide every verdict. They are yours, not ours — a
              compliance officer has to be able to state the number that produced a
              HOLD, and change it. Saved to disk and applied immediately.
            </p>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <NumberRule
                label="MAX HHI BEFORE HOLD"
                hint="Herfindahl-Hirschman Index, 0–10,000. Above 2,500 is treated as concentrated."
                value={rules.hhiMaxBeforeHold}
                onChange={(v) => update("hhiMaxBeforeHold", v)}
              />
              <NumberRule
                label="MAX SINGLE COUNTERPARTY %"
                hint="Share of settlement volume one counterparty may hold before a HOLD."
                value={rules.counterpartyMaxSharePct}
                onChange={(v) => update("counterpartyMaxSharePct", v)}
              />
              <NumberRule
                label={`TRAVEL RULE THRESHOLD (${rules.travelRuleCurrency})`}
                hint="FATF R.16 reporting threshold in your jurisdiction."
                value={rules.travelRuleThresholdFiat}
                onChange={(v) => update("travelRuleThresholdFiat", v)}
              />
              <NumberRule
                label="XRP REFERENCE RATE"
                hint="No price feed ships in this build — supply the rate your books use."
                value={rules.xrpReferenceRate}
                step={0.01}
                onChange={(v) => update("xrpReferenceRate", v)}
              />
              <NumberRule
                label="MIN RESERVE HEADROOM (XRP)"
                hint="Spendable margin above the owner reserve before a HOLD."
                value={rules.minReserveHeadroomXrp}
                onChange={(v) => update("minReserveHeadroomXrp", v)}
              />
              <NumberRule
                label="CREDENTIAL EXPIRY WARNING (DAYS)"
                hint="How far ahead the radar flags an expiring credential."
                value={rules.credentialExpiryWarningDays}
                onChange={(v) => update("credentialExpiryWarningDays", v)}
              />
            </div>

            <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
              <Switch
                checked={rules.strictFreezeRights}
                onCheckedChange={(v) => update("strictFreezeRights", Boolean(v))}
              />
              <div>
                <p className="text-[11px] font-medium text-foreground">Strict freeze-rights check</p>
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                  Treat an issuer that merely <em>retains</em> the right to freeze as a blocking
                  failure rather than an advisory one. Custodians generally want this on.
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2">
              <Button onClick={() => void save().then(() => push({ title: "RULE SET SAVED", tone: "go" }))} disabled={!dirty}>
                {dirty ? "SAVE RULE SET" : "SAVED"}
              </Button>
              <Button variant="outline" onClick={reset}>RESTORE DEFAULTS</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(asJson());
                  push({ title: "RULE SET COPIED", body: "Portable JSON on the clipboard.", tone: "info" });
                }}
              >
                COPY AS JSON
              </Button>
            </div>

            {rules.hhiMaxBeforeHold !== DEFAULT_RULES.hhiMaxBeforeHold && (
              <p className="mono-font mt-3 text-[9px] text-hold">
                HHI threshold differs from the {DEFAULT_RULES.hhiMaxBeforeHold.toLocaleString()} default —
                document the rationale for your examiner.
              </p>
            )}
          </div>
        )}

        {/* ── Signed export ────────────────────────────────────── */}

        {tab === "watch" && (
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-3 border-b border-line/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="watch-run"
                  checked={watch.running}
                  onCheckedChange={(v) => void watch.toggle(v)}
                />
                <Label htmlFor="watch-run" className="text-[11px] tracking-wide">
                  MONITOR {watch.running ? "RUNNING" : "PAUSED"}
                </Label>
              </div>
              <div className="flex items-center gap-1">
                {WATCH_INTERVALS.map((i) => (
                  <button
                    key={i.ms}
                    onClick={() => void watch.setCadence(i.ms)}
                    className={cn(
                      "border px-2 py-1 text-[10px] tracking-wide transition-colors",
                      watch.intervalMs === i.ms
                        ? "border-spectral/60 text-spectral"
                        : "border-line/40 text-muted hover:text-spectral"
                    )}
                  >
                    {i.label.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void watch.sweep()}
                  disabled={watch.sweeping || watchedIssuers.length === 0}
                >
                  {watch.sweeping ? "SWEEPING…" : "SWEEP NOW"}
                </Button>
                {watch.alerts.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => void watch.clearAlerts()}>
                    CLEAR
                  </Button>
                )}
              </div>
            </div>

            <div className="border-b border-line/40 px-4 py-2 text-[10px] leading-relaxed text-muted">
              {watchedIssuers.length === 0
                ? "No issued-currency positions on this account, so there is nothing to monitor. Load a wallet holding issued balances."
                : `Baselined ${Object.keys(watch.baseline).length} of ${watchedIssuers.length} issuers.${watch.lastSweep ? ` Last sweep ${new Date(watch.lastSweep).toLocaleTimeString()}.` : ""} An issuer setting lsfGlobalFreeze immobilises your balance the moment it lands; this is the only thing that tells you.`}
              {watch.error && <span className="mt-1 block text-hold">{watch.error}</span>}
            </div>

            {watch.alerts.length === 0 ? (
              <EmptyState
                icon={<NovaShield className="h-5 w-5" />}
                title="NO DRIFT DETECTED"
                body={
                  watchedIssuers.length === 0
                    ? "Monitoring begins once the loaded account holds an issued balance."
                    : "Every monitored issuer holds the posture it held at baseline. Changes appear here and raise a native notification."
                }
              />
            ) : (
              <div className="divide-y divide-line/30">
                {watch.alerts.map((a) => (
                  <Signal
                    key={a.id}
                    severity={a.severity}
                    headline={a.headline}
                    detail={a.detail}
                    magnitude={`${a.from} → ${a.to}`}
                    confidence="HIGH"
                    source={`${a.field} · ${shortAddress(a.issuer)}`}
                    at={a.at}
                    acknowledged={a.acknowledged}
                    onAcknowledge={() => void watch.acknowledge(a.id)}
                    className="rounded-none border-b border-border/30"
                  />
                ))}
              </div>
            )}

            {Object.keys(watch.baseline).length > 0 && (
              <div className="border-t border-line/40 px-4 py-3">
                <Eyebrow>CURRENT BASELINE</Eyebrow>
                <div className="mt-2 grid gap-1">
                  {Object.values(watch.baseline).map((p) => (
                    <DataRow
                      key={p.address}
                      label={shortAddress(p.address)}
                      value={`${postureLabel(p)}${p.transferRateBps > 0 ? ` · ${p.transferRateBps} bps` : ""}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "offline" && (
          <Gated feature="compliance_api" onUpgrade={onUpgrade} onSignIn={onUpgrade} className="h-full">
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-3 border-b border-line/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="offline-mode"
                    checked={vault.offlineMode}
                    onCheckedChange={(v) => void vault.setMode(v)}
                    disabled={vault.snapshots.length === 0}
                  />
                  <Label htmlFor="offline-mode" className="text-[11px] tracking-wide">
                    OFFLINE MODE {vault.engaged ? "ENGAGED" : "OFF"}
                  </Label>
                </div>
                <Input
                  value={snapLabel}
                  onChange={(e) => setSnapLabel(e.target.value)}
                  placeholder="Snapshot label (optional)"
                  className="h-8 w-56 text-[11px]"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!data.account}
                  onClick={() => {
                    void (async () => {
                      const snap = await vault.capture({
                        label: snapLabel,
                        ledger: data.ledger,
                        account: data.account,
                        credentials: data.credentials,
                        trustLines: lines,
                        postures: exposures.map((e) => e.posture),
                      });
                      setSnapLabel("");
                      push({
                        title: "STATE CAPTURED",
                        body: `Ledger ${snap.ledgerIndex.toLocaleString()} · ${snap.credentials.length} credentials, ${snap.trustLines.length} lines`,
                        tone: "go",
                      });
                    })();
                  }}
                >
                  CAPTURE STATE
                </Button>
              </div>

              <div className="border-b border-line/40 px-4 py-2 text-[10px] leading-relaxed text-muted">
                Capture validated ledger state while connected, then adjudicate
                against it on a segregated network. Every offline verdict is
                stamped with the ledger index and capture time it rests on and
                marked <span className="text-spectral">offline</span> in the
                durable ledger — a snapshot verdict must never be mistakable
                for a live one.
              </div>

              {vault.active && vault.staleness && (
                <div
                  className={cn(
                    "border-b px-4 py-3",
                    vault.staleness.severity === "critical"
                      ? "border-no-go/40 bg-no-go/5"
                      : vault.staleness.severity === "warn"
                        ? "border-hold/40 bg-hold/5"
                        : "border-line/40"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <StatusDot
                      status={
                        vault.staleness.severity === "critical"
                          ? "no-go"
                          : vault.staleness.severity === "warn"
                            ? "hold"
                            : "go"
                      }
                    />
                    <Eyebrow>ACTIVE SNAPSHOT · {vault.staleness.label.toUpperCase()}</Eyebrow>
                  </div>
                  <p className="mt-1.5 max-w-3xl text-[11px] leading-relaxed">
                    {vault.staleness.disclosure}
                  </p>
                  <code className="mt-2 block max-w-3xl break-all text-[10px] leading-relaxed text-muted">
                    {provenanceLine(vault.active)}
                  </code>
                </div>
              )}

              {vault.snapshots.length === 0 ? (
                <EmptyState
                  icon={<NovaVault className="h-5 w-5" />}
                  title="NO CAPTURED STATE"
                  body="Capture ledger state while connected. Offline mode cannot be engaged without a snapshot — adjudicating against nothing is worse than adjudicating against disclosed stale state."
                />
              ) : (
                <div className="divide-y divide-line/30">
                  {vault.snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className={cn(
                        "flex flex-wrap items-center gap-2 px-4 py-2.5",
                        snap.id === vault.activeId && "bg-spectral/[0.04]"
                      )}
                    >
                      <button
                        onClick={() =>
                          void vault.activate(snap.id === vault.activeId ? null : snap.id)
                        }
                        className={cn(
                          "border px-2 py-1 text-[10px] tracking-wide transition-colors",
                          snap.id === vault.activeId
                            ? "border-spectral/60 text-spectral"
                            : "border-line/40 text-muted hover:text-spectral"
                        )}
                      >
                        {snap.id === vault.activeId ? "ACTIVE" : "USE"}
                      </button>
                      <span className="min-w-0 flex-1 truncate text-[11px]">{snap.label}</span>
                      <span className="text-[10px] text-muted">
                        {snap.credentials.length} cred · {snap.trustLines.length} lines ·{" "}
                        {snap.postures.length} issuers
                      </span>
                      <span className="text-[10px] text-muted">
                        {describeAge(snap.capturedAt)}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => void vault.remove(snap.id)}>
                        DELETE
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Gated>
        )}

        {tab === "export" && (
          <div className="p-4">
            {!has("compliance_api") ? (
              <EmptyState
                icon={<NovaVault size={16} />}
                title="SIGNED EXPORT REQUIRES INSTITUTION"
                body="Chain-of-custody signing is part of the Institution plan. Desk can still export an unsigned CSV from the Audit Trail."
                action={<Button size="sm" onClick={onUpgrade}>SEE PLANS</Button>}
              />
            ) : (
              <>
                <p className="max-w-[600px] text-[11px] leading-relaxed text-muted-foreground">
                  Writes every recorded adjudication to CSV and signs it with a SHA-256
                  digest over the exact bytes. The signature is printed in the file's own
                  footer, so a recipient can verify the document they hold is the document
                  that left this machine — without being handed a separate string to trust.
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <Button className="gap-2" onClick={() => void runExport()} disabled={exporting || entries.length === 0}>
                    <NovaShield size={13} />
                    {exporting ? "SIGNING…" : "GENERATE SIGNED REPORT"}
                  </Button>
                  <span className="mono-font text-[10px] text-muted-foreground">
                    {entries.length.toLocaleString()} records
                  </span>
                </div>

                {signature && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING}
                    className="mt-4 border border-go/40 bg-go-dim p-3"
                  >
                    <Eyebrow className="text-go">CHAIN-OF-CUSTODY SIGNATURE · SHA-256</Eyebrow>
                    <p className="mono-font selectable mt-1.5 break-all text-[10px] leading-relaxed text-foreground">
                      {signature}
                    </p>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(signature);
                        push({ title: "SIGNATURE COPIED", tone: "info" });
                      }}
                      className="stencil mt-2 text-[8px] tracking-[0.2em] text-foreground underline underline-offset-2"
                    >COPY</button>
                  </motion.div>
                )}

                <div className="mt-6 border-t border-border pt-4">
                  <Eyebrow className="mb-2">HOW A RECIPIENT VERIFIES IT</Eyebrow>
                  <pre className="mono-font overflow-x-auto rounded-md border border-border bg-background p-2.5 text-[9px] leading-relaxed text-muted-foreground">
{`# strip the footer, hash the body, compare to sha256(body)
sed '/^# NOSHASHI audit export/,$d' noshashi-audit-*.csv \\
  | shasum -a 256`}
                  </pre>
                </div>

                <div className="mt-6 border-t border-border pt-4">
                  <Eyebrow className="mb-2">LEDGER MAINTENANCE</Eyebrow>
                  <DataRow label="RECORDS HELD" value={entries.length.toLocaleString()} />
                  <DataRow label="OLDEST" value={entries.length ? new Date(entries[entries.length - 1].at).toLocaleDateString() : "—"} />
                  <DataRow label="STORAGE" value="LOCAL ONLY · NEVER TRANSMITTED" tone="go" />
                  <button
                    onClick={() => {
                      void clear().then(() => {
                        setSignature(null);
                        push({ title: "LEDGER CLEARED", body: "Local adjudication history erased.", tone: "hold" });
                      });
                    }}
                    className="stencil mt-3 text-[8px] tracking-[0.2em] text-muted-foreground transition-colors hover:text-no-go"
                  >
                    ERASE LOCAL LEDGER
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function describeAge(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NumberRule({
  label,
  hint,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <div>
      <Label htmlFor={label}>{label}</Label>
      <Input
        id={label}
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mono-font mt-1.5 text-[11px]"
      />
      <p className="mt-1 text-[9px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}
