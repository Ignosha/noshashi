import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../xrpl/client", () => ({ rpc: vi.fn() }));
import { rpc } from "../xrpl/client";
import { collectSettlementEvidence } from "./xrpl-evidence";
import type { ContinuityIntent } from "./intent";
import { XRPL_RLUSD } from "./rlusd";
const account = "rrrrrrrrrrrrrrrrrrrrrhoLvTp";
const intent: ContinuityIntent = {
  schema: "noshashi.continuity.intent.v1", network: "xrpl-mainnet",
  tenantId: "bank", requestId: "req", transactionType: "Payment",
  sourceAccount: account, destinationAccount: account,
  asset: { currency: "XRP", issuer: null }, amount: "1000",
  destinationTag: null, lastLedgerSequence: 200, signingPayloadSha256: "a".repeat(64),
};
describe("XRPL read-only settlement evidence adapter", () => {
  beforeEach(() => vi.clearAllMocks());
  it("fails closed when validated ledger is unavailable", async () => {
    vi.mocked(rpc).mockRejectedValue(new Error("offline"));
    expect(await collectSettlementEvidence(intent)).toBeNull();
  });
  it("fails closed when the ledger response is not validated", async () => {
    vi.mocked(rpc).mockImplementation(async (command) => {
      if (command === "ledger") return { validated: false, ledger: { ledger_index: 190 } };
      throw new Error("unexpected downstream RPC");
    });
    expect(await collectSettlementEvidence(intent)).toBeNull();
    expect(vi.mocked(rpc)).toHaveBeenCalledTimes(1);
  });
  it("fails closed on a missing ledger index", async () => {
    vi.mocked(rpc).mockImplementation(async (command) => {
      if (command === "ledger") return { validated: true, ledger: {} };
      throw new Error("unexpected downstream RPC");
    });
    expect(await collectSettlementEvidence(intent)).toBeNull();
    expect(vi.mocked(rpc)).toHaveBeenCalledTimes(1);
  });
  it("rejects account data reporting a different ledger", async () => {
    vi.mocked(rpc).mockImplementation(async (command) => {
      if (command === "ledger") return { validated: true, ledger: { ledger_index: 190 } };
      if (command === "account_info") return {
        ledger_index: 189, validated: true,
        account_data: { Balance: "2000000", OwnerCount: 1, Sequence: 1, Flags: 0 },
      };
      return {};
    });
    const result = await collectSettlementEvidence(intent);
    expect(result?.sourceExists).toBeNull();
    expect(result?.destinationExists).toBeNull();
    expect(result?.destinationTagRequired).toBeNull();
  });
  it("rejects account data explicitly marked unvalidated", async () => {
    vi.mocked(rpc).mockImplementation(async (command) => {
      if (command === "ledger") return { validated: true, ledger: { ledger_index: 190 } };
      if (command === "account_info") return {
        ledger_index: 190, validated: false,
        account_data: { Balance: "2000000", OwnerCount: 1, Sequence: 1, Flags: 0 },
      };
      return {};
    });
    const result = await collectSettlementEvidence(intent);
    expect(result?.sourceExists).toBeNull();
    expect(result?.destinationExists).toBeNull();
  });
  it("rejects account data for a different XRPL address", async () => {
    vi.mocked(rpc).mockImplementation(async (command) => {
      if (command === "ledger") return { validated: true, ledger: { ledger_index: 190 } };
      if (command === "account_info") return {
        ledger_index: 190, validated: true,
        account_data: { Account: "rDifferentAccount", Balance: "2000000", OwnerCount: 1, Sequence: 1, Flags: 0 },
      };
      return {};
    });
    const result = await collectSettlementEvidence(intent);
    expect(result?.sourceExists).toBeNull();
    expect(result?.destinationExists).toBeNull();
    expect(result?.sourceSpendableDrops).toBeNull();
    expect(result?.destinationTagRequired).toBeNull();
  });
  it("pins account reads to validated ledger and preserves unknown reserves", async () => {
    vi.mocked(rpc).mockImplementation(async (command, params) => {
      if (command === "ledger") return { validated: true, ledger: { ledger_index: 190 } };
      if (command === "account_info") {
        expect(params?.ledger_index).toBe(190);
        return { account_data: { Balance: "2000000", OwnerCount: 1, Sequence: 1, Flags: 0 } };
      }
      if (command === "fee") return { drops: { open_ledger_fee: "12" } };
      return {};
    });
    const result = await collectSettlementEvidence(intent);
    expect(result?.sourceSpendableDrops).toBeNull();
    expect(result?.destinationTagRequired).toBe(false);
    expect(result?.estimatedFeeDrops).toBe("12");
  });
});

