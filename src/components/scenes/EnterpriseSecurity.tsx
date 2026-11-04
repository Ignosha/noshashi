import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveTextFile } from "@/lib/export";
import { readSetting, writeSetting } from "@/lib/store";
import { isValidAddress } from "@/lib/xrpl/client";
import {
  evidenceRecord,
  parseWorkflowJson,
} from "@/lib/security/workflowEvidence";
import {
  softwareInventory,
  scanDependencies,
  type Exposure,
} from "@/lib/security/dependencyExposure";
import {
  treasuryModel,
  treasuryDrill,
  type TreasuryModel,
} from "@/lib/security/treasuryScenario";
import {
  READINESS_CHECKS,
  assessReadiness,
  encryptReadiness,
  decryptReadiness,
  type ReadinessPlan,
  type EncryptedReadiness,
} from "@/lib/security/readiness";
import {
  readLedgerIntegrity,
  type IntegrityReport,
} from "@/lib/security/ledgerIntegrity";

function Intro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <header className="mb-5">
      <p className="mono-font text-xs tracking-widest text-muted-foreground">
        {eyebrow}
      </p>
      <h2
        className="mt-2 text-3xl"
        style={{ fontFamily: "var(--font-editorial)" }}
      >
        {title}
      </h2>
      <div className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </header>
  );
}
function ExportEvidence({
  scope,
  payload,
}: {
  scope: string;
  payload: unknown;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="mt-5">
      <Button
        variant="outline"
        onClick={async () => {
          try {
            const record = await evidenceRecord(scope, payload);
            setNote(
              await saveTextFile(
                `noshashi-${scope}.json`,
                JSON.stringify(record, null, 2),
                "application/json",
              ),
            );
          } catch (e) {
            setNote(e instanceof Error ? e.message : "Export unavailable.");
          }
        }}
      >
        EXPORT COMPLETE EVIDENCE
      </Button>
      <p role="status" className="mt-2 text-xs text-muted-foreground">
        {note}
      </p>
    </div>
  );
}
const editorClass =
  "mono-font mt-2 min-h-48 w-full rounded-none border border-border bg-background p-3 text-xs leading-relaxed text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground";

