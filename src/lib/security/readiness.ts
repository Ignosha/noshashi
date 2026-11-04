import { publicSource } from "./workflowEvidence";
import { containsLedgerSeed } from "@/lib/agent/secrets";

export const READINESS_CHECKS = [
  "clean_device_reviewed",
  "backup_access_tested",
  "signing_authority_reviewed",
  "evidence_location_known",
  "approval_roles_agreed",
] as const;
export type ReadinessPlan = {
  schema: "noshashi-readiness-v1";
  ownerRole: string;
  backupRole: string;
  contactUrl: string;
  contactCheckedAt: string;
  contactCheckAcknowledged: boolean;
  checks: Record<(typeof READINESS_CHECKS)[number], boolean>;
};
export function readinessPlan(value: any): ReadinessPlan {
  if (
    !value ||
    value.schema !== "noshashi-readiness-v1" ||
    typeof value.ownerRole !== "string" ||
    value.ownerRole.length > 80 ||
    typeof value.backupRole !== "string" ||
    value.backupRole.length > 80 ||
    typeof value.contactCheckedAt !== "string" ||
    value.contactCheckedAt.length > 40 ||
    typeof value.contactCheckAcknowledged !== "boolean" ||
    !value.checks ||
    READINESS_CHECKS.some((k) => typeof value.checks[k] !== "boolean")
  )
    throw Error(
      "Invalid readiness record. Use roles, an official contact route and checklist answers; never enter recovery phrases or keys.",
    );
  const contactUrl =
    value.contactUrl === "" ? "" : publicSource(value.contactUrl);
  if (contactUrl && (new URL(contactUrl).search || new URL(contactUrl).hash))
    throw Error("Use the public contact page without query strings or tokens.");
  return {
    schema: value.schema,
    ownerRole: value.ownerRole.trim(),
    backupRole: value.backupRole.trim(),
    contactUrl,
    contactCheckedAt: value.contactCheckedAt,
    contactCheckAcknowledged: value.contactCheckAcknowledged,
    checks: Object.fromEntries(
      READINESS_CHECKS.map((k) => [k, value.checks[k]]),
    ) as ReadinessPlan["checks"],
  };
}
export function assessReadiness(value: ReadinessPlan, now = Date.now()) {
  const p = readinessPlan(value);
  const gaps: string[] = [];
  if (!p.ownerRole) gaps.push("Assign a response owner role.");
  if (!p.backupRole || p.backupRole.toLowerCase() === p.ownerRole.toLowerCase())
    gaps.push("Assign a distinct backup role.");
  const checked = Date.parse(p.contactCheckedAt);
  if (
    !p.contactUrl ||
    !p.contactCheckAcknowledged ||
    !Number.isFinite(checked) ||
    checked > now ||
    now - checked > 90 * 86400000
  )
    gaps.push(
      "Independently check the official contact route and record a date within the last 90 days.",
    );
  for (const key of READINESS_CHECKS)
    if (!p.checks[key]) gaps.push(`Review: ${key.replace(/_/g, " ")}.`);
  return {
    status: gaps.length ? "review_gaps" : "checklist_complete",
    gaps,
    assessedAt: new Date(now).toISOString(),
    limitation:
      "Self-reported procedures only. This does not verify backups, test a signing device, confirm a custodian or guarantee recovery.",
  };
}

export type EncryptedReadiness = {
  schema: "noshashi-readiness-encrypted-v1";
  kdf: "PBKDF2-SHA256";
  iterations: 600000;
  cipher: "AES-256-GCM";
  salt: string;
  iv: string;
  ciphertext: string;
};
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function decode(text: string, max: number) {
  if (
    typeof text !== "string" ||
    text.length > max * 2 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(text)
  )
    throw Error("Invalid encrypted notebook.");
  const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  if (bytes.length > max) throw Error("Encrypted notebook exceeds its limit.");
  return bytes;
}
async function keyFor(passphrase: string, salt: Uint8Array) {
  if (passphrase.length < 14 || passphrase.length > 256)
    throw Error(
      "Use a notebook passphrase of 14–256 characters. Do not use a wallet seed.",
    );
  if (await containsLedgerSeed(passphrase))
    throw Error("Never use a wallet seed as a notebook passphrase.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptReadiness(
  value: ReadinessPlan,
  passphrase: string,
): Promise<EncryptedReadiness> {
  const p = readinessPlan(value);
  if (await containsLedgerSeed(JSON.stringify(p)))
    throw Error(
      "Remove wallet seeds. This notebook stores procedures and public contact routes only.",
    );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(
        "noshashi-readiness-encrypted-v1",
      ),
    },
    await keyFor(passphrase, salt),
    new TextEncoder().encode(JSON.stringify(p)),
  );
  return {
    schema: "noshashi-readiness-encrypted-v1",
    kdf: "PBKDF2-SHA256",
    iterations: 600000,
    cipher: "AES-256-GCM",
    salt: b64(salt),
    iv: b64(iv),
    ciphertext: b64(new Uint8Array(encrypted)),
  };
}
export async function decryptReadiness(
  v: any,
  passphrase: string,
): Promise<ReadinessPlan> {
  if (
    !v ||
    v.schema !== "noshashi-readiness-encrypted-v1" ||
    v.kdf !== "PBKDF2-SHA256" ||
    v.iterations !== 600000 ||
    v.cipher !== "AES-256-GCM"
  )
    throw Error("Unsupported notebook format or KDF settings.");
  const salt = decode(v.salt, 16),
    iv = decode(v.iv, 12),
    ciphertext = decode(v.ciphertext, 16384);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16)
    throw Error("Invalid encrypted notebook.");
  const key = await keyFor(passphrase, salt);
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(v.schema),
      },
      key,
      ciphertext,
    );
    return readinessPlan(JSON.parse(new TextDecoder().decode(plain)));
  } catch {
    throw Error(
      "Notebook could not be unlocked. Check the passphrase and file integrity; no recovery/reset service exists.",
    );
  }
}
