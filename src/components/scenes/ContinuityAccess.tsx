import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveTextFile } from "@/lib/export";
import {
  canonical,
  credentialsOf,
  isAddress,
  isDomainId,
  readDomain,
  sha256Hex,
  validatedLedger,
  type CredentialEntry,
  type DomainEntry,
  type LedgerAt,
} from "@/lib/compliance/registry";
import { compareDomainRules, forecastAccess } from "@/lib/continuity/access";
import {
  renderDecisionReport,
  verifyDecisionPack,
} from "@/lib/continuity/decisionPack";
import { ContinuityWork } from "./ContinuityWork";
import {
  sampleAccounts,
  sampleDomain,
  sampleTime,
} from "@/lib/continuity/sample";

type Portfolio = {
  source: "fictional sample" | "validated ledger";
  domain: DomainEntry;
  accounts: { account: string; credentials: CredentialEntry[] }[];
  ledger: LedgerAt | null;
  closeTime: number;
};
const sample: Portfolio = {
  source: "fictional sample",
  domain: sampleDomain,
  accounts: sampleAccounts,
  ledger: null,
  closeTime: sampleTime,
};

export function ContinuityAccess() {
  const [restored, setRestored] = useState<Awaited<
    ReturnType<typeof verifyDecisionPack>
  > | null>(null);
  const [revision, setRevision] = useState(0);
  const restoreInput = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(sample);
  const [domainId, setDomainId] = useState("");
  const [accounts, setAccounts] = useState("");
  const [horizon, setHorizon] = useState(7);
  const [removed, setRemoved] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const validHorizon =
    Number.isInteger(horizon) && horizon >= 1 && horizon <= 365;
  const report = useMemo(() => {
    if (!portfolio || !validHorizon) return null;
    const proposed = portfolio.domain.accepted.filter(
      (_, index) => !removed.includes(index),
    );
    return {
      source: portfolio.source,
      ledger: portfolio.ledger,
      closeTime: portfolio.closeTime,
      provenance: restored
        ? "Imported observations. File integrity and calculation replay checked. Source authenticity requires a fresh ledger read."
        : portfolio.source === "fictional sample"
          ? "Fictional sample observations."
          : "Read from Mainnet in this workspace at the stated ledger index.",
      domain: portfolio.domain,
      proposedRules: proposed,
      horizonDays: horizon,
      accounts: portfolio.accounts.map((item) => {
        const input = {
          ...item,
          domain: portfolio.domain,
          closeTime: portfolio.closeTime,
          horizonDays: horizon,
        };
        return {
          ...item,
          forecast: forecastAccess(input),
          ruleImpact: proposed.length
            ? compareDomainRules(input, proposed)
            : null,
        };
      }),
    };
  }, [portfolio, removed, horizon, validHorizon, restored]);

  async function read() {
    setMessage("");
    setPortfolio(null);
    setRestored(null);
    const list = [...new Set(accounts.split(/[\s,]+/).filter(Boolean))];
    if (
      !isDomainId(domainId) ||
      !list.length ||
      list.length > 20 ||
      list.some((account) => !isAddress(account))
    ) {
      setMessage(
        "Enter a domain ID and 1–20 distinct classic account addresses.",
      );
      return;
    }
    setBusy(true);
    try {
      const ledger = await validatedLedger();
      const domain = await readDomain(domainId, ledger.index);
      if (!domain)
        throw new Error(
          "Domain absent from this ledger. Check the ID and network.",
        );
      const held = await Promise.all(
        list.map(async (account) => ({
          account,
          credentials: await credentialsOf(account, "subject", ledger.index),
        })),
      );
      setPortfolio({
        source: "validated ledger",
        domain,
        accounts: held,
        ledger,
        closeTime: ledger.closeTime,
      });
      setRemoved([]);
      setMessage(
        "Read complete. Every account was checked at the same ledger index.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Read failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreFile(file?: File) {
    if (!file) return;
    setRestoring(true);
    try {
      if (file.size > 2000000)
        throw new Error("Maximum saved review size is 2 MB.");
      const verified = await verifyDecisionPack(JSON.parse(await file.text()));
      setPortfolio({
        ...verified.snapshot,
        source: verified.source,
        ledger: verified.ledger,
      });
      setDomainId(verified.snapshot.domain.domainId);
      setAccounts(
        verified.snapshot.accounts.map((item) => item.account).join("\n"),
      );
      setHorizon(verified.horizonDays);
      setRemoved(
        verified.snapshot.domain.accepted.flatMap((rule, index) =>
          verified.proposedRules.some(
            (candidate) =>
              candidate.issuer === rule.issuer &&
              candidate.typeHex === rule.typeHex,
          )
            ? []
            : [index],
        ),
      );
      setRestored(verified);
      setRevision((value) => value + 1);
      setMessage(
        "Saved review reopened. Digest and replay match. Source observations need independent verification.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to reopen review.",
      );
    } finally {
      setRestoring(false);
    }
  }

  async function exportReport() {
    if (!report) return;
    setExporting(true);
    try {
      const evidence = { version: 1 as const, ...report };
      const digest = await sha256Hex(canonical(evidence));
      await saveTextFile(
        "continuity-access-review.json",
        JSON.stringify({ evidence, sha256: digest }, null, 2),
        "application/json",
      );
      setMessage("Saved access review and SHA-256 digest.");
    } catch {
      setMessage("Export failed. Try again while the review is open.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="ct-studio">
      <aside className="ct-controls" aria-label="Change inputs">
        <h2>Change rehearsal</h2>
        <p>Choose the domain, accounts and proposed rules.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void read();
          }}
        >
          <label>
            Permissioned domain ID
            <Input
              value={domainId}
              onChange={(event) => {
                setDomainId(event.target.value);
                setPortfolio(null);
              }}
              disabled={busy || restoring}
            />
          </label>
          <label>
            Accounts
            <textarea
              rows={3}
              value={accounts}
              disabled={busy || restoring}
              onChange={(event) => {
                setAccounts(event.target.value);
                setPortfolio(null);
              }}
            />
          </label>
          <div className="ct-actions">
            <Button disabled={busy || restoring} type="submit">
              {busy ? "Reading…" : "Read ledger"}
            </Button>
            <Button
              disabled={busy || restoring}
              variant="outline"
              type="button"
              onClick={() => {
                setPortfolio(sample);
                setRemoved([]);
                setRestored(null);
                setRevision((value) => value + 1);
                setMessage("");
              }}
            >
              Load sample
            </Button>
            <Button
              disabled={busy || restoring}
              variant="outline"
              type="button"
              onClick={() => restoreInput.current?.click()}
            >
              {restoring ? "Verifying…" : "Reopen saved rehearsal"}
            </Button>
            <input
              hidden
              type="file"
              accept=".json"
              ref={restoreInput}
              aria-label="Saved rehearsal JSON"
              onChange={(event) => {
                void restoreFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </form>
        <p role="status">{message}</p>
        {portfolio && (
          <>
            <label>
              Forecast days
              <Input
                type="number"
                min={1}
                max={365}
                value={Number.isNaN(horizon) ? "" : horizon}
                onChange={(event) => setHorizon(event.target.valueAsNumber)}
              />
            </label>
            {!validHorizon && <p role="alert">Enter 1–365 whole days.</p>}
            <fieldset>
              <legend className="text-xs font-medium">
                Retain credential rules
              </legend>
              {portfolio.domain.accepted.map((rule, index) => (
                <label key={rule.issuer + rule.typeHex} className="break-all">
                  <input
                    type="checkbox"
                    checked={!removed.includes(index)}
                    onChange={(event) =>
                      setRemoved(
                        event.target.checked
                          ? removed.filter((value) => value !== index)
                          : [...removed, index],
                      )
                    }
                  />{" "}
                  {rule.type ?? rule.typeHex}
                  <small className="block text-muted-foreground">
                    {rule.issuer}
                  </small>
                </label>
              ))}
            </fieldset>
            {removed.length === portfolio.domain.accepted.length && (
              <p role="alert">Keep at least one rule.</p>
            )}
            <details>
              <summary>Assumptions</summary>
              <p>
                Credentials and rules stay as observed until each deadline.
                Renewals and revocations change the projection. Domain owners
                keep owner access.
              </p>
            </details>
          </>
        )}
      </aside>
      <section className="ct-results" aria-label="Change results">
        {portfolio ? (
          <>
            <p className="ct-source">
              {restored
                ? "Imported snapshot · source unverified"
                : portfolio.source === "fictional sample"
                  ? "Fictional sample portfolio"
                  : `Mainnet ledger ${portfolio.ledger?.index} · ${portfolio.ledger?.closeIso}`}
            </p>
            <header className="ct-result-head">
              <h2>Access outlook</h2>
              <Button
                variant="outline"
                disabled={!report || exporting}
                onClick={() => void exportReport()}
              >
                {exporting ? "Saving…" : "Export access evidence"}
              </Button>
            </header>
            {report && (
              <div className="ct-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Expiry outlook</th>
                      <th>Rule removal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.accounts.map((row) => (
                      <tr key={row.account}>
                        <th scope="row">{row.account}</th>
                        <td>
                          {row.forecast.outcome}
                          <small className="block">{row.forecast.lossAt}</small>
                        </td>
                        <td>
                          {row.ruleImpact?.outcome ?? "Scenario incomplete"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {report && (
              <ContinuityWork
                key={
                  portfolio.source +
                  (portfolio.ledger?.index ?? "sample") +
                  revision
                }
                snapshot={portfolio}
                proposed={report.proposedRules}
                sample={portfolio.source === "fictional sample"}
                initialReview={restored?.rehearsal}
                save={async (work, format) => {
                  const evidence = {
                    version: 1 as const,
                    ...report,
                    rehearsal: work,
                  };
                  const digest = await sha256Hex(canonical(evidence));
                  await saveTextFile(
                    "continuity-change-rehearsal.json",
                    JSON.stringify({ evidence, sha256: digest }, null, 2),
                    "application/json",
                  );
                  if (format === "html")
                    await saveTextFile(
                      "continuity-decision-report.html",
                      renderDecisionReport(evidence, digest),
                      "text/html",
                    );
                  setMessage("Saved change rehearsal and evidence digest.");
                }}
              />
            )}
          </>
        ) : (
          <p className="ct-empty">
            Read the ledger, reopen a saved review or load the sample.
          </p>
        )}
      </section>
    </div>
  );
}
