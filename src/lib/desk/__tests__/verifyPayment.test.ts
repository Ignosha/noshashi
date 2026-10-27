import { createHash } from "node:crypto";
import { classicAddressToXAddress } from "ripple-address-codec";
import { describe, expect, it } from "vitest";
import { addressProblem, buildInvoice, canonicalJson, cleanAddress, EMPTY_INVOICE, evidenceFile, formatAmountView, type VerificationReport } from "../verifyPayment";

/**
 * The web side of invoice verification. The decision itself is made and
 * tested in Rust (src-tauri/src/verify/tests.rs); these cover the form,
 * the exported record, and that a record's digest can be recomputed here
 * exactly as the Rust engine computes it.
 */

describe("canonicalJson matches the Rust engine", () => {
  it("reproduces the Rust digest for the shared parity vector", () => {
    // Same record as t35_digest_parity_vector in src-tauri/src/verify/tests.rs.
    const record = {
      schema: "noshashi.xrpl-payment-evidence/1",
      b: [1, true, null, 'Zürich "quoted" \n'],
      a: { z: "161.1605415577872", y: 107587014 },
    };
    const digest = createHash("sha256").update(canonicalJson(record), "utf8").digest("hex").toUpperCase();
    expect(digest).toBe("ACA86C389009899CF9FCCC15EA4E175A57571075388F5EEB4FFC98E5767A2766");
  });

  it("sorts keys at every depth and drops whitespace", () => {
    expect(canonicalJson({ b: 1, a: { y: [1, 2], x: "s" } })).toBe('{"a":{"x":"s","y":[1,2]},"b":1}');
  });
});

const valid = {
  ...EMPTY_INVOICE,
  invoiceId: "INV-7",
  destination: "rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6",
  expectedAmount: "161.1605415577872",
};

describe("buildInvoice", () => {
  it("keeps money as strings, exactly as typed", () => {
    const p = buildInvoice(valid);
    expect(typeof p).toBe("object");
    if (typeof p === "object") {
      expect(p.expected_amount).toBe("161.1605415577872");
      expect(p.asset).toEqual({ kind: "xrp" });
      expect(p.allow_partial_payment).toBe(false);
    }
  });

  it.each([
    [{ invoiceId: "" }, /identifier/],
    [{ destination: "not-an-address" }, /receiving account/],
    [{ expectedAmount: "0" }, /positive/],
    [{ expectedAmount: "-5" }, /positive/],
    [{ expectedAmount: "1e3" }, /positive/],
    [{ destinationTag: "-1" }, /destination tag/],
    [{ assetKind: "issued" as const, currency: "XRP", issuer: "rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6" }, /issued currency/],
    [{ assetKind: "issued" as const, currency: "USD", issuer: "nope" }, /issuer/],
    // One character changed (the last 6 → 7): right shape, wrong checksum.
    [{ destination: "rogue5HnPRSszD9CWGSUz8UGHMVwSSKF7" }, /checksum/],
    [{ destination: "Rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6" }, /capital R/],
    [{ destination: "rogue5HnPRSszD9CWGSUz8UGHMVwSSKF0" }, /0, O, I or l/],
    [{ destination: "" }, /Enter the receiving account/],
  ])("rejects %j", (patch, message) => {
    expect(buildInvoice({ ...valid, ...patch })).toMatch(message);
  });

  it("builds an issued-currency invoice with tag and tolerance", () => {
    const p = buildInvoice({ ...valid, assetKind: "issued", currency: "CSC", issuer: "rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr", destinationTag: "42", tolerance: "0.01", allowPartial: true });
    expect(p).toMatchObject({ destination_tag: 42, underpayment_tolerance: "0.01", allow_partial_payment: true, asset: { kind: "issued", currency: "CSC" } });
  });
});

describe("display and export", () => {
  it("decodes 40-hex currency codes for display", () => {
    expect(formatAmountView({ asset: { kind: "issued", currency: "534F4C4F00000000000000000000000000000000", issuer: "r" }, value: "1.5" })).toBe("1.5 SOLO");
    expect(formatAmountView(null)).toBe("—");
  });

  it("exports the evidence with its digest and how to recompute it", () => {
    const report = { transaction_hash: "F3B8B18E6AEFDCEA", evidence_digest: "AB", decision_key: "CD", status: "HOLD", reason_code: "NO_INVOICE_POLICY", evidence: { x: 1 } } as unknown as VerificationReport;
    const file = evidenceFile(report);
    expect(file.filename).toBe("noshashi-payment-evidence-F3B8B18E6AEF.json");
    expect(JSON.parse(file.contents)).toMatchObject({ evidence_digest: "AB", evidence: { x: 1 } });
  });
});

describe("receiving account as pasted", () => {
  const address = "rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6";

  it("strips spaces, line breaks and invisible characters copying adds", () => {
    const pasted = `\u200B ${address.slice(0, 10)}\u00AD${address.slice(10)}\n\uFEFF`;
    expect(cleanAddress(pasted)).toBe(address);
    const p = buildInvoice({ ...valid, destination: pasted });
    expect(typeof p === "object" && p.destination).toBe(address);
  });

  it("accepts a valid classic address", () => {
    expect(addressProblem(address, "receiving account")).toBeNull();
  });

  it("splits an X-address into the account and its tag", () => {
    const p = buildInvoice({ ...valid, destination: classicAddressToXAddress(address, 42, false) });
    expect(typeof p === "object" && p.destination).toBe(address);
    expect(typeof p === "object" && p.destination_tag).toBe(42);
  });

  it("refuses an X-address whose tag disagrees with the tag field", () => {
    expect(buildInvoice({ ...valid, destination: classicAddressToXAddress(address, 42, false), destinationTag: "7" })).toMatch(/tag 42/);
  });

  it("checks the issuer the same way", () => {
    const p = buildInvoice({ ...valid, assetKind: "issued", currency: "CSC", issuer: " rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr\u200B" });
    expect(typeof p === "object" && p.asset).toEqual({ kind: "issued", currency: "CSC", issuer: "rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr" });
  });
});
