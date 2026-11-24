import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { hashContinuityIntent, type ContinuityIntent } from "./intent";
import {
  evaluateThreatIntegration, evaluateWalletIntegration, evaluationDigest,
  simulatedThreatAdapter, simulatedWalletAdapter,
  type ThreatEvaluationRequest, type ThreatIndicator, type ThreatObservation,
  type WalletEvaluationRequest, type WalletObservation,
} from "./integration-evaluation";

const clock = { nowMs: 10_000, maxEvidenceAgeMs: 1_000 };
const sourceAccount = "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
const destination = "rrrrrrrrrrrrrrrrrrrrrhoLvTp";
const intent: ContinuityIntent = {
  schema: "noshashi.continuity.intent.v1",
  network: "xrpl-mainnet",
  tenantId: "synthetic-tenant-01",
  requestId: "synthetic-request-01",
  transactionType: "Payment",
  sourceAccount,
  destinationAccount: destination,
  asset: { currency: "XRP", issuer: null },
  amount: "1000000",
  destinationTag: 0,
  lastLedgerSequence: 108_000_100,
  signingPayloadSha256: "a".repeat(64),
};
const walletRequest: WalletEvaluationRequest = {
  schema: "noshashi.continuity.wallet-evaluation.v1",
  walletIntentRef: "fixture-wallet-01",
  intent,
  policyHash: "b".repeat(64),
  ledgerHash: "c".repeat(64),
  prior: null,
};
const provenance = {
  provider: "synthetic-source",
  sourceRef: "fixture-observation-01",
  observedAtMs: 9_900,
  expiresAtMs: 11_000,
};
const walletObservation: WalletObservation = {
  tenantId: intent.tenantId, network: intent.network, walletIntentRef: walletRequest.walletIntentRef,
  intentHash: await hashContinuityIntent(intent), transactionHash: "d".repeat(64), provenance,
};
const prior = {
  intentHash: walletObservation.intentHash,
  policyHash: walletRequest.policyHash,
  ledgerHash: walletRequest.ledgerHash,
  expiresAtMs: 10_500,
};
const threatRequest: ThreatEvaluationRequest = {
  schema: "noshashi.continuity.threat-evaluation.v1",
  tenantId: intent.tenantId, network: intent.network, address: destination,
};
const indicator: ThreatIndicator = {
  id: "fixture-alert-01", network: intent.network, address: destination,
  kind: "OPERATIONAL_ALERT", disposition: "UNREVIEWED", provenance,
};
const threatObservation: ThreatObservation = {
  tenantId: threatRequest.tenantId, network: intent.network, address: destination, provenance,
  indicators: [indicator],
};

