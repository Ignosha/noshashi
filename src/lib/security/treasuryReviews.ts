import { supabase } from "@/lib/supabase/client";
import { canonical } from "@/lib/compliance/registry";
import { evidenceRecord } from "./workflowEvidence";
import { containsLedgerSeed } from "@/lib/agent/secrets";
import type { TreasuryPreflight } from "./treasuryPreflight";
export type TreasuryReviewRecord = {
  id: string;
  organization_id: string;
  requested_by: string;
  proposal_text: string;
  proposal_hash: string;
  proposal: Record<string, unknown>;
  policy: Record<string, unknown>;
  evidence: Record<string, unknown>;
  status: string;
  effective_status: string;
  expires_at: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};
async function call(name: string, params: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const { data, error } = await supabase()
      .schema("noshashi")
      .rpc(name, params)
      .abortSignal(controller.signal);
    if (error || !data)
      throw Error(
        "Organization review service is unavailable or the outcome is unconfirmed. Refresh before retrying; verify the treasury-review migration is installed.",
      );
    if (data.ok !== true)
      throw Error(
        `Review request refused: ${data.code ?? "INCOMPLETE"}. No payment was authorized.`,
      );
    return data;
  } finally {
    clearTimeout(timer);
  }
}
const hashText = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
export async function listTreasuryReviews(
  org: string,
): Promise<TreasuryReviewRecord[]> {
  const data = await call("treasury_list_reviews", { p_org: org });
  if (!Array.isArray(data.records) || data.records.length > 100)
    throw Error("Review history is incomplete.");
  for (const r of data.records) {
    if (
      !r ||
      typeof r.id !== "string" ||
      typeof r.requested_by !== "string" ||
      !["pending", "approved", "rejected", "cancelled", "expired"].includes(
        r.effective_status,
      ) ||
      typeof r.evidence !== "object" ||
      typeof r.policy !== "object" ||
      typeof r.proposal_text !== "string" ||
      r.proposal_text.length > 8192 ||
      !/^[a-f0-9]{64}$/.test(r.proposal_hash) ||
      (await hashText(r.proposal_text)) !== r.proposal_hash ||
      canonical(JSON.parse(r.proposal_text)) !== canonical(r.proposal) ||
      r.organization_id !== org ||
      !Number.isFinite(Date.parse(r.expires_at))
    )
      throw Error(
        "Review payload or digest verification failed. No approval may be inferred.",
      );
  }
  return data.records;
}
export async function requestTreasuryReview(
  org: string,
  key: string,
  report: TreasuryPreflight,
) {
  if (new TextEncoder().encode(JSON.stringify(report)).length > 65536)
    throw Error(
      "This review exceeds the 64 KiB server record limit. Export the complete preflight for a scoped manual review; evidence was not silently removed.",
    );
  if (
    !Number.isFinite(Date.parse(report.observedAt)) ||
    Date.now() - Date.parse(report.observedAt) > 120000 ||
    Date.parse(report.observedAt) > Date.now() + 30000
  )
    throw Error(
      "Refresh preflight before requesting review; the snapshot is stale.",
    );
  const { sha256, ...payload } = report;
  if (
    (await evidenceRecord("treasury-preflight-v1", payload)).sha256 !== sha256
  )
    throw Error(
      "Preflight evidence digest mismatch. Read a fresh snapshot before requesting review.",
    );
  const result = await call("treasury_request_review", {
    p_org: org,
    p_key: key,
    p_proposal: canonical(report.proposal),
    p_policy: report.policy,
    p_evidence: report,
  });
  if (
    typeof result.id !== "string" ||
    result.proposalHash !== (await hashText(canonical(report.proposal)))
  )
    throw Error(
      "Submission receipt is unconfirmed. Refresh review history before retrying.",
    );
  return result;
}
export async function decideTreasuryReview(
  record: TreasuryReviewRecord,
  decision: "approved" | "rejected",
  note: string,
  confirmed: boolean,
) {
  if (!confirmed || note.trim().length < 10)
    throw Error(
      "Inspect the exact payload and explain the review before deciding.",
    );
  if (await containsLedgerSeed(note))
    throw Error("Remove wallet secrets from the review note.");
  if (Date.parse(record.expires_at) <= Date.now())
    throw Error("This review has expired. Request a fresh preflight.");
  if ((await hashText(record.proposal_text)) !== record.proposal_hash)
    throw Error("Proposal digest mismatch.");
  return call("treasury_decide_review", {
    p_id: record.id,
    p_hash: record.proposal_hash,
    p_decision: decision,
    p_note: note.trim(),
  });
}
export const cancelTreasuryReview = (id: string) =>
  call("treasury_cancel_review", { p_id: id });
