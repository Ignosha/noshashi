/*
 * The delivered-amount export's arithmetic and CSV. Exact decimals only:
 * a record that says 0.30000000000000004 XRP is a wrong record.
 */
import { describe, it, expect } from "vitest";
import { dropsToXrp, plainDecimal, compareDecimal, toCsv, displayCurrency, parseAmount } from "../api/_lib/delivered.js";

describe("exact amounts", () => {
  it("converts drops without floats", () => {
    expect(dropsToXrp("1")).toBe("0.000001");
    expect(dropsToXrp("1000000")).toBe("1");
    expect(dropsToXrp("100000000000000000")).toBe("100000000000");
    expect(dropsToXrp("300000")).toBe("0.3");
    expect(dropsToXrp("0")).toBe("0");
  });

  it("expands the ledger's exponent form", () => {
    expect(plainDecimal("1e-6")).toBe("0.000001");
    expect(plainDecimal("1.5e+10")).toBe("15000000000");
    expect(plainDecimal("9999999999999999e80").length).toBe(96);
    expect(plainDecimal("123.45")).toBe("123.45");
  });

  it("compares decimals exactly", () => {
    expect(compareDecimal("0.000001", "1000000")).toBe(-1);
    expect(compareDecimal("1.10", "1.1")).toBe(0);
    expect(compareDecimal("2", "10")).toBe(-1);
    expect(compareDecimal("0.3", "0.29999999999999999")).toBe(1);
  });

  it("reads XRP and issued amounts", () => {
    expect(parseAmount("2500000")).toEqual({ currency: "XRP", issuer: "", value: "2.5" });
    expect(parseAmount({ currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", value: "1e-6" }).value).toBe("1e-6");
    expect(parseAmount("not drops")).toBeNull();
  });
});

describe("the CSV", () => {
  it("neutralises a cell a spreadsheet would run as a formula", () => {
    const csv = toCsv([{ currency: "=HYPERLINK(\"http://x\")", amount_stated: "-5" }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    // A negative number is a number, not a formula.
    expect(csv).toContain(",-5,");
  });

  it("never lets a token pass itself off as XRP", () => {
    // "XRP" in the 40-hex form, a known impersonation.
    const fake = "5852500000000000000000000000000000000000";
    expect(displayCurrency(fake)).toBe(fake);
    expect(displayCurrency("XRP")).toBe("XRP");
    expect(displayCurrency("534F4C4F00000000000000000000000000000000")).toBe("SOLO");
  });
});

import { isBusy } from "../api/_lib/authority.js";

describe("which ledger refusals move on to the next server", () => {
  it("treats a rate limit or a busy server as not an answer", () => {
    // xrplcluster's reply on 2026-10-11, as the export received it.
    expect(isBusy({ code: "error", message: "rate limit: units quota (10000 per 60s) exhausted, retry in ~104942ms" })).toBe(true);
    expect(isBusy({ code: "slowDown", message: "You are placing too much load on the server." })).toBe(true);
  });
  it("treats the ledger's own refusal as final", () => {
    expect(isBusy({ code: "actNotFound", message: "Account not found." })).toBe(false);
    expect(isBusy({ code: "invalidParams", message: "Invalid parameters." })).toBe(false);
  });
});

import { deliveredRows, summarize } from "../api/_lib/delivered.js";
import { readFileSync } from "node:fs";

/* Real account_tx entries, unmodified (tests/fixtures/README.md). */
const page = JSON.parse(readFileSync("tests/fixtures/account-tx-solo-107587061.json", "utf8"));

describe("rows from a real account_tx page", () => {
  it("books what arrived for the account, and only its own payments", () => {
    const rows = deliveredRows(page.account, page.transactions);
    // Two payments into SOLO's issuer; the routed self-conversions and the
    // OfferCancel are not its payments and are left out.
    expect(rows.map((r) => r.tx_hash.slice(0, 12))).toEqual(["33C313E12DD8", "7DFCD11863AE"]);
    expect(rows[0]).toMatchObject({
      direction: "in", counterparty: "rPBJGLCysYLSrfH6SttjoWkYW3Pvu2qPR", currency: "SOLO",
      amount_stated: "0.067791435856414", amount_delivered: "0.067791435856414",
      partial_payment: "no", fee_xrp: "", ledger_index: 107585451, date_utc: "2026-10-11T14:26:32Z",
    });
  });

  it("flags a real partial payment that delivered less than it stated", () => {
    const rows = deliveredRows("rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6", page.transactions);
    const csc = rows.find((r) => r.tx_hash.startsWith("F3B8B18E6AEF"));
    expect(csc).toMatchObject({
      direction: "self", currency: "CSC", partial_payment: "yes", delivered_less_than_stated: "yes",
      amount_stated: "162.6994990013102", amount_delivered: "161.1605415577872",
    });
    const solo = rows.find((r) => r.tx_hash.startsWith("84B464CB48ED"));
    // Short by 0.000000000014687: caught exactly, where a float would not care.
    expect(solo).toMatchObject({ partial_payment: "yes", delivered_less_than_stated: "yes",
      amount_stated: "1.064341457878901", amount_delivered: "1.064341457864214" });
    expect(summarize(rows)).toMatchObject({ payments: 2, partial_payments: 2, delivered_less_than_stated: 2 });
    expect(solo.fee_xrp).not.toBe("");
  });
});
