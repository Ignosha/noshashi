import { supabase } from "@/lib/supabase/client";
import { publicSource } from "./workflowEvidence";
import { containsLedgerSeed } from "@/lib/agent/secrets";
import {
  THREAT_CATEGORIES,
  type ThreatCategory,
  type ThreatReport,
} from "./threats";

export type NetworkIndicator = {
  id: string;
  address: string;
  category: string;
  evidence: string[];
  sources: string[];
  reviewedAt: string;
  expiresAt: string;
  confidence: "staff_reviewed_indicator";
};
export type SharedReport = {
  organization: string;
  address: string;
  category: ThreatCategory;
  evidence: string[];
  note: string;
  sources: string[];
};
const addressPattern = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
async function call(name: string, params: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const { data, error } = await supabase()
      .schema("noshashi")
      .rpc(name, params)
      .abortSignal(controller.signal);
    if (error)
      throw Error(
        "The reviewed-sharing backend is unavailable or the result is unconfirmed. Refresh organization reports before retrying a write; ask the operator to verify the security-network migration.",
      );
    if (!data || data.ok !== true)
      throw Error(
        `Request refused: ${data?.code ?? "INCOMPLETE_RESPONSE"}. Nothing was approved automatically.`,
      );
    return data;
  } finally {
    clearTimeout(timer);
  }
}
export async function networkLookup(addresses: string[]): Promise<{
  reports: NetworkIndicator[];
  evaluatedAt: string;
  limit: number;
  limitation: string;
}> {
  if (
    !addresses.length ||
    addresses.length > 50 ||
    addresses.some((a) => !addressPattern.test(a))
  )
    throw Error("Enter 1–50 public classic addresses.");
  const data = await call("security_network_lookup", {
    p_addresses: [...new Set(addresses)],
  });
  if (
    !Array.isArray(data.reports) ||
    data.reports.length > 100 ||
    !Number.isFinite(Date.parse(data.evaluatedAt)) ||
    data.reports.some(
      (r: any) =>
        !addressPattern.test(r.address) ||
        !addresses.includes(r.address) ||
        !(THREAT_CATEGORIES as readonly string[]).includes(r.category) ||
        typeof r.id !== "string" ||
        r.confidence !== "staff_reviewed_indicator" ||
        !Array.isArray(r.evidence) ||
        !r.evidence.length ||
        r.evidence.length > 20 ||
        r.evidence.some(
          (h: unknown) => typeof h !== "string" || !/^[A-F0-9]{64}$/.test(h),
        ) ||
        !Array.isArray(r.sources) ||
        !r.sources.length ||
        r.sources.length > 5 ||
        !Number.isFinite(Date.parse(r.reviewedAt)) ||
        Date.parse(r.reviewedAt) > Date.parse(data.evaluatedAt) ||
        Date.parse(r.expiresAt) > Date.parse(r.reviewedAt) + 90 * 86400000 ||
        !Number.isFinite(Date.parse(r.expiresAt)) ||
        Date.parse(r.expiresAt) <= Date.parse(data.evaluatedAt),
    )
  )
    throw Error(
      "Incomplete or expired network evidence; no clearance was issued.",
    );
  return {
    reports: data.reports.map((r: NetworkIndicator) => ({
      ...r,
      sources: r.sources.map(publicSource),
    })),
    evaluatedAt: data.evaluatedAt,
    limit: 100,
    limitation: String(data.limitation),
  };
}
export async function prepareSharedReport(
  input: SharedReport,
): Promise<SharedReport> {
  if (
    !/^[a-f0-9-]{36}$/i.test(input.organization) ||
    !addressPattern.test(input.address) ||
    !(THREAT_CATEGORIES as readonly string[]).includes(input.category) ||
    !Array.isArray(input.evidence) ||
    !input.evidence.length ||
    input.evidence.length > 20 ||
    input.evidence.some((h) => !/^[a-f0-9]{64}$/i.test(h)) ||
    typeof input.note !== "string" ||
    input.note.trim().length < 10 ||
    input.note.length > 2000 ||
    !input.sources.length ||
    input.sources.length > 5
  )
    throw Error(
      "A report needs an organization, classic address, category, 1–20 transaction hashes, public sources and a 10–2,000 character factual note.",
    );
  if (
    (await containsLedgerSeed(input.note)) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(input.note)
  )
    throw Error(
      "Remove wallet secrets. Only public incident evidence may be shared.",
    );
  return {
    organization: input.organization,
    address: input.address,
    category: input.category,
    evidence: [...new Set(input.evidence.map((h) => h.toUpperCase()))],
    note: input.note.trim(),
    sources: [...new Set(input.sources.map(publicSource))],
  };
}
export const participantStatus = (organization: string) =>
  call("security_network_status", { p_org: organization });
export async function sharePreparedReport(
  report: SharedReport,
  consent: boolean,
) {
  if (!consent)
    throw Error(
      "Review the exact public payload and explicitly approve sharing it.",
    );
  const p = await prepareSharedReport(report);
  const result = await call("security_share_threat", {
    p_org: p.organization,
    p_address: p.address,
    p_category: p.category,
    p_evidence: p.evidence,
    p_note: p.note,
    p_sources: p.sources,
  });
  if (typeof result.id !== "string" || !/^[a-f0-9-]{36}$/i.test(result.id))
    throw Error(
      "Submission receipt is incomplete. Refresh organization reports before retrying.",
    );
  return result;
}
export const withdrawSharedReport = (id: string, reason: string) =>
  call("security_withdraw_threat", { p_id: id, p_reason: reason });
export const participantVerification = (
  organization: string,
  source: string,
  note: string,
) =>
  call("security_verify_participant", {
    p_org: organization,
    p_source: publicSource(source),
    p_note: note,
  });
export const networkReviewQueue = () =>
  call("security_network_review_queue", {});
export const reviewNetworkReport = (
  id: string,
  decision: "confirmed" | "rejected",
  note: string,
) =>
  call("security_review_threat", {
    p_id: id,
    p_decision: decision,
    p_note: note,
  });

/** A bounded private history read; unavailable data never becomes an empty history. */
export async function organizationReportHistory(
  organization: string,
): Promise<ThreatReport[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const { data, error } = await supabase()
      .schema("noshashi")
      .from("threat_reports")
      .select("id,address,category,status,created_at,review_note")
      .eq("organization_id", organization)
      .order("created_at", { ascending: false })
      .limit(100)
      .abortSignal(controller.signal);
    if (error || !Array.isArray(data))
      throw Error(
        "Organization report history is unavailable. Refresh before attempting another submission.",
      );
    return data as ThreatReport[];
  } finally {
    clearTimeout(timer);
  }
}
