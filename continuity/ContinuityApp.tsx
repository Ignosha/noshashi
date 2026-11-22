import { useState } from "react";
import { ContinuityWorkspace } from "../src/components/continuity/ContinuityWorkspace";
import { collectSettlementEvidence } from "../src/lib/continuity/xrpl-evidence";
import { evaluateSettlement, type SettlementResult } from "../src/lib/continuity/settlement";
import { previewContinuityTransaction, type PreflightPreview } from "../src/lib/continuity/preview";
import { validateContinuityIntent, type ContinuityIntent } from "../src/lib/continuity/intent";

/**
 * Dedicated, read-only development entry. A transaction intent must be supplied
 * explicitly. Neither this UI nor the XRPL adapter signs or submits transactions.
 */
export function ContinuityApp() {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<PreflightPreview | null>(null);
  const [settlement, setSettlement] = useState<SettlementResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    if (busy) return;
    setBusy(true); setError(null); setPreview(null); setSettlement(null);
    try {
      const intent = JSON.parse(raw) as ContinuityIntent;
      validateContinuityIntent(intent);
      const evidence = await collectSettlementEvidence(intent);
      const settlementResult = evaluateSettlement(intent, evidence);
      // Policy/issuer/liquidity source attestations are not wired yet.
      // Preview therefore remains HOLD; settlement may independently NO-GO.
      const preflight = await previewContinuityTransaction(intent, null);
      setSettlement(settlementResult);
      setPreview({
        ...preflight,
        verdict: settlementResult.verdict === "NO-GO" ? "NO-GO" : "HOLD",
        reasons: [...preflight.reasons, ...settlementResult.reasons],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to review transaction.");
    } finally { setBusy(false); }
  }
  return (
    <div className="flex h-dvh min-h-[420px] flex-col overflow-hidden bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <label htmlFor="continuity-intent" className="stencil text-xs">Transaction intent (JSON)</label>
        <textarea id="continuity-intent" rows={2} value={raw} onChange={event => setRaw(event.target.value)}
          className="min-w-0 w-full flex-1 basis-[280px] resize-y border border-border bg-background p-2 font-mono text-xs"
          placeholder="Paste a canonical NOSHASHI Continuity intent. No private keys." />
        <button type="button" disabled={busy || !raw.trim()} onClick={() => { void run(); }}
          className="desk-button border border-border px-4 py-2 text-xs disabled:opacity-50">
          {busy ? "Reading XRPL…" : "Run read-only review"}
        </button>
        {error && <p role="alert" className="w-full text-xs text-no-go">{error}</p>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto" aria-label="Continuity review results">
        <ContinuityWorkspace preview={preview} settlement={settlement} />
      </div>
    </div>
  );
}
