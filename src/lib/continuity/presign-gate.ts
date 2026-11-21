/**
 * Continuity pre-sign authorization boundary.
 * Pure, fail-closed logic. This module does NOT integrate with a custody signer.
 * The signing adapter must recompute the transaction-intent digest and must
 * never interpret HOLD as authorization.
 */
export type ContinuityVerdict = "GO" | "HOLD" | "NO-GO";
export type PreSignDecision = Readonly<{
  verdict: ContinuityVerdict;
  intentHash: string;
  policyHash: string;
  ledgerHash: string;
  expiresAtMs: number;
  receiptVerified: boolean;
  evidenceComplete: boolean;
}>;
export type PreSignRequest = Readonly<{
  intentHash: string;
  policyHash: string;
  ledgerHash: string;
  nowMs: number;
}>;
export type GateResult = Readonly<{
  allowed: boolean;
  reason:
    | "AUTHORIZED"
    | "MISSING_DECISION"
    | "NON_GO_VERDICT"
    | "UNVERIFIED_RECEIPT"
    | "INCOMPLETE_EVIDENCE"
    | "INVALID_BINDING"
    | "EXPIRED_DECISION";
}>;
const sha256 = /^[0-9a-f]{64}$/i;
/** Caller must verify the receipt signature before setting receiptVerified. */
export function evaluatePreSignGate(
  request: PreSignRequest,
  decision: PreSignDecision | null,
): GateResult {
  const deny = (reason: GateResult["reason"]): GateResult => ({ allowed: false, reason });
  if (!decision) return deny("MISSING_DECISION");
  if (decision.verdict !== "GO") return deny("NON_GO_VERDICT");
  if (!decision.receiptVerified) return deny("UNVERIFIED_RECEIPT");
  if (!decision.evidenceComplete) return deny("INCOMPLETE_EVIDENCE");
  if (
    !Number.isFinite(request.nowMs) ||
    !Number.isFinite(decision.expiresAtMs) ||
    ![request.intentHash, request.policyHash, request.ledgerHash,
      decision.intentHash, decision.policyHash, decision.ledgerHash].every(v => sha256.test(v)) ||
    request.intentHash.toLowerCase() !== decision.intentHash.toLowerCase() ||
    request.policyHash.toLowerCase() !== decision.policyHash.toLowerCase() ||
    request.ledgerHash.toLowerCase() !== decision.ledgerHash.toLowerCase()
  ) return deny("INVALID_BINDING");
  if (request.nowMs >= decision.expiresAtMs) return deny("EXPIRED_DECISION");
  return { allowed: true, reason: "AUTHORIZED" };
}
