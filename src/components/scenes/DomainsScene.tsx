import { useCallback, useEffect, useMemo, useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { NovaGrid, NovaShield } from "@/components/nova/NovaIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortAddress } from "@/lib/xrpl/client";
import { truncateMiddle } from "@/lib/format";
import { saveTextFile } from "@/lib/export";
import { useToast } from "@/lib/toast";
import {
  checkAdmission,
  directoryDomains,
  domainsOwnedBy,
  isAddress,
  isDomainId,
  readDomain,
  typeLabel,
  validatedLedger,
  type AdmissionRecord,
  type DirectoryDomain,
  type DomainEntry,
  type LedgerAt,
  type RegistryStatus,
} from "@/lib/compliance/registry";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { cn } from "@/lib/utils";

/** PermissionedDomains amendment, by name and by ID, as server_info lists it. */
const AMENDMENT = ["PermissionedDomains", "A730EB18A9D4BB52502C898589558B4CCEB4BE10044500EE5581137A2E80E849"];
/** Pages a full sweep of mainnet state takes at 2,048 objects a page (Sept 2026). */
const APPROX_PAGES = 9_600;

/**
 * DomainsScene — permissioned domains (XLS-80) on XRPL mainnet.
 *
 * For a compliance officer the question is never "what domains could
 * exist", it is "which domains exist, what do they demand, and would this
 * counterparty be let in". The directory is every PermissionedDomain object
 * on mainnet, from the registry sweep; the detail and the admission check
 * are read live from the latest validated ledger, and the admission record
 * is digested so it can be filed and re-checked.
 */
export function DomainsScene({ data }: { data: XrplState }) {
  const { server, connected } = data;
  const { push } = useToast();

  const [directory, setDirectory] = useState<DirectoryDomain[]>([]);
  const [status, setStatus] = useState<RegistryStatus | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [loadingDirectory, setLoadingDirectory] = useState(true);

  const [query, setQuery] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [lookedUp, setLookedUp] = useState<DomainEntry[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState<{ domain: DomainEntry | null; ledger: LedgerAt } | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const [counterparty, setCounterparty] = useState("");
  const [checking, setChecking] = useState(false);
  const [record, setRecord] = useState<AdmissionRecord | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const loadDirectory = useCallback(async () => {
    setLoadingDirectory(true);
    setDirectoryError(null);
    try {
      const r = await directoryDomains();
      setDirectory(r.domains);
      setStatus(r.status);
    } catch (e) {
      setDirectoryError(e instanceof Error ? e.message : "The registry could not be read.");
    } finally {
      setLoadingDirectory(false);
    }
  }, []);
  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  // Everything in view: the directory plus anything looked up live that the
  // directory has not reached yet.
  const rows = useMemo(() => {
    const byId = new Map<string, DomainEntry & { source: "directory" | "live" }>();
    for (const d of directory) byId.set(d.domainId, { ...d, source: "directory" });
    for (const d of lookedUp) if (!byId.has(d.domainId)) byId.set(d.domainId, { ...d, source: "live" });
    const needle = query.trim().toUpperCase();
    const all = [...byId.values()];
    if (!needle) return all;
    return all.filter((d) => d.domainId.startsWith(needle) || d.owner.toUpperCase().startsWith(needle) || d.accepted.some((a) => a.issuer.toUpperCase().startsWith(needle)));
  }, [directory, lookedUp, query]);

  const selected = rows.find((d) => d.domainId === selectedId) ?? null;

  // The selected domain, re-read live: the directory can be hours old.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLive(null);
    setLiveError(null);
    setRecord(null);
    void (async () => {
      try {
        const ledger = await validatedLedger();
        const domain = await readDomain(selectedId, ledger.index);
        if (!cancelled) setLive({ domain, ledger });
      } catch (e) {
        if (!cancelled) setLiveError(e instanceof Error ? e.message : "The ledger could not be read.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const lookUp = async () => {
    const q = query.trim();
    if (!isAddress(q) && !isDomainId(q)) {
      setLookupNote("Enter a domain ID (64 hex characters) or the owner's r-address to read it live.");
      return;
    }
    setLookupBusy(true);
    setLookupNote(null);
    try {
      const ledger = await validatedLedger();
      const found = isDomainId(q) ? [await readDomain(q, ledger.index)].filter((d): d is DomainEntry => d !== null) : await domainsOwnedBy(q, ledger.index);
      setLookedUp((prev) => [...found, ...prev.filter((p) => !found.some((f) => f.domainId === p.domainId))]);
      setLookupNote(
        found.length
          ? `${found.length} domain${found.length === 1 ? "" : "s"} read at ledger ${ledger.index.toLocaleString()}.`
          : `No permissioned domain ${isDomainId(q) ? "with that ID" : "owned by that account"} at ledger ${ledger.index.toLocaleString()}.`
      );
      if (found[0]) setSelectedId(found[0].domainId);
    } catch (e) {
      setLookupNote(e instanceof Error ? e.message : "The ledger could not be read.");
    } finally {
      setLookupBusy(false);
    }
  };

  const runCheck = async () => {
    if (!selectedId) return;
    if (!isAddress(counterparty)) {
      setCheckError("Enter the counterparty's classic r-address.");
      return;
    }
    setChecking(true);
    setCheckError(null);
    setRecord(null);
    try {
      setRecord(await checkAdmission(selectedId, counterparty));
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : "The check could not be completed.");
    } finally {
      setChecking(false);
    }
  };

  const exportRecord = async () => {
    if (!record) return;
    try {
      const where = await saveTextFile(
        `noshashi-admission-${record.account.slice(0, 8)}-${record.ledger.index}.json`,
        JSON.stringify({ kind: "noshashi.domain_admission", ...record }, null, 2),
        "application/json"
      );
      push({ title: "ADMISSION RECORD SAVED", body: where, tone: "go" });
    } catch (e) {
      push({ title: "EXPORT FAILED", body: e instanceof Error ? e.message : "Unable to write file", tone: "no-go" });
    }
  };

  const amendmentOn = (server?.amendedFeatures ?? []).some((f) => AMENDMENT.includes(f));
  const domainSweep = status?.sweeps.find((s) => s.kind === "permissioned_domain");
  const issuers = new Set(directory.flatMap((d) => d.accepted.map((a) => a.issuer)));
  const detail = live?.domain ?? selected;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <SceneHeader
        index="05"
        kicker="XLS-80 · PERMISSIONED DOMAINS · MAINNET"
        title="DOMAIN GRID"
        sub="Every permissioned domain on the XRP Ledger, what each one requires, and whether a counterparty would be admitted — read from the ledger, never assumed."
        status={connected ? "go" : "no-go"}
        statusLabel={connected ? "LIVE" : "OFFLINE"}
        right={
          <Button size="sm" variant="outline" onClick={() => void loadDirectory()} disabled={loadingDirectory}>
            {loadingDirectory ? "READING…" : "REFRESH"}
          </Button>
        }
      />

      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="DOMAINS ON MAINNET" value={status ? status.domains.toLocaleString() : "—"} hint={domainSweep?.last_complete_ledger ? `Full sweep at ledger ${domainSweep.last_complete_ledger.toLocaleString()}` : "First sweep in progress"} />
        <Stat label="CREDENTIAL ISSUERS TRUSTED" value={status ? issuers.size.toLocaleString() : "—"} hint="Distinct issuers named in AcceptedCredentials" />
        <Stat
          label="REGISTRY SWEEP"
          value={domainSweep?.in_progress ? `${Math.min(99, Math.round((domainSweep.pages_read / APPROX_PAGES) * 100))}%` : domainSweep?.last_complete_at ? "COMPLETE" : "—"}
          hint={domainSweep?.in_progress ? `${domainSweep.pages_read.toLocaleString()} pages of ~${APPROX_PAGES.toLocaleString()} at ledger ${domainSweep.in_progress_ledger?.toLocaleString()}` : domainSweep?.last_complete_at ? `Finished ${new Date(domainSweep.last_complete_at).toLocaleString()}` : "Not started"}
        />
        <Stat label="XLS-80 AMENDMENT" value={server ? (amendmentOn ? "ENABLED" : "NOT REPORTED") : "—"} tone={amendmentOn ? "go" : "hold"} hint="As the connected node reports it" />
      </div>

      <div className="grid min-h-[480px] flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        <Panel
          label="DIRECTORY"
          className="min-h-0 lg:col-span-3"
          bodyClassName="flex min-h-0 flex-col p-0"
          right={<span className="mono-font text-[11px] tabular-nums text-muted-foreground">{rows.length} SHOWN</span>}
        >
          <form
            className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void lookUp();
            }}
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter, or paste a domain ID / owner address to read it live"
              className="mono-font h-8 min-w-[240px] flex-1 text-[12px]"
              spellCheck={false}
              aria-label="Domain ID or owner address"
            />
            <Button size="sm" type="submit" disabled={lookupBusy}>
              {lookupBusy ? "READING…" : "READ LIVE"}
            </Button>
            {lookupNote && <p className="w-full text-[11.5px] text-muted-foreground">{lookupNote}</p>}
          </form>

          {directoryError && !rows.length ? (
            <EmptyState icon={<NovaGrid size={16} />} title="REGISTRY UNREACHABLE" body={`${directoryError.replace(/\.?$/, ".")} Live lookups by domain ID or owner still work.`} />
          ) : !rows.length ? (
            <EmptyState
              icon={<NovaGrid size={16} />}
              title={loadingDirectory ? "READING THE REGISTRY" : query ? "NO MATCH" : "NO DOMAINS FOUND YET"}
              body={
                loadingDirectory
                  ? "Loading every permissioned domain found on mainnet."
                  : query
                    ? "Nothing in the directory matches. Press READ LIVE to query the ledger directly."
                    : domainSweep?.in_progress
                      ? `The first sweep of mainnet is ${Math.round((domainSweep.pages_read / APPROX_PAGES) * 100)}% through the ledger and has found none yet. Paste a domain ID or owner address to read one directly.`
                      : "The ledger holds no permissioned domains that the last sweep found."
              }
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border">
                    {["DOMAIN ID", "OWNER", "ACCEPTS", "LAST CHANGED", ""].map((h) => (
                      <th key={h} className="stencil px-3 py-2 text-[10.5px] font-medium tracking-[0.1em] text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr
                      key={d.domainId}
                      onClick={() => setSelectedId(d.domainId)}
                      className={cn("cursor-pointer border-b border-border/40 transition-colors hover:bg-secondary/40", d.domainId === selectedId && "bg-secondary/60")}
                    >
                      <td className="mono-font px-3 py-2 text-[12px] text-foreground">{truncateMiddle(d.domainId, 8, 6)}</td>
                      <td className="mono-font px-3 py-2 text-[12px] text-muted-foreground">{shortAddress(d.owner)}</td>
                      <td className="px-3 py-2 text-[12px] text-foreground/85">
                        {d.accepted.length} credential{d.accepted.length === 1 ? "" : "s"}
                      </td>
                      <td className="mono-font px-3 py-2 text-[12px] tabular-nums text-muted-foreground">{d.previousTxnLedger?.toLocaleString() ?? "—"}</td>
                      <td className="px-3 py-2">{d.source === "live" && <Badge variant="outline" className="text-[10px]">LIVE</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto lg:col-span-2 [&>*]:shrink-0">
          <Panel label="DOMAIN" right={live ? <span className="mono-font text-[11px] text-muted-foreground">LEDGER {live.ledger.index.toLocaleString()}</span> : null}>
            {!selectedId ? (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">Select a domain to read it live from the ledger and check a counterparty against it.</p>
            ) : liveError ? (
              <p className="text-[12.5px] text-no-go">{liveError}</p>
            ) : live && !live.domain ? (
              <p className="text-[12.5px] text-hold">This domain no longer exists at ledger {live.ledger.index.toLocaleString()}: its owner deleted it after the last sweep.</p>
            ) : detail ? (
              <div>
                <p className="mono-font selectable break-all text-[12px] text-foreground">{detail.domainId}</p>
                <div className="mt-2">
                  <DataRow label="OWNER" value={<span className="mono-font selectable">{detail.owner}</span>} />
                  <DataRow label="SEQUENCE" value={detail.sequence ?? "—"} />
                  <DataRow label="LAST CHANGED" value={detail.previousTxnLedger ? `Ledger ${detail.previousTxnLedger.toLocaleString()}` : "—"} />
                  <DataRow label="READ" value={live ? "LIVE" : "DIRECTORY (READING LIVE…)"} tone={live ? "go" : "hold"} />
                </div>
                <Eyebrow className="mb-1.5 mt-3">ADMITS HOLDERS OF ANY OF</Eyebrow>
                {detail.accepted.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">No accepted credentials: only the owner is in this domain.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.accepted.map((a) => (
                      <li key={`${a.issuer}-${a.typeHex}`} className="rounded border border-border px-2.5 py-1.5">
                        <p className="text-[12.5px] text-foreground">{typeLabel(a)}</p>
                        <p className="mono-font selectable text-[11px] text-muted-foreground">issued by {a.issuer}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">Reading the domain…</p>
            )}
          </Panel>

          <Panel label="ADMISSION CHECK" right={<NovaShield size={13} className="text-muted-foreground" />}>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Would this counterparty be admitted? The owner always is; anyone else must hold one of the accepted credentials, accepted and unexpired at the latest validated ledger.
            </p>
            <form
              className="mt-2.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void runCheck();
              }}
            >
              <Input
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="Counterparty r-address"
                className="mono-font h-8 text-[12px]"
                spellCheck={false}
                disabled={!selectedId}
                aria-label="Counterparty address"
              />
              <Button size="sm" type="submit" disabled={!selectedId || checking}>
                {checking ? "CHECKING…" : "CHECK"}
              </Button>
            </form>
            {checkError && <p className="mt-2 text-[12px] text-no-go">{checkError}</p>}
            {record && (
              <div className="mt-3">
                <div className={cn("rounded border px-3 py-2", record.result.admitted ? "border-go/50 bg-go/10" : "border-no-go/50 bg-no-go/10")}>
                  <p className={cn("stencil text-[13px] tracking-[0.1em]", record.result.admitted ? "text-go" : "text-no-go")}>
                    {record.result.admitted ? "ADMITTED" : "NOT ADMITTED"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-foreground/85">
                    {record.result.basis === "owner"
                      ? "The counterparty owns this domain."
                      : record.result.basis === "credential"
                        ? "Holds at least one accepted, unexpired credential the domain accepts."
                        : "Holds none of the accepted credentials in a usable state."}
                  </p>
                </div>
                <ul className="mt-2 space-y-1">
                  {record.result.lines.map((l) => (
                    <li key={`${l.issuer}-${l.typeHex}`} className="flex items-start justify-between gap-2 text-[12px]">
                      <span className="min-w-0">
                        <span className="text-foreground">{typeLabel(l)}</span>
                        <span className="mono-font block truncate text-[11px] text-muted-foreground">{shortAddress(l.issuer)}</span>
                      </span>
                      <span className={cn("stencil shrink-0 text-[11px]", l.status === "valid" ? "text-go" : l.status === "not_held" ? "text-muted-foreground" : "text-hold")}>
                        {l.status === "valid" ? "VALID" : l.status === "pending" ? "NOT ACCEPTED" : l.status === "expired" ? "EXPIRED" : "NOT HELD"}
                        {l.expiresAt && l.status === "valid" ? ` · to ${l.expiresAt.slice(0, 10)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mono-font mt-2 break-all text-[10.5px] text-faint">
                  Ledger {record.ledger.index.toLocaleString()} · closed {record.ledger.closeIso} · SHA-256 {record.digest}
                </p>
                <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => void exportRecord()}>
                  SAVE ADMISSION RECORD (JSON)
                </Button>
              </div>
            )}
          </Panel>

          {status && (
            <Panel label="HOW THIS IS READ">
              <p className="text-[12px] leading-relaxed text-muted-foreground">{status.method}</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "go" | "hold" }) {
  return (
    <Panel bodyClassName="p-3.5">
      <p className="stencil text-[10.5px] tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className={cn("data-font mt-1.5 text-[22px] font-[600] leading-none tabular-nums", tone === "go" ? "text-go" : tone === "hold" ? "text-hold" : "text-foreground")}>{value}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </Panel>
  );
}
