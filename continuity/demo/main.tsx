import React, { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { DataRow, Panel } from "../../src/components/nova/Panel";
import {
  archivedRlusdIssuer, payment, rehearseWalletHandoff, reviewArchivedPayment, rlusd, verifyDemoReceipt,
} from "./evidence";
import "../../src/index.css";

const buttonClass = "desk-button border border-border px-3 py-2 text-sm disabled:opacity-50";
const codeClass = "break-all font-mono text-xs";
const issuer = archivedRlusdIssuer();

type Step = "payment" | "issuer" | "handoff";
const steps: ReadonlyArray<{ id: Step; title: string }> = [
  { id: "payment", title: "Recorded payment" },
  { id: "issuer", title: "RLUSD intelligence" },
  { id: "handoff", title: "Wallet handoff" },
];

function Identifier({ label, children }: { label: string; children: ReactNode }) {
  return <div className="border-b border-border/40 py-2 last:border-0">
    <dt className="stencil mb-1 text-[10px] text-muted-foreground">{label}</dt>
    <dd className={codeClass}>{children}</dd>
  </div>;
}

function saveReceipt(receipt: NonNullable<Awaited<ReturnType<typeof reviewArchivedPayment>>>["receipt"]) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "noshashi-demo-payment-evidence.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Demo() {
  const [step, setStep] = useState<Step>("payment");
  const [review, setReview] = useState<Awaited<ReturnType<typeof reviewArchivedPayment>> | null>(null);
  const [handoff, setHandoff] = useState<Awaited<ReturnType<typeof rehearseWalletHandoff>> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptResult, setReceiptResult] = useState<string | null>(null);

  async function run<T>(work: () => Promise<T>, update: (result: T) => void) {
    setPending(true);
    setError(null);
    try {
      update(await work());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to complete the demonstration step.");
    } finally {
      setPending(false);
    }
  }

  return <div className="ledger-desktop min-h-dvh bg-background text-foreground">
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div>
          <p className="stencil text-[11px] text-muted-foreground">NOSHASHI LABS · LEDGER DESK</p>
          <h1 className="display mt-1 text-3xl">Continuity demonstration</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="stencil border border-border px-3 py-2 text-[11px] text-hold">Offline rehearsal</span>
          <a className={buttonClass} href="../index.html">Continuity workspace</a>
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Review a recorded XRPL payment, inspect issuer controls, and rehearse how changed conditions reach an operator.
        Recorded and simulated inputs are labeled in every step.
      </p>
      <nav className="flex flex-wrap gap-2 border-b border-border pb-4" aria-label="Demonstration steps">
        {steps.map(item => <button key={item.id} type="button" className={buttonClass + (item.id === step ? " bg-muted" : "")}
          aria-current={item.id === step ? "step" : undefined} disabled={pending}
          onClick={() => { setStep(item.id); setError(null); }}>{item.title}</button>)}
      </nav>
      {error && <p className="border border-border p-3 text-sm text-no-go" role="alert">{error}</p>}
      {step === "payment" && <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="Historical · XRPL mainnet">
          <h2 className="text-lg font-medium">Verify a recorded SOLO payment</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Re-run the payment verifier on independently operated RPC archives and bind the destination AccountRoot to the same ledger.
          </p>
          <dl className="my-3">
            <Identifier label="Transaction">{payment.hash}</Identifier>
            <Identifier label="Validated ledger hash">{payment.ledgerHash}</Identifier>
          </dl>
          <button className={buttonClass} type="button" disabled={pending}
            onClick={() => { setReview(null); setReceiptResult(null); void run(() => reviewArchivedPayment(), setReview); }}>
            {pending ? "Reviewing evidence…" : "Run payment review"}
          </button>
        </Panel>
        <Panel label="Payment result">
          {review ? <div aria-live="polite" className="space-y-3">
            <DataRow label="Ledger result" value={review.report.transaction_result} />
            <DataRow label="Validated ledger" value={review.report.ledger_index?.toLocaleString("en-US") ?? "Unknown"} />
            <DataRow label="Requested" value={review.report.requested_amount ? `${review.report.requested_amount.value} SOLO` : "Unknown"} />
            <DataRow label="Delivered" value={review.report.delivered_amount ? `${review.report.delivered_amount.value} SOLO` : "Unknown"} />
            <DataRow label="Tag required at this ledger" value={review.receipt.evidence.destinationTagRequired ? "Yes" : "No"} />
            <DataRow label="Captured sources" value={review.report.sources.join(" · ")} />
            <DataRow label="Invoice decision" value={`${review.report.status} · No invoice supplied`} tone="hold" />
            <dl><Identifier label="Destination and issuer">{payment.issuer}</Identifier></dl>
            <details>
              <summary className="cursor-pointer text-sm">Capture timestamps</summary>
              <ul className="mt-2 space-y-2 text-xs text-muted-foreground">{review.receipt.evidence.sources.map(source =>
                <li key={source.operator}>{source.operator} ({source.url}) · tx {source.transactionCapturedAt} · destination {source.destinationCapturedAt}</li>)}
              </ul>
            </details>
          </div> : <p className="text-sm text-muted-foreground">Run the review to see delivered amount, destination state and evidence provenance.</p>}
        </Panel>
        {review && <Panel label="Evidence receipt" className="lg:col-span-2">
          <dl><Identifier label="Evidence digest · SHA-256">{review.receipt.evidenceDigest}</Identifier></dl>
          <p className="my-3 text-sm text-muted-foreground">
            The digest detects changes against this exported evidence record. Provider identity and institutional approval are outside this receipt.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={buttonClass} disabled={pending}
              onClick={() => { void run(() => verifyDemoReceipt(review.receipt), valid => setReceiptResult(valid ? "Digest matches" : "Digest mismatch")); }}>
              Verify receipt digest
            </button>
            <button type="button" className={buttonClass} onClick={() => saveReceipt(review.receipt)}>Export receipt JSON</button>
            <output aria-live="polite" className="text-sm">{receiptResult}</output>
          </div>
        </Panel>}
      </div>}
      {step === "issuer" && <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="RLUSD · Asset identity">
          <h2 className="text-lg font-medium">An asset is identified by its network and issuer</h2>
          <dl className="my-2">
            <Identifier label="Network">{rlusd.network}</Identifier>
            <Identifier label="Issuer account">{rlusd.issuer}</Identifier>
            <Identifier label="XRPL currency code">{rlusd.currency}</Identifier>
          </dl>
          <a className="text-sm underline" href={rlusd.identitySource}>Ripple’s published issuer address</a>
        </Panel>
        <Panel label="Historical · Issuer controls">
          {issuer ? <>
            <p className="mb-3 text-sm text-muted-foreground">Archived AccountRoot · ledger {issuer.ledgerIndex.toLocaleString("en-US")} · observed {issuer.observedAt}</p>
            <DataRow label="Global freeze" value={issuer.powers.globalFreeze ? "Set" : "Clear"} />
            <DataRow label="RequireAuth" value={issuer.powers.requireAuth ? "Set" : "Clear"} />
            <DataRow label="Issuer retains freeze power" value={issuer.powers.noFreeze ? "No" : "Yes"} />
            <DataRow label="Supply concentration" value="Unknown in this snapshot" tone="hold" />
            <DataRow label="Reserves" value="Outside this ledger observation" tone="muted" />
          </> : <p role="status" className="text-sm text-hold">HOLD · Archived RLUSD issuer controls are unavailable.</p>}
          <p className="mt-4 text-sm text-muted-foreground">Planned expansion includes issuer-control change monitoring and payment-specific trust-line checks.</p>
        </Panel>
      </div>}
      {step === "handoff" && <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="Simulated · Hypothetical Dfns evaluation">
          <h2 className="text-lg font-medium">Review a proposed RLUSD payment before signing</h2>
          <p className="my-3 text-sm text-muted-foreground">
            A mocked wallet provider supplies a 250 RLUSD intent on XRPL mainnet. It has no destination tag. In a future integration,
            the wallet provider retains signing and execution responsibility. This rehearsal makes no requests to Dfns.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={buttonClass} disabled={pending}
              onClick={() => { void run(() => rehearseWalletHandoff(false), setHandoff); }}>Assess simulated intent</button>
            <button type="button" className={buttonClass} disabled={pending || !handoff}
              onClick={() => { void run(() => rehearseWalletHandoff(true), setHandoff); }}>Simulate new tag requirement</button>
          </div>
        </Panel>
        <Panel label="Simulated · Operator review">
          {handoff ? <div aria-live="polite">
            <DataRow label="Assessment" value={handoff.verdict} tone={handoff.verdict === "NO-GO" ? "no-go" : "hold"} />
            <DataRow label="Signing authorization" value={handoff.signingAuthorized ? "Granted" : "Unavailable"} />
            <dl><Identifier label="Intent fingerprint">{handoff.intentHash ?? "Unavailable"}</Identifier></dl>
            <ul className="mt-3 space-y-2 text-sm">
              {handoff.reasons.map(reason => <li key={reason}>{reason === "DESTINATION_TAG_REQUIRED"
                ? "The destination now requires a tag. This intent has none."
                : reason === "XRPL_EVIDENCE_NOT_PROVIDED"
                  ? "Live validated XRPL evidence is unavailable in this rehearsal."
                  : reason === "ISSUED_ASSET_STATE_UNKNOWN"
                    ? "Trust-line authorization and freeze state are unknown."
                    : reason === "ISSUED_ASSET_SETTLEMENT_CHECKS_INCOMPLETE"
                      ? "Issued-asset settlement checks are incomplete."
                      : reason}</li>)}
            </ul>
          </div> : <p className="text-sm text-muted-foreground">Assess the intent, then change the simulated destination condition to see the new disposition.</p>}
        </Panel>
      </div>}
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><Demo /></React.StrictMode>);
