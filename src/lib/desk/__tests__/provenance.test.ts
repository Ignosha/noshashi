import { beforeEach, describe, expect, it, vi } from "vitest";
import { rpc } from "@/lib/xrpl/client";
import { readProvenance } from "../provenance";

vi.mock("@/lib/xrpl/client", () => ({ rpc: vi.fn(), XrplError: Error }));

const address = "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
const sender = "r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59";
const transaction = {
  validated: true,
  ledger_index: 100_000,
  tx_json: { Account: sender, Destination: address, TransactionType: "Payment", Amount: "999000000" },
  meta: {
    TransactionResult: "tesSUCCESS",
    delivered_amount: "25000000",
    AffectedNodes: [{ CreatedNode: { LedgerEntryType: "AccountRoot", NewFields: { Account: address } } }],
  },
};

describe("counterparty funding evidence", () => {
  beforeEach(() => {
    vi.mocked(rpc).mockReset();
    vi.mocked(rpc).mockResolvedValueOnce({ account_data: { Sequence: 100003 } });
    vi.mocked(rpc).mockResolvedValueOnce({ info: { complete_ledgers: "32570-110000" } });
  });

  it("reports the actual XRP delivered by a validated account creation payment", async () => {
    vi.mocked(rpc).mockResolvedValueOnce({ transactions: [transaction] });
    expect(await readProvenance(address)).toMatchObject({
      fundedBy: sender, fundingAmountXrp: 25, historyIncomplete: false, approxSentCount: 3,
    });
  });

  it.each([
    { ...transaction, meta: { ...transaction.meta, AffectedNodes: [] } },
    { ...transaction, meta: { ...transaction.meta, TransactionResult: "tecNO_DST" } },
    { ...transaction, validated: false },
  ])("withholds an account origin and funder when creation was not established", async (entry) => {
    vi.mocked(rpc).mockResolvedValueOnce({ transactions: [entry] });
    expect(await readProvenance(address)).toMatchObject({
      originLedger: 100_000, historyIncomplete: true, fundedBy: undefined, approxSentCount: undefined,
    });
  });
});
