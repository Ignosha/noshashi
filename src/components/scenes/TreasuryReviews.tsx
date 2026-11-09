import { useEffect, useState } from "react";
import { useOrg } from "@/lib/org/useOrg";
import { useAuth } from "@/lib/auth/useAuth";
import { useBilling } from "@/lib/billing/useEntitlements";
import { Button } from "@/components/ui/button";
import { saveTextFile } from "@/lib/export";
import { evidenceRecord } from "@/lib/security/workflowEvidence";
import {
  listTreasuryReviews,
  requestTreasuryReview,
  decideTreasuryReview,
  cancelTreasuryReview,
  type TreasuryReviewRecord,
} from "@/lib/security/treasuryReviews";
import type { TreasuryPreflight } from "@/lib/security/treasuryPreflight";
export function TreasuryReviews({
  report,
  onOpen,
}: {
  report: TreasuryPreflight | null;
  onOpen: (id: string) => void;
}) {
  const org = useOrg();
  const auth = useAuth();
  const { has } = useBilling();
  const organization = org.data?.membership.organizationId ?? null;
  return (
    <TreasuryReviewPanel
      key={organization ?? "none"}
      organization={organization}
      actor={auth.user?.id ?? null}
      mfa={auth.mfaSatisfied}
      entitled={has("withdrawal_screening")}
      report={report}
      onOpen={onOpen}
    />
  );
}
export function TreasuryReviewPanel({
  organization,
  actor,
  mfa,
  entitled,
  report,
  onOpen,
}: {
  organization: string | null;
  actor: string | null;
  mfa: boolean;
  entitled: boolean;
  report: TreasuryPreflight | null;
  onOpen: (id: string) => void;
}) {
  const [records, setRecords] = useState<TreasuryReviewRecord[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState<string | null>(null);
  useEffect(() => {
    setKey(crypto.randomUUID());
  }, [report?.sha256]);
  const refresh = async () => {
    if (!organization) return;
    setRecords(null);
    setRecords(await listTreasuryReviews(organization));
  };
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review unavailable.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="border-t border-border pt-5"
      aria-label="Organization payment reviews"
    >
      <h3 className="display text-2xl">
        A different authorized account reviews the exact proposal.
      </h3>
      <p className="mt-3 text-sm text-muted-foreground">
        Enterprise organization workflow. Requester and reviewer must use MFA;
        the reviewer must be a different authorized account. Records expire
        after 15 minutes and can be cancelled. These are organization review
        records, not signing credentials, reservations or an enforced hold.
        Client preflight evidence is not independently verified by this service.
      </p>
      {!entitled ? (
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => onOpen("withdrawal")}
        >
          REVIEW ENTERPRISE ACCESS
        </Button>
      ) : !organization || !actor ? (
        <p className="mt-3 text-sm">
          Sign in and select an organization in Organization &amp; Policy.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm">
            {mfa
              ? "MFA satisfied for this session; server checks it again."
              : "Complete MFA in Account & Security before requesting or deciding a review."}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              disabled={busy || !mfa || !report}
              onClick={() =>
                void run(async () => {
                  if (!report) return;
                  const receipt = await requestTreasuryReview(
                    organization,
                    key,
                    report,
                  );
                  setNotice(
                    `Review ${receipt.id} recorded until ${receipt.expiresAt}. No transfer is authorized.`,
                  );
                  await refresh();
                })
              }
            >
              REQUEST INDEPENDENT REVIEW
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              REFRESH ORGANIZATION REVIEWS
            </Button>
          </div>
          {records === null ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Refresh to load verified review receipts. Backend migration is
              required; missing history is not an empty approved queue.
            </p>
          ) : !records.length ? (
            <p className="mt-3 text-sm">
              No organization review records returned.
            </p>
          ) : (
            records.map((r) => (
              <article
                key={r.id}
                className="mt-4 min-w-0 border border-border p-4"
              >
                <h4 className="text-lg">
                  {r.effective_status.toUpperCase()} · review record only
                </h4>
                <p className="mono-font mt-2 break-all text-xs">
                  {r.proposal_hash}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Requester {r.requested_by} · expires {r.expires_at} · reviewer{" "}
                  {r.reviewed_by ?? "none"}
                </p>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer">
                    Inspect exact proposal, policy and client evidence
                  </summary>
                  <pre className="mono-font mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(
                      {
                        proposalText: r.proposal_text,
                        policy: r.policy,
                        evidence: r.evidence,
                        reviewNote: r.review_note,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
                {r.effective_status === "pending" &&
                  r.requested_by !== actor && (
                    <div className="mt-3 space-y-3">
                      <label className="flex gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={confirmed === r.id}
                          onChange={(e) => {
                            setConfirmed(e.target.checked ? r.id : null);
                            setNote("");
                          }}
                        />
                        I inspected this exact proposal and its limitations.
                        This review does not release funds.
                      </label>
                      {confirmed === r.id && (
                        <label className="block text-sm">
                          Review note (10–2,000 characters, no secrets)
                          <textarea
                            className="mt-2 min-h-24 w-full border border-border bg-background p-3 text-sm"
                            maxLength={2000}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                          />
                        </label>
                      )}
                      <div className="flex flex-wrap gap-3">
                        {(["approved", "rejected"] as const).map((decision) => (
                          <Button
                            key={decision}
                            variant="outline"
                            disabled={
                              busy ||
                              !mfa ||
                              confirmed !== r.id ||
                              note.trim().length < 10
                            }
                            onClick={() =>
                              void run(async () => {
                                await decideTreasuryReview(
                                  r,
                                  decision,
                                  note,
                                  confirmed === r.id,
                                );
                                setConfirmed(null);
                                setNote("");
                                await refresh();
                                setNotice(
                                  `Review ${decision}. No signing authorization was issued.`,
                                );
                              })
                            }
                          >
                            {decision === "approved"
                              ? "ACCEPT REVIEW RECORD"
                              : "REJECT PROPOSAL"}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                {r.requested_by === actor &&
                  ["pending", "approved"].includes(r.effective_status) && (
                    <Button
                      className="mt-3"
                      variant="outline"
                      disabled={busy || !mfa}
                      onClick={() =>
                        void run(async () => {
                          await cancelTreasuryReview(r.id);
                          await refresh();
                          setNotice(
                            "Review cancelled. This does not reverse any payment.",
                          );
                        })
                      }
                    >
                      CANCEL REVIEW RECORD
                    </Button>
                  )}
                <Button
                  className="mt-3 ml-2"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const evidence = await evidenceRecord(
                        "organization-treasury-review-v1",
                        r,
                      );
                      setNotice(
                        await saveTextFile(
                          "noshashi-organization-review.json",
                          JSON.stringify(evidence, null, 2),
                          "application/json",
                        ),
                      );
                    })
                  }
                >
                  EXPORT VERIFIED REVIEW RECEIPT
                </Button>
              </article>
            ))
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-no-go">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
