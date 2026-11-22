/** XRPL Transaction Autopsy v1 — deterministic, read-only normalization.
 * This module does not fetch network data or assert an outcome is final without validation.
 */
export type AutopsyState = "VERIFIED_FACT" | "UNKNOWN";
export type AutopsyReport = Readonly<{
  schema: "noshashi.autopsy.v1";
  network: "xrpl-mainnet";
  hash: string;
  status: AutopsyState;
  validated: boolean;
  ledgerIndex: number | null;
  resultCode: string | null;
  disposition: "SUCCESS" | "FAILED" | "UNKNOWN";
  reasonCodes: readonly string[];
}>;
const hashPattern = /^[A-Fa-f0-9]{64}$/;
export function normalizeAutopsy(hash: string, response: Record<string, unknown> | null): AutopsyReport {
  if (!hashPattern.test(hash)) throw new Error("INVALID_TRANSACTION_HASH");
  const base = {
    schema: "noshashi.autopsy.v1" as const, network: "xrpl-mainnet" as const,
    hash: hash.toUpperCase(),
  };
  const unknown = (reason: string): AutopsyReport => ({
    ...base, status: "UNKNOWN", validated: false, ledgerIndex: null,
    resultCode: null, disposition: "UNKNOWN", reasonCodes: [reason],
  });
  if (!response) return unknown("TRANSACTION_EVIDENCE_MISSING");
  const returnedHash = response.hash ?? (response.tx_json as Record<string, unknown> | undefined)?.hash;
  if (typeof returnedHash !== "string" || returnedHash.toUpperCase() !== base.hash)
    return unknown("TRANSACTION_HASH_MISMATCH");
  if (response.validated !== true) return unknown("TRANSACTION_NOT_VALIDATED");
  const ledgerIndex = response.ledger_index;
  if (!Number.isSafeInteger(ledgerIndex) || (ledgerIndex as number) <= 0)
    return unknown("LEDGER_INDEX_UNKNOWN");
  const meta = response.meta;
  if (!meta || typeof meta !== "object") return unknown("TRANSACTION_METADATA_MISSING");
  const code = (meta as Record<string, unknown>).TransactionResult;
  if (typeof code !== "string" || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(code))
    return unknown("TRANSACTION_RESULT_UNKNOWN");
  const success = code === "tesSUCCESS";
  return {
    ...base, status: "VERIFIED_FACT", validated: true,
    ledgerIndex: ledgerIndex as number, resultCode: code,
    disposition: success ? "SUCCESS" : "FAILED",
    reasonCodes: success ? [] : [code],
  };
}
