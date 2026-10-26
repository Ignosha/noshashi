import { useRef, useState } from "react";
import { Panel } from "@/components/nova/Panel";
import { Signal } from "@/components/nova/Signal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { isTauri } from "@/lib/env";
import { saveTextFile } from "@/lib/export";
import {
  buildInvoice,
  EMPTY_INVOICE,
  evidenceFile,
  formatAmountView,
  verifyPayment,
  type InvoiceForm,
  type VerifyResponse,
  type VerificationStatus,
} from "@/lib/desk/verifyPayment";
import { cn } from "@/lib/utils";

/**
 * Did this transaction pay this invoice? The verdict comes from the Rust
 * engine (verify_xrpl_payment); this panel collects the invoice, shows the
 * answer and never colours anything green unless the engine said VERIFIED.
 */

const TONE: Record<VerificationStatus, { text: string; border: string; label: string }> = {
  VERIFIED: { text: "text-go", border: "border-go/50", label: "VERIFIED" },
  HOLD: { text: "text-hold", border: "border-hold/50", label: "HOLD: DO NOT CREDIT YET" },
  REJECTED: { text: "text-no-go", border: "border-no-go/50", label: "REJECTED: DO NOT CREDIT" },
};

function Field({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="mt-2.5">
      <Label htmlFor={id} className="text-[10.5px] tracking-wide">
        {label}
      </Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} className="mt-1 font-mono text-[11px]" />
    </div>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-2.5 flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-[10.5px] leading-snug tracking-wide">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function InvoiceCheck({ hash }: { hash: string }) {
  const [form, setForm] = useState<InvoiceForm>(EMPTY_INVOICE);
  const [network, setNetwork] = useState<"mainnet" | "testnet">("mainnet");
  const [dualSource, setDualSource] = useState(true);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  // Guards double clicks; settlement idempotency is the engine's job.
  const inflight = useRef(false);

  const set = <K extends keyof InvoiceForm>(key: K) => (value: InvoiceForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const check = async () => {
    if (inflight.current) return;
    setError(null);
    setSaved(null);
    if (!/^[0-9A-Fa-f]{64}$/.test(hash.trim())) {
      setError("Enter the transaction hash above first.");
      return;
    }
    const invoice = buildInvoice(form);
    if (typeof invoice === "string") {
      setError(invoice);
      return;
    }
    inflight.current = true;
    setBusy(true);
    setResult(null);
    try {
      setResult(await verifyPayment({ hash: hash.trim(), network, invoice, dualSource, record: true }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };

  const exportEvidence = async () => {
    if (!result) return;
    const file = evidenceFile(result.report);
    setSaved(await saveTextFile(file.filename, file.contents, "application/json"));
  };

  const r = result?.report;
  const tone = r ? TONE[r.status] : null;

  return (
    <Panel label="INVOICE CHECK" className="shrink-0">
      {!isTauri && (
        <p className="mb-2 text-[11px] leading-relaxed text-faint">
          Invoice verification runs in the desktop app, where the checks are made in Rust against the ledger.
        </p>
      )}
      <Field id="inv-id" label="INVOICE ID" value={form.invoiceId} onChange={set("invoiceId")} placeholder="INV-1042" />
      <Field id="inv-dest" label="RECEIVING ACCOUNT" value={form.destination} onChange={set("destination")} placeholder="r…" />
      <Field id="inv-tag" label="DESTINATION TAG (OPTIONAL)" value={form.destinationTag} onChange={set("destinationTag")} />
      <div className="mt-2.5 flex gap-2" role="radiogroup" aria-label="Asset">
        {(["xrp", "issued"] as const).map((k) => (
          <Button key={k} type="button" size="sm" variant={form.assetKind === k ? "default" : "outline"} aria-pressed={form.assetKind === k} onClick={() => set("assetKind")(k)}>
            {k === "xrp" ? "XRP" : "ISSUED TOKEN"}
          </Button>
        ))}
      </div>
      {form.assetKind === "issued" && (
        <>
          <Field id="inv-cur" label="CURRENCY CODE" value={form.currency} onChange={set("currency")} placeholder="USD or 40-hex" />
          <Field id="inv-iss" label="ISSUER" value={form.issuer} onChange={set("issuer")} placeholder="r…" />
        </>
      )}
      <Field id="inv-amt" label={`EXPECTED AMOUNT (${form.assetKind === "xrp" ? "XRP" : "TOKEN UNITS"})`} value={form.expectedAmount} onChange={set("expectedAmount")} placeholder="125.5" />
      <Field id="inv-tol" label="ACCEPTED SHORTFALL (OPTIONAL)" value={form.tolerance} onChange={set("tolerance")} placeholder="0" />
      <Toggle id="inv-partial" label="Accept partial payments that still meet the invoice" checked={form.allowPartial} onChange={set("allowPartial")} />
      <Toggle id="inv-over" label="Hold overpayments for review" checked={form.holdOverpayment} onChange={set("holdOverpayment")} />
      <Toggle id="inv-dual" label="Compare two independent node operators" checked={dualSource} onChange={setDualSource} />
      <div className="mt-2.5 flex gap-2" role="radiogroup" aria-label="Network">
        {(["mainnet", "testnet"] as const).map((n) => (
          <Button key={n} type="button" size="sm" variant={network === n ? "default" : "outline"} aria-pressed={network === n} onClick={() => setNetwork(n)}>
            {n.toUpperCase()}
          </Button>
        ))}
      </div>
      <Button className="mt-3 w-full" onClick={() => void check()} disabled={busy || !isTauri}>
        {busy ? "CHECKING AGAINST THE LEDGER…" : "CHECK AGAINST INVOICE"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-[11px] text-no-go">
          {error}
        </p>
      )}

      {r && tone && (
        <div className={cn("mt-3 border p-3", tone.border)} aria-live="polite">
          <p className={cn("stencil text-[12px] tracking-[0.14em]", tone.text)}>{tone.label}</p>
          <p className="mt-1 font-mono text-[10.5px] text-faint">{r.reason_code}</p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{r.explanation}</p>
          <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[10.5px]">
            <dt className="text-faint">REQUESTED</dt>
            <dd className="break-all text-muted-foreground">{formatAmountView(r.requested_amount)}</dd>
            <dt className="text-faint">DELIVERED</dt>
            <dd className="break-all text-foreground">{formatAmountView(r.delivered_amount)}</dd>
            <dt className="text-faint">DIFFERENCE</dt>
            <dd className="break-all text-muted-foreground">{r.amount_difference ?? "—"}</dd>
            <dt className="text-faint">PARTIAL</dt>
            <dd className="text-muted-foreground">{r.partial_payment === null ? "unknown" : r.partial_payment ? "flagged" : "no"}</dd>
            <dt className="text-faint">RESULT</dt>
            <dd className="text-muted-foreground">{r.transaction_result ?? "unknown"}</dd>
            <dt className="text-faint">LEDGER</dt>
            <dd className="text-muted-foreground">{r.ledger_index?.toLocaleString() ?? "—"}{r.validated === false ? " (not validated)" : ""}</dd>
            <dt className="text-faint">SOURCES</dt>
            <dd className="break-all text-muted-foreground">{r.sources.join(", ") || "none"}</dd>
            <dt className="text-faint">RULES</dt>
            <dd className="text-muted-foreground">{r.rule_version}</dd>
            <dt className="text-faint">EVIDENCE</dt>
            <dd className="break-all text-muted-foreground">{r.evidence_digest}</dd>
          </dl>
          {r.findings.length > 1 && (
            <div className="mt-2.5 border-t border-border/40 pt-1">
              {r.findings.slice(1).map((f, i) => (
                <Signal key={`${f.code}-${i}`} severity="info" kicker={f.code} headline={f.explanation} className="rounded-none border-b border-border/20 px-0" />
              ))}
            </div>
          )}
          {result?.recorded && <p className="mt-2 text-[10.5px] text-faint">Recorded for this session: this transaction can no longer settle a different invoice here.</p>}
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => void exportEvidence()}>
            EXPORT EVIDENCE (JSON)
          </Button>
          {saved && <p className="mt-1.5 text-[10.5px] text-faint">Saved to {saved}</p>}
        </div>
      )}
    </Panel>
  );
}
