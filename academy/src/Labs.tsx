import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Lab, LabStep } from "@/lib/learn/labs";
import { completeStep, labStatus, sanitizeProgress, shuffled, stepKey } from "@/lib/learn/labProgress";
import { testnetInvoice, testnetRecorded } from "@/lib/academy/testnetLab";
import { useOnline } from "./useOnline";
import { LAB_SUBJECTS } from "@/lib/learn/labs";
import { BENCHES, runInvoice, type BenchResult, type InvoiceRun } from "./benches";
import { ALL_LABS, labById } from "./labs";
import { useLocal } from "./useLocal";

/**
 * Labs — practising every NOSHASHI feature on the real XRP Ledger.
 *
 * Each step says what to do in NOSHASHI, in its own words and button names,
 * so a trainee who has the app can follow it there. Where the reading needs
 * only the public ledger, a practice bench makes the same reading here with
 * NOSHASHI's own code, on the step's real address, so a trainee without the
 * app still sees live results. Then one question, explained right or wrong.
 */

/** Invoice checks the mainnet invoice lab runs, exactly as recorded in the shared vectors. */
const CSC = {
  destination: LAB_SUBJECTS.cscDestination,
  asset: { kind: "issued", currency: "CSC", issuer: LAB_SUBJECTS.cscIssuer },
};
/** What the mainnet invoice runs decided when recorded (tests/fixtures/payment-verify-vectors.json). */
const INVOICE_RECORDED: Record<string, string> = {
  "invoice/rejected": "REJECTED · PARTIAL_NOT_PERMITTED",
  "invoice/verified": "VERIFIED · SETTLED_PARTIAL_PERMITTED",
};
const INVOICE_RUNS: Record<string, InvoiceRun> = {
  "invoice/rejected": {
    network: "mainnet",
    hash: LAB_SUBJECTS.cscPayment,
    invoice: { invoice_id: "INV-CSC-1", ...CSC, expected_amount: "162.6994990013102" },
  },
  "invoice/verified": {
    network: "mainnet",
    hash: LAB_SUBJECTS.cscPayment,
    invoice: { invoice_id: "INV-CSC-2", ...CSC, expected_amount: "161.1605415577872", allow_partial_payment: true },
  },
};

function invoiceRunFor(lab: Lab, step: LabStep): InvoiceRun | null {
  if (lab.id === "invoice-testnet") return testnetInvoice(step.id);
  return INVOICE_RUNS[stepKey(lab.id, step.id)] ?? null;
}

function subjectOf(step: LabStep): string | null {
  return step.subject ?? step.copy?.[0]?.value ?? null;
}

export function useLabProgress() {
  const [stored, store] = useLocal<unknown>("academy.labs", null);
  return [sanitizeProgress(stored), store] as const;
}

