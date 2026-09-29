import { useEffect, useState } from "react";
import { Panel, DataRow } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { NovaShield } from "@/components/nova/NovaIcon";
import { useLedger, type LedgerEntry } from "@/lib/desk/ledger";
import { verifyEntry, type ReceiptCheck } from "@/lib/desk/evidence";
import { checkState, CHECK_STATE_COPY, DOMAIN_REGISTRY } from "@/lib/policy";
import { readSync, type SyncReport } from "@/lib/net/sync";
import { shortAddress } from "@/lib/xrpl/client";
import { cn } from "@/lib/utils";

/**
 * The decision card: the one panel an executive reads.
 *
 * Built only from what NOSHASHI recorded and can re-check: the latest
 * verdict on the adjudication ledger, the rule profile or institutional
 * policy that produced it, the rules that decided it, the receipt digest
 * recomputed here, and how many public nodes answer now. Nothing on it is
 * a score or a confidence percentage: every line is a record or a count.
 */

const TONE = {
  go: { text: "text-go", border: "border-go/50", bg: "bg-go/10", word: "GO" },
  hold: { text: "text-hold", border: "border-hold/50", bg: "bg-hold/10", word: "HOLD" },
  "no-go": { text: "text-no-go", border: "border-no-go/50", bg: "bg-no-go/10", word: "NO-GO" },
  "insufficient-data": { text: "text-hold", border: "border-hold/50", bg: "bg-hold/10", word: "INSUFFICIENT DATA" },
} as const;

const MEANING = {
  go: "Every blocking rule passed. Cleared to proceed, subject to your own approval.",
  hold: "No blocking rule failed, but one needs review. A person signs off before anything moves.",
  "no-go": "A blocking rule failed. Do not proceed on this reading.",
  "insufficient-data": "The ledger could not supply what a rule needs, so no decision was issued. Read again before acting.",
} as const;

function findings(entry: LedgerEntry): Array<{ label: string; state: string; tone: "go" | "hold" | "no-go" | "muted"; why: string }> {
  if (entry.policyResults?.length) {
    return entry.policyResults
      .filter((r) => r.state !== "PASS" && r.state !== "NOT_APPLICABLE")
      .map((r) => ({ label: r.label, state: r.state.replace("_", " "), tone: r.state === "FAIL" ? ("no-go" as const) : ("hold" as const), why: r.reason }));
  }
  return (entry.checks ?? [])
    .map((c) => ({ c, s: checkState(c) }))
    .filter(({ s }) => s !== "PASS" && s !== "NOT_APPLICABLE")
    .map(({ c, s }) => ({ label: c.label, state: CHECK_STATE_COPY[s].label, tone: CHECK_STATE_COPY[s].tone, why: c.detail }));
}

