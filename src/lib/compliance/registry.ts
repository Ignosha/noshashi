import { FUNCTIONS_URL } from "@/lib/supabase/project";
import { rpc, XrplError } from "@/lib/xrpl/client";
import {
  admission,
  credentialFromEntry,
  domainFromEntry,
  hexToText,
  type Admission,
  type AcceptedCredential,
  type CredentialEntry,
  type DomainEntry,
} from "../../../supabase/functions/_shared/ledgerRegistry.ts";

/**
 * Permissioned domains and credentials for compliance teams.
 *
 * Two sources, never mixed without saying so:
 *  - the directory, from noshashi-ledger-registry: every PermissionedDomain
 *    and Credential object on mainnet, read by a sweep of the validated
 *    ledger's state, with the ledger each sweep was pinned to;
 *  - live reads, straight from the ledger at the latest validated index,
 *    for the domain or account in front of the operator. A decision (an
 *    admission check, a counterparty's credentials) is always made on a
 *    live read, and its record carries that ledger index.
 */

export type { Admission, AcceptedCredential, CredentialEntry, DomainEntry };

const BASE = `${FUNCTIONS_URL}/noshashi-ledger-registry`;
const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HEX64 = /^[0-9A-Fa-f]{64}$/;

export const isAddress = (v: string) => ADDRESS.test(v.trim());
export const isDomainId = (v: string) => HEX64.test(v.trim());

// ── The directory ─────────────────────────────────────────────────────

export type SweepStatus = {
  kind: "permissioned_domain" | "credential";
  in_progress: boolean;
  in_progress_ledger: number | null;
  pages_read: number;
  found_so_far: number;
  started_at: string | null;
  last_complete_at: string | null;
  last_complete_ledger: number | null;
  last_complete_pages: number | null;
  last_error: string | null;
};
export type RegistryStatus = { sweeps: SweepStatus[]; domains: number; credentials: number; method: string };

export type DirectoryDomain = DomainEntry & { seenLedger: number; firstSeenAt: string; removedAt: string | null };

type DomainRow = {
  domain_id: string;
  owner: string;
  sequence: number | null;
  accepted_credentials: AcceptedCredential[];
  previous_txn_id: string | null;
  previous_txn_ledger: number | null;
  seen_ledger: number;
  first_seen_at: string;
  removed_at: string | null;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(15_000) });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ? `Registry: ${body.error}` : `The registry replied ${response.status}.`);
  return body;
}

export async function registryStatus(): Promise<RegistryStatus> {
  return getJson<RegistryStatus>("/status");
}

export async function directoryDomains(owner?: string): Promise<{ domains: DirectoryDomain[]; status: RegistryStatus }> {
  const q = owner ? `?owner=${encodeURIComponent(owner)}` : "";
  const body = await getJson<{ domains: DomainRow[]; status: RegistryStatus }>(`/domains${q}`);
  return {
    status: body.status,
    domains: body.domains.map((d) => ({
      domainId: d.domain_id,
      owner: d.owner,
      sequence: d.sequence,
      accepted: d.accepted_credentials ?? [],
      previousTxnId: d.previous_txn_id,
      previousTxnLedger: d.previous_txn_ledger,
      seenLedger: d.seen_ledger,
      firstSeenAt: d.first_seen_at,
      removedAt: d.removed_at,
    })),
  };
}

export type IssuerRow = {
  issuer: string;
  credential_type: string | null;
  credential_type_hex: string;
  total: number;
  accepted: number;
  pending: number;
  expired: number;
  domains: number;
};

export async function directoryIssuers(): Promise<{ issuers: IssuerRow[]; status: RegistryStatus }> {
  const body = await getJson<{ issuers: IssuerRow[]; status: RegistryStatus }>("/issuers");
  return {
    status: body.status,
    issuers: body.issuers.map((r) => ({ ...r, total: Number(r.total), accepted: Number(r.accepted), pending: Number(r.pending), expired: Number(r.expired), domains: Number(r.domains) })),
  };
}