export function Labs({ openId, onClose }: { openId: string | null; onClose: () => void }) {
  const [progress, setProgress] = useLabProgress();
  const [labId, setLabId] = useState<string | null>(openId);
  const lab = labId ? labById(labId) : undefined;

  if (!lab) {
    return (
      <div className="flex flex-col gap-3">
        <p className="max-w-[70ch] text-[12.5px] text-muted-foreground">
          {ALL_LABS.length} labs, one for every NOSHASHI feature. Each uses real XRP Ledger addresses and transactions. Where a lab can read the ledger
          here, press RUN IT HERE to see live results; if you have NOSHASHI, follow the same steps there.
        </p>
        <ul className="flex flex-col gap-1.5">
          {ALL_LABS.map((l) => {
            const s = labStatus(l, progress);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setLabId(l.id)}
                  className="inset-row flex w-full items-start gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                >
                  <span aria-hidden className={cn("mt-0.5 w-4 font-mono text-[12px]", s.complete ? "text-go" : "text-faint")}>
                    {s.complete ? "✓" : "○"}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[12.5px] font-medium text-foreground">{l.title}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{l.outcome}</span>
                  </span>
                  <span className="font-mono text-[10.5px] text-faint">
                    {s.done}/{s.total} · ~{l.minutes} MIN
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <LabRun
      key={lab.id}
      lab={lab}
      progress={progress}
      onDone={(key) => setProgress(completeStep(progress, key, Date.now()))}
      onBack={() => {
        setLabId(null);
        onClose();
      }}
    />
  );
}

function LabRun({
  lab,
  progress,
  onDone,
  onBack,
}: {
  lab: Lab;
  progress: ReturnType<typeof sanitizeProgress>;
  onDone: (key: string) => void;
  onBack: () => void;
}) {
  const [at, setAt] = useState(() => Math.min(labStatus(lab, progress).next, lab.steps.length - 1));
  const step = lab.steps[at];
  const key = stepKey(lab.id, step.id);
  const done = !!progress.done[key];
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="self-start font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground hover:text-brand">
        ← ALL LABS
      </button>
      <div>
        <h2 className="text-[16px] font-semibold text-foreground">{lab.title}</h2>
        <p className="text-[12px] text-muted-foreground">{lab.outcome}</p>
        {lab.note && <p className="mt-1 text-[11px] text-faint">{lab.note}</p>}
        {lab.requires && <p className="mt-1 text-[11px] text-faint">In NOSHASHI this screen needs a paid plan. The practice bench here is free.</p>}
      </div>
      <p className="font-mono text-[10.5px] tracking-[0.1em] text-faint">
        STEP {at + 1} OF {lab.steps.length}
      </p>
      <section className="flex flex-col gap-2 rounded-[4px] border border-border/70 px-3.5 py-3">
        <h3 className="text-[13.5px] font-semibold text-foreground">{step.task}</h3>
        <Values step={step} />
        <Bench lab={lab} step={step} />
        <p className="text-[12px] text-muted-foreground">
          <strong className="text-foreground">Look for:</strong> {step.lookFor}
        </p>
      </section>
      <Checkpoint key={key} step={step} seed={key} done={done} onRight={() => onDone(key)} />
      <div className="flex gap-2">
        <Button variant="outline" disabled={at === 0} onClick={() => setAt(at - 1)}>
          ← PREVIOUS STEP
        </Button>
        {at < lab.steps.length - 1 ? (
          <Button onClick={() => setAt(at + 1)}>NEXT STEP →</Button>
        ) : (
          <Button onClick={onBack}>FINISH LAB</Button>
        )}
      </div>
    </div>
  );
}

function Values({ step }: { step: LabStep }) {
  const [copied, setCopied] = useState<string | null>(null);
  const values = [...(step.subject ? [{ label: step.subjectLabel ?? "VALUE", value: step.subject }] : []), ...(step.copy ?? [])];
  if (!values.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {values.map(({ label, value }) => (
        <div key={`${label}:${value}`} className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-[10.5px] tracking-[0.1em] text-faint">{label.toUpperCase()}</span>
          <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-telemetry" title={value}>
            {value}
          </code>
          <button
            type="button"
            aria-label={`Copy ${label}`}
            onClick={() =>
              void navigator.clipboard.writeText(value).then(
                () => {
                  setCopied(value);
                  window.setTimeout(() => setCopied(null), 1500);
                },
                () => undefined
              )
            }
            className="shrink-0 font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground hover:text-brand"
          >
            {copied === value ? "COPIED" : "COPY"}
          </button>
        </div>
      ))}
    </div>
  );
}

function Bench({ lab, step }: { lab: Lab; step: LabStep }) {
  const invoice = invoiceRunFor(lab, step);
  const bench = invoice ? { label: "CHECK AGAINST INVOICE", run: () => runInvoice(invoice) } : BENCHES[step.scene];
  const subject = subjectOf(step);
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BenchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!bench || (!invoice && !subject && step.scene !== "network")) {
    return <p className="text-[11px] text-faint">This step happens in NOSHASHI itself; read what to look for, then answer the question below.</p>;
  }
  // Offline, or the ledger did not answer: show what was recorded instead.
  // Every lab step already states its recorded reading and the ledger it
  // was read at; invoice steps also carry the verdict they were recorded with.
  const recorded = (): BenchResult => {
    const key = stepKey(lab.id, step.id);
    const t = lab.id === "invoice-testnet" ? testnetRecorded(step.id) : null;
    if (t) return { headline: `Recorded: ${t.headline}`, rows: t.rows, findings: [] };
    return {
      headline: INVOICE_RECORDED[key] ? `Recorded: ${INVOICE_RECORDED[key]}` : "Recorded reading",
      rows: [],
      findings: [{ id: "recorded", severity: "info", title: "As recorded", detail: step.lookFor }],
    };
  };
  const run = async () => {
    setBusy(true);
    setError(null);
    if (!online) {
      setResult(recorded());
      setError("You are offline, so this is the reading recorded when the lab was written. Connect and run it again for a live reading.");
      setBusy(false);
      return;
    }
    try {
      setResult(await bench.run(subject ?? ""));
    } catch {
      setResult(recorded());
      setError("The ledger could not be reached, so this is the recorded reading. Try again when you are connected for a live one.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-[4px] bg-brand/5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void run()} disabled={busy}>
          {busy ? "READING THE LEDGER…" : online ? `RUN IT HERE: ${bench.label}` : "SHOW THE RECORDED READING"}
        </Button>
        <span className="text-[11px] text-faint">
          {online
            ? `Live from the XRP Ledger${invoice?.network === "testnet" ? " testnet" : ""}, using NOSHASHI's own code.`
            : "Offline: shows the real reading recorded for this step."}
        </span>
      </div>
      <div aria-live="polite">
        {error && <p className="text-[12px] text-hold">{error}</p>}
        {result && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] font-semibold text-foreground">{result.headline}</p>
            {result.rows.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
                {result.rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-mono text-faint">{k}</dt>
                    <dd className="break-all font-mono text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {result.findings.map((f) => (
              <div key={f.id} className="border-l-2 pl-2.5" style={{ borderColor: f.severity === "critical" ? "hsl(var(--status-no-go))" : f.severity === "warn" ? "hsl(var(--status-hold))" : f.severity === "ok" ? "hsl(var(--status-go))" : "hsl(var(--border))" }}>
                <p className="text-[12px] font-medium text-foreground">{f.title}</p>
                <p className="text-[11.5px] text-muted-foreground">{f.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Checkpoint({ step, seed, done, onRight }: { step: LabStep; seed: string; done: boolean; onRight: () => void }) {
  const q = shuffled(step.check.options, step.check.answer, seed);
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-[13px] font-semibold text-foreground">
        {step.check.question} {done && <span className="font-mono text-[10.5px] text-go">✓ DONE</span>}
      </legend>
      {q.options.map((o, i) => (
        <label
          key={o}
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-[4px] border px-3 py-2 text-[12.5px]",
            picked !== null && i === q.answer && "border-go/60 bg-go/10",
            picked === i && i !== q.answer && "border-no-go/60 bg-no-go/10",
            picked === null && "border-border/70 hover:border-brand/40"
          )}
        >
          <input
            type="radio"
            name={seed}
            className="mt-0.5 h-4 w-4"
            checked={picked === i}
            onChange={() => {
              setPicked(i);
              if (i === q.answer) onRight();
            }}
          />
          <span>{o}</span>
        </label>
      ))}
      <div aria-live="polite">
        {picked !== null && (
          <p className="rounded-[4px] bg-elevated px-3 py-2 text-[12.5px] text-foreground">
            <strong>{picked === q.answer ? "Right. " : "Not quite. "}</strong>
            {step.check.why}
          </p>
        )}
      </div>
    </fieldset>
  );
}