export function DecisionCard({ onNavigate }: { onNavigate: (scene: string) => void }) {
  const { entries, loaded } = useLedger();
  const latest = entries[0] ?? null;
  const [receipt, setReceipt] = useState<ReceiptCheck | null>(null);
  const [sync, setSync] = useState<SyncReport | null>(null);

  useEffect(() => {
    if (!latest) return;
    let cancelled = false;
    setReceipt(null);
    void verifyEntry(latest).then((r) => {
      if (!cancelled) setReceipt(r);
    });
    return () => {
      cancelled = true;
    };
  }, [latest]);

  useEffect(() => {
    let cancelled = false;
    void readSync()
      .then((r) => {
        if (!cancelled) setSync(r);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;

  if (!latest) {
    return (
      <Panel label="DECISION" right={<NovaShield size={13} className="text-muted-foreground" />}>
        <p className="text-[15px] text-foreground">No analyses yet.</p>
        <p className="mt-1 max-w-[560px] text-[12.5px] leading-relaxed text-muted-foreground">
          Run a gate check on a settlement to get a GO, HOLD or NO-GO decision, the rules that decided it, and a receipt anyone can re-check.
        </p>
        <Button size="sm" className="mt-3" onClick={() => onNavigate("verify")}>
          RUN THE FIRST ANALYSIS
        </Button>
      </Panel>
    );
  }

  const tone = TONE[latest.verdict];
  const profile = DOMAIN_REGISTRY.find((d) => d.id === latest.domainId);
  const list = findings(latest);
  const agreeing = sync ? sync.nodes.filter((n) => n.reachable && n.ledgerSeq !== undefined && sync.leaderSeq !== undefined && sync.leaderSeq - n.ledgerSeq <= 2).length : null;

  return (
    <Panel
      label="LATEST DECISION"
      right={<span className="mono-font text-[11px] text-muted-foreground">{new Date(latest.at).toLocaleString()}</span>}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <div className={cn("rounded-md border px-4 py-3", tone.border, tone.bg)}>
            <p className={cn("display text-[34px] font-[700] leading-none tracking-[0.06em]", tone.text)} aria-label={`Decision: ${tone.word}`}>
              {tone.word}
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/90">{MEANING[latest.verdict]}</p>
          </div>
          <div className="mt-3">
            <DataRow label="SUBJECT" value={<span className="mono-font selectable">{latest.label ?? shortAddress(latest.subject)}</span>} />
            <DataRow label="AMOUNT" value={`${latest.amountXrp.toLocaleString()} XRP`} />
            <DataRow
              label="POLICY"
              value={latest.policy ? `${latest.policy.name} v${latest.policy.version}` : `Reference profile ${profile?.code ?? latest.domainCode}`}
            />
            <DataRow label="RULES" value={`${latest.checksPassed} of ${latest.checksTotal} passed`} tone={latest.checksPassed === latest.checksTotal ? "go" : "hold"} />
            <DataRow
              label="LEDGER"
              value={latest.ledgerIndex ? `#${latest.ledgerIndex.toLocaleString()}${latest.offline ? " (snapshot)" : ""}` : latest.offline ? "Offline snapshot" : "Not recorded (older entry)"}
            />
            <DataRow
              label="RECEIPT"
              value={receipt === null ? "Checking…" : receipt.state === "verified" ? "Verified · SHA-256 recomputed" : receipt.state === "mismatch" ? "DOES NOT MATCH" : "Unverifiable (older entry)"}
              tone={receipt?.state === "verified" ? "go" : receipt?.state === "mismatch" ? "no-go" : "muted"}
            />
            <DataRow
              label="NETWORK NOW"
              value={sync === null ? "Reading nodes…" : `${agreeing} of ${sync.nodes.length} public nodes in step`}
              tone={sync === null ? "muted" : agreeing === sync.nodes.length ? "go" : agreeing ? "hold" : "no-go"}
            />
            <DataRow label="HUMAN DECISION" value="Yours — NOSHASHI analyses, people approve" tone="muted" />
          </div>
        </div>

        <div className="min-w-0">
          <p className="stencil text-[10.5px] tracking-[0.1em] text-muted-foreground">WHY</p>
          {list.length === 0 ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/85">
              Every rule evaluated passed. The receipt records each one with what it read.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-2">
              {list.slice(0, 5).map((f) => (
                <li key={f.label} className="rounded border border-border px-3 py-2">
                  <p className="flex items-center justify-between gap-2 text-[12.5px] text-foreground">
                    <span className="min-w-0 truncate">{f.label}</span>
                    <span className={cn("stencil shrink-0 text-[10.5px]", f.tone === "no-go" ? "text-no-go" : f.tone === "hold" ? "text-hold" : "text-muted-foreground")}>{f.state}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{f.why}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mono-font mt-3 break-all text-[10.5px] text-faint">SHA-256 {latest.digest}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onNavigate("workstation")}>
              OPEN THE EVIDENCE
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onNavigate("verify")}>
              RUN ANOTHER
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
