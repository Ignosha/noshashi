import { FUNCTIONS_URL } from "@/lib/supabase/project";
import { supabase } from "@/lib/supabase/client";
import { supabaseErrorMessage } from "@/lib/supabase/errors";
import { rpc, XrplError } from "@/lib/xrpl/client";
import { sanctionsFor } from "@/lib/xrpl/sanctions";
import { fundingChain } from "@/lib/xrpl/deposit";
import {
  normalizeDomain,
  screenWithdrawal,
  THREAT_CATEGORIES,
  type FundingHop,
  type ThreatEntry,
  type WithdrawalScreening,
} from "../../../supabase/functions/_shared/xrplEvents.ts";

/**
 * The shared scam registry, the phishing link feed and withdrawal
 * screening, as the app uses them.
 *
 * Lookups go to the public noshashi-xrpl-watch routes (no account needed),
 * so the app, the website and the API read the same records. A report is
 * written through noshashi.submit_threat_report, which checks the
 * organization's plan and the member's role; it counts only once NOSHASHI
 * staff who did not submit it have confirmed it.
 */

export { THREAT_CATEGORIES };
export type ThreatCategory = (typeof THREAT_CATEGORIES)[number];
export type ThreatHit = ThreatEntry & { evidenceTx: string[] };

const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

/** Confirmed registry entries for these addresses; null when the registry could not be reached. */
export async function threatsFor(addresses: string[]): Promise<Record<string, ThreatHit> | null> {
  const wanted = [...new Set(addresses.filter((a) => ADDRESS.test(a)))].slice(0, 50);
  if (!wanted.length) return {};
  try {
    const response = await fetch(`${FUNCTIONS_URL}/noshashi-xrpl-watch/threats?addresses=${wanted.join(",")}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { hits?: Array<{ address: string; reports: number; categories: string[]; first_confirmed: string; evidence_tx: string[] }> };
    const out: Record<string, ThreatHit> = {};
    for (const h of body.hits ?? []) {
      if (ADDRESS.test(h.address)) out[h.address] = { address: h.address, reports: h.reports, categories: h.categories, firstConfirmed: h.first_confirmed, evidenceTx: h.evidence_tx ?? [] };
    }
    return out;
  } catch {
    return null;
  }
}

export type PhishingCheck = {
  domain: string;
  listed: boolean;
  seen: boolean;
  sightings: Array<{ domain: string; listed: boolean; recipients: number; senders: number; sightings: number; first_seen: string; last_seen: string; sample_memo: string; sample_tx: string }>;
  method: string;
  last_ledger_read: number | null;
  ledgers_read_24h: number;
  note: string;
};

export async function checkPhishingLink(link: string): Promise<PhishingCheck> {
  const domain = normalizeDomain(link);
  if (!domain) throw new Error("That is not a public domain name or link.");
  const response = await fetch(`${FUNCTIONS_URL}/noshashi-xrpl-watch/phishing?domain=${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(10_000) });
  const body = (await response.json().catch(() => ({}))) as PhishingCheck & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `The phishing check failed (HTTP ${response.status}).`);
  return body;
}

const REFUSALS: Record<string, string> = {
  NOT_AUTHENTICATED: "Sign in again to report. Nothing was sent.",
  INSUFFICIENT_PERMISSIONS: "Your role in this organization cannot file reports.",
  FEATURE_NOT_IN_PLAN: "Filing reports is part of the Institutional plan. Lookups are free.",
  INVALID_ADDRESS: "That is not a classic XRP Ledger address.",
  INVALID_CATEGORY: "Choose a category.",
  INVALID_EVIDENCE: "Give 1 to 20 transaction hashes (64 hex characters each) that show it.",
  INVALID_NOTE: "Describe what happened in 10 to 2,000 characters.",
  ALREADY_REPORTED: "Your organization has already reported this address in this category.",
  RATE_LIMITED: "Your organization has filed 50 reports today. Try again tomorrow.",
};

export async function submitThreatReport(org: string, address: string, category: ThreatCategory, evidence: string[], note: string): Promise<string> {
  const { data, error } = await supabase().schema("noshashi").rpc("submit_threat_report", { p_org: org, p_address: address, p_category: category, p_evidence: evidence, p_note: note });
  if (error) throw new Error(supabaseErrorMessage(error));
  const result = data as { ok: boolean; code?: string; id?: string };
  if (!result.ok) throw new Error(REFUSALS[result.code ?? ""] ?? `Refused (${result.code}).`);
  return String(result.id);
}

export type ThreatReport = { id: string; address: string; category: string; status: "pending" | "confirmed" | "rejected"; created_at: string; review_note: string | null };

export async function listThreatReports(org: string): Promise<ThreatReport[]> {
  const { data, error } = await supabase().schema("noshashi").from("threat_reports")
    .select("id, address, category, status, created_at, review_note").eq("organization_id", org).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []) as ThreatReport[];
}

// ── Withdrawal screening, read live ──────────────────────────────────

export type WithdrawalRequest = { destination: string; destinationTag: number | null; amountXrp: number | null; previousDestinations: string[]; ownAddresses: string[] };
export type WithdrawalResult = WithdrawalScreening & { chain: FundingHop[]; ledger: number; unchecked: string[] };

export async function screenWithdrawalLive(req: WithdrawalRequest): Promise<WithdrawalResult> {
  const [ledger, info, server] = await Promise.all([
    rpc("ledger", { ledger_index: "validated" }),
    rpc("account_info", { account: req.destination, ledger_index: "validated" }).catch((e) => (e instanceof XrplError && e.code === "actNotFound" ? null : Promise.reject(e))),
    rpc("server_info", {}),
  ]);
  const current = Number(ledger.ledger_index ?? ledger.ledger?.ledger_index);
  const reserveBaseXrp = Number(server.info?.validated_ledger?.reserve_base_xrp);
  if (!Number.isFinite(reserveBaseXrp) || reserveBaseXrp <= 0) throw new Error("The base reserve could not be read.");
  const chain = info ? await fundingChain(req.destination) : [{ account: req.destination, fundedBy: null, activatedLedger: null }];
  const accounts = chain.map((h) => h.account);
  const [sanctions, threats] = await Promise.all([sanctionsFor(accounts), threatsFor(accounts)]);
  const unchecked = [...(sanctions === null ? ["the OFAC SDN list"] : []), ...(threats === null ? ["the scam registry"] : [])];
  const result = screenWithdrawal({
    destination: req.destination,
    destinationTag: req.destinationTag,
    amountXrp: req.amountXrp,
    destinationInfo: info,
    chain,
    currentLedger: current,
    reserveBaseXrp,
    sanctions: sanctions?.hits ?? {},
    threats: threats ?? {},
    previousDestinations: req.previousDestinations,
    ownAddresses: req.ownAddresses,
  });
  // A list that could not be read is never taken as clear.
  const verdict = unchecked.length && result.verdict === "clear" ? "review" : result.verdict;
  return { ...result, verdict, chain, ledger: current, unchecked };
}
