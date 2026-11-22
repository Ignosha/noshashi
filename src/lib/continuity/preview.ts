import type { ContinuityIntent } from "./intent";
import { hashContinuityIntent } from "./intent";
import { evaluateAssurance, type AssuranceInput, type AssuranceResult } from "./assurance";

/**
 * Read-only Continuity preview. Never returns signing authorization.
 * The existing assurance composer is NOT an enforcement boundary:
 * settlement validation, issuer certificate verification and trusted
 * source attestation must be added before a signed GO can be issued.
 */
export type PreflightPreview = Readonly<{
  intentHash: string | null;
  verdict: "HOLD" | "NO-GO";
  reasons: readonly string[];
  evidenceComplete: false;
  signingAuthorized: false;
  riskAssessment: AssuranceResult | null;
}>;

export async function previewContinuityTransaction(
  intent: ContinuityIntent,
  evidence: AssuranceInput | null,
): Promise<PreflightPreview> {
  let intentHash: string;
  try {
    intentHash = await hashContinuityIntent(intent);
  } catch {
    return {
      intentHash: null, verdict: "HOLD", reasons: ["INVALID_TRANSACTION_INTENT"],
      evidenceComplete: false, signingAuthorized: false, riskAssessment: null,
    };
  }
  if (!evidence) {
    return {
      intentHash, verdict: "HOLD", reasons: ["XRPL_EVIDENCE_NOT_PROVIDED"],
      evidenceComplete: false, signingAuthorized: false, riskAssessment: null,
    };
  }
  const assessment = evaluateAssurance(evidence);
  return {
    intentHash,
    verdict: assessment.verdict === "NO-GO" ? "NO-GO" : "HOLD",
    reasons: [...assessment.reasons, "SETTLEMENT_AND_SOURCE_VERIFICATION_NOT_INTEGRATED"],
    evidenceComplete: false,
    signingAuthorized: false,
    riskAssessment: assessment,
  };
}
