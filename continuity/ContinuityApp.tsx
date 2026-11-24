import { useRef, useState } from "react";
import { ContinuityWorkspace } from "../src/components/continuity/ContinuityWorkspace";
import { collectSettlementEvidence } from "../src/lib/continuity/xrpl-evidence";
import { evaluateSettlement, type SettlementEvidence, type SettlementResult } from "../src/lib/continuity/settlement";
import { previewContinuityTransaction, type PreflightPreview } from "../src/lib/continuity/preview";
import { validateContinuityIntent } from "../src/lib/continuity/intent";
import { isHolderToHolder, isXrplRlusd } from "../src/lib/continuity/rlusd";
import { compareRlusdObservations, type RlusdComparison } from "../src/lib/continuity/rlusd-monitor";
import { xrplLink } from "../src/lib/xrpl/link";

const MAX_INTENT_LENGTH = 32_768;
const inputErrors: Record<string, string> = {
  INVALID_INTENT: "Paste a JSON object containing a Continuity intent.",
  UNSUPPORTED_INTENT: "Use the Continuity v1 intent schema and the XRPL Mainnet network.",
  INVALID_IDENTITY: "The intent needs a tenant ID, request ID, and transaction type.",
  INVALID_ACCOUNT: "Use classic XRPL addresses for the source and destination.",
  INVALID_ASSET: "The asset needs a currency and a valid issuer field.",
  INVALID_ISSUER: "Issued assets need an issuer. XRP uses a null issuer.",
  INVALID_AMOUNT: "Enter the amount as a positive decimal string using canonical notation.",
  INVALID_TAG: "Enter a destination tag from 0 to 4,294,967,295 or use null.",
  INVALID_LEDGER: "Enter a positive integer for the last ledger sequence.",
  INVALID_SIGNING_PAYLOAD_HASH: "Enter a 64-character hexadecimal signing-payload digest.",
  UNKNOWN_INTENT_FIELD: "The intent has missing or unrecognized fields.",
  UNKNOWN_ASSET_FIELD: "Use only the currency and issuer fields in the asset.",
};

type Review = {
  preview: PreflightPreview;
  settlement: SettlementResult;
  evidence: SettlementEvidence | null;
  comparison: RlusdComparison | null;
};

/**
 * Dedicated, read-only development entry. A transaction intent must be supplied
 * explicitly. Neither this UI nor the XRPL adapter signs or submits transactions.
 */
export function ContinuityApp() {
  const [raw, setRaw] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const inputRevision = useRef(0);

  async function run() {
    if (inFlight.current || !raw.trim()) return;
    const previousReview = review;
    const tryAlternateProvider = previousReview !== null && previousReview.evidence === null;
    setError(null);
    setReview(null);
    if (raw.length > MAX_INTENT_LENGTH) {
      setError("The intent exceeds 32,768 characters. Paste a single transaction intent.");
      return;
    }
    let intent: unknown;
    try {
      intent = JSON.parse(raw);
      validateContinuityIntent(intent);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setError(inputErrors[code] ?? "Enter valid JSON for a single transaction intent.");
      return;
    }

    const revision = inputRevision.current;
    inFlight.current = true;
    setBusy(true);
    try {
      const evidenceRequest = !navigator.onLine ? Promise.resolve(null)
        : tryAlternateProvider ? xrplLink.reconnect().then(connected => connected ? collectSettlementEvidence(intent) : null)
        : collectSettlementEvidence(intent);
      const [preflight, evidence] = await Promise.all([
        previewContinuityTransaction(intent, null),
        evidenceRequest,
      ]);
      if (revision !== inputRevision.current) return;
      const settlement = evaluateSettlement(intent, evidence);
      const previousEvidence = preflight.intentHash && previousReview?.preview.intentHash === preflight.intentHash
        ? previousReview.evidence : null;
      const comparison = intent.transactionType === "Payment" && isXrplRlusd(intent) && isHolderToHolder(intent)
        ? compareRlusdObservations(intent, previousEvidence, evidence) : null;
      setReview({
        preview: {
          ...preflight,
          verdict: settlement.verdict === "NO-GO" ? "NO-GO" : "HOLD",
          reasons: [
            ...(!preflight.intentHash ? ["INTENT_FINGERPRINT_UNAVAILABLE"] : []),
            ...(evidence ? ["INSTITUTIONAL_POLICY_AND_ATTESTATIONS_UNAVAILABLE"] : preflight.reasons),
            ...settlement.reasons,
          ],
        },
        settlement,
        evidence,
        comparison,
      });
    } catch {
      if (revision === inputRevision.current) setError("Unable to complete the review. Check your connection and retry.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function changeIntent(value: string) {
    inputRevision.current += 1;
    setRaw(value);
    setReview(null);
    setError(null);
  }

  return (
    <div className="flex h-dvh min-h-[420px] flex-col overflow-hidden bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <label htmlFor="continuity-intent" className="stencil text-xs">Transaction intent (JSON)</label>
        <textarea id="continuity-intent" rows={2} value={raw} onChange={event => changeIntent(event.target.value)}
          aria-invalid={error ? true : undefined} aria-describedby="continuity-review-status"
          autoComplete="off" spellCheck={false}
          className="min-w-0 w-full flex-1 basis-[280px] resize-y border border-border bg-background p-2 font-mono text-xs"
          placeholder="Paste a canonical NOSHASHI Continuity intent. No private keys." />
        <button type="button" disabled={busy || !raw.trim()} onClick={() => { void run(); }}
          className="desk-button border border-border px-4 py-2 text-xs disabled:opacity-50">
          {busy ? "Reading XRPL…" : review && !review.evidence ? "Retry XRPL review" : "Run read-only review"}
        </button>
        <a href="./demo/index.html" className="desk-button border border-border px-4 py-2 text-xs">
          Continuity demonstration
        </a>
        <p id="continuity-review-status" role="status" className="w-full text-xs text-muted-foreground">
          {busy ? "Reading XRPL. Editing the input clears this review." : review
            ? !review.evidence
              ? "Validated ledger evidence is unavailable. Retry when the XRPL connection is available."
              : `XRPL Mainnet · validated ledger ${review.evidence.ledgerIndex.toLocaleString()}`
            : "Paste one intent to review its payment conditions."}
        </p>
        {error && <p role="alert" className="w-full text-xs text-no-go">{error}</p>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto" aria-label="Continuity review results" aria-busy={busy}>
        <ContinuityWorkspace preview={review?.preview} settlement={review?.settlement} comparison={review?.comparison} />
      </div>
    </div>
  );
}
