/**
 * Permissioned domains (XLS-80) and credentials (XLS-70), as ledger facts.
 *
 * Shared by the registry sweep (noshashi-ledger-registry), which reads every
 * PermissionedDomain and Credential object on mainnet, and by the desktop
 * app, which reads single ones live. Both shape ledger entries here and
 * both answer "would this account be admitted to this domain?" with the
 * same rule, so a directory row and a live check can never disagree.
 *
 * The admission rule is the ledger's own (rippled `accountInDomain`): the
 * domain's owner is always in it; anyone else is in it while they hold a
 * Credential matching one of the domain's AcceptedCredentials (same issuer,
 * same type) that the subject has accepted and that has not expired at the
 * ledger's close time.
 */

/** Seconds between the Unix epoch and the XRPL epoch (2000-01-01). */
export const RIPPLE_EPOCH = 946_684_800;
/** lsfAccepted on a Credential: the subject has accepted it. */
export const LSF_ACCEPTED = 0x0001_0000;

const HEX64 = /^[0-9A-F]{64}$/;

export type AcceptedCredential = {
  issuer: string;
  /** CredentialType as stored on ledger (hex). */
  typeHex: string;
  /** The type as text when it decodes to printable UTF-8, otherwise null. */
  type: string | null;
};

export type DomainEntry = {
  domainId: string;
  owner: string;
  sequence: number | null;
  accepted: AcceptedCredential[];
  previousTxnId: string | null;
  previousTxnLedger: number | null;
};

export type CredentialEntry = {
  credentialId: string;
  subject: string;
  issuer: string;
  typeHex: string;
  type: string | null;
  accepted: boolean;
  /** Expiration in XRPL-epoch seconds, or null when it never expires. */
  expiration: number | null;
  uri: string | null;
  previousTxnId: string | null;
  previousTxnLedger: number | null;
};

/** Printable UTF-8 from hex, or null (binary types are shown as hex). */
export function hexToText(hex: string): string | null {
  if (!hex || hex.length % 2 || !/^[0-9A-Fa-f]+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  // Control characters mean the bytes were never meant as text.
  return /[\x00-\x1F\x7F]/.test(text) ? null : text;
}

export function textToHex(text: string): string {
  return Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** A PermissionedDomain ledger entry, shaped. `index` is its ledger key, the domain ID. */
export function domainFromEntry(entry: Record<string, unknown>, index?: string): DomainEntry | null {
  if (entry.LedgerEntryType !== "PermissionedDomain") return null;
  const domainId = String(index ?? entry.index ?? "").toUpperCase();
  const owner = str(entry.Owner);
  if (!HEX64.test(domainId) || !owner) return null;
  const accepted: AcceptedCredential[] = [];
  for (const wrapper of (entry.AcceptedCredentials as Array<Record<string, unknown>> | undefined) ?? []) {
    const c = (wrapper.Credential ?? wrapper) as Record<string, unknown>;
    const issuer = str(c.Issuer);
    const typeHex = str(c.CredentialType)?.toUpperCase();
    if (issuer && typeHex) accepted.push({ issuer, typeHex, type: hexToText(typeHex) });
  }
  return {
    domainId,
    owner,
    sequence: num(entry.Sequence),
    accepted,
    previousTxnId: str(entry.PreviousTxnID),
    previousTxnLedger: num(entry.PreviousTxnLgrSeq),
  };
}

/** A Credential ledger entry, shaped. `index` is its ledger key. */
export function credentialFromEntry(entry: Record<string, unknown>, index?: string): CredentialEntry | null {
  if (entry.LedgerEntryType !== "Credential") return null;
  const credentialId = String(index ?? entry.index ?? "").toUpperCase();
  const subject = str(entry.Subject);
  const issuer = str(entry.Issuer);
  const typeHex = str(entry.CredentialType)?.toUpperCase();
  if (!HEX64.test(credentialId) || !subject || !issuer || !typeHex) return null;
  const uriHex = str(entry.URI);
  return {
    credentialId,
    subject,
    issuer,
    typeHex,
    type: hexToText(typeHex),
    accepted: ((num(entry.Flags) ?? 0) & LSF_ACCEPTED) !== 0,
    expiration: num(entry.Expiration),
    uri: uriHex ? hexToText(uriHex) ?? uriHex : null,
    previousTxnId: str(entry.PreviousTxnID),
    previousTxnLedger: num(entry.PreviousTxnLgrSeq),
  };
}

export type CredentialStatus = "valid" | "pending" | "expired";

/** `closeTime` is the ledger close time in XRPL-epoch seconds. */
export function credentialStatus(c: Pick<CredentialEntry, "accepted" | "expiration">, closeTime: number): CredentialStatus {
  if (c.expiration !== null && c.expiration <= closeTime) return "expired";
  return c.accepted ? "valid" : "pending";
}

export type AdmissionLine = AcceptedCredential & {
  status: "valid" | "pending" | "expired" | "not_held";
  credentialId: string | null;
  /** ISO date of expiry, when the credential held has one. */
  expiresAt: string | null;
};

export type Admission = {
  admitted: boolean;
  /** Why: the account owns the domain, holds a valid accepted credential, or neither. */
  basis: "owner" | "credential" | "none";
  lines: AdmissionLine[];
};

export function rippleToIso(seconds: number): string {
  return new Date((seconds + RIPPLE_EPOCH) * 1000).toISOString();
}

/**
 * Would `account` be admitted to `domain`? `held` is every Credential object
 * the account is subject of (any issuer); `closeTime` the validated ledger's
 * close time in XRPL-epoch seconds.
 */
export function admission(domain: DomainEntry, account: string, held: CredentialEntry[], closeTime: number): Admission {
  const lines: AdmissionLine[] = domain.accepted.map((want) => {
    const match = held.find((c) => c.subject === account && c.issuer === want.issuer && c.typeHex === want.typeHex);
    if (!match) return { ...want, status: "not_held", credentialId: null, expiresAt: null };
    return {
      ...want,
      status: credentialStatus(match, closeTime),
      credentialId: match.credentialId,
      expiresAt: match.expiration === null ? null : rippleToIso(match.expiration),
    };
  });
  if (account === domain.owner) return { admitted: true, basis: "owner", lines };
  const ok = lines.some((l) => l.status === "valid");
  return { admitted: ok, basis: ok ? "credential" : "none", lines };
}

/** Credentials that stop counting within `days` of `closeTime` (still valid today). */
export function expiringWithin(c: Pick<CredentialEntry, "accepted" | "expiration">, closeTime: number, days: number): boolean {
  return c.expiration !== null && c.expiration > closeTime && c.expiration - closeTime <= days * 86_400;
}