describe("read-only wallet evaluation", () => {
  it("binds a matching simulated intent and reported transaction to a digestible HOLD record", async () => {
    const readIntent = vi.fn(async () => walletObservation);
    const result = await evaluateWalletIntegration({ ...walletRequest, prior }, { mode: "SIMULATED", readIntent }, clock);
    expect(readIntent).toHaveBeenCalledExactlyOnceWith({
      tenantId: intent.tenantId, network: intent.network, walletIntentRef: walletRequest.walletIntentRef,
    });
    expect(result.record).toMatchObject({
      mode: "SIMULATED", review: "HOLD", approvalDrift: "UNCHANGED", providerObservation: "MATCHED",
      binding: { intentHash: walletObservation.intentHash, policyHash: walletRequest.policyHash, ledgerHash: walletRequest.ledgerHash },
      observation: { transactionHash: walletObservation.transactionHash, provenance },
    });
    expect(await evaluationDigest(result.record)).toBe(result.sha256);
    expect(await evaluationDigest({ ...result.record, observation: { ...walletObservation, transactionHash: null } })).not.toBe(result.sha256);
  });

  it.each([
    ["destination", { destinationAccount: sourceAccount }],
    ["tag", { destinationTag: null }],
    ["amount", { amount: "1000001" }],
    ["signing payload digest", { signingPayloadSha256: "f".repeat(64) }],
  ])("detects drift if the %s changes", async (_label, patch) => {
    const result = await evaluateWalletIntegration(
      { ...walletRequest, intent: { ...intent, ...patch }, prior }, simulatedWalletAdapter(walletObservation), clock,
    );
    expect(result.record).toMatchObject({
      approvalDrift: "CHANGED", providerObservation: "UNKNOWN", observation: null,
      reasons: ["INTENT_MISMATCH", "APPROVAL_CONTEXT_CHANGED"], review: "HOLD",
    });
  });

  it.each(["ledgerHash", "policyHash"] as const)("detects drift when %s changes", async field => {
    const result = await evaluateWalletIntegration(
      { ...walletRequest, [field]: "e".repeat(64), prior }, simulatedWalletAdapter(walletObservation), clock,
    );
    expect(result.record).toMatchObject({ approvalDrift: "CHANGED", reasons: ["APPROVAL_CONTEXT_CHANGED"], review: "HOLD" });
  });

  it("compares exact XRPL currency and issuer for a simulated RLUSD payment", async () => {
    const issuedIntent: ContinuityIntent = {
      ...intent, amount: "12.5",
      asset: { currency: "524C555344000000000000000000000000000000", issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De" },
    };
    const sameWallet = simulatedWalletAdapter({
      ...walletObservation, intentHash: await hashContinuityIntent(issuedIntent), transactionHash: null,
    });
    const result = await evaluateWalletIntegration({ ...walletRequest, intent: issuedIntent }, sameWallet, clock);
    expect(result.record).toMatchObject({ providerObservation: "MATCHED", review: "HOLD" });
    const altered = { ...issuedIntent, asset: { ...issuedIntent.asset, issuer: sourceAccount } };
    const mismatch = await evaluateWalletIntegration({ ...walletRequest, intent: altered }, sameWallet, clock);
    expect(mismatch.record).toMatchObject({ providerObservation: "UNKNOWN", reasons: ["INTENT_MISMATCH"], review: "HOLD" });
  });

  it("distinguishes absent baselines and expired exact baselines", async () => {
    const adapter = simulatedWalletAdapter(walletObservation);
    expect((await evaluateWalletIntegration(walletRequest, adapter, clock)).record.approvalDrift).toBe("UNKNOWN");
    const result = await evaluateWalletIntegration(
      { ...walletRequest, prior: { ...prior, expiresAtMs: clock.nowMs } }, adapter, clock,
    );
    expect(result.record).toMatchObject({ approvalDrift: "EXPIRED", reasons: ["APPROVAL_EXPIRED"] });
  });

  it.each([
    ["cross tenant", { tenantId: "other-tenant" }, "SCOPE_MISMATCH"],
    ["other intent reference", { walletIntentRef: "other-wallet-01" }, "SCOPE_MISMATCH"],
    ["too old", { provenance: { ...provenance, observedAtMs: 8_999 } }, "STALE_OBSERVATION"],
    ["expired", { provenance: { ...provenance, expiresAtMs: clock.nowMs } }, "STALE_OBSERVATION"],
    ["future", { provenance: { ...provenance, observedAtMs: 10_001 } }, "STALE_OBSERVATION"],
    ["invalid transaction", { transactionHash: "wrong" }, "MALFORMED_OBSERVATION"],
    ["extra provider data", { rawPrivateData: "fixture data" }, "MALFORMED_OBSERVATION"],
  ])("withholds %s observations", async (_label, patch, reason) => {
    const result = await evaluateWalletIntegration(walletRequest, simulatedWalletAdapter({ ...walletObservation, ...patch }), clock);
    expect(result.record).toMatchObject({
      review: "HOLD", providerObservation: "UNKNOWN", observation: null, reasons: [reason],
    });
  });

  it("rejects malformed requests before reading from the provider", async () => {
    const readIntent = vi.fn();
    const adapter = { mode: "SIMULATED" as const, readIntent };
    await expect(evaluateWalletIntegration({ ...walletRequest, privateKey: "discard me" }, adapter, clock)).rejects.toThrow("INVALID_WALLET_REQUEST");
    await expect(evaluateWalletIntegration(
      { ...walletRequest, intent: { ...intent, sourceAccount: "r" + "A".repeat(25) } }, adapter, clock,
    )).rejects.toThrow("INVALID_WALLET_INTENT");
    await expect(evaluateWalletIntegration({ ...walletRequest, intent: { ...intent, amount: 10 } }, adapter, clock)).rejects.toThrow("INVALID_WALLET_INTENT");
    await expect(evaluateWalletIntegration({ ...walletRequest, intent: { ...intent, amount: "1.1" } }, adapter, clock)).rejects.toThrow("INVALID_WALLET_INTENT");
    await expect(evaluateWalletIntegration(walletRequest, adapter, { ...clock, maxEvidenceAgeMs: Infinity })).rejects.toThrow("INVALID_EVALUATION_CONTEXT");
    expect(readIntent).not.toHaveBeenCalled();
  });

  it("keeps missing observations and provider exceptions distinct without exporting provider errors", async () => {
    const missing = await evaluateWalletIntegration(walletRequest, simulatedWalletAdapter(null), clock);
    expect(missing.record.reasons).toEqual(["MISSING_OBSERVATION"]);
    const failed = await evaluateWalletIntegration(walletRequest, {
      mode: "EXTERNAL", readIntent: async () => { throw new Error("private upstream error"); },
    }, clock);
    expect(failed.record.reasons).toEqual(["PROVIDER_UNAVAILABLE"]);
    expect(JSON.stringify(failed)).not.toContain("private upstream error");
  });
});

describe("read-only threat evaluation", () => {
  it("preserves provider observations separately from review and binds historical records", async () => {
    const dismissed: ThreatIndicator = {
      ...indicator, id: "historic-01", disposition: "DISMISSED", kind: "COUNTERPARTY_INCIDENT",
    };
    const result = await evaluateThreatIntegration(
      threatRequest, simulatedThreatAdapter({ ...threatObservation, indicators: [indicator, dismissed] }), clock,
    );
    expect(result.record).toMatchObject({
      review: "HOLD", mode: "SIMULATED", providerObservation: "INDICATORS_REPORTED",
      reasons: ["INDICATOR_REQUIRES_REVIEW"], observation: { indicators: [indicator, dismissed] },
    });
    expect(await evaluationDigest(result.record)).toBe(result.sha256);
    expect(await evaluationDigest({ ...result.record, scope: { ...result.record.scope, address: sourceAccount } })).not.toBe(result.sha256);
  });

  it("treats empty, disputed, stale and dismissed indicators as no current result", async () => {
    const empty = await evaluateThreatIntegration(
      threatRequest, simulatedThreatAdapter({ ...threatObservation, indicators: [] }), clock,
    );
    expect(empty.record).toMatchObject({
      review: "HOLD", providerObservation: "UNKNOWN", reasons: ["NO_CURRENT_INDICATORS"],
    });
    const result = await evaluateThreatIntegration(threatRequest, simulatedThreatAdapter({
      ...threatObservation,
      indicators: [
        { ...indicator, id: "stale-01", provenance: { ...provenance, expiresAtMs: clock.nowMs } },
        { ...indicator, id: "disputed-01", disposition: "DISPUTED" },
        { ...indicator, id: "dismissed-01", disposition: "DISMISSED" },
      ],
    }), clock);
    expect(result.record).toMatchObject({
      review: "HOLD", providerObservation: "UNKNOWN",
      reasons: ["INDICATOR_STALE", "INDICATOR_DISPUTED", "NO_CURRENT_INDICATORS"],
    });
  });

  it.each([
    ["wrong tenant", { tenantId: "other-tenant" }, "SCOPE_MISMATCH"],
    ["wrong subject", { address: sourceAccount }, "SCOPE_MISMATCH"],
    ["wrong indicator subject", { indicators: [{ ...indicator, address: sourceAccount }] }, "SCOPE_MISMATCH"],
    ["duplicate indicator IDs", { indicators: [indicator, indicator] }, "MALFORMED_OBSERVATION"],
    ["oversized feed", { indicators: Array.from({length: 33}, (_, i) => ({ ...indicator, id: "indicator-" + i })) }, "MALFORMED_OBSERVATION"],
    ["creator-supplied fraud determination", { indicators: [{ ...indicator, conclusion: "fraud" }] }, "MALFORMED_OBSERVATION"],
  ])("withholds an observation with %s", async (_label, patch, reason) => {
    const result = await evaluateThreatIntegration(threatRequest, simulatedThreatAdapter({ ...threatObservation, ...patch }), clock);
    expect(result.record).toMatchObject({
      review: "HOLD", providerObservation: "UNKNOWN", observation: null, reasons: [reason],
    });
  });

  it("rejects unimplemented networks before calling the adapter", async () => {
    const readIndicators = vi.fn();
    await expect(evaluateThreatIntegration(
      { ...threatRequest, network: "ethereum-mainnet" }, { mode: "SIMULATED", readIndicators }, clock,
    )).rejects.toThrow("INVALID_THREAT_REQUEST");
    expect(readIndicators).not.toHaveBeenCalled();
  });
});

it("reproduces both documented sample receipts exactly", async () => {
  const guide = readFileSync(new URL("../../../docs/api/continuity-integration-evaluation.md", import.meta.url), "utf8");
  const samples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
  expect(samples).toHaveLength(4);
  const [documentedWalletRequest, documentedWalletReceipt, documentedThreatRequest, documentedThreatReceipt] = samples;
  const walletAdapter = simulatedWalletAdapter(documentedWalletReceipt.record.observation);
  expect(await evaluateWalletIntegration(documentedWalletRequest, walletAdapter, clock)).toEqual(documentedWalletReceipt);
  const threatAdapter = simulatedThreatAdapter(documentedThreatReceipt.record.observation);
  expect(await evaluateThreatIntegration(documentedThreatRequest, threatAdapter, clock)).toEqual(documentedThreatReceipt);
});
