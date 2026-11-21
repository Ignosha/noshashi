/**
 * Canonical, domain-separated transaction intent for NOSHASHI Continuity.
 * Amounts are strings to avoid floating-point rounding.
 * This is an intent commitment, NOT a serialized XRPL transaction hash.
 */
export type IntentValue = string | number | boolean | null | IntentValue[] | { [key: string]: IntentValue };
export type ContinuityIntent = Readonly<{
  schema: "noshashi.continuity.intent.v1";
  network: "xrpl-mainnet";
  tenantId: string;
  requestId: string;
  transactionType: string;
  sourceAccount: string;
  destinationAccount: string | null;
  asset: Readonly<{ currency: string; issuer: string | null }>;
  amount: string;
  destinationTag: number | null;
  lastLedgerSequence: number;
  signingPayloadSha256: string;
}>;
const hex64 = /^[0-9a-f]{64}$/i;
const decimal = /^(0|[1-9]\d*)(\.\d*[1-9])?$/;
const xrplAccount = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
/** Reject values JSON.stringify would silently drop or coerce. */
export function canonicalJson(value: IntentValue): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("UNSAFE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value !== "object") throw new Error("INVALID_VALUE");
  const record = value as Record<string, IntentValue>;
  const keys = Object.keys(record).sort();
  if (keys.some(k => k === "__proto__" || k === "constructor" || k === "prototype")) {
    throw new Error("UNSAFE_KEY");
  }
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalJson(record[k])).join(",") + "}";
}
export function validateContinuityIntent(intent: ContinuityIntent): void {
  if (intent.schema !== "noshashi.continuity.intent.v1" || intent.network !== "xrpl-mainnet") throw new Error("UNSUPPORTED_INTENT");
  if (![intent.tenantId, intent.requestId, intent.transactionType].every(v => typeof v === "string" && v.length > 0 && v.length <= 128)) throw new Error("INVALID_IDENTITY");
  if (!xrplAccount.test(intent.sourceAccount) || (intent.destinationAccount !== null && !xrplAccount.test(intent.destinationAccount))) throw new Error("INVALID_ACCOUNT");
  if (!intent.asset || !/^[A-Za-z0-9]{3,40}$/.test(intent.asset.currency) || (intent.asset.issuer !== null && !xrplAccount.test(intent.asset.issuer))) throw new Error("INVALID_ASSET");
  if (intent.asset.currency === "XRP" ? intent.asset.issuer !== null : intent.asset.issuer === null) throw new Error("INVALID_ISSUER");
  if (!decimal.test(intent.amount) || intent.amount === "0") throw new Error("INVALID_AMOUNT");
  if (intent.destinationTag !== null && (!Number.isSafeInteger(intent.destinationTag) || intent.destinationTag < 0 || intent.destinationTag > 4294967295)) throw new Error("INVALID_TAG");
  if (!Number.isSafeInteger(intent.lastLedgerSequence) || intent.lastLedgerSequence <= 0) throw new Error("INVALID_LEDGER");
  if (!hex64.test(intent.signingPayloadSha256)) throw new Error("INVALID_SIGNING_PAYLOAD_HASH");
  const keys = Object.keys(intent).sort();
  const expected = ["amount","asset","destinationAccount","destinationTag","lastLedgerSequence","network","requestId","schema","signingPayloadSha256","sourceAccount","tenantId","transactionType"].sort();
  if (keys.length !== expected.length || keys.some((k,i) => k !== expected[i])) throw new Error("UNKNOWN_INTENT_FIELD");
  const assetKeys = Object.keys(intent.asset).sort();
  if (assetKeys.join(",") !== "currency,issuer") throw new Error("UNKNOWN_ASSET_FIELD");
}
export async function hashContinuityIntent(intent: ContinuityIntent): Promise<string> {
  validateContinuityIntent(intent);
  const bytes = new TextEncoder().encode("NOSHASHI_CONTINUITY_INTENT_V1\n" + canonicalJson(intent as unknown as IntentValue));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
}
