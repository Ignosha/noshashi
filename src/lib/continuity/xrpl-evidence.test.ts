import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../xrpl/client", () => ({ rpc: vi.fn() }));
import { rpc } from "../xrpl/client";
import { collectSettlementEvidence } from "./xrpl-evidence";
import type { ContinuityIntent } from "./intent";
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
