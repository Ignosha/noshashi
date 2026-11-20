import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canonical, sha256Hex } from "@/lib/compliance/registry";
import { saveTextFile } from "@/lib/export";
import {
  readIssuerClosures,
  sampleIssuerReview,
  type IssuerReview,
} from "@/lib/continuity/issuer";

export function ContinuityIssuer() {
  const [issuer, setIssuer] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [days, setDays] = useState(30);
  const [requireFrozen, setRequireFrozen] = useState(false);
  const [input, setInput] = useState(
    '[{"id":"Closure-01","wallet":null,"closed":"2026-11-01"}]',
  );
  const [report, setReport] = useState<IssuerReview | null>(sampleIssuerReview);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function read() {
    setBusy(true);
    setReport(null);
    setMessage("");
    try {
      setReport(
        await readIssuerClosures(
          issuer.trim(),
          currency.trim(),
          JSON.parse(input),
          days,
          requireFrozen,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ledger read failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!report) return;
    try {
      const evidence = { format: "continuity-issuer-v1", ...report };
      const sha256 = await sha256Hex(canonical(evidence));
      await saveTextFile(
        "continuity-issuer-review.json",
        JSON.stringify({ evidence, sha256 }, null, 2),
        "application/json",
      );
      setMessage("Issuer review saved.");
    } catch {
      setMessage("Export failed. Try again.");
    }
  }
  return (
    <div className="ct-studio">
      <aside className="ct-controls">
        <h2>Issuer offboarding</h2>
        <p>Check closures against one ledger snapshot.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void read();
          }}
        >
          <fieldset disabled={busy} onChange={() => setReport(null)}>
            <label>
              Issuer
              <Input
                value={issuer}
                onChange={(event) => setIssuer(event.target.value)}
              />
            </label>
            <label>
              Currency code
              <Input
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              />
            </label>
            <label>
              Redemption days
              <Input
                type="number"
                min={0}
                max={365}
                value={Number.isNaN(days) ? "" : days}
                onChange={(event) => setDays(event.target.valueAsNumber)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={requireFrozen}
                onChange={(event) => setRequireFrozen(event.target.checked)}
              />{" "}
              Policy requires individual freeze
            </label>
            <label>
              Closure records
              <textarea
                rows={9}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={50000}
                spellCheck={false}
              />
            </label>
            <details>
              <summary>Record format</summary>
              <p>
                Each record needs id, wallet and closed (YYYY-MM-DD). Use null
                for a missing wallet mapping. Up to 20 records.
              </p>
            </details>
          </fieldset>
          <Button disabled={busy} type="submit">
            {busy ? "Reading…" : "Read Mainnet"}
          </Button>
        </form>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => {
            setReport(sampleIssuerReview());
            setDays(30);
            setRequireFrozen(false);
            setCurrency("USD");
            setMessage("");
          }}
        >
          Load sample
        </Button>
        <p role="status">{message}</p>
      </aside>
      <section className="ct-findings" aria-label="Issuer findings">
        <div className="ct-result-head">
          <h2>Closure queue</h2>
          <Button
            disabled={!report}
            variant="outline"
            onClick={() => void save()}
          >
            Export evidence
          </Button>
        </div>
        {report && (
          <>
            <p className="ct-source">
              {report.source} ·{" "}
              {report.ledger ? `Ledger ${report.ledger.index}` : report.asOf}
            </p>
            <div className="ct-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Balance</th>
                    <th>Issuer permissions</th>
                    <th>Finding</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">
                        {row.id}
                        <small>{row.wallet ?? "Mapping missing"}</small>
                      </th>
                      <td>
                        {row.fact
                          ? `${row.fact.balance} ${report.currency}`
                          : "Unknown"}
                      </td>
                      <td>
                        {row.fact
                          ? `${row.fact.authorized ? "Authorized" : "Authorization flag off"} · ${row.fact.frozen ? "Frozen" : "Individual freeze off"}`
                          : "Unknown"}
                      </td>
                      <td>{row.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ct-footnote">
              Policy window · {report.graceDays} days. Findings cover this
              issuer and asset. Customer mappings remain operator declarations.
            </p>
          </>
        )}
        {!report && (
          <p className="ct-empty">
            Read the ledger or load the sample to see the closure queue.
          </p>
        )}
      </section>
    </div>
  );
}
