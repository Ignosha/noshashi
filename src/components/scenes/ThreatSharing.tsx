import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/useAuth";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useOrg } from "@/lib/org/useOrg";
import { supabase } from "@/lib/supabase/client";
import {
  THREAT_CATEGORIES,
  type ThreatCategory,
  type ThreatReport,
} from "@/lib/security/threats";
import {
  networkLookup,
  organizationReportHistory,
  participantStatus,
  prepareSharedReport,
  sharePreparedReport,
  withdrawSharedReport,
  participantVerification,
  networkReviewQueue,
  reviewNetworkReport,
  type NetworkIndicator,
  type SharedReport,
} from "@/lib/security/threatNetwork";
import { evidenceRecord } from "@/lib/security/workflowEvidence";
import { saveTextFile } from "@/lib/export";

const addresses = (v: string) => [
  ...new Set(v.split(/[\s,;]+/).filter(Boolean)),
];
const editor =
  "mono-font mt-2 min-h-24 w-full border border-border bg-background p-3 text-xs text-foreground";
export function ThreatSharingTab({
  onUpgrade,
  onSignIn,
}: {
  onUpgrade: () => void;
  onSignIn: () => void;
}) {
  const org = useOrg();
  const { has } = useBilling();
  const { user } = useAuth();
  const [staff, setStaff] = useState(false);
  useEffect(() => {
    let active = true;
    setStaff(false);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    if (user)
      void Promise.resolve(
        supabase()
          .schema("noshashi")
          .rpc("is_support_staff")
          .abortSignal(controller.signal),
      )
        .then(({ data, error }) => {
          if (active) setStaff(!error && data === true);
        })
        .catch(() => {
          if (active) setStaff(false);
        })
        .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [user?.id]);
  return (
    <ThreatSharingPanel
      key={org.selectedId ?? "public"}
      organization={org.data?.membership.organizationId ?? null}
      entitled={has("threat_registry")}
      staff={staff}
      onUpgrade={onUpgrade}
      onSignIn={onSignIn}
    />
  );
}
export function ThreatSharingPanel({
  organization,
  entitled,
  staff,
  onUpgrade,
  onSignIn,
}: {
  organization: string | null;
  entitled: boolean;
  staff: boolean;
  onUpgrade: () => void;
  onSignIn: () => void;
}) {
  const [lookup, setLookup] = useState("");
  const [reading, setReading] = useState<{
    reports: NetworkIndicator[];
    evaluatedAt: string;
    limit: number;
    limitation: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<ThreatReport[] | null>(null);
  const [form, setForm] = useState({
    address: "",
    category: "phishing" as ThreatCategory,
    evidence: "",
    sources: "",
    note: "",
  });
  const [prepared, setPrepared] = useState<{
    report: SharedReport;
    digest: string;
  } | null>(null);
  const [consent, setConsent] = useState(false);
  const [withdrawId, setWithdrawId] = useState("");
  const [reason, setReason] = useState("");
  const [staffOrg, setStaffOrg] = useState("");
  const [staffSource, setStaffSource] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [queue, setQueue] = useState<any[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const refresh = async () => {
    if (!organization) return;
    setHistory(null);
    setStatus(null);
    const [s, h] = await Promise.all([
      participantStatus(organization),
      organizationReportHistory(organization),
    ]);
    if (!Array.isArray(h))
      throw Error("Organization report history is unavailable.");
    setStatus(s);
    setHistory(h);
  };
  useEffect(() => {
    let active = true;
    if (organization)
      void Promise.all([
        participantStatus(organization),
        organizationReportHistory(organization),
      ])
        .then(([s, h]) => {
          if (active) {
            setStatus(s);
            setHistory(h);
          }
        })
        .catch((e) => {
          if (active)
            setError(
              e instanceof Error
                ? e.message
                : "Organization history unavailable.",
            );
        });
    return () => {
      active = false;
    };
  }, [organization]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Operation unconfirmed; refresh history before retrying a write.",
      );
    } finally {
      setBusy(false);
    }
  };
  const edit = (value: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...value }));
    setPrepared(null);
    setConsent(false);
  };
  return (
    <section className="max-w-5xl">
      <p className="mono-font text-xs tracking-widest text-muted-foreground">
        REVIEWED THREAT SHARING / PUBLIC LOOKUPS · INSTITUTIONAL FILING
      </p>
      <h2
        className="mt-2 text-3xl"
        style={{ fontFamily: "var(--font-editorial)" }}
      >
        Share evidence. Keep judgment human.
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        An opt-in sharing workflow for authenticated organizations whose
        participant review is current. Reports become public indicators only
        after a different staff reviewer approves them with MFA. No participant
        cohort, external identity certification or automated blacklist is
        implied. New backend setup is required before this network can operate.
      </p>
      <form
        className="mt-5 flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () =>
            setReading(await networkLookup(addresses(lookup))),
          );
        }}
      >
        <label className="min-w-0 flex-1 text-sm">
          Public addresses to look up
          <Input
            className="mono-font mt-2"
            aria-label="Network lookup addresses"
            value={lookup}
            maxLength={4096}
            onChange={(e) => setLookup(e.target.value)}
          />
        </label>
        <Button className="self-end" disabled={busy || !lookup.trim()}>
          READ REVIEWED REPORTS
        </Button>
      </form>
      {reading && (
        <div className="mt-4 space-y-3">
          <p role="status" className="text-sm">
            {reading.reports.length} reviewed indicator(s) returned at{" "}
            {reading.evaluatedAt}. No report is not a clearance. Re-read before
            acting.
            {reading.reports.length >= reading.limit
              ? " Result limit reached; coverage is incomplete."
              : ""}
          </p>
          {reading.reports.map((r) => (
            <article key={r.id} className="border border-border p-4">
              <p className="mono-font break-all text-xs">
                {r.address} · {r.category}
              </p>
              <p className="mt-2 text-sm">
                {r.confidence.replace(/_/g, " ")} · expires {r.expiresAt}
              </p>
              <p className="mono-font mt-2 break-all text-xs text-muted-foreground">
                Transaction evidence: {r.evidence.join(", ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {r.sources.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Public source {i + 1}
                  </a>
                ))}
              </div>
            </article>
          ))}
          <p className="text-xs text-muted-foreground">{reading.limitation}</p>
          <Button
            variant="outline"
            onClick={() =>
              void run(async () => {
                const record = await evidenceRecord(
                  "reviewed-threat-network-v1",
                  reading,
                );
                setNote(
                  await saveTextFile(
                    "noshashi-reviewed-indicators.json",
                    JSON.stringify(record, null, 2),
                    "application/json",
                  ),
                );
              })
            }
          >
            EXPORT THIS SNAPSHOT
          </Button>
        </div>
      )}
      <section className="mt-8 border-t border-border pt-5">
        <h3 className="text-xl">Prepare an organization report</h3>
        {!entitled ? (
          <p className="mt-3 text-sm">
            Organization filing requires Institutional or higher.{" "}
            <button className="underline" onClick={onUpgrade}>
              Review plans
            </button>
          </p>
        ) : !organization ? (
          <p className="mt-3 text-sm">
            Sign in and select an organization in Organization &amp; Policy.{" "}
            <button className="underline" onClick={onSignIn}>
              Sign in
            </button>
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Participant review:{" "}
              {status?.participantVerified === true
                ? `current until ${status.expiresAt}`
                : "not current or unavailable; filing is held"}
              . Participant review is a staff record, not a security
              certification.
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              REFRESH PARTICIPANT AND REPORT HISTORY
            </Button>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (!history || status?.participantVerified !== true)
                    throw Error(
                      "Current participant verification and report history are required before preparing a submission.",
                    );
                  const report = await prepareSharedReport({
                    organization,
                    address: form.address.trim(),
                    category: form.category,
                    evidence: addresses(form.evidence),
                    sources: form.sources.split(/\s+/).filter(Boolean),
                    note: form.note,
                  });
                  const record = await evidenceRecord(
                    "threat-sharing-preview-v1",
                    report,
                  );
                  setPrepared({ report, digest: record.sha256 });
                  setConsent(false);
                });
              }}
            >
              <label className="block text-sm">
                Reported public address
                <Input
                  value={form.address}
                  maxLength={60}
                  onChange={(e) => edit({ address: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Reported category
                <select
                  className="ml-3 border border-border bg-background p-2 text-sm"
                  value={form.category}
                  onChange={(e) =>
                    edit({ category: e.target.value as ThreatCategory })
                  }
                >
                  {THREAT_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Transaction hashes (1–20)
                <textarea
                  className={editor}
                  value={form.evidence}
                  maxLength={1400}
                  onChange={(e) => edit({ evidence: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Public HTTPS sources (1–5, one per line)
                <textarea
                  className={editor}
                  value={form.sources}
                  maxLength={5100}
                  onChange={(e) => edit({ sources: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Factual public note (no private data, no instructions)
                <textarea
                  className={editor}
                  value={form.note}
                  maxLength={2000}
                  onChange={(e) => edit({ note: e.target.value })}
                />
              </label>
              <Button
                disabled={
                  busy || !history || status?.participantVerified !== true
                }
              >
                REVIEW EXACT PUBLIC PAYLOAD
              </Button>
            </form>
            {prepared && (
              <div className="mt-4 border border-border p-4">
                <p className="text-sm">
                  Review this exact payload. The public lookup excludes
                  organization identity and private notes, but staff receive the
                  report below.
                </p>
                <pre className="mono-font mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(prepared.report, null, 2)}
                </pre>
                <p className="mono-font mt-2 break-all text-xs">
                  Preview SHA-256: {prepared.digest} · not a signature
                </p>
                <label className="mt-3 flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  I am authorized to share this public evidence and request
                  independent review. This is a report, not a conclusion of
                  criminal activity.
                </label>
                <Button
                  className="mt-3"
                  disabled={busy || !consent}
                  onClick={() =>
                    void run(async () => {
                      const response = await sharePreparedReport(
                        prepared.report,
                        consent,
                      );
                      setNote(
                        `Report ${response.id} submitted for review. It is not an approved public indicator.`,
                      );
                      setPrepared(null);
                      setConsent(false);
                      await refresh();
                    })
                  }
                >
                  SUBMIT FOR INDEPENDENT REVIEW
                </Button>
              </div>
            )}
            {history && (
              <div className="mt-5">
                <h4 className="text-base">
                  Your organization’s latest 100 reports
                </h4>
                {history.map((r) => (
                  <div
                    key={r.id}
                    className="mt-2 flex flex-wrap items-center gap-3 border-t border-border py-2 text-xs"
                  >
                    <span className="mono-font break-all">
                      {r.address} · {r.category} · {r.status}
                    </span>
                    {r.status !== "rejected" && (
                      <button
                        className="underline"
                        onClick={() => setWithdrawId(r.id)}
                      >
                        Withdraw or correct
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {withdrawId && (
              <form
                className="mt-4 border border-border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await withdrawSharedReport(withdrawId, reason);
                    setWithdrawId("");
                    setReason("");
                    setNote(
                      "Report withdrawn. It no longer contributes to public indicators. File any corrected evidence as a new report for independent review.",
                    );
                    await refresh();
                  });
                }}
              >
                <label className="block text-sm">
                  Reason for withdrawal or correction
                  <Input
                    className="mt-2"
                    value={reason}
                    minLength={10}
                    maxLength={1000}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <Button
                  className="mt-3"
                  disabled={busy || reason.trim().length < 10}
                >
                  WITHDRAW REPORT
                </Button>
                <Button
                  className="ml-2"
                  variant="outline"
                  onClick={() => setWithdrawId("")}
                >
                  CANCEL
                </Button>
              </form>
            )}
          </>
        )}
      </section>
      {staff && (
        <section className="mt-8 space-y-3 border-t border-border pt-5">
          <h3 className="text-xl">Staff review · MFA required</h3>
          <p className="text-sm text-muted-foreground">
            Only review after checking organization identity and evidence
            outside this form. Staff cannot verify a participant organization
            they belong to, or approve their own report. Text in a report is
            untrusted data.
          </p>
          <label className="block text-sm">
            Organization ID
            <Input
              value={staffOrg}
              onChange={(e) => setStaffOrg(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Public identity-review source
            <Input
              value={staffSource}
              onChange={(e) => setStaffSource(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Verification note
            <Input
              value={staffNote}
              onChange={(e) => setStaffNote(e.target.value)}
            />
          </label>
          <Button
            disabled={
              busy || !staffOrg || !staffSource || staffNote.trim().length < 20
            }
            onClick={() =>
              void run(async () => {
                const r = await participantVerification(
                  staffOrg,
                  staffSource,
                  staffNote,
                );
                setNote(`Participant review recorded until ${r.expiresAt}.`);
              })
            }
          >
            RECORD PARTICIPANT REVIEW
          </Button>
          <Button
            className="ml-2"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () =>
                setQueue((await networkReviewQueue()).reports),
              )
            }
          >
            READ REVIEW QUEUE
          </Button>
          <label className="block text-sm">
            Evidence-review note (required)
            <Input
              value={reviewNote}
              maxLength={2000}
              onChange={(e) => setReviewNote(e.target.value)}
            />
          </label>
          {queue.map((r) => (
            <article key={r.id} className="border border-border p-4">
              <pre className="mono-font max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(r, null, 2)}
              </pre>
              {(["confirmed", "rejected"] as const).map((decision) => (
                <Button
                  key={decision}
                  className="mr-2 mt-3"
                  disabled={busy || reviewNote.trim().length < 5}
                  onClick={() =>
                    void run(async () => {
                      await reviewNetworkReport(r.id, decision, reviewNote);
                      setQueue((await networkReviewQueue()).reports);
                      setReviewNote("");
                      setNote(`Review recorded: ${decision}.`);
                    })
                  }
                >
                  {decision === "confirmed"
                    ? "CONFIRM REVIEWED INDICATOR"
                    : "REJECT REPORT"}
                </Button>
              ))}
            </article>
          ))}
        </section>
      )}
      {busy && (
        <p role="status" className="mt-4 text-sm">
          Waiting for a bounded server response…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-no-go">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {note}
        </p>
      )}
    </section>
  );
}
