import type { ContinuityIntent } from "./intent";

/** Evidence must be collected from the same validated ledger. */
export type SettlementEvidence = Readonly<{
  ledgerIndex: number;
  validated: boolean;
  sourceAccount: string;
  destinationAccount: string | null;
  sourceExists: boolean | null;
  destinationExists: boolean | null;
  sourceSequence: number;
  sourceSpendableDrops: string | null;
  estimatedFeeDrops: string | null;
  destinationTagRequired: boolean | null;
  trustLineAuthorized: boolean | null;
  trustLineFrozen: boolean | null;
  issuerGlobalFreeze: boolean | null;
}>;
export type SettlementResult = Readonly<{
  verdict: "GO" | "HOLD" | "NO-GO";
  reasons: readonly string[];
  evidenceComplete: boolean;
}>;
const drops = /^(0|[1-9]\d*)$/;
function parseDrops(value: string | null): bigint | null {
  if (value === null || !drops.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}
/**
 * Conservative Payment-only checks. GO means these checks passed, NOT that
 * settlement is guaranteed or signing is authorized. No live RPC is performed.
 */
export function evaluateSettlement(intent: ContinuityIntent, evidence: SettlementEvidence | null): SettlementResult {
  if (!evidence) return { verdict: "HOLD", reasons: ["SETTLEMENT_EVIDENCE_MISSING"], evidenceComplete: false };
  const reasons: string[] = [];
  let incomplete = false;
  let blocked = false;
  const missing = (reason: string) => { reasons.push(reason); incomplete = true; };
  const fail = (reason: string) => { reasons.push(reason); blocked = true; };
  if (intent.transactionType !== "Payment") missing("TRANSACTION_TYPE_UNSUPPORTED");
  if (!evidence.validated || !Number.isSafeInteger(evidence.ledgerIndex) || evidence.ledgerIndex <= 0 ||
      evidence.ledgerIndex >= intent.lastLedgerSequence) missing("LEDGER_UNVALIDATED_OR_EXPIRED");
  if (evidence.sourceAccount !== intent.sourceAccount || evidence.destinationAccount !== intent.destinationAccount)
    missing("ACCOUNT_EVIDENCE_MISMATCH");
  if (evidence.sourceExists === null) missing("SOURCE_ACCOUNT_STATE_UNKNOWN");
  else if (evidence.sourceExists === false) fail("SOURCE_ACCOUNT_NOT_FOUND");
  if (evidence.destinationExists === null) missing("DESTINATION_STATE_UNKNOWN");
  else if (!evidence.destinationExists) missing("DESTINATION_CREATION_RULES_NOT_EVALUATED");
  if (!Number.isSafeInteger(evidence.sourceSequence) || evidence.sourceSequence <= 0) missing("SOURCE_SEQUENCE_UNKNOWN");
  if (evidence.destinationTagRequired === null) missing("DESTINATION_TAG_RULE_UNKNOWN");
  else if (evidence.destinationTagRequired && intent.destinationTag === null) fail("DESTINATION_TAG_REQUIRED");
  if (intent.asset.currency !== "XRP") {
    if (evidence.trustLineAuthorized === null || evidence.trustLineFrozen === null || evidence.issuerGlobalFreeze === null)
      missing("ISSUED_ASSET_STATE_UNKNOWN");
    else {
      if (!evidence.trustLineAuthorized) fail("TRUST_LINE_UNAUTHORIZED");
      if (evidence.trustLineFrozen) fail("TRUST_LINE_FROZEN");
      if (evidence.issuerGlobalFreeze) fail("ISSUER_GLOBAL_FREEZE");
    }
    // Issued-asset source balances, transfer rates, and destination limits need
    // additional evidence; do not produce a GO without those checks.
    missing("ISSUED_ASSET_SETTLEMENT_CHECKS_INCOMPLETE");
  } else {
    const available = parseDrops(evidence.sourceSpendableDrops);
    const fee = parseDrops(evidence.estimatedFeeDrops);
    const amount = parseDrops(intent.amount);
    if (available === null || fee === null || amount === null || amount === 0n)
      missing("XRP_BALANCE_OR_FEE_UNKNOWN");
    else if (available < amount + fee) fail("INSUFFICIENT_SPENDABLE_XRP");
  }
  return {
    verdict: blocked ? "NO-GO" : incomplete ? "HOLD" : "GO",
    reasons, evidenceComplete: !incomplete,
  };
}
