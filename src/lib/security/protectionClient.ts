import { supabase } from "@/lib/supabase/client";
import { supabaseErrorMessage } from "@/lib/supabase/errors";
import { rpc, XrplError } from "@/lib/xrpl/client";
import {
  assessProtection,
  buildLiabilityTree,
  fromUnits,
  heldAccountFrom,
  proofFor,
  rootOf,
  toUnits,
  type HeldAccount,
  type InclusionProof,
  type ProtectionReport,
} from "../../../supabase/functions/_shared/protection.ts";

/**
 * Customer Asset Protection in the app: build the liabilities tree from the
 * institution's own balance export (on this machine; nothing but the root,
 * total and count is sent), publish the root, keep the program's reserve
 * and fund accounts, and read the same assessment the daily attestation
 * records, live.
 */

export type ProtectionProgramRow = {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  reserve_addresses: string[];
  fund_addresses: string[];
  coverage_limit_xrp: number;
  public: boolean;
  updated_at: string;
};

export type LiabilitiesRow = { id: number; root: string; total_xrp: number; customers: number; as_of: string; published_at: string };
export type AttestationRow = { id: number; attested_at: string; ledger_index: number; status: ProtectionReport["status"]; coverage_ratio: number | null; digest: string; previous_digest: string | null };

const db = () => supabase().schema("noshashi");

const REFUSALS: Record<string, string> = {
  NOT_AUTHENTICATED: "Sign in again. Nothing was saved.",
  INSUFFICIENT_PERMISSIONS: "Only owners, admins and compliance members can change a protection program.",
  FEATURE_NOT_IN_PLAN: "Proof of reserves is part of the Institutional plan.",
  FUND_NOT_IN_PLAN: "A protection fund and a public page are part of the Enterprise plan.",
  INVALID_ADDRESSES: "Give 1 to 50 reserve addresses and up to 20 fund addresses, each a classic r-address.",
  FUND_OVERLAPS_RESERVES: "An account cannot be both a reserve and part of the protection fund.",
  INVALID_SLUG: "The page name is 3 to 48 lower-case letters, digits and hyphens.",
  INVALID_NAME: "The program name is 2 to 120 characters.",
  INVALID_LIMIT: "The per-customer limit must be zero or more XRP.",
  SLUG_TAKEN: "Another program already uses that page name.",
  TOO_MANY_PROGRAMS: "An organization can run up to 10 programs.",
  NOT_FOUND: "No such program in this organization.",
  INVALID_ROOT: "The root must be 64 lower-case hex characters.",
  INVALID_TOTAL: "The total and the number of customers must be positive.",
  INVALID_AS_OF: "The balances must be dated within the last 35 days.",
};

function refusal(data: unknown): void {
  const r = data as { ok: boolean; code?: string };
  if (!r.ok) throw new Error(REFUSALS[r.code ?? ""] ?? `Refused (${r.code}).`);
}

export async function listPrograms(org: string): Promise<ProtectionProgramRow[]> {
  const { data, error } = await db().from("protection_programs").select("id, organization_id, slug, name, reserve_addresses, fund_addresses, coverage_limit_xrp, public, updated_at").eq("organization_id", org).order("created_at");
  if (error) throw new Error(supabaseErrorMessage(error));
  return ((data ?? []) as ProtectionProgramRow[]).map((p) => ({ ...p, coverage_limit_xrp: Number(p.coverage_limit_xrp) }));
}

export async function saveProgram(org: string, p: { id: string | null; slug: string; name: string; reserves: string[]; fund: string[]; limitXrp: number; isPublic: boolean }): Promise<string> {
  const { data, error } = await db().rpc("save_protection_program", { p_org: org, p_id: p.id, p_slug: p.slug, p_name: p.name, p_reserves: p.reserves, p_fund: p.fund, p_limit_xrp: p.limitXrp, p_public: p.isPublic });
  if (error) throw new Error(supabaseErrorMessage(error));
  refusal(data);
  return String((data as { id: string }).id);
}

export async function latestLiabilities(program: string): Promise<LiabilitiesRow | null> {
  const { data, error } = await db().from("protection_liabilities").select("id, root, total_xrp, customers, as_of, published_at").eq("program_id", program).order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  return data ? { ...(data as LiabilitiesRow), total_xrp: Number((data as LiabilitiesRow).total_xrp) } : null;
}

