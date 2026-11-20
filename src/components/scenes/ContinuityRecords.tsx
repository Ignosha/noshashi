import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { canonical, sha256Hex } from "@/lib/compliance/registry";
import { saveTextFile } from "@/lib/export";
import { reviewBridge, reviewLending } from "@/lib/continuity/portfolio";
import { bridgeSample, lendingSample } from "@/lib/continuity/portfolioSamples";

const modes = {
  bridge: {
    title: "Bridge reconciliation",
    action: "Reconcile records",
    sample: bridgeSample,
    hint: "Match the destination receipt to the expected net amount and accounting credit.",
  },
  lending: {
    title: "Borrower concentration",
    action: "Check exposure",
    sample: lendingSample,
    hint: "Combine explicitly mapped wallets against one portfolio limit.",
  },
};
export function ContinuityRecords({ mode }: { mode: "bridge" | "lending" }) {
  const config = modes[mode];
  const [input, setInput] = useState(JSON.stringify(config.sample, null, 2));
  const [fictional, setFictional] = useState(true);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<
    ReturnType<typeof reviewBridge> | ReturnType<typeof reviewLending> | null
  >(null);
  const file = useRef<HTMLInputElement>(null);
  function run() {
    setReport(null);
    setMessage("");
    try {
      if (input.length > 250000)
        throw new Error("Maximum record size is 250 KB.");
      setReport(
        mode === "bridge"
          ? reviewBridge(JSON.parse(input))
          : reviewLending(JSON.parse(input)),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review failed.");
    }
  }
  async function importFile(selected?: File) {
    if (!selected) return;
    try {
      if (selected.size > 250000)
        throw new Error("Maximum record size is 250 KB.");
      setInput(await selected.text());
      setFictional(false);
      setReport(null);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    }
  }
  async function save() {
    if (!report) return;
    try {
      const evidence = {
        format: `continuity-${mode}-v1`,
        records: JSON.parse(input),
        source: fictional ? "Fictional sample" : "Operator-supplied records",
        report,
      };
      const sha256 = await sha256Hex(canonical(evidence));
      await saveTextFile(
        `continuity-${mode}-review.json`,
        JSON.stringify({ evidence, sha256 }, null, 2),
        "application/json",
      );
      setMessage("Evidence saved.");
    } catch {
      setMessage("Export failed. Try again.");
    }
  }
  return (
    <div className="ct-studio">
      <section className="ct-controls" aria-label={`${config.title} input`}>
        <h2>{config.title}</h2>
        <p>{config.hint}</p>
        <div className="ct-actions">
          <Button variant="outline" onClick={() => file.current?.click()}>
            Import JSON
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setInput(JSON.stringify(config.sample, null, 2));
              setFictional(true);
              setReport(null);
              setMessage("");
            }}
          >
            Load sample
          </Button>
        </div>
        <input
          hidden
          type="file"
          accept=".json"
          ref={file}
          aria-label={`${mode} records JSON`}
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <label>
          Source records
          <textarea
            rows={19}
            spellCheck={false}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setFictional(false);
              setReport(null);
            }}
          />
        </label>
        <Button onClick={run}>{config.action}</Button>
        <p role="status">{message}</p>
      </section>
      <section className="ct-results" aria-label={`${config.title} results`}>
        <p className="ct-source">
          {fictional ? "Fictional sample" : "Operator-supplied records"} ·
          independent verification required
        </p>
        {!report && (
          <p className="ct-empty">
            Run the review to see exceptions and evidence.
          </p>
        )}
        {report && (
          <>
            <header className="ct-result-head">
              <h2>{report.outcome}</h2>
              <Button variant="outline" onClick={() => void save()}>
                Export findings
              </Button>
            </header>
            {"reasons" in report ? (
              <ul className="ct-findings">
                {report.reasons.length ? (
                  report.reasons.map((reason) => <li key={reason}>{reason}</li>)
                ) : (
                  <li>
                    Expected destination, delivered amount and single accounting
                    credit agree.
                  </li>
                )}
              </ul>
            ) : (
              <>
                <p className="ct-source">{report.assetId}</p>
                <dl className="ct-metrics">
                  <div>
                    <dt>Current exposure</dt>
                    <dd>{report.existing}</dd>
                  </div>
                  <div>
                    <dt>Proposed exposure</dt>
                    <dd>{report.proposed}</dd>
                  </div>
                  <div>
                    <dt>Available before request</dt>
                    <dd>{report.remainingUnderLimit}</dd>
                  </div>
                </dl>
                <p>
                  {report.covered
                    ? "Declared export and borrower mappings complete"
                    : "Export or mapping coverage needs review"}{" "}
                  · {report.unmapped} unmapped loans
                </p>
              </>
            )}
            <p className="ct-footnote">{report.source}</p>
            <details>
              <summary>Evidence record</summary>
              <pre>{JSON.stringify(report, null, 2)}</pre>
            </details>
          </>
        )}
        <p className="ct-footnote">
          {mode === "bridge"
            ? "Amounts use asset units. Expected delivery is net of route fees. Status and receipts come from your supplied records."
            : "The portfolio value is the limit basis you declare. Outcomes measure concentration under that basis."}
        </p>
      </section>
    </div>
  );
}
