import { describe, expect, it } from "vitest";
import type { ContinuityIntent } from "./intent";
import { XRPL_RLUSD } from "./rlusd";
import { compareRlusdObservations } from "./rlusd-monitor";
import type { SettlementEvidence } from "./settlement";

const intent: ContinuityIntent = {
  schema: "noshashi.continuity.intent.v1", network: "xrpl-mainnet", tenantId: "tenant", requestId: "request",
  transactionType: "Payment", sourceAccount: "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
  destinationAccount: "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY", destinationTag: null,
  asset: { currency: XRPL_RLUSD.currency, issuer: XRPL_RLUSD.issuer },
  amount: "1", lastLedgerSequence: 200, signingPayloadSha256: "C".repeat(64),
};
const clear = {
  issuerAuthorized: false, issuerFrozen: false, holderFrozen: false,
  issuerDeepFrozen: false, holderDeepFrozen: false,
};
const controls = {
  ledgerHash: "A".repeat(64), asset: XRPL_RLUSD, issuerRequireAuth: false,
  issuerGlobalFreeze: false, sourceLine: clear, destinationLine: clear,
};
const previous: SettlementEvidence = {
  ledgerIndex: 190, validated: true, sourceAccount: intent.sourceAccount,
  destinationAccount: intent.destinationAccount, sourceExists: true, destinationExists: true,
  sourceSequence: 10, sourceSpendableDrops: null, estimatedFeeDrops: null, destinationTagRequired: false,
  trustLineAuthorized: null, trustLineFrozen: null, issuerGlobalFreeze: null, rlusd: controls,
};
const nextControls = { ...controls, ledgerHash: "B".repeat(64) };
const current = { ...previous, ledgerIndex: 191, rlusd: nextControls };

describe("RLUSD payment-condition monitoring", () => {
  it("lists material changes with both observation anchors", () => {
    const result = compareRlusdObservations(intent, previous, { ...current, destinationTagRequired: true,
      rlusd: { ...nextControls, issuerGlobalFreeze: true, sourceLine: { ...clear, holderDeepFrozen: true } } });
    expect(result).toEqual({ status: "CHANGED", reason: null,
      previousLedger: { index: 190, hash: controls.ledgerHash }, currentLedger: { index: 191, hash: nextControls.ledgerHash },
      changes: ["destinationTagRequired", "issuerGlobalFreeze", "sourceHolderDeepFrozen"].map(condition => ({
        condition, previous: false, current: true,
      })),
    });
  });

  it("reports unchanged when the complete later reading agrees", () => {
    expect(compareRlusdObservations(intent, previous, current)).toMatchObject({ status: "UNCHANGED", changes: [] });
  });

  it.each([null, { ...current, validated: false }, { ...current, ledgerIndex: intent.lastLedgerSequence },
    { ...current, destinationAccount: intent.sourceAccount }, { ...current, rlusd: undefined },
  ])("rejects missing, unvalidated, expired, or mismatched inputs", (reading) => {
    expect(compareRlusdObservations(intent, previous, reading)).toMatchObject({
      status: "UNKNOWN", reason: "RLUSD_MONITOR_EVIDENCE_UNBOUND", changes: [],
    });
  });

  it.each([previous, { ...current, ledgerIndex: 189 }, { ...current, rlusd: controls }])("requires a later distinct ledger", (reading) => {
    expect(compareRlusdObservations(intent, previous, reading)).toMatchObject({
      status: "UNKNOWN", reason: "RLUSD_MONITOR_LEDGER_NOT_NEW", changes: [],
    });
  });

  it("withholds a clear comparison when a control is unknown", () => {
    expect(compareRlusdObservations(intent, previous, { ...current,
      rlusd: { ...nextControls, destinationLine: null, issuerGlobalFreeze: true },
    })).toMatchObject({ status: "UNKNOWN", reason: "RLUSD_MONITOR_CONTROLS_INCOMPLETE", changes: [] });
  });
});
