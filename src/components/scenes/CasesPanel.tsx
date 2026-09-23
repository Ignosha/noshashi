import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/nova/EmptyState";
import { Eyebrow } from "@/components/nova/Panel";
import { NovaVault } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/useAuth";
import { saveTextFile } from "@/lib/export";
import { verifyEntry, type ReceiptCheck } from "@/lib/desk/evidence";
import type { LedgerEntry } from "@/lib/desk/ledger";
import {
  OUTCOME_LABEL,
  exportCase,
  stateOf,
  useInvestigations,
  verifyCase,
  type CaseEvent,
  type CaseOutcome,
  type CasePriority,
  type CaseStatus,
  type Investigation,
} from "@/lib/desk/investigations";
import { useToast } from "@/lib/toast";
import { shortAddress } from "@/lib/xrpl/client";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<CaseStatus, string> = {
  open: "text-hold",
  "in-review": "text-foreground",
  escalated: "text-no-go",
  closed: "text-muted-foreground",
};
const VERDICT_TONE: Record<string, string> = { go: "text-go", hold: "text-hold", "no-go": "text-no-go", "insufficient-data": "text-muted-foreground" };
const utc = (iso?: string) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "—");

/**
 * Investigations: a person's follow-up on verdicts. The verdict stays the
 * engine's; the case records what people did about it, in a hash-chained
 * log that reports any after-the-fact edit.
 */