export async function listAttestations(program: string, limit = 30): Promise<AttestationRow[]> {
  const { data, error } = await db().from("protection_attestations").select("id, attested_at, ledger_index, status, coverage_ratio, digest, previous_digest").eq("program_id", program).order("id", { ascending: false }).limit(limit);
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []) as AttestationRow[];
}

export async function publishLiabilities(program: string, root: string, totalXrp: number, customers: number, asOf: string): Promise<void> {
  const { data, error } = await db().rpc("publish_protection_liabilities", { p_program: program, p_root: root, p_total_xrp: totalXrp, p_customers: customers, p_as_of: asOf });
  if (error) throw new Error(supabaseErrorMessage(error));
  refusal(data);
}

// ── The liabilities tree, built on this machine ─────────────────────

export type BuiltLiabilities = {
  root: string;
  totalXrp: number;
  customers: number;
  salt: string;
  /** One proof per customer, keyed by the customer id from the file, to send to each customer. */
  proofs: Array<{ customer: string; proof: InclusionProof & { salt: string } }>;
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Read "customer id,balance in XRP" lines and build the tree. Each leaf is
 * keyed by SHA-256(salt | customer id), with a fresh random salt, so the
 * published tree names nobody and a customer's id cannot be guessed from it.
 */
export async function buildLiabilities(csv: string): Promise<BuiltLiabilities> {
  const rows = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (rows.length && !/\d/.test(rows[0].split(",")[1] ?? "")) rows.shift(); // a header line
  if (!rows.length) throw new Error("The file has no customer balances.");
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const seen = new Set<string>();
  const entries: Array<{ customer: string; ref: string; amount: bigint }> = [];
  for (const [i, line] of rows.entries()) {
    const [id, value] = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (!id || value === undefined) throw new Error(`Line ${i + 1}: expected "customer id,balance".`);
    if (seen.has(id)) throw new Error(`Customer ${id} appears twice; give each customer one line with their total.`);
    seen.add(id);
    entries.push({ customer: id, ref: await sha256Hex(`${salt}|${id}`), amount: toUnits(value) });
  }
  const levels = await buildLiabilityTree(entries);
  const root = rootOf(levels);
  return {
    root: root.hash,
    totalXrp: fromUnits(root.sum),
    customers: root.count,
    salt,
    proofs: entries.map((e, i) => ({ customer: e.customer, proof: { ...proofFor(levels, i, e.ref), salt } })),
  };
}

// ── The assessment, read live ───────────────────────────────────────

/** `validatedIndex` is the index of a validated ledger, read first so every account is read at the same one. */
async function heldAccount(address: string, programAccounts: string[], validatedIndex: number, closeTime: number): Promise<HeldAccount> {
  const info = await rpc("account_info", { account: address, ledger_index: validatedIndex, signer_lists: true }).catch((e) => (e instanceof XrplError && e.code === "actNotFound" ? null : Promise.reject(e)));
  const escrows: Array<Record<string, unknown>> = [];
  if (info) {
    let marker: unknown;
    for (let page = 0; page < 5; page++) {
      const r = await rpc("account_objects", { account: address, ledger_index: validatedIndex, type: "escrow", limit: 400, ...(marker ? { marker } : {}) });
      escrows.push(...((r.account_objects ?? []) as Array<Record<string, unknown>>));
      marker = r.marker;
      if (!marker) break;
    }
  }
  return heldAccountFrom(address, info, escrows, programAccounts, closeTime);
}

export async function assessLive(p: ProtectionProgramRow, liabilities: LiabilitiesRow | null): Promise<ProtectionReport> {
  const ledger = await rpc("ledger", { ledger_index: "validated" });
  const ledgerIndex = Number(ledger.ledger_index ?? ledger.ledger?.ledger_index);
  const closeTime = Number(ledger.ledger?.close_time);
  const accounts = [...p.reserve_addresses, ...p.fund_addresses];
  const held: HeldAccount[] = [];
  for (const a of accounts) held.push(await heldAccount(a, accounts, ledgerIndex, closeTime));
  return assessProtection(
    {
      name: p.name,
      reserveAddresses: p.reserve_addresses,
      fundAddresses: p.fund_addresses,
      coverageLimitXrp: p.coverage_limit_xrp,
      liabilities: liabilities ? { root: liabilities.root, totalXrp: liabilities.total_xrp, count: liabilities.customers, asOf: new Date(liabilities.as_of).toISOString() } : null,
    },
    held.slice(0, p.reserve_addresses.length),
    held.slice(p.reserve_addresses.length),
    ledgerIndex,
    new Date((closeTime + 946_684_800) * 1000).toISOString()
  );
}