describe("Continuity RLUSD state reads", () => {
  const ledgerHash = "a".repeat(64).toUpperCase();
  const recipient = "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
  const payment: ContinuityIntent = { ...intent,
    asset: { issuer: XRPL_RLUSD.issuer, currency: XRPL_RLUSD.currency.toLowerCase() },
    destinationAccount: recipient, amount: "10",
  };
  const pinned = { validated: true, ledger_hash: ledgerHash, ledger_index: 190 };
  const limit = (issuer: string): { issuer: string; currency: string } => ({ issuer, currency: XRPL_RLUSD.currency });

  function mockLedger({ header = pinned, sourceLine = pinned, issuer = pinned, flags = 0x00080000 | 0x04000000,
    lowLimit = limit(account), highLimit = limit(XRPL_RLUSD.issuer) } = {}) {
    vi.mocked(rpc).mockImplementation(async (command, params = {}) => {
      if (command === "ledger") return header;
      if (command === "account_info") return {
        ...(params.account === XRPL_RLUSD.issuer ? issuer : pinned),
        account_data: { Account: params.account, LedgerEntryType: "AccountRoot", Sequence: 23,
          Flags: params.account === XRPL_RLUSD.issuer ? 0x00040000 : 0 },
      };
      if (command === "ledger_entry") {
        expect(params.ledger_hash).toBe(ledgerHash);
        const request = params.ripple_state as { accounts: string[]; currency: string };
        expect(request.currency).toBe(XRPL_RLUSD.currency);
        expect(request.accounts[0]).toBe(XRPL_RLUSD.issuer);
        if (request.accounts[1] === account) return {
          ...sourceLine,
          node: { LedgerEntryType: "RippleState", Flags: flags, LowLimit: lowLimit, HighLimit: highLimit },
        };
        expect(request.accounts[1]).toBe(recipient);
        return { ...pinned, node: { LedgerEntryType: "RippleState", Flags: 0x00010000 | 0x00020000 | 0x04000000,
          LowLimit: limit(XRPL_RLUSD.issuer), HighLimit: limit(recipient) } };
      }
      return {};
    });
  }

  beforeEach(() => vi.clearAllMocks());

  it("requires the exact asset and reads both line orientations at one hash", async () => {
    mockLedger();
    const evidence = await collectSettlementEvidence(payment);
    expect(evidence?.rlusd).toEqual({
      ledgerHash, asset: XRPL_RLUSD, issuerRequireAuth: true, issuerGlobalFreeze: false,
      sourceLine: { issuerAuthorized: true, issuerFrozen: false, holderFrozen: false,
        issuerDeepFrozen: true, holderDeepFrozen: false },
      // Reserve bits must never make an unapproved line look authorized.
      destinationLine: { issuerAuthorized: false, issuerFrozen: false, holderFrozen: false,
        issuerDeepFrozen: false, holderDeepFrozen: true },
    });
  });

  it("rejects a validated header with no well-formed hash", async () => {
    mockLedger({ header: { ...pinned, ledger_hash: "invalid" } });
    expect(await collectSettlementEvidence(payment)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { sourceLine: { ...pinned, ledger_hash: "B".repeat(64) } },
    { sourceLine: { ...pinned, ledger_index: 189 } },
    { sourceLine: { ...pinned, validated: false } },
    { lowLimit: limit(recipient) },
    { lowLimit: { ...limit(account), currency: "USD" } },
    { flags: -1 },
  ])("holds a line with invalid or mismatched evidence %j", async (override) => {
    mockLedger(override);
    const evidence = await collectSettlementEvidence(payment);
    expect(evidence?.rlusd?.sourceLine).toBeNull();
    expect(evidence?.rlusd?.destinationLine).not.toBeNull();
  });

  it("does not attribute issuer flags to the wrong ledger", async () => {
    mockLedger({ issuer: { ...pinned, ledger_hash: "B".repeat(64) } });
    const evidence = await collectSettlementEvidence(payment);
    expect(evidence?.rlusd?.issuerRequireAuth).toBeNull();
    expect(evidence?.rlusd?.issuerGlobalFreeze).toBeNull();
  });

  it("does not query RLUSD controls for a lookalike issuer", async () => {
    mockLedger();
    const evidence = await collectSettlementEvidence({ ...payment, asset: { ...payment.asset, issuer: account } });
    expect(evidence?.rlusd).toBeUndefined();
    expect(vi.mocked(rpc).mock.calls.some(([c]) => c === "ledger_entry")).toBe(false);
  });
});
