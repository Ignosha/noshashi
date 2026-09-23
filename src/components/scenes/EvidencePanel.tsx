import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/nova/EmptyState";
import { StatusDot } from "@/components/nova/StatusDot";
import { Eyebrow } from "@/components/nova/Panel";
import { NovaShield } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortAddress } from "@/lib/xrpl/client";
import type { LedgerEntry } from "@/lib/desk/ledger";
import {
  buildChain,
  explain,
  verifyEntry,
  verdictConsistent,
  type ChainStep,
  type ReceiptCheck,
} from "@/lib/desk/evidence";
import { cn } from "@/lib/utils";
import { PolicyVerdictBlock } from "./PolicyVerdict";

const LIST = 60;

const TONE: Record<NonNullable<ChainStep["tone"]>, string> = {
  go: "text-go",
  hold: "text-hold",
  "no-go": "text-no-go",
  default: "text-foreground",
};

/**
 * Evidence chain for one stored verdict, and a re-derivation of its
 * receipt. Everything shown is a field of the stored entry or a rule of
 * the engine; nothing is fetched and no model is involved.
 */
export function EvidencePanel({ entries, loaded }: { entries: LedgerEntry[]; loaded: boolean }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [check, setCheck] = useState<ReceiptCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? entries.filter(
          (e) =>
            e.subject.toLowerCase().includes(needle) ||
            e.digest.toLowerCase().includes(needle) ||
            (e.label ?? "").toLowerCase().includes(needle)
        )
      : entries;
    return filtered.slice(0, LIST);
  }, [entries, query]);

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? list[0] ?? null,
    [entries, list, selectedId]
  );

  // A verification result belongs to one entry; drop it when the selection moves.
  useEffect(() => setCheck(null), [selected?.id]);

  if (!loaded) {
    return <p className="mono-font animate-pulse p-4 text-[10px] text-muted-foreground">LOADING LEDGER…</p>;
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<NovaShield size={16} />}
        title="NO VERDICTS TO TRACE"
        body="Run a gate check in Verification. Each verdict recorded here can be walked back to the state, policy and rules that produced it, and its receipt re-derived."
      />
    );
  }

  const runVerify = async () => {
    if (!selected) return;
    setChecking(true);
    try {
      setCheck(await verifyEntry(selected));
    } finally {
      setChecking(false);
    }
  };

  const chain = selected ? buildChain(selected) : [];
  const why = selected ? explain(selected) : null;
  const consistent = selected ? verdictConsistent(selected) : null;

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-[minmax(220px,300px)_1fr]">
      <div className="border-b border-border lg:border-b-0 lg:border-r">
        <div className="border-b border-border p-2.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by address, label or digest…"
            className="mono-font h-7 text-[10px]"
          />
        </div>
        <ul>
          {list.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => setSelectedId(e.id)}
                className={cn(
                  "flex w-full items-center gap-2 border-b border-border/30 px-3 py-2 text-left hover:bg-foreground/[0.03]",
                  selected?.id === e.id && "bg-foreground/[0.06]"
                )}
              >
                <StatusDot status={e.verdict} size={6} />
                <span className="mono-font flex-1 truncate text-[10px] text-foreground">
                  {e.label ?? shortAddress(e.subject)}
                </span>
                <span className="mono-font text-[9px] text-muted-foreground/80">
                  {new Date(e.at).toLocaleDateString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {entries.length > list.length && !query && (
          <p className="stencil px-3 py-2 text-[8px] tracking-[0.18em] text-muted-foreground">
            MOST RECENT {LIST} OF {entries.length.toLocaleString()} · FILTER TO FIND OLDER
          </p>
        )}
      </div>

      {selected && why && (
        <div className="min-w-0 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-2" onClick={() => void runVerify()} disabled={checking}>
              <NovaShield size={13} />
              {checking ? "RECOMPUTING…" : "VERIFY RECEIPT"}
            </Button>
            {consistent === false && (
              <span className="stencil text-[8px] tracking-[0.18em] text-no-go">
                STORED VERDICT DOES NOT FOLLOW FROM ITS RULES
              </span>
            )}
          </div>

          {check && <VerifyResult check={check} />}

          <Eyebrow className="mb-2 mt-5">EVIDENCE CHAIN</Eyebrow>
          <ol className="border-l border-border">
            {chain.map((step, i) => (
              <li key={`${step.kind}-${i}`} className="relative pb-3 pl-4 last:pb-0">
                <span className="absolute -left-[3px] top-1.5 h-[5px] w-[5px] bg-border" />
                <p className="stencil text-[8px] tracking-[0.2em] text-muted-foreground">{step.title}</p>
                <p
                  className={cn(
                    "mono-font selectable mt-0.5 break-all text-[10px]",
                    TONE[step.tone ?? "default"]
                  )}
                >
                  {step.value}
                </p>
                {step.detail && (
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{step.detail}</p>
                )}
              </li>
            ))}
          </ol>

          <div className="mt-6">
            <PolicyVerdictBlock
              policy={selected.policy}
              results={selected.policyResults}
              verdict={{
                label: selected.verdict.toUpperCase(),
                tone: selected.verdict === "go" ? "text-go" : selected.verdict === "no-go" ? "text-no-go" : "text-hold",
              }}
            />
            <p className="mt-1.5 text-[9px] text-muted-foreground/80">
              As recorded when the verdict was issued. The current policy is not applied to it.
            </p>
          </div>

          <Eyebrow className="mb-2 mt-6">EXPLANATION</Eyebrow>
          <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2">
            {(
              [
                ["WHY", why.why],
                ["HOW", why.how],
                ["EVIDENCE", why.evidence],
                ["POLICY", why.policy],
                ["LIMITATIONS", why.limitations],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="stencil pt-0.5 text-[8px] tracking-[0.2em] text-muted-foreground">{k}</dt>
                <dd className="text-[10px] leading-relaxed text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function VerifyResult({ check }: { check: ReceiptCheck }) {
  if (check.state === "verified") {
    return (
      <div className="mt-3 border border-go/40 bg-go-dim p-3">
        <Eyebrow className="text-go">VERIFIED · RECEIPT RE-DERIVED FROM THE STORED BODY</Eyebrow>
        <p className="mono-font selectable mt-1.5 break-all text-[10px] text-foreground">{check.digest}</p>
      </div>
    );
  }
  if (check.state === "mismatch") {
    return (
      <div className="mt-3 border border-no-go/50 p-3">
        <Eyebrow className="text-no-go">MISMATCH · THIS RECORD WAS CHANGED AFTER IT WAS ISSUED</Eyebrow>
        <p className="mono-font selectable mt-1.5 break-all text-[10px] text-muted-foreground">
          ISSUED {check.stored}
        </p>
        <p className="mono-font selectable mt-1 break-all text-[10px] text-no-go">
          NOW&nbsp;&nbsp;&nbsp;{check.recomputed}
        </p>
      </div>
    );
  }
  return (
    <div className="mt-3 border border-hold/40 p-3">
      <Eyebrow className="text-hold">UNVERIFIABLE</Eyebrow>
      <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{check.reason}</p>
    </div>
  );
}
