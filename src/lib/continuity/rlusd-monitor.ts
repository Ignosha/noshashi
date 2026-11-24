import type { ContinuityIntent } from "./intent";
import type { SettlementEvidence } from "./settlement";
import { isHolderToHolder, isXrplRlusd, XRPL_RLUSD } from "./rlusd";

type LedgerPoint = Readonly<{ index: number; hash: string }>;
type ConditionChange = Readonly<{ condition: string; previous: boolean; current: boolean }>;
export type RlusdComparison = Readonly<{
  status: "UNKNOWN" | "CHANGED" | "UNCHANGED";
  reason: "RLUSD_MONITOR_EVIDENCE_UNBOUND" | "RLUSD_MONITOR_LEDGER_NOT_NEW" | "RLUSD_MONITOR_CONTROLS_INCOMPLETE" | null;
  previousLedger: LedgerPoint | null;
  currentLedger: LedgerPoint | null;
  changes: readonly ConditionChange[];
}>;

function boundLedger(intent: ContinuityIntent, evidence: SettlementEvidence | null): LedgerPoint | null {
  if (!evidence?.validated || !Number.isSafeInteger(evidence.ledgerIndex) || evidence.ledgerIndex <= 0 ||
      evidence.ledgerIndex >= intent.lastLedgerSequence || evidence.sourceAccount !== intent.sourceAccount ||
      evidence.destinationAccount !== intent.destinationAccount) return null;
  const controls = evidence.rlusd;
  if (!controls || controls.asset.network !== XRPL_RLUSD.network || controls.asset.issuer !== XRPL_RLUSD.issuer ||
      controls.asset.currency !== XRPL_RLUSD.currency || !/^[a-f0-9]{64}$/i.test(controls.ledgerHash)) return null;
  return { index: evidence.ledgerIndex, hash: controls.ledgerHash.toUpperCase() };
}

function flags(evidence: SettlementEvidence | null): Readonly<Record<string, boolean | null | undefined>> {
  const controls = evidence?.rlusd;
  const source = controls?.sourceLine;
  const destination = controls?.destinationLine;
  return {
    sourceExists: evidence?.sourceExists,
    destinationExists: evidence?.destinationExists,
    destinationTagRequired: evidence?.destinationTagRequired,
    issuerRequireAuth: controls?.issuerRequireAuth,
    issuerGlobalFreeze: controls?.issuerGlobalFreeze,
    sourceIssuerAuthorized: source?.issuerAuthorized,
    sourceIssuerFrozen: source?.issuerFrozen,
    sourceHolderFrozen: source?.holderFrozen,
    sourceIssuerDeepFrozen: source?.issuerDeepFrozen,
    sourceHolderDeepFrozen: source?.holderDeepFrozen,
    destinationIssuerAuthorized: destination?.issuerAuthorized,
    destinationIssuerFrozen: destination?.issuerFrozen,
    destinationHolderFrozen: destination?.holderFrozen,
    destinationIssuerDeepFrozen: destination?.issuerDeepFrozen,
    destinationHolderDeepFrozen: destination?.holderDeepFrozen,
  };
}

/** Compare pinned control observations. The caller retains prior evidence only for the same intent hash. */
export function compareRlusdObservations(
  intent: ContinuityIntent, previous: SettlementEvidence | null, current: SettlementEvidence | null,
): RlusdComparison {
  const eligible = intent.transactionType === "Payment" && isXrplRlusd(intent) && isHolderToHolder(intent);
  const previousLedger = eligible ? boundLedger(intent, previous) : null;
  const currentLedger = eligible ? boundLedger(intent, current) : null;
  const unknown = (reason: NonNullable<RlusdComparison["reason"]>): RlusdComparison => ({
    status: "UNKNOWN", reason, previousLedger, currentLedger, changes: [],
  });
  if (!previousLedger || !currentLedger) return unknown("RLUSD_MONITOR_EVIDENCE_UNBOUND");
  if (currentLedger.index <= previousLedger.index || currentLedger.hash === previousLedger.hash)
    return unknown("RLUSD_MONITOR_LEDGER_NOT_NEW");

  const before = flags(previous);
  const after = flags(current);
  const changes: ConditionChange[] = [];
  for (const [condition, prior] of Object.entries(before)) {
    const latest = after[condition];
    if (typeof prior !== "boolean" || typeof latest !== "boolean")
      return unknown("RLUSD_MONITOR_CONTROLS_INCOMPLETE");
    if (prior !== latest) changes.push({ condition, previous: prior, current: latest });
  }
  return { status: changes.length ? "CHANGED" : "UNCHANGED", reason: null, previousLedger, currentLedger, changes };
}
