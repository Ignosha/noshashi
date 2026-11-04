import { canonical } from "@/lib/compliance/registry";
import { containsLedgerSeed } from "@/lib/agent/secrets";

export async function evidenceRecord(scope: string, payload: unknown) {
  const evidence = { schema: "noshashi-security-evidence-v1", scope, payload };
  const bytes = new TextEncoder().encode(canonical(evidence));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return {
    evidence,
    sha256: Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    canonicalization: "recursive sorted-key JSON / UTF-8",
    limitation:
      "A hash identifies evidence bytes; it is not a digital signature or independent attestation.",
  };
}

/** Untrusted input is data only. Do not retain secrets in workflow records. */
export async function parseWorkflowJson(text: string): Promise<unknown> {
  if (new TextEncoder().encode(text).length > 131072)
    throw Error("Input exceeds the 128 KiB workflow limit.");
  if (
    (await containsLedgerSeed(text)) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----|\"(?:seed|mnemonic|privateKey|private_key|apiKey|api_key|password|token)\"\s*:/i.test(
      text,
    )
  )
    throw Error(
      "Remove secrets and private keys. These workflows accept public metadata and procedures only.",
    );
  try {
    return JSON.parse(text);
  } catch {
    throw Error("Enter valid JSON. No commands or scripts are executed.");
  }
}

export function publicSource(value: unknown): string {
  if (typeof value !== "string" || value.length > 1000)
    throw Error("Use a public HTTPS source URL.");
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw Error("Use a public HTTPS source URL.");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    !u.hostname.includes(".") ||
    /^[\d.]+$/.test(u.hostname) ||
    u.hostname.includes(":") ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(u.hostname)
  )
    throw Error(
      "Use a public HTTPS source URL without embedded credentials or a private host.",
    );
  return u.href;
}