// ── Live reads ────────────────────────────────────────────────────────

export type LedgerAt = { index: number; closeTime: number; closeIso: string };

export async function validatedLedger(): Promise<LedgerAt> {
  const r = await rpc("ledger", { ledger_index: "validated" });
  const index = Number(r.ledger_index ?? r.ledger?.ledger_index);
  const closeTime = Number(r.ledger?.close_time);
  if (!Number.isFinite(index) || !Number.isFinite(closeTime)) throw new Error("No validated ledger could be read.");
  return { index, closeTime, closeIso: new Date((closeTime + 946_684_800) * 1000).toISOString() };
}

/** One domain by its ID, from the ledger. Null when no such domain exists. */
export async function readDomain(domainId: string, validatedIndex: number): Promise<DomainEntry | null> {
  try {
    const r = await rpc("ledger_entry", { index: domainId.trim().toUpperCase(), ledger_index: validatedIndex });
    return domainFromEntry(r.node ?? {}, r.index);
  } catch (e) {
    if (e instanceof XrplError && e.code === "entryNotFound") return null;
    throw e;
  }
}

async function ownedObjects(account: string, type: "permissioned_domain" | "credential", validatedIndex: number): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let marker: unknown;
  for (let page = 0; page < 10; page++) {
    try {
      const r = await rpc("account_objects", { account, type, ledger_index: validatedIndex, limit: 400, ...(marker ? { marker } : {}) });
      out.push(...((r.account_objects ?? []) as Array<Record<string, unknown>>));
      marker = r.marker;
      if (!marker) break;
    } catch (e) {
      if (e instanceof XrplError && e.code === "actNotFound") return [];
      throw e;
    }
  }
  return out;
}

/** Domains an account owns, from the ledger. */
export async function domainsOwnedBy(owner: string, validatedIndex: number): Promise<DomainEntry[]> {
  return (await ownedObjects(owner, "permissioned_domain", validatedIndex))
    .map((o) => domainFromEntry(o, o.index as string))
    .filter((d): d is DomainEntry => d !== null);
}

/**
 * Credentials that name `account`, from the ledger. A Credential sits in
 * both the issuer's and the subject's owner directory, so the same read
 * returns what the account issued and what it holds; `role` picks one.
 */
export async function credentialsOf(account: string, role: "subject" | "issuer", validatedIndex: number): Promise<CredentialEntry[]> {
  return (await ownedObjects(account, "credential", validatedIndex))
    .map((o) => credentialFromEntry(o, o.index as string))
    .filter((c): c is CredentialEntry => c !== null && (role === "subject" ? c.subject === account : c.issuer === account));
}

export type AdmissionRecord = {
  domain: DomainEntry;
  account: string;
  result: Admission;
  ledger: LedgerAt;
  checkedAt: string;
  digest: string;
};

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Canonical JSON (sorted keys), so the same facts always give the same digest. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Would `account` be admitted to the domain, read live? The record's
 * digest covers the domain as read, the account, the credentials matched,
 * the verdict and the ledger index, so a printed record can be re-checked.
 */
export async function checkAdmission(domainId: string, account: string): Promise<AdmissionRecord> {
  const ledger = await validatedLedger();
  const domain = await readDomain(domainId, ledger.index);
  if (!domain) throw new Error("No permissioned domain with that ID exists in the validated ledger.");
  const held = await credentialsOf(account.trim(), "subject", ledger.index);
  const result = admission(domain, account.trim(), held, ledger.closeTime);
  const checkedAt = new Date().toISOString();
  const digest = await sha256(canonical({ domain, account: account.trim(), result, ledger: ledger.index, closeTime: ledger.closeTime }));
  return { domain, account: account.trim(), result, ledger, checkedAt, digest };
}

/** The type as a person reads it: text when the bytes are text, else hex. */
export function typeLabel(c: { type: string | null; typeHex: string }): string {
  return c.type ?? hexToText(c.typeHex) ?? `0x${c.typeHex}`;
}

export { sha256 as sha256Hex };
