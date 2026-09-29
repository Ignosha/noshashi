import { useCallback, useEffect, useMemo, useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { NovaCredit, NovaShield, NovaTerminal, NovaVault } from "@/components/nova/NovaIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shortAddress } from "@/lib/xrpl/client";
import { truncateMiddle } from "@/lib/format";
import { saveTextFile } from "@/lib/export";
import { useSetting } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { evidencePackage, readTrailPage, screenCounterparties, type AuditRow, type Screening } from "@/lib/compliance/audit";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { cn } from "@/lib/utils";

type Filter = "all" | "in" | "out" | "flagged";
const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
/** Pages of 200 read per LOAD MORE. */
const PAGES_PER_LOAD = 2;

/**
 * HistoryScene — the audit trail a compliance officer files.
 *
 * Any account's validated history, read from account_tx: what was actually
 * delivered (partial payments shown for what they are), the destination
 * tag that ties a payment to a customer, memos, and every counterparty
 * screened against the OFAC SDN list and the confirmed scam registry. The
 * export is a CSV plus a manifest naming the CSV's SHA-256 and the ledger
 * range, so the filed copy can be shown to be the one produced here.
 */
export function HistoryScene({ data }: { data: XrplState }) {
  const { account } = data;
  const { push } = useToast();

  const [subjectInput, setSubjectInput] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [marker, setMarker] = useState<unknown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screening, setScreening] = useState<Screening | null>(null);
  const [screeningBusy, setScreeningBusy] = useState(false);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [threshold, setThreshold] = useSetting("audit.thresholdXrp", 10_000);
  const [exporting, setExporting] = useState(false);

  // Follow the loaded wallet until the operator audits another account.
  useEffect(() => {
    if (!subject && account?.address) {
      setSubjectInput(account.address);
      void load(account.address);
    }
  }, [account?.address]);

  const screen = useCallback(async (all: AuditRow[]) => {
    setScreeningBusy(true);
    try {
      setScreening(await screenCounterparties(all));
    } finally {
      setScreeningBusy(false);
    }
  }, []);

  const load = async (who: string, more = false) => {
    if (!ADDRESS.test(who)) {
      setError("Enter a classic r-address to audit.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let next: unknown = more ? marker : undefined;
      let collected = more ? rows : [];
      for (let i = 0; i < PAGES_PER_LOAD; i++) {
        const page = await readTrailPage(who, next);
        collected = [...collected, ...page.rows];
        next = page.marker;
        if (!next) break;
      }
      setSubject(who);
      setRows(collected);
      setMarker(next ?? null);
      if (!more) setScreening(null);
      void screen(collected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The ledger could not be read.");
    } finally {
      setLoading(false);
    }
  };

  const flagOf = useCallback(
    (r: AuditRow) => {
      const flags: string[] = [];
      if (r.counterparty && screening?.sanctions[r.counterparty]) flags.push("OFAC");
      if (r.counterparty && screening?.threats[r.counterparty]) flags.push("SCAM");
      if (r.partial) flags.push("PARTIAL");
      if (r.deliveredXrp !== null && r.deliveredXrp >= threshold) flags.push("≥ THRESHOLD");
      return flags;
    },
    [screening, threshold]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "in" && r.direction !== "in") return false;
      if (filter === "out" && r.direction !== "out") return false;
      if (filter === "flagged" && flagOf(r).length === 0) return false;
      if (!needle) return true;
      return (
        r.hash.toLowerCase().includes(needle) ||
        (r.counterparty ?? "").toLowerCase().includes(needle) ||
        r.type.toLowerCase().includes(needle) ||
        String(r.destinationTag ?? "").includes(needle) ||
        r.memos.some((m) => m.toLowerCase().includes(needle))
      );
    });
  }, [rows, filter, query, flagOf]);

  const totals = useMemo(() => {
    let inbound = 0;
    let outbound = 0;
    let fees = 0;
    for (const r of filtered) {
      if (r.direction === "out" || (r.direction === "other" && r.counterparty === null)) fees += r.feeXrp;
      if (r.deliveredXrp === null) continue;
      if (r.direction === "in") inbound += r.deliveredXrp;
      if (r.direction === "out") outbound += r.deliveredXrp;
    }
    return { inbound, outbound, fees };
  }, [filtered]);

  const flagged = rows.filter((r) => flagOf(r).length > 0).length;
  const sanctionedHits = screening ? Object.keys(screening.sanctions).length : 0;
  const scamHits = screening ? Object.keys(screening.threats).length : 0;

  const exportEvidence = async () => {
    if (!subject || filtered.length === 0) return;
    setExporting(true);
    try {
      const pkg = await evidencePackage(subject, filtered, screening, threshold);
      const stamp = new Date().toISOString().slice(0, 10);
      const base = `noshashi-audit-${subject.slice(0, 8)}-${stamp}`;
      const csvPath = await saveTextFile(`${base}.csv`, pkg.csv);
      await saveTextFile(`${base}.manifest.json`, pkg.manifest, "application/json");
      push({ title: "AUDIT TRAIL EXPORTED", body: `${filtered.length} records · SHA-256 ${pkg.digest.slice(0, 16)}… · ${csvPath}`, tone: "go" });
    } catch (e) {
      push({ title: "EXPORT FAILED", body: e instanceof Error ? e.message : "Unable to write file", tone: "no-go" });
    } finally {
      setExporting(false);
    }
  };

  const ledgers = rows.map((r) => r.ledger).filter((n) => n > 0);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <SceneHeader
        index="06"
        kicker="AUDIT TRAIL · ACCOUNT_TX · VALIDATED"
        title="AUDIT TRAIL"
        sub="Any account's validated history with delivered amounts, destination tags and memos, every counterparty screened against the OFAC SDN list and the scam registry, exported with a SHA-256 manifest."
        status={sanctionedHits > 0 ? "no-go" : flagged > 0 ? "hold" : rows.length ? "go" : "hold"}
        statusLabel={loading ? "READING" : sanctionedHits ? `${sanctionedHits} SANCTIONED` : `${rows.length} RECORDS`}
        right={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void exportEvidence()} disabled={exporting || filtered.length === 0}>
            <NovaVault size={13} />
            {exporting ? "WRITING…" : "EXPORT EVIDENCE"}
          </Button>
        }
      />

      <form
        className="flex shrink-0 flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(subjectInput.trim());
        }}
      >
        <Input value={subjectInput} onChange={(e) => setSubjectInput(e.target.value)} placeholder="Account to audit (r-address)" className="mono-font h-8 min-w-[260px] flex-1 text-[12px]" spellCheck={false} aria-label="Account to audit" />
        <Button size="sm" type="submit" disabled={loading}>
          {loading ? "READING…" : "READ HISTORY"}
        </Button>
        <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          Flag at or above
          <Input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))}
            className="mono-font h-8 w-[110px] text-[12px]"
            aria-label="Reporting threshold in XRP"
          />
          XRP
        </label>
      </form>

      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile label="INBOUND (DELIVERED)" value={`${totals.inbound.toLocaleString(undefined, { maximumFractionDigits: 2 })} XRP`} icon={<NovaCredit size={14} />} />
        <Tile label="OUTBOUND (DELIVERED)" value={`${totals.outbound.toLocaleString(undefined, { maximumFractionDigits: 2 })} XRP`} icon={<NovaTerminal size={14} />} />
        <Tile
          label="COUNTERPARTY SCREENING"
          value={screeningBusy ? "SCREENING…" : screening ? `${sanctionedHits + scamHits} HIT${sanctionedHits + scamHits === 1 ? "" : "S"}` : "—"}
          tone={sanctionedHits ? "no-go" : scamHits ? "hold" : screening ? "go" : undefined}
          hint={screening ? `${screening.screened} counterparties · OFAC SDN + scam registry${screening.unchecked.length ? ` · NOT CHECKED: ${screening.unchecked.join(", ")}` : ""}` : "Runs after the history is read"}
          icon={<NovaShield size={14} />}
        />
        <Tile label="FLAGGED RECORDS" value={String(flagged)} tone={flagged ? "hold" : undefined} hint={`OFAC, scam registry, partial payments, ≥ ${threshold.toLocaleString()} XRP`} icon={<NovaVault size={14} />} />
      </div>

      <Panel
        label="LEDGER RECORDS"
        className="min-h-[420px] flex-1"
        bodyClassName="flex min-h-0 flex-col p-0"
        right={
          <div className="flex items-center gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hash, account, tag, memo…" className="mono-font h-7 w-[200px] text-[12px]" spellCheck={false} aria-label="Filter records" />
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                <TabsTrigger value="all">ALL</TabsTrigger>
                <TabsTrigger value="in">IN</TabsTrigger>
                <TabsTrigger value="out">OUT</TabsTrigger>
                <TabsTrigger value="flagged">FLAGGED</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
      >
        {error ? (
          <EmptyState className="flex-1" icon={<NovaTerminal size={16} />} title="HISTORY UNAVAILABLE" body={error} />
        ) : filtered.length === 0 ? (
          <EmptyState
            className="flex-1"
            icon={<NovaCredit size={16} />}
            title={loading ? "READING THE LEDGER" : rows.length === 0 ? "NO RECORDS" : "NO MATCHING RECORDS"}
            body={
              loading
                ? "Reading validated history, newest first."
                : rows.length === 0
                  ? subject
                    ? "This account has no validated transactions."
                    : "Enter an account to audit, or load a wallet."
                  : "No record matches the current filter."
            }
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  {["", "DATE (UTC)", "TYPE", "COUNTERPARTY", "DELIVERED", "TAG", "FLAGS", "RESULT", "HASH"].map((h, i) => (
                    <th key={`${h}-${i}`} className="stencil px-3 py-2 text-[10.5px] font-medium tracking-[0.1em] text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const flags = flagOf(r);
                  return (
                    <tr key={r.hash} className={cn("border-b border-border/30 transition-colors hover:bg-secondary/40", flags.includes("OFAC") && "bg-no-go/10")}>
                      <td className="px-3 py-1.5 text-[12px] text-muted-foreground" title={r.direction}>
                        {r.direction === "in" ? "↓" : r.direction === "out" ? "↑" : "↔"}
                      </td>
                      <td className="mono-font whitespace-nowrap px-3 py-1.5 text-[11.5px] text-muted-foreground">{r.date.replace("T", " ").slice(0, 19)}</td>
                      <td className="mono-font px-3 py-1.5 text-[12px] text-foreground/85">{r.type}</td>
                      <td className="mono-font selectable px-3 py-1.5 text-[12px] text-muted-foreground">{r.counterparty ? shortAddress(r.counterparty) : "—"}</td>
                      <td className="mono-font whitespace-nowrap px-3 py-1.5 text-[12px] tabular-nums text-foreground">
                        {r.delivered ? `${Number(r.delivered.value).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${r.delivered.currency}` : "—"}
                      </td>
                      <td className="mono-font px-3 py-1.5 text-[12px] tabular-nums text-muted-foreground">{r.destinationTag ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        <span className="flex flex-wrap gap-1">
                          {flags.map((f) => (
                            <Badge key={f} variant={f === "OFAC" ? "no-go" : "hold"} className="text-[10px]">
                              {f}
                            </Badge>
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant={r.result === "tesSUCCESS" ? "go" : "no-go"} className="text-[10px]">
                          {r.result}
                        </Badge>
                      </td>
                      <td className="mono-font selectable px-3 py-1.5 text-[11.5px] text-muted-foreground" title={r.memos.length ? `Memo: ${r.memos.join(" | ")}` : r.hash}>
                        {truncateMiddle(r.hash, 6, 4)}
                        {r.memos.length > 0 && <span className="ml-1 text-hold">✉</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1.5">
          <Eyebrow>
            {filtered.length} OF {rows.length} RECORDS{ledgers.length ? ` · LEDGERS ${Math.min(...ledgers).toLocaleString()}–${Math.max(...ledgers).toLocaleString()}` : ""}
          </Eyebrow>
          <span className="flex items-center gap-2">
            <span className="mono-font text-[11px] text-muted-foreground">SUBJECT {subject ? shortAddress(subject) : "—"}</span>
            {marker !== null && subject && (
              <Button size="sm" variant="outline" disabled={loading} onClick={() => void load(subject, true)}>
                {loading ? "READING…" : "LOAD OLDER"}
              </Button>
            )}
          </span>
        </div>
      </Panel>
    </div>
  );
}

function Tile({ label, value, hint, icon, tone }: { label: string; value: string; hint?: string; icon: React.ReactNode; tone?: "go" | "hold" | "no-go" }) {
  return (
    <Panel bodyClassName="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="stencil text-[10.5px] tracking-[0.1em] text-muted-foreground">{label}</p>
          <p className={cn("data-font mt-1.5 text-[19px] font-[600] leading-none tabular-nums", tone === "no-go" ? "text-no-go" : tone === "hold" ? "text-hold" : tone === "go" ? "text-go" : "text-foreground")}>{value}</p>
          {hint && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
        </div>
        <span className="shrink-0 text-muted-foreground/70">{icon}</span>
      </div>
    </Panel>
  );
}
