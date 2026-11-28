import { beforeEach, expect, it, vi } from "vitest";
import { destinationPreflight, paymentReceipt } from "../api/_lib/routes/payment-evidence.js";
import { receiptFor } from "../api/_lib/asset-risk-receipt.js";
import { rippleRpcWithSource } from "../api/_lib/authority.js";

vi.mock("../api/_lib/authority.js", () => ({ rippleRpcWithSource: vi.fn() }));

const account = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const hash = "A".repeat(64);
const endpoint = "https://example.com";
const ledger_index = 1234;

function response() {
  return {
    code: 200,
    body: null,
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

beforeEach(() => vi.resetAllMocks());

it("flags a required tag and deposit authorization without treating tag zero as missing", async () => {
  rippleRpcWithSource.mockResolvedValue({
    endpoint, result: { validated: true, ledger_index, account_data: { Account: account, Flags: 0x01020000 } },
  });
  const missing = response();
  await destinationPreflight({ method: "GET", query: { account }, headers: {} }, missing);
  expect(missing.body.findings).toEqual(["DESTINATION_TAG_REQUIRED", "DEPOSIT_AUTHORIZATION_NEEDS_REVIEW"]);
  const supplied = response();
  await destinationPreflight({ method: "GET", query: { account, tag: "0" }, headers: {} }, supplied);
  expect(supplied.body.supplied_tag).toBe(0);
  expect(supplied.body.findings).toEqual(["DEPOSIT_AUTHORIZATION_NEEDS_REVIEW"]);
  const { receipt, ...report } = supplied.body;
  expect(receipt.digest).toBe(await receiptFor(report));
});

it("uses only delivered metadata and refuses an unvalidated payment", async () => {
  const result = {
    hash, ledger_index, validated: true,
    tx_json: { TransactionType: "Payment", Destination: account, DestinationTag: 0, Amount: "9000000" },
    meta: { TransactionResult: "tesSUCCESS", delivered_amount: "1000000" },
  };
  rippleRpcWithSource.mockResolvedValueOnce({ endpoint, result });
  const paid = response();
  await paymentReceipt({ method: "GET", query: { hash }, headers: {} }, paid);
  expect(paid.body).toMatchObject({ status: "DELIVERED", delivered_amount: { currency: "XRP", drops: "1000000" }, destination_tag: 0 });
  rippleRpcWithSource.mockResolvedValueOnce({ endpoint, result: { ...result, validated: false } });
  const pending = response();
  await paymentReceipt({ method: "GET", query: { hash }, headers: {} }, pending);
  expect(pending.code).toBe(409);
});

it("keeps unavailable amounts distinct from delivered or failed payments", async () => {
  rippleRpcWithSource.mockResolvedValue({
    endpoint, result: {
      hash, ledger_index, validated: true, TransactionType: "Payment",
      meta: { TransactionResult: "tesSUCCESS", delivered_amount: "unavailable" },
    },
  });
  const res = response();
  await paymentReceipt({ method: "GET", query: { hash }, headers: {} }, res);
  expect(res.body).toMatchObject({ status: "AMOUNT_UNAVAILABLE", delivered_amount: null });
});
