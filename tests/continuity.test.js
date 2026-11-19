/*
 * Continuity (tools/continuity/): one issued-token deposit against the
 * credits posted for it. The live-settlement test reads a real Mainnet SOLO
 * payment, captured from rippled as the page receives it.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const C = require("../tools/continuity/continuity.js");
const live = JSON.parse(readFileSync(new URL("./fixtures/continuity-solo-tx.json", import.meta.url), "utf8"));

describe("amounts", () => {
  it("reads decimal strings in one canonical form", () => {
    expect(C.decimal("25")).toBe("25");
    expect(C.decimal("25.00")).toBe("25");
    expect(C.decimal("0025.10")).toBe("25.1");
    expect(C.decimal("0")).toBe("0");
  });
  it("reads the exponent form rippled uses for very large and small amounts", () => {
    expect(C.decimal("2.5e1")).toBe("25");
    expect(C.decimal("1.5e-7")).toBe("0.00000015");
    expect(C.decimal("1e15")).toBe("1000000000000000");
    expect(C.decimal("9999999999999999e80")).toBe("9999999999999999" + "0".repeat(80));
  });
  it("refuses anything that is not a non-negative decimal", () => {
    for (const v of ["", "-1", "1,5", "abc", "1e999", 25, null]) expect(C.decimal(v)).toBeNull();
  });
});

describe("currency codes", () => {
  it("matches a long ticker to the 40-hex code the ledger returns", () => {
    expect(C.currencyKey("RLUSD")).toBe("524C555344000000000000000000000000000000");
    expect(C.currencyKey("524c555344000000000000000000000000000000")).toBe(C.currencyKey("RLUSD"));
  });
  it("keeps three-character codes as written: the ledger treats usd and USD as different", () => {
    expect(C.currencyKey("USD")).toBe("USD");
    expect(C.currencyKey("usd")).not.toBe(C.currencyKey("USD"));
  });
});

describe("the checks", () => {
  it("the sample fails on the duplicate credit, and passes once it is removed", () => {
    const sample = C.evaluate(C.sample);
    expect(sample.verdict).toBe("FAIL");
    expect(sample.checks["Exactly one matching credit"]).toBe("FAIL");
    const corrected = structuredClone(C.sample);
    corrected.credits.pop();
    expect(C.evaluate(corrected).verdict).toBe("PASS");
  });
  it("a missing credit export is unknown, never a pass", () => {
    const s = structuredClone(C.sample);
    delete s.credits;
    expect(C.evaluate(s).verdict).toBe("UNKNOWN");
  });
  it("a wrong issuer fails even when the ticker matches", () => {
    const s = structuredClone(C.sample);
    s.credits = [{ amount: "25", issuer: "someone-else", currency: "EUR" }];
    expect(C.evaluate(s).checks["Credited issuer"]).toBe("FAIL");
  });
});

describe("live settlement (Mainnet SOLO payment, a 40-hex currency code)", () => {
  const hash = live.result.hash;
  const s = C.settlementFrom(live, hash);

  it("reads what the ledger says was delivered", () => {
    expect(s.error).toBeUndefined();
    expect(s.ledgerIndex).toBe(live.result.ledger_index);
    expect(s.payment.currency).toBe(live.result.meta.delivered_amount.currency);
    expect(s.payment.delivered).toBe(live.result.meta.delivered_amount.value);
  });

  it("passes when the requirement says SOLO in words and one credit matches", () => {
    const d = live.result.meta.delivered_amount;
    const input = {
      requirement: { destination: live.result.tx_json.Destination, issuer: d.issuer, currency: "SOLO", amount: d.value },
      payment: s.payment,
      credits: [{ amount: d.value, issuer: d.issuer, currency: "SOLO" }],
    };
    expect(C.evaluate(input)).toMatchObject({ verdict: "PASS" });
  });

  it("refuses a reply for another transaction, an unvalidated one, or an XRP payment", () => {
    expect(C.settlementFrom(live, "0".repeat(64)).error).toMatch(/different transaction/);
    const pending = structuredClone(live);
    pending.result.validated = false;
    expect(C.settlementFrom(pending, hash).error).toMatch(/validated/);
    const xrp = structuredClone(live);
    xrp.result.meta.delivered_amount = "1000000";
    expect(C.settlementFrom(xrp, hash).error).toMatch(/XRP payment/);
  });
});

describe("the two pages share one body", () => {
  it("the site page is built from the operator copy", async () => {
    const { continuityBody } = await import("../scripts/build-products.mjs");
    const body = await continuityBody();
    for (const id of ["data", "hash", "connected", "verify", "watch", "run", "replay", "save", "result"]) {
      expect(body).toContain(`id="${id}"`);
    }
  });
  it("the adapter serves the page and its script, and nothing else from disk", () => {
    const py = readFileSync(new URL("../tools/continuity/credit_source.py", import.meta.url), "utf8");
    expect(py).toContain('"continuity.html"');
    expect(py).toContain('path == "/continuity.js"');
    expect(py).toContain("mode=ro");
  });
});
