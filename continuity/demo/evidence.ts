import archive from "./solo-mainnet-107585451.json";
import rlusdAccount from "../../tests/fixtures/issuer-state-rlusd-107586974.json";
import { powersFrom } from "../../supabase/functions/_shared/issuerPowers";
import { digest, observe, verify } from "../../supabase/functions/noshashi-verify/payment";
import type { ContinuityIntent } from "../../src/lib/continuity/intent";
import { previewContinuityTransaction } from "../../src/lib/continuity/preview";
import { evaluateSettlement, type SettlementEvidence } from "../../src/lib/continuity/settlement";

export const payment = {
  hash: "33C313E12DD8B2CFDB98ABC6298D4EFD0F3BC8EF283C057A026DA6170E7939AD",
  ledgerHash: "879FD94AC6C1944ABE886760B2706E2A5B863A94DDDA62F9FD0D62E66A97F06B",
  ledgerIndex: 107585451,
  currency: "534F4C4F00000000000000000000000000000000",
  issuer: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz",
} as const;

export const rlusd = {
  network: "XRPL mainnet",
  currency: "524C555344000000000000000000000000000000",
  issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
  identitySource: "https://docs.ripple.com/products/stablecoin/overview/token-addresses",
} as const;

const REQUIRE_DESTINATION_TAG = 0x0002_0000;

export async function reviewArchivedPayment(records: typeof archive.records = archive.records) {
  if (records.length !== 2 || new Set(records.map(source => source.operator)).size !== 2 ||
      new Set(records.map(source => source.tx.url)).size !== 2) {
    throw new Error("Two distinct archived RPC responses are required.");
  }
  const sources = records.map(source => {
    const tx = source.tx.result;
    const account = source.account_info.result;
    const flags = account.account_data.Flags;
    if (source.tx.url !== source.account_info.url || tx.hash !== payment.hash ||
        tx.ledger_hash !== payment.ledgerHash || tx.ledger_index !== payment.ledgerIndex || !tx.validated ||
        account.ledger_hash !== payment.ledgerHash || account.ledger_index !== payment.ledgerIndex || !account.validated ||
        tx.tx_json.Destination !== payment.issuer || account.account_data.Account !== tx.tx_json.Destination ||
        !Number.isSafeInteger(flags) || flags < 0 || flags > 0xffff_ffff) {
      throw new Error("Recorded transaction and destination evidence could not be bound to the same validated ledger.");
    }
    return {
      operator: source.operator,
      url: source.tx.url,
      transactionCapturedAt: source.tx.capturedAt,
      destinationCapturedAt: source.account_info.capturedAt,
      destinationFlags: flags,
    };
  });
  if (sources[0].destinationFlags !== sources[1].destinationFlags) {
    throw new Error("Recorded sources disagree on destination flags.");
  }
  const report = await verify({
    network: "mainnet",
    requestedHash: payment.hash,
    reads: records.map(source => {
      // TypeScript adds optional undefined properties to unions inferred from JSON imports.
      const result = source.tx.result as unknown as Parameters<typeof observe>[2];
      return observe(source.operator, source.tx.capturedAt, result);
    }),
    invoice: null,
    priorInvoice: null,
    evaluatedAt: new Date().toISOString(),
  });
  const deliveredAsset = report.delivered_amount?.asset;
  if (report.reason_code !== "NO_INVOICE_POLICY" || deliveredAsset?.kind !== "issued" ||
      deliveredAsset.issuer !== payment.issuer || deliveredAsset.currency !== payment.currency) {
    throw new Error("Recorded sources did not establish the expected historical SOLO payment.");
  }
  const evidence = {
    type: "historical-replay" as const,
    payment: report.evidence,
    paymentEvidenceDigest: report.evidence_digest,
    ledgerHash: payment.ledgerHash,
    destination: payment.issuer,
    destinationTagRequired: (sources[0].destinationFlags & REQUIRE_DESTINATION_TAG) !== 0,
    sources,
  };
  return {
    report,
    receipt: { schema: "noshashi.continuity.demo-receipt/1", evidence, evidenceDigest: await digest(evidence) },
  };
}

export type DemoReceipt = Awaited<ReturnType<typeof reviewArchivedPayment>>["receipt"];

export async function verifyDemoReceipt(receipt: DemoReceipt): Promise<boolean> {
  return receipt.schema === "noshashi.continuity.demo-receipt/1" &&
    await digest(receipt.evidence.payment) === receipt.evidence.paymentEvidenceDigest &&
    await digest(receipt.evidence) === receipt.evidenceDigest;
}

export function archivedRlusdIssuer() {
  const result = rlusdAccount.result;
  const flags = result.account_data.Flags;
  if (!result.validated || result.account_data.Account !== rlusd.issuer ||
      !Number.isSafeInteger(flags) || flags < 0 || flags > 0xffff_ffff) return null;
  const powers = powersFrom(result);
  if (!powers) return null;
  return { ledgerIndex: result.ledger_index, observedAt: rlusdAccount.read_at, powers };
}

export async function rehearseWalletHandoff(destinationNowRequiresTag: boolean) {
  const intent: ContinuityIntent = {
    schema: "noshashi.continuity.intent.v1",
    network: "xrpl-mainnet",
    tenantId: "demo-tenant",
    requestId: "demo-rlusd-payment",
    transactionType: "Payment",
    sourceAccount: "rPBJGLCysYLSrfH6SttjoWkYW3Pvu2qPR",
    destinationAccount: "rnXyVQzgxZe7TR1EPzTkGj2jxH4LMJYh66",
    asset: { currency: rlusd.currency, issuer: rlusd.issuer },
    amount: "250",
    destinationTag: null,
    lastLedgerSequence: 1010,
    // A fixed simulated commitment. This is not a wallet signing payload.
    signingPayloadSha256: "0".repeat(64),
  };
  const simulated: SettlementEvidence = {
    ledgerIndex: 1000,
    validated: true,
    sourceAccount: intent.sourceAccount,
    destinationAccount: intent.destinationAccount,
    sourceExists: true,
    destinationExists: true,
    sourceSequence: 1,
    sourceSpendableDrops: null,
    estimatedFeeDrops: null,
    destinationTagRequired: destinationNowRequiresTag,
    trustLineAuthorized: null,
    trustLineFrozen: null,
    issuerGlobalFreeze: null,
  };
  const settlement = evaluateSettlement(intent, simulated);
  const preview = await previewContinuityTransaction(intent, null);
  return {
    simulated: true as const,
    intentHash: preview.intentHash,
    verdict: settlement.verdict === "NO-GO" ? "NO-GO" as const : preview.verdict,
    reasons: [...preview.reasons, ...settlement.reasons],
    signingAuthorized: preview.signingAuthorized,
  };
}
