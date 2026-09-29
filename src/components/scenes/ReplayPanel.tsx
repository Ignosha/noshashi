import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/nova/Panel";
import type { LedgerEntry } from "@/lib/desk/ledger";
import { usePolicyStore } from "@/lib/desk/policyStore";
import { replayable, replayVerdict, type ReplayResult } from "@/lib/desk/replay";
import { readReplayData } from "@/lib/desk/replayRead";
import { CHECK_STATE_COPY, CHECK_TONE_CLASS } from "@/lib/policy";
import { cn } from "@/lib/utils";
import { verifyEntry } from "@/lib/desk/evidence";
import { institutionalReport, reportFilename } from "@/lib/desk/report";
import { saveTextFile } from "@/lib/export";
import { useOrg } from "@/lib/org/useOrg";
import { useToast } from "@/lib/toast";

/**
 * REPLAY: re-read the ledger at the receipt's own index, re-run the same
 * rules, and show what matches and what does not. The stored verdict is
 * never touched.
 */
export function ReplayButton({ entry, onResult }: { entry: LedgerEntry; onResult: (r: ReplayResult) => void }) {
  const [busy, setBusy] = useState(false);
  const store = usePolicyStore();
  const blocked = replayable(entry);

  const run = async () => {
    setBusy(true);
    try {
      const data = await readReplayData(entry.subject, entry.ledgerIndex!);
      // The policy's parameters, when this device holds the exact version (matched by its hash).
      const params = entry.policy ? store.versions.find((v) => v.hash === entry.policy!.hash)?.params : undefined;
      onResult(await replayVerdict(entry, data, params));
    } catch (e) {
      onResult({ state: "not-replayable", reason: `The ledger could not be read for replay: ${e instanceof Error ? e.message : String(e)}. Nothing was compared.` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={() => (blocked ? onResult({ state: "not-replayable", reason: blocked }) : void run())} disabled={busy} title="Re-read the ledger at this receipt's index and re-run its rules">
      {busy ? "REPLAYING…" : "REPLAY"}
    </Button>
  );
}

const label = (s: string) => (s === "absent" ? "ABSENT" : CHECK_STATE_COPY[s as keyof typeof CHECK_STATE_COPY].label);
const tone = (s: string) => (s === "absent" ? "text-muted-foreground" : CHECK_TONE_CLASS[CHECK_STATE_COPY[s as keyof typeof CHECK_STATE_COPY].tone][0]);

export function ReplayResultView({ result }: { result: ReplayResult }) {
  if (result.state === "not-replayable") {
    return (
      <div className="mt-3 rounded border border-border px-3 py-2">
        <p className="stencil text-[10.5px] tracking-[0.12em] text-muted-foreground">REPLAY NOT POSSIBLE</p>
        <p className="mt-1 text-[12px] leading-relaxed text-foreground/90">{result.reason}</p>
      </div>
    );
  }
  const same = result.state === "matches";
  return (
    <div className={cn("mt-3 rounded border px-3 py-2", same ? "border-go/40 bg-go/5" : "border-hold/50 bg-hold/5")}>
      <p className={cn("stencil text-[10.5px] tracking-[0.12em]", same ? "text-go" : "text-hold")}>
        {same ? "REPLAY MATCHES THE RECORD" : `REPLAY DIFFERS · ${result.changed.length} RULE${result.changed.length === 1 ? "" : "S"} CHANGED`}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-foreground/90">
        Re-read at ledger {result.ledgerIndex.toLocaleString()}. Recorded {result.recordedVerdict.toUpperCase()}, replayed{" "}
        {result.replayedVerdict.toUpperCase()}. {same ? "The recomputed SHA-256 equals the stored digest." : "The stored record is unchanged; the difference below is the finding."}
      </p>
      <p className="mono-font mt-1 break-all text-[10.5px] text-muted-foreground">
        RECORDED {result.recordedDigest}
        <br />
        REPLAYED {result.replayedDigest}
      </p>
      <Eyebrow className="mb-1 mt-3">RULES</Eyebrow>
      <table className="w-full text-left text-[11.5px]">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1 pr-2 font-normal">Rule</th>
            <th className="py-1 pr-2 font-normal">Recorded</th>
            <th className="py-1 font-normal">Replayed</th>
          </tr>
        </thead>
        <tbody>
          {result.rules.map((r) => (
            <tr key={r.id} className={cn("border-t border-border/30", r.recorded !== r.replayed && "bg-hold/10")}>
              <td className="py-1 pr-2 text-foreground">
                {r.label}
                {r.carried && <span className="text-muted-foreground"> · carried</span>}
              </td>
              <td className={cn("stencil py-1 pr-2 text-[10.5px]", tone(r.recorded))}>{label(r.recorded)}</td>
              <td className={cn("stencil py-1 text-[10.5px]", tone(r.replayed))}>{label(r.replayed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(result.carried.length > 0 || result.unavailable.length > 0) && (
        <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-muted-foreground">
          {result.carried.map((c) => (
            <li key={c}>{c}</li>
          ))}
          {result.unavailable.map((u) => (
            <li key={u}>Could not be read at that ledger: {u}.</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** EXPORT REPORT: the institutional report for this decision, as one HTML file that prints to PDF. */
export function ExportReportButton({ entry, replay }: { entry: LedgerEntry; replay: ReplayResult | null }) {
  const [busy, setBusy] = useState(false);
  const org = useOrg();
  const { push } = useToast();
  const run = async () => {
    setBusy(true);
    try {
      const html = institutionalReport({
        entry,
        verification: await verifyEntry(entry),
        replay,
        exceptions: org.data?.exceptions ?? [],
      });
      const where = await saveTextFile(reportFilename(entry), html, "text/html");
      push({ title: "REPORT EXPORTED", body: `${where} · open it in a browser and print to PDF`, tone: "go" });
    } catch (e) {
      push({ title: "REPORT NOT SAVED", body: e instanceof Error ? e.message : String(e), tone: "no-go" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={() => void run()} disabled={busy} title="Executive summary, decision, findings, evidence, exceptions and verification instructions in one file">
      {busy ? "EXPORTING…" : "EXPORT REPORT"}
    </Button>
  );
}
