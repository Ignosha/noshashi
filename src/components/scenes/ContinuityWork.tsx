import { useMemo, useRef, useState } from "react";
import { Panel } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { parseCommitments, rehearseWork, type AccessSnapshot, type Commitment } from "@/lib/continuity/rehearsal";
import { sampleWork } from "@/lib/continuity/workSample";
import { summarizeWork, type ReviewNote, type WorkReview } from "@/lib/continuity/decisionPack";
import type { AcceptedCredential } from "@/lib/compliance/registry";

export function ContinuityWork({ snapshot, proposed, sample, save, initialReview }: {
  snapshot: AccessSnapshot;
  proposed: AcceptedCredential[];
  sample: boolean;
  save: (work: WorkReview, format: "json" | "html") => Promise<void>;
  initialReview?: WorkReview;
}) {
  const [work, setWork] = useState<Commitment[]>(initialReview ? parseCommitments(initialReview.rows, snapshot.closeTime) : sample ? sampleWork : []);
  const [reviews, setReviews] = useState<Record<string, ReviewNote>>(() => Object.fromEntries(initialReview?.rows.map(row => [row.id, row.review]) ?? []));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const result = useMemo(() => {
    if (!work.length || !proposed.length) return null;
    try { return { rows: rehearseWork(snapshot, proposed, work), error: "" }; }
    catch (failure) { return { rows: [], error: failure instanceof Error ? failure.message : "Unable to rehearse these activities." }; }
  }, [snapshot, proposed, work]);
  const hasResult = !!result && !result.error;
  async function importWork(file?: File) {
    if (!file) return;
    try {
      if (file.size > 250000) throw new Error("Maximum activity file size is 250 KB.");
      const next = parseCommitments(JSON.parse(await file.text()), snapshot.closeTime);
      setWork(next); setReviews({}); setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to import activities."); }
  }
  function updateReview(id: string, field: keyof ReviewNote, value: string) {
    setReviews(current => ({ ...current, [id]: { ...(current[id] ?? { owner: "", nextAction: "" }), [field]: value } }));
  }
  const reviewedRows = result?.rows.map(row => ({ ...row, review: reviews[row.id] ?? { owner: "", nextAction: "" } })) ?? [];
  const coverage = summarizeWork(reviewedRows);
  async function exportWork(format: "json" | "html") {
    if (!hasResult) return;
    setSaving(true);
    try {
      await save({ assumptions: "Rules and credentials persist until each planned time. All listed dependencies are operator declarations.",
        rows: reviewedRows }, format);
      setError("");
    } catch { setError("Export failed. Your rehearsal remains open."); }
    finally { setSaving(false); }
  }
  return <Panel label="CHANGE REHEARSAL">
    <h2 className="text-xl mb-2">Which planned work needs attention?</h2>
    <p className="text-sm text-muted-foreground">Connect trades, payments, bridge transfers, loans and offboarding to the domain access your process requires. Declare each dependency explicitly. Findings cover that access prerequisite at the planned time.</p>
    <div className="flex flex-wrap gap-3 my-4">
      <Button variant="outline" onClick={() => fileInput.current?.click()}>Import activity list</Button>
      <Button disabled={!hasResult || saving} onClick={() => void exportWork("json")}>{saving ? "Saving…" : "Export rehearsal"}</Button>
      <Button variant="outline" disabled={!hasResult || saving} onClick={() => void exportWork("html")}>Export decision report</Button>
      <input hidden ref={fileInput} type="file" accept=".json" aria-label="Activity list JSON" onChange={event => {
        void importWork(event.target.files?.[0]); event.target.value = "";
      }} />
    </div>
    <p className="text-sm text-muted-foreground mb-3">Decision report export saves printable HTML and matching evidence JSON.</p>
    <details className="text-sm mb-4"><summary>Activity file format</summary>
      <p className="my-2">Use a unique ID, a UTC plannedAt time and 1–10 account/domainId dependencies. Activity types are trade, payment, bridge, loan and offboarding.</p>
      <pre className="overflow-auto p-2 bg-background">{JSON.stringify([{ id: "Operation-01", activity: "payment", plannedAt: "2026-11-27T12:00:00Z", dependencies: [{ account: snapshot.accounts[0]?.account ?? "Account address", domainId: snapshot.domain.domainId }] }], null, 2)}</pre>
    </details>
    {error && <p role="alert" className="text-sm my-2">Import or export error · {error}</p>}
    {result?.error && <p role="alert">{result.error}</p>}
    {!work.length && <p className="text-sm">Import the planned work for this portfolio to start a rehearsal.</p>}
    {!proposed.length && <p role="alert">Keep at least one credential rule for a valid scenario.</p>}
    {hasResult && <>
      <p className="text-sm mb-3">{result.rows.length} activities · {result.rows.filter(row => row.changedByScenario).length} affected by rule removal · {result.rows.filter(row => row.missingEvidence).length} with missing ledger evidence</p>
      <div className="border-l-2 border-border pl-3 mb-4 text-sm space-y-1" aria-label="Review coverage">
        <p>{coverage.coveredChecks}/{coverage.requiredChecks} declared access prerequisites covered</p>
        <p>{coverage.baselineAccessGaps} activities with baseline access gaps</p>
        <p>{coverage.missingOwner} activities without an owner · {coverage.missingNextAction} without a next action</p>
        <p className="text-muted-foreground">Review coverage applies to the declared scope. Other settlement and credit checks need their own evidence.</p>
      </div>
      {result.rows.map(row => <article key={row.id} className="border-t py-4 space-y-2">
        <h3 className="font-medium">{row.id} · {row.activity}</h3>
        <p className="text-sm">{row.plannedAt} · {row.outcome}{row.changedByScenario ? " · Changed by proposed rules" : ""}</p>
        {row.requirements.map(requirement => <p key={`${requirement.account}:${requirement.domainId}`} className="text-sm break-all">{requirement.account} · {requirement.reason}</p>)}
        <label className="block text-sm">Review owner<input className="block w-full rounded border bg-background p-2" maxLength={120} value={reviews[row.id]?.owner ?? ""} onChange={event => updateReview(row.id, "owner", event.target.value)} /></label>
        <label className="block text-sm">Next action<textarea className="block w-full rounded border bg-background p-2" maxLength={1000} value={reviews[row.id]?.nextAction ?? ""} onChange={event => updateReview(row.id, "nextAction", event.target.value)} /></label>
        <p className="text-xs text-muted-foreground">{row.scope}</p>
      </article>)}
      <p className="text-sm text-muted-foreground">Review notes stay in this open workspace and in exports. These are proposed actions for your team to review.</p>
    </>}
  </Panel>;
}
