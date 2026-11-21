import type { PolicyCheck } from "../policy";
import { checkState } from "../policy";
import type { AuthorityCertificate } from "../desk/authority";
import type { ExitFill } from "../desk/liquidity";
import type { ContinuityVerdict } from "./presign-gate";

/**
 * Read-only decision composition from existing NOSHASHI evidence.
 * This does NOT issue a signed authorization receipt.
 * Missing or non-validated evidence fails closed to HOLD.
 */
export type AssuranceInput = Readonly<{
  policyChecks: readonly PolicyCheck[];
  issuerCertificate: AuthorityCertificate | null;
  exitFill: ExitFill | null;
  requiredExitAmount: number | null;
  maximumSlippageBps: number | null;
  validatedLedgerIndex: number | null;
  issuerLedgerIndex: number | null;
  liquidityLedgerIndex: number | null;
}>;
export type AssuranceResult = Readonly<{
  verdict: ContinuityVerdict;
  reasons: readonly string[];
  evidenceComplete: boolean;
}>;
export function evaluateAssurance(input: AssuranceInput): AssuranceResult {
  const reasons: string[] = [];
  let hardBlock = false;
  let incomplete = false;
  if (!Number.isSafeInteger(input.validatedLedgerIndex) || (input.validatedLedgerIndex ?? 0) <= 0) {
    reasons.push("VALIDATED_LEDGER_MISSING"); incomplete = true;
  }
  if (!input.policyChecks.length) { reasons.push("POLICY_CHECKS_MISSING"); incomplete = true; }
  for (const c of input.policyChecks) {
    const state = checkState(c);
    if (state === "INSUFFICIENT_DATA") { reasons.push("POLICY_EVIDENCE_MISSING:" + c.id); incomplete = true; }
    else if (state === "FAIL" && c.severity === "block") { reasons.push("POLICY_BLOCK:" + c.id); hardBlock = true; }
    else if (state === "REVIEW" || (state === "FAIL" && c.severity === "warn")) reasons.push("POLICY_REVIEW:" + c.id);
  }
  if (!input.issuerCertificate || input.issuerLedgerIndex !== input.validatedLedgerIndex ||
      input.issuerCertificate.ledgerIndex !== input.validatedLedgerIndex) {
    reasons.push("ISSUER_EVIDENCE_MISSING_OR_STALE"); incomplete = true;
  } else if (input.issuerCertificate.verdict === "NO-GO") {
    reasons.push("ISSUER_BLOCK"); hardBlock = true;
  } else if (input.issuerCertificate.verdict !== "GO") reasons.push("ISSUER_REVIEW");
  if (!input.exitFill || input.liquidityLedgerIndex !== input.validatedLedgerIndex ||
      input.requiredExitAmount === null || !Number.isFinite(input.requiredExitAmount) || input.requiredExitAmount <= 0 ||
      input.maximumSlippageBps === null || !Number.isFinite(input.maximumSlippageBps) || input.maximumSlippageBps < 0 ||
      !Number.isFinite(input.exitFill?.filled) || !Number.isFinite(input.exitFill?.requested) ||
      input.exitFill.requested !== input.requiredExitAmount ||
      !Number.isFinite(input.exitFill.slippageBps)) {
    reasons.push("LIQUIDITY_EVIDENCE_MISSING_OR_STALE"); incomplete = true;
  } else {
    if (input.exitFill.filled < input.requiredExitAmount) { reasons.push("INSUFFICIENT_EXIT_DEPTH"); hardBlock = true; }
    if (input.exitFill.slippageBps! > input.maximumSlippageBps!) { reasons.push("SLIPPAGE_LIMIT"); hardBlock = true; }
  }
  return {
    verdict: hardBlock ? "NO-GO" : incomplete || reasons.length ? "HOLD" : "GO",
    reasons,
    evidenceComplete: !incomplete,
  };
}
