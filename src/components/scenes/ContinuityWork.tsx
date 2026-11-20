import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  parseCommitments,
  rehearseWork,
  type AccessSnapshot,
  type Commitment,
} from "@/lib/continuity/rehearsal";
import { rippleToIso } from "../../../supabase/functions/_shared/ledgerRegistry.ts";
import { sampleWork } from "@/lib/continuity/workSample";
import {
  summarizeWork,
  type ReviewNote,
  type WorkReview,
} from "@/lib/continuity/decisionPack";
import type { AcceptedCredential } from "@/lib/compliance/registry";

export function ContinuityWork({
  snapshot,
  proposed,
  sample,
  save,
  initialReview,
}: {
  snapshot: AccessSnapshot;
  proposed: AcceptedCredential[];
  sample: boolean;
  save: (work: WorkReview, format: "json" | "html") => Promise<void>;
  initialReview?: WorkReview;
}) {
  const [work, setWork] = useState<Commitment[]>(
    initialReview
      ? parseCommitments(initialReview.rows, snapshot.closeTime)
      : sample
        ? sampleWork
        : [],
  );
  const [reviews, setReviews] = useState<Record<string, ReviewNote>>(() =>
    Object.fromEntries(
      initialReview?.rows.map((row) => [row.id, row.review]) ?? [],
    ),
  );
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const result = useMemo(() => {
    if (!work.length || !proposed.length) return null;
    try {
      return { rows: rehearseWork(snapshot, proposed, work), error: "" };
    } catch (failure) {
      return {
        rows: [],
        error:
          failure instanceof Error
            ? failure.message
            : "Unable to rehearse these activities.",
      };
    }
  }, [snapshot, proposed, work]);
  const hasResult = !!result && !result.error;
  async function importWork(file?: File) {
    if (!file) return;
    try {
      if (file.size > 250000)
        throw new Error("Maximum activity file size is 250 KB.");
      const next = parseCommitments(
        JSON.parse(await file.text()),
        snapshot.closeTime,
      );
      setWork(next);
      setReviews({});
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to import activities.",
      );
    }
  }
  function updateReview(id: string, field: keyof ReviewNote, value: string) {
    setReviews((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? { owner: "", nextAction: "" }),
        [field]: value,
      },
    }));
  }
  const reviewedRows =
    result?.rows.map((row) => ({
      ...row,
      review: reviews[row.id] ?? { owner: "", nextAction: "" },
    })) ?? [];
  const coverage = summarizeWork(reviewedRows);
  async function exportWork(format: "json" | "html") {
    if (!hasResult) return;
    setSaving(true);
    try {
      await save(
        {
          assumptions:
            "Rules and credentials persist until each planned time. All listed dependencies are operator declarations.",
          rows: reviewedRows,
        },
        format,
      );
      setError("");
    } catch {
      setError("Export failed. Your rehearsal remains open.");
    } finally {
      setSaving(false);
    }
  }
  const selected =
    result?.rows.find((row) => row.id === selectedId) ?? result?.rows[0];
  return (
    <section className="mt-7" aria-label="Planned work">
      <h2>Planned work</h2>
      <div className="ct-actions">
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          Import activity list
        </Button>
        <Button
          disabled={!hasResult || saving}
          onClick={() => void exportWork("json")}
        >
          {saving ? "Saving…" : "Export rehearsal"}
        </Button>
        <Button
          variant="outline"
          disabled={!hasResult || saving}
          onClick={() => void exportWork("html")}
        >
          Export decision report
        </Button>
        <input
          hidden
          ref={fileInput}
          type="file"
          accept=".json"
          aria-label="Activity list JSON"
          onChange={(event) => {
            void importWork(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error && <p role="alert">{error}</p>}
      {result?.error && <p role="alert">{result.error}</p>}
      {!work.length && <p>Import the planned activities for this portfolio.</p>}
      {!proposed.length && (
        <p role="alert">Keep at least one credential rule.</p>
      )}
      {hasResult && (
        <>
          <p className="ct-source">
            {result.rows.length} activities · {coverage.affectedByChange}{" "}
            affected by rule removal · {coverage.missingEvidence} with missing
            ledger evidence
          </p>
          <p className="text-xs mb-3" aria-label="Review coverage">
            {coverage.coveredChecks}/{coverage.requiredChecks} prerequisites
            covered · {coverage.baselineAccessGaps} baseline gaps ·{" "}
            {coverage.missingOwner} owners missing
          </p>
          <div className="ct-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Planned time</th>
                  <th>Access finding</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <button
                        aria-pressed={selected?.id === row.id}
                        onClick={() => setSelectedId(row.id)}
                      >
                        {row.id}
                      </button>
                      <small>{row.activity}</small>
                    </th>
                    <td>
                      {row.plannedAt.replace("T", " ").replace("Z", " UTC")}
                    </td>
                    <td>
                      {row.outcome}
                      {row.changedByScenario && (
                        <small className="block">
                          Affected by proposed rules
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && (
            <article
              className="ct-inspector"
              aria-label="Selected activity review"
            >
              <h3 className="text-sm font-medium">{selected.id} · Follow-up</h3>
              {selected.requirements.map((requirement) => (
                <p key={requirement.account + requirement.domainId}>
                  {requirement.account} · {requirement.reason}
                </p>
              ))}
              <div className="grid gap-3 md:grid-cols-2">
                <label>
                  Review owner
                  <input
                    maxLength={120}
                    value={reviews[selected.id]?.owner ?? ""}
                    onChange={(event) =>
                      updateReview(selected.id, "owner", event.target.value)
                    }
                  />
                </label>
                <label>
                  Next action
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={reviews[selected.id]?.nextAction ?? ""}
                    onChange={(event) =>
                      updateReview(
                        selected.id,
                        "nextAction",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>
            </article>
          )}
          <p className="ct-footnote">
            Declared domain-access prerequisites only. Other settlement checks
            need their own evidence. Decision report export saves HTML and
            matching JSON.
          </p>
        </>
      )}
      <details>
        <summary>Activity format and scope</summary>
        <p>
          Declare each required account and domain. Supported activity labels
          are trade, payment, bridge, loan and offboarding.
        </p>
        <pre>
          {JSON.stringify(
            [
              {
                id: "Operation-01",
                activity: "payment",
                plannedAt: rippleToIso(snapshot.closeTime + 7 * 86400).replace(
                  ".000Z",
                  "Z",
                ),
                dependencies: [
                  {
                    account: snapshot.accounts[0]?.account ?? "Account address",
                    domainId: snapshot.domain.domainId,
                  },
                ],
              },
            ],
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