export function DependencyExposureTab() {
  const [input, setInput] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Exposure | null>(null);
  return (
    <section className="max-w-5xl">
      <Intro
        eyebrow="SUPPLY-CHAIN EXPOSURE / PRO"
        title="Which workflows use a reported vulnerable package?"
      >
        Check an owner-supplied npm inventory against OSV advisory records. This
        does not discover installed software, prove exploitation, scan firmware
        or detect unknown vulnerabilities. A zero-result response is not a
        security clearance.
      </Intro>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setResult(null);
          setError("");
          try {
            const assets = softwareInventory(await parseWorkflowJson(input));
            setResult(await scanDependencies(assets, consent));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Scan unavailable.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="text-sm">
          Your npm software inventory (JSON, exact versions)
          <textarea
            aria-label="Software inventory JSON"
            className={editorClass}
            maxLength={131072}
            value={input}
            disabled={busy}
            placeholder={
              '[{"id":"signing-client","name":"xrpl","version":"4.0.0","workflow":"Signing workstation"}]'
            }
            onChange={(e) => {
              setInput(e.target.value);
              setConsent(false);
              setResult(null);
            }}
          />
        </label>
        <label className="mt-3 flex gap-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I approve sending these package names and versions to OSV. Asset IDs
          and workflow labels stay on this device. Do not include confidential
          package names without authorization.
        </label>
        <Button className="mt-4" disabled={busy || !consent || !input.trim()}>
          {busy ? "CHECKING ADVISORIES…" : "CHECK EXPOSURE"}
        </Button>
      </form>
      {busy && (
        <p role="status" className="mt-3 text-sm">
          Checking up to 50 packages under a 20-second total deadline…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-no-go">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-5 space-y-3">
          <p role="status" className="border-y border-border py-3 text-sm">
            {result.complete
              ? "Requested advisory data returned"
              : "INCOMPLETE ADVISORY COVERAGE"}{" "}
            · {result.observedAt} · OSV snapshot
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Workflow / asset</th>
                  <th className="p-2">Exact package</th>
                  <th className="p-2">Advisory identifiers</th>
                </tr>
              </thead>
              <tbody>
                {result.assets.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <th className="p-2 font-normal">
                      {a.workflow}
                      <span className="block text-xs text-muted-foreground">
                        {a.id}
                      </span>
                    </th>
                    <td className="mono-font p-2 text-xs">
                      {a.name}@{a.version}
                    </td>
                    <td className="p-2">
                      {a.advisoryIds.join(", ") ||
                        "None returned — not a clearance"}
                      {a.incomplete ? " · more results not read" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.advisories.map((a) => (
            <article key={a.id} className="border border-border p-4">
              <h3 className="text-base">
                {a.id}
                {a.withdrawn ? " · WITHDRAWN ADVISORY" : " · REQUIRES REVIEW"}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.summary}</p>
              <p className="mono-font mt-2 text-xs text-muted-foreground">
                Source modified: {a.modified}
              </p>
              <p className="mt-2 flex flex-wrap gap-3 text-xs">
                {a.references.map((u, i) => (
                  <a
                    key={u}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Source {i + 1}
                  </a>
                ))}
              </p>
            </article>
          ))}
          {result.detailsUnavailable.length > 0 && (
            <p className="text-sm text-hold">
              Details unavailable for: {result.detailsUnavailable.join(", ")}.
              Do not treat these as cleared.
            </p>
          )}
          <ExportEvidence scope="dependency-exposure-v1" payload={result} />
        </div>
      )}
    </section>
  );
}

const emptyPlan = (): ReadinessPlan => ({
  schema: "noshashi-readiness-v1",
  ownerRole: "",
  backupRole: "",
  contactUrl: "",
  contactCheckedAt: "",
  contactCheckAcknowledged: false,
  checks: Object.fromEntries(
    READINESS_CHECKS.map((k) => [k, false]),
  ) as ReadinessPlan["checks"],
});
const NOTEBOOK_KEY = "security.readiness.encrypted.v1";
export function RecoveryReadinessTab() {
  const [envelope, setEnvelope] = useState<EncryptedReadiness | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [plan, setPlan] = useState<ReadinessPlan | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void readSetting<EncryptedReadiness | null>(NOTEBOOK_KEY, null).then(
      (v) => {
        if (active) {
          setEnvelope(v);
          setLoaded(true);
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);
  const lock = () => {
    setPlan(null);
    setPassphrase("");
    setNotice("Notebook locked. Only the encrypted record is retained.");
  };
  useEffect(() => {
    if (!plan) return;
    const timer = setTimeout(lock, 300000);
    const hidden = () => {
      if (document.hidden) lock();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [Boolean(plan)]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Notebook action unavailable.");
    } finally {
      setBusy(false);
    }
  };
  const update = (p: Partial<ReadinessPlan>) =>
    setPlan((v) => (v ? { ...v, ...p } : v));
  let assessment: ReturnType<typeof assessReadiness> | null = null;
  if (plan)
    try {
      assessment = assessReadiness(plan);
    } catch (e) {
      assessment = {
        status: "review_gaps",
        gaps: [
          e instanceof Error
            ? e.message
            : "Complete the public contact information.",
        ],
        assessedAt: new Date().toISOString(),
        limitation:
          "Self-reported procedures; incomplete input cannot establish readiness.",
      };
    }
  return (
    <section className="max-w-4xl">
      <Intro
        eyebrow="RECOVERY READINESS / PRO · DEVICE LOCAL"
        title="Prepare the response before the incident."
      >
        An encrypted notebook for roles, public contact routes and recovery
        drills. No seeds, passwords for other services or private keys. It uses
        passphrase-based encryption on this device; it is not a managed
        enterprise key vault, shared organization storage or a recovery service.
        Keep your passphrase separately—there is no reset.
      </Intro>
      {!loaded ? (
        <p role="status">Reading encrypted notebook…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <label className="min-w-64 flex-1 text-sm">
              Notebook passphrase (14+ characters)
              <Input
                aria-label="Notebook passphrase"
                className="mt-2"
                type="password"
                autoComplete="off"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={busy}
              />
            </label>
            {envelope && !plan && (
              <Button
                className="self-end"
                disabled={busy || !passphrase}
                onClick={() =>
                  void run(async () => {
                    setPlan(await decryptReadiness(envelope, passphrase));
                    setNotice(
                      "Notebook unlocked locally. It locks after five minutes or when the page is hidden.",
                    );
                  })
                }
              >
                UNLOCK NOTEBOOK
              </Button>
            )}
            {!envelope && !plan && (
              <Button
                className="self-end"
                disabled={busy}
                onClick={() => setPlan(emptyPlan())}
              >
                CREATE READINESS NOTEBOOK
              </Button>
            )}
            {plan && (
              <Button className="self-end" variant="outline" onClick={lock}>
                LOCK NOTEBOOK
              </Button>
            )}
          </div>
          <label className="mt-4 block text-xs text-muted-foreground">
            Import an encrypted notebook (JSON, up to 32 KiB)
            <input
              className="mt-2 block text-xs"
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void run(async () => {
                    if (f.size > 32768)
                      throw Error("Notebook file exceeds 32 KiB.");
                    const v = JSON.parse(await f.text());
                    if (v?.schema !== "noshashi-readiness-encrypted-v1")
                      throw Error(
                        "Import an encrypted notebook, not a plaintext plan.",
                      );
                    setEnvelope(v);
                    setPlan(null);
                    setPassphrase("");
                    setNotice(
                      "Imported ciphertext held in this session. Unlock and save to retain it on this device.",
                    );
                  });
              }}
            />
          </label>
          {plan && assessment && (
            <div className="mt-6 space-y-4 border-t border-border pt-4">
              <fieldset disabled={busy} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm">
                    Response owner role
                    <Input
                      className="mt-2"
                      value={plan.ownerRole}
                      maxLength={80}
                      onChange={(e) => update({ ownerRole: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    Backup response role
                    <Input
                      className="mt-2"
                      value={plan.backupRole}
                      maxLength={80}
                      onChange={(e) => update({ backupRole: e.target.value })}
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  Official custodian or wallet-provider contact page
                  <Input
                    className="mt-2"
                    type="url"
                    placeholder="https://official.example/contact"
                    value={plan.contactUrl}
                    onChange={(e) => update({ contactUrl: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Date you independently checked that public route
                  <Input
                    className="mt-2 max-w-xs"
                    type="date"
                    value={plan.contactCheckedAt.slice(0, 10)}
                    onChange={(e) =>
                      update({
                        contactCheckedAt: e.target.value
                          ? `${e.target.value}T00:00:00.000Z`
                          : "",
                      })
                    }
                  />
                </label>
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={plan.contactCheckAcknowledged}
                    onChange={(e) =>
                      update({ contactCheckAcknowledged: e.target.checked })
                    }
                  />
                  I checked the operator’s official route independently;
                  NOSHASHI has not verified it for me.
                </label>
                <fieldset className="space-y-3">
                  <legend className="mb-3 text-sm">
                    Self-reported response drills
                  </legend>
                  {READINESS_CHECKS.map((k) => (
                    <label key={k} className="flex gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={plan.checks[k]}
                        onChange={(e) =>
                          update({
                            checks: { ...plan.checks, [k]: e.target.checked },
                          })
                        }
                      />
                      {k.replace(/_/g, " ")}
                    </label>
                  ))}
                </fieldset>
                <div role="status" className="border border-border p-4">
                  <p className="text-base">
                    {assessment.status === "checklist_complete"
                      ? "Checklist complete — self-reported"
                      : "Readiness gaps to review"}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {assessment.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {assessment.limitation}
                  </p>
                </div>
                <Button
                  disabled={busy || passphrase.length < 14}
                  onClick={() =>
                    void run(async () => {
                      const encrypted = await encryptReadiness(
                        plan,
                        passphrase,
                      );
                      await writeSetting(NOTEBOOK_KEY, encrypted);
                      const stored =
                        await readSetting<EncryptedReadiness | null>(
                          NOTEBOOK_KEY,
                          null,
                        );
                      if (stored?.ciphertext !== encrypted.ciphertext)
                        throw Error(
                          "Device storage could not confirm persistence. Keep an encrypted export; this session is not a saved backup.",
                        );
                      setEnvelope(encrypted);
                      setNotice(
                        "Encrypted notebook saved and read back from device storage. No plaintext record or passphrase was saved by this tool.",
                      );
                    })
                  }
                >
                  {busy ? "WORKING…" : "SAVE ENCRYPTED ON THIS DEVICE"}
                </Button>
              </fieldset>
            </div>
          )}
          {envelope && (
            <Button
              className="mt-4 ml-2"
              variant="outline"
              onClick={() =>
                void run(async () => {
                  const text = JSON.stringify(envelope, null, 2);
                  if (text.length > 32768)
                    throw Error("Encrypted notebook exceeds its format limit.");
                  setNotice(
                    await saveTextFile(
                      "noshashi-readiness.encrypted.json",
                      text,
                      "application/json",
                    ),
                  );
                })
              }
            >
              EXPORT ENCRYPTED NOTEBOOK
            </Button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-no-go">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </section>
  );
}

const exampleModel = JSON.stringify(
  {
    quorum: 2,
    actors: [
      {
        id: "signer-a",
        kind: "signer",
        weight: 1,
        groups: ["custodian-a"],
        verified: false,
      },
      {
        id: "signer-b",
        kind: "signer",
        weight: 1,
        groups: ["custodian-a"],
        verified: false,
      },
      {
        id: "signer-c",
        kind: "signer",
        weight: 1,
        groups: ["custodian-b"],
        verified: false,
      },
    ],
  },
  null,
  2,
);
export function TreasuryScenarioTab() {
  const [text, setText] = useState(exampleModel);
  const [model, setModel] = useState<TreasuryModel | null>(null);
  const [compromised, setCompromised] = useState<string[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [error, setError] = useState("");
  const result = model ? treasuryDrill(model, compromised, unavailable) : null;
  const choose = (values: string[], value: string, checked: boolean) =>
    checked ? [...values, value] : values.filter((v) => v !== value);
  return (
    <section className="max-w-5xl">
      <Intro
        eyebrow="TREASURY CONTINGENCIES / FREE · LOCAL MODEL"
        title="Different signer addresses can share one failure."
      >
        Model a custodian, team or device outage and a separate compromise
        scenario. The example is invented, not your wallet configuration.
        Replace it with verified ownership assumptions before operational
        review. Nothing here signs, submits or changes wallet authority.
      </Intro>
      <label className="text-sm">
        Owner-supplied active-path model (JSON)
        <textarea
          className={editorClass}
          aria-label="Treasury scenario JSON"
          value={text}
          maxLength={131072}
          onChange={(e) => {
            setText(e.target.value);
            setModel(null);
          }}
        />
      </label>
      <Button
        className="mt-3"
        onClick={async () => {
          setError("");
          try {
            setModel(treasuryModel(await parseWorkflowJson(text)));
            setCompromised([]);
            setUnavailable([]);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Invalid scenario.");
          }
        }}
      >
        LOAD LOCAL MODEL
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-no-go">
          {error}
        </p>
      )}
      {model && result && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-hold">
            {result.assumptionsVerified
              ? "Mappings marked reviewed by the operator; NOSHASHI has not independently verified them."
              : "UNVERIFIED ASSUMPTIONS — scenario results cannot establish actual wallet protection."}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {[...new Set(model.actors.flatMap((a) => a.groups))].map(
              (group) => (
                <fieldset key={group} className="border border-border p-4">
                  <legend className="mono-font px-2 text-sm">{group}</legend>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Paths:{" "}
                    {model.actors
                      .filter((a) => a.groups.includes(group))
                      .map((a) => a.id)
                      .join(", ")}
                  </p>
                  <label className="mr-4 inline-flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={compromised.includes(group)}
                      onChange={(e) =>
                        setCompromised((v) =>
                          choose(v, group, e.target.checked),
                        )
                      }
                    />
                    Assume compromised
                  </label>
                  <label className="mt-2 inline-flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={unavailable.includes(group)}
                      onChange={(e) =>
                        setUnavailable((v) =>
                          choose(v, group, e.target.checked),
                        )
                      }
                    />
                    Assume unavailable
                  </label>
                </fieldset>
              ),
            )}
          </div>
          <div
            role="status"
            aria-live="polite"
            className="grid gap-3 md:grid-cols-2"
          >
            <div className="border border-border p-4">
              <p className="text-xs text-muted-foreground">
                COMPROMISE SCENARIO
              </p>
              <p className="mt-2 text-xl">
                {result.scenarioCanAuthorize
                  ? "Scenario could authorize"
                  : "Authorization not demonstrated"}
              </p>
              <p className="mt-2 text-sm">
                Compromised signer weight {result.compromisedWeight} / quorum{" "}
                {result.quorum}
                {result.directCompromise
                  ? "; a direct key path is compromised"
                  : ""}
                .
              </p>
            </div>
            <div className="border border-border p-4">
              <p className="text-xs text-muted-foreground">OUTAGE SCENARIO</p>
              <p className="mt-2 text-xl">
                {result.scenarioCanOperate
                  ? "Configured path remains"
                  : "No modeled authorization path remains"}
              </p>
              <p className="mt-2 text-sm">
                Remaining signer weight {result.survivingWeight} / quorum{" "}
                {result.quorum}
                {result.directSurvivor ? "; a direct key path remains" : ""}.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{result.limitation}</p>
          <ExportEvidence
            scope="treasury-contingency-v1"
            payload={{ model, compromised, unavailable, result }}
          />
        </div>
      )}
    </section>
  );
}

export function LedgerIntegrityTab() {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IntegrityReport | null>(null);
  return (
    <section className="max-w-5xl">
      <Intro
        eyebrow="LEDGER-DATA INTEGRITY / FREE"
        title="One account. One ledger hash. Three endpoint readings."
      >
        Compare identical raw AccountRoot bytes at one ledger hash. Agreement
        between endpoints is not independent consensus verification or a
        security clearance. Ripple operates both s1 and s2; three endpoints do
        not establish three independent operators. Only a public account address
        is sent.
      </Intro>
      <form
        className="flex gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !isValidAddress(address.trim())) return;
          setBusy(true);
          setResult(null);
          setError("");
          try {
            setResult(await readLedgerIntegrity(address.trim()));
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Comparison unavailable.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="min-w-0 flex-1 text-sm">
          Public XRPL address
          <Input
            className="mono-font mt-2"
            aria-label="Integrity account address"
            value={address}
            disabled={busy}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <Button
          className="self-end"
          disabled={busy || !isValidAddress(address.trim())}
        >
          {busy ? "COMPARING…" : "COMPARE NODE EVIDENCE"}
        </Button>
      </form>
      {busy && (
        <p role="status" className="mt-3 text-sm">
          Reading fresh anchors, then the same object hash scope. Each network
          phase is bounded.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-no-go">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-5 space-y-4">
          <div role="status" className="border-y border-border py-4">
            <h3 className="text-xl">
              {result.status.toUpperCase()} · endpoint claims
            </h3>
            <p className="mono-font mt-2 break-all text-xs">
              Ledger {result.anchor.index} · {result.anchor.hash}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {result.status === "agreed"
                ? "All requested endpoint payloads matched within this exact scope. This does not establish that the nodes or account are secure."
                : "Disagreement or missing evidence requires review. Unavailable data is not a pass."}
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {result.nodes.map((n) => (
              <article
                key={n.node}
                className="min-w-0 border border-border p-4"
              >
                <h4 className="mono-font break-all text-xs">{n.node}</h4>
                <p className="mt-3 text-sm">{n.status.toUpperCase()}</p>
                <p className="mono-font mt-2 break-all text-xs text-muted-foreground">
                  {n.sha256 ?? n.error}
                </p>
              </article>
            ))}
          </div>
          <ExportEvidence
            scope="ledger-endpoint-comparison-v1"
            payload={result}
          />
        </div>
      )}
    </section>
  );
}