export function CasesPanel({ entries, initialCaseId }: { entries: LedgerEntry[]; initialCaseId?: string | null }) {
  const inv = useInvestigations();
  const { user } = useAuth();
  const { push } = useToast();
  const actor = user?.email ?? "local operator";
  const [filter, setFilter] = useState<"active" | "closed" | "all">("active");
  const [selectedId, setSelectedId] = useState<string | null>(initialCaseId ?? null);

  useEffect(() => {
    if (initialCaseId) setSelectedId(initialCaseId);
  }, [initialCaseId]);

  const rows = useMemo(
    () =>
      inv.cases
        .map((c) => ({ c, s: stateOf(c) }))
        .filter(({ s }) => (filter === "all" ? true : filter === "closed" ? s.status === "closed" : s.status !== "closed"))
        .sort((a, b) => (b.s.updatedAt ?? "").localeCompare(a.s.updatedAt ?? "")),
    [inv.cases, filter]
  );
  const selected = inv.cases.find((c) => c.id === selectedId) ?? rows[0]?.c ?? null;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error) {
      push({ title: `${label} FAILED`, body: error instanceof Error ? error.message : String(error), tone: "no-go" });
    }
  };

  if (!inv.loaded) return <p className="mono-font animate-pulse p-4 text-[10px] text-muted-foreground">LOADING CASES…</p>;
  if (inv.cases.length === 0) {
    return (
      <EmptyState
        icon={<NovaVault size={16} />}
        title="NO INVESTIGATIONS"
        body="Open one from any verdict — in Verification after a gate check, or from the EVIDENCE tab. A case records what people did about a verdict; it never changes the verdict itself."
      />
    );
  }

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-[minmax(240px,320px)_1fr]">
      <div className="border-b border-border lg:border-b-0 lg:border-r">
        <div className="flex gap-1 border-b border-border p-2.5">
          {(["active", "closed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "stencil rounded border px-2 py-1 text-[8px] tracking-[0.18em]",
                filter === f ? "border-foreground/50 text-foreground" : "border-border text-muted-foreground"
              )}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        {rows.length === 0 && (
          <p className="px-3 py-3 text-[10px] leading-relaxed text-muted-foreground">
            No {filter} cases.{" "}
            <button onClick={() => setFilter("all")} className="underline underline-offset-2 hover:text-foreground">
              Show all {inv.cases.length}
            </button>
          </p>
        )}
        <ul>
          {rows.map(({ c, s }) => (
            <li key={c.id}>
              <button
                onClick={() => setSelectedId(c.id)}
                className={cn("w-full border-b border-border/30 px-3 py-2 text-left hover:bg-foreground/[0.03]", selected?.id === c.id && "bg-foreground/[0.06]")}
              >
                <p className="truncate text-[10px] text-foreground">{c.title}</p>
                <p className="mono-font mt-0.5 text-[8.5px] text-muted-foreground">
                  <span className={STATUS_TONE[s.status]}>{s.status.toUpperCase()}</span> · {s.priority.toUpperCase()} · {s.linked.length} verdict{s.linked.length === 1 ? "" : "s"} · {utc(s.updatedAt)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {selected && <CaseDetail key={selected.id} c={selected} entries={entries} actor={actor} run={run} mutate={inv.mutate} />}
    </div>
  );
}

function CaseDetail({
  c,
  entries,
  actor,
  run,
  mutate,
}: {
  c: Investigation;
  entries: LedgerEntry[];
  actor: string;
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  mutate: ReturnType<typeof useInvestigations>["mutate"];
}) {
  const { push } = useToast();
  const s = stateOf(c);
  const [integrity, setIntegrity] = useState<Awaited<ReturnType<typeof verifyCase>> | null>(null);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState<CaseOutcome>("cleared");
  const [rationale, setRationale] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [linkId, setLinkId] = useState("");
  const [receipts, setReceipts] = useState<Record<string, ReceiptCheck | "not-held">>({});

  useEffect(() => {
    void verifyCase(c).then(setIntegrity);
  }, [c]);

  const linkable = entries.filter((e) => e.subject === c.subject && !s.linked.some((l) => l.entryId === e.id)).slice(0, 25);
  const closed = s.status === "closed";
  const broken = integrity && !integrity.ok;

  const checkReceipt = async (entryId: string) => {
    const e = entries.find((x) => x.id === entryId);
    setReceipts((r) => ({ ...r, [entryId]: "not-held" }));
    if (e) {
      const res = await verifyEntry(e);
      setReceipts((r) => ({ ...r, [entryId]: res }));
    }
  };

  return (
    <div className="min-w-0 space-y-5 p-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="display text-[14px] font-[600] text-foreground">{c.title}</p>
          <span className={cn("stencil text-[8px] tracking-[0.2em]", broken ? "text-no-go" : "text-go")}>
            {integrity === null ? "CHECKING CHAIN…" : integrity.ok ? `● CASE LOG INTACT · ${c.events.length} EVENTS` : `INTEGRITY FAILURE · ${integrity.reason}`}
          </span>
        </div>
        <p className="mono-font mt-1 text-[9.5px] text-muted-foreground">
          SUBJECT <span className="selectable text-foreground">{c.subject}</span> · OPENED {utc(s.openedAt)} BY {s.openedBy}
          {s.assignee && ` · ASSIGNED ${s.assignee}`}
        </p>
        <p className="mono-font mt-0.5 text-[9.5px]">
          <span className={STATUS_TONE[s.status]}>{s.status.toUpperCase()}</span>
          <span className="text-muted-foreground"> · PRIORITY {s.priority.toUpperCase()}</span>
          {s.outcome && <span className="text-foreground"> · {OUTCOME_LABEL[s.outcome].toUpperCase()}</span>}
        </p>
        <p className="mt-2 max-w-[640px] text-[9.5px] leading-relaxed text-muted-foreground">
          The verdicts below are the engine's and do not change. This case records what people did about them;
          a resolution here — including an approved exception — sits beside the official verdict, never over it.
        </p>
      </div>

      <section>
        <Eyebrow className="mb-2">LINKED VERDICTS · AS RECORDED WHEN LINKED</Eyebrow>
        {s.linked.map((l) => {
          const r = receipts[l.entryId];
          return (
            <div key={l.entryId} className="border-b border-border/30 py-1.5">
              <p className="mono-font text-[9.5px]">
                <span className={VERDICT_TONE[l.verdict]}>{l.verdict.toUpperCase()}</span>
                <span className="text-foreground"> · {l.amountXrp.toLocaleString()} XRP · {l.domainCode}</span>
                <span className="text-muted-foreground"> · {utc(l.at)}</span>
                {l.policy && <span className="text-muted-foreground"> · {l.policy.name} v{l.policy.version}</span>}
              </p>
              <p className="mono-font selectable text-[8.5px] text-muted-foreground">RECEIPT {l.digest}</p>
              {l.exceptions.length > 0 && (
                <p className="mono-font text-[8.5px] text-hold">FAILED RULES {l.exceptions.join(", ")}</p>
              )}
              <button
                onClick={() => void checkReceipt(l.entryId)}
                className="stencil mt-0.5 text-[7.5px] tracking-[0.2em] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                VERIFY RECEIPT
              </button>
              {r && (
                <span className={cn("mono-font ml-2 text-[8.5px]", r === "not-held" ? "text-muted-foreground" : r.state === "verified" ? "text-go" : r.state === "mismatch" ? "text-no-go" : "text-hold")}>
                  {r === "not-held"
                    ? "Verdict no longer on this ledger; the case keeps its recorded digest."
                    : r.state === "verified"
                      ? "VERIFIED"
                      : r.state === "mismatch"
                        ? "MISMATCH — ledger record changed after issue"
                        : "UNVERIFIABLE"}
                </span>
              )}
            </div>
          );
        })}
        {!closed && !broken && linkable.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <select
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              aria-label="Verdict to link"
              className="mono-font h-7 rounded border border-border bg-background px-1 text-[9.5px] text-foreground"
            >
              <option value="">Link another verdict on {shortAddress(c.subject)}…</option>
              {linkable.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.verdict.toUpperCase()} · {e.amountXrp.toLocaleString()} XRP · {utc(e.at)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={!linkId}
              onClick={() => run("LINK", async () => { await mutate(c.id, { kind: "link", entry: entries.find((e) => e.id === linkId)! }, actor); setLinkId(""); })}
            >
              LINK
            </Button>
          </div>
        )}
      </section>

      {!closed && !broken && (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <Eyebrow className="mb-2">ADD NOTE</Eyebrow>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="What was checked, with whom, and what it showed."
              className="w-full rounded border border-border bg-background p-2 text-[10.5px] text-foreground"
            />
            <Button size="sm" className="mt-1.5" disabled={!note.trim()} onClick={() => run("NOTE", async () => { await mutate(c.id, { kind: "note", text: note }, actor); setNote(""); })}>
              ADD NOTE
            </Button>
          </div>
          <div className="space-y-2">
            <Eyebrow>STATUS · PRIORITY · ASSIGNMENT</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {(["open", "in-review", "escalated"] as const).map((st) => (
                <Button key={st} size="sm" variant={s.status === st ? "default" : "outline"} onClick={() => run("STATUS", () => mutate(c.id, { kind: "status", to: st }, actor))}>
                  {st.toUpperCase()}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["low", "medium", "high"] as CasePriority[]).map((p) => (
                <Button key={p} size="sm" variant={s.priority === p ? "default" : "outline"} onClick={() => run("PRIORITY", () => mutate(c.id, { kind: "priority", to: p }, actor))}>
                  {p.toUpperCase()}
                </Button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Assign to (name or email)" className="h-7 text-[10px]" />
              <Button size="sm" variant="outline" disabled={!assignee.trim()} onClick={() => run("ASSIGN", async () => { await mutate(c.id, { kind: "assign", to: assignee }, actor); setAssignee(""); })}>
                ASSIGN
              </Button>
            </div>
            {!closing ? (
              <Button size="sm" variant="outline" onClick={() => setClosing(true)}>CLOSE CASE…</Button>
            ) : (
              <div className="border border-border p-2">
                <p className="stencil mb-1 text-[8px] tracking-[0.2em] text-muted-foreground">RESOLUTION · A PERSON'S DECISION</p>
                <select value={outcome} onChange={(e) => setOutcome(e.target.value as CaseOutcome)} aria-label="Outcome" className="mono-font h-7 w-full rounded border border-border bg-background px-1 text-[9.5px] text-foreground">
                  {(Object.keys(OUTCOME_LABEL) as CaseOutcome[]).map((o) => (
                    <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>
                  ))}
                </select>
                <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} placeholder="Rationale (required, at least 10 characters)" className="mt-1.5 w-full rounded border border-border bg-background p-2 text-[10.5px] text-foreground" />
                {outcome === "exception-approved" && (
                  <p className="mt-1 text-[9px] leading-snug text-hold">
                    An approved exception is recorded against your name. The verdict and its receipt stay as the engine issued them.
                  </p>
                )}
                <div className="mt-1.5 flex gap-1.5">
                  <Button size="sm" disabled={rationale.trim().length < 10} onClick={() => run("CLOSE", async () => { await mutate(c.id, { kind: "close", outcome, rationale }, actor); setClosing(false); setRationale(""); })}>
                    CLOSE CASE
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setClosing(false)}>CANCEL</Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {closed && !broken && (
        <section>
          <Eyebrow className="mb-1">RESOLVED {utc(s.closedAt)}</Eyebrow>
          <p className="text-[10.5px] text-foreground">{s.outcome && OUTCOME_LABEL[s.outcome]}</p>
          <p className="mt-0.5 whitespace-pre-wrap text-[10px] text-muted-foreground">{s.rationale}</p>
          <div className="mt-2 flex gap-1.5">
            <Input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Reason to reopen (at least 10 characters)" className="h-7 text-[10px]" />
            <Button size="sm" variant="outline" disabled={reopenReason.trim().length < 10} onClick={() => run("REOPEN", async () => { await mutate(c.id, { kind: "reopen", reason: reopenReason }, actor); setReopenReason(""); })}>
              REOPEN
            </Button>
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <Eyebrow>CASE LOG · APPEND-ONLY · HASH-CHAINED</Eyebrow>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              run("EXPORT", async () => {
                const dest = await saveTextFile(`noshashi-${c.id}.json`, await exportCase(c), "application/json");
                push({ title: "CASE EXPORTED", body: `Written to ${dest}`, tone: "go" });
              })
            }
          >
            EXPORT CASE FILE
          </Button>
        </div>
        <ol className="border-l border-border">
          {c.events.map((e) => (
            <li key={e.seq} className="relative pb-2.5 pl-4 last:pb-0">
              <span className={cn("absolute -left-[3px] top-1.5 h-[5px] w-[5px]", integrity && !integrity.ok && e.seq >= integrity.at ? "bg-no-go" : "bg-border")} />
              <p className="mono-font text-[9px] text-muted-foreground">
                #{e.seq} · {utc(e.at)} · {e.actor}
              </p>
              <p className="text-[10px] leading-relaxed text-foreground">{describe(e)}</p>
              <p className="mono-font text-[8px] text-muted-foreground/60">{e.hash.slice(0, 16)}…</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function describe(e: CaseEvent): string {
  switch (e.kind) {
    case "opened":
      return `Opened on a ${e.linked?.verdict.toUpperCase()} verdict (receipt ${e.linked?.digest.slice(0, 12)}…).`;
    case "note":
      return e.text ?? "";
    case "status":
      return `Status ${e.from?.toUpperCase()} → ${e.to?.toUpperCase()}.`;
    case "priority":
      return `Priority ${e.from?.toUpperCase()} → ${e.to?.toUpperCase()}.`;
    case "assigned":
      return `Assigned to ${e.to}${e.from ? ` (was ${e.from})` : ""}.`;
    case "linked":
      return `Linked a ${e.linked?.verdict.toUpperCase()} verdict for ${e.linked?.amountXrp.toLocaleString()} XRP (receipt ${e.linked?.digest.slice(0, 12)}…).`;
    case "closed":
      return `Closed — ${e.outcome ? OUTCOME_LABEL[e.outcome] : ""}. ${e.text ?? ""}`;
    case "reopened":
      return `Reopened: ${e.text ?? ""}`;
  }
}

/**
 * Open a case on a verdict, or add the verdict to the open case already
 * running on the same subject. Then hand over to the CASES tab.
 */
export function OpenInvestigationButton({
  entry,
  onOpened,
  className,
}: {
  entry: LedgerEntry;
  onOpened?: (caseId: string) => void;
  className?: string;
}) {
  const inv = useInvestigations();
  const { user } = useAuth();
  const { push } = useToast();
  const actor = user?.email ?? "local operator";
  const existing = inv.cases.find((c) => c.subject === entry.subject && stateOf(c).status !== "closed");
  const already = inv.cases.find((c) => stateOf(c).linked.some((l) => l.entryId === entry.id));
  return (
    <button
      disabled={!inv.loaded}
      onClick={() =>
        void (async () => {
          try {
            if (already) {
              onOpened?.(already.id);
              return;
            }
            if (existing) {
              await inv.mutate(existing.id, { kind: "link", entry }, actor);
              push({ title: "VERDICT ADDED TO CASE", body: existing.title, tone: "info" });
              onOpened?.(existing.id);
            } else {
              const id = await inv.open({ entry, actor, now: new Date().toISOString() });
              push({ title: "INVESTIGATION OPENED", body: "Ledger & Policy → CASES", tone: "info" });
              onOpened?.(id);
            }
          } catch (error) {
            push({ title: "COULD NOT OPEN CASE", body: error instanceof Error ? error.message : String(error), tone: "no-go" });
          }
        })()
      }
      className={cn(
        "stencil border border-border px-2 py-1 text-[8px] tracking-[0.2em] text-muted-foreground hover:border-foreground/40 hover:text-foreground",
        className
      )}
    >
      {already ? "VIEW INVESTIGATION" : existing ? "ADD TO OPEN INVESTIGATION" : "OPEN INVESTIGATION"}
    </button>
  );
}
