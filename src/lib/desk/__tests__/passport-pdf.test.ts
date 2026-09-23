import { describe, expect, it } from "vitest";
import { passportToPdf, type AssetPassport } from "../passport";

// Shape only: the values are never fetched or displayed, they exist so the
// PDF writer has fields to lay out. The test is about file structure.
const passport: AssetPassport = {
  version: 1,
  generatedAt: "2026-09-23T00:00:00.000Z",
  asset: { issuer: "rIssuerAddressPlaceholder000000000", currency: "" , domain: "example.com" },
  authority: {
    verdict: "hold",
    checks: [],
    digest: "d".repeat(64),
    ledgerIndex: 1,
    source: "ledger",
    rulesVersion: 1,
  },
  issuance: {
    canFreeze: false, globalFreeze: false, requiresAuth: false,
    ledgerIndex: 1, readAt: "2026-09-23T00:00:00.000Z", currencies: [],
  },
  findings: [],
  receipt: { bodyDigest: "b".repeat(64), signedDigest: "s".repeat(64), algorithm: "SHA-256" },
  presenter: { name: "Zoë (Desk) \\ Ops", contact: "ops@example.com", jurisdiction: "US" },
  caveats: [],
};

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");

describe("passportToPdf", () => {
  const pdf = latin1(passportToPdf(passport));

  it("points every xref entry at the first byte of its object", () => {
    const xrefAt = Number(/startxref\n(\d+)\n/.exec(pdf)![1]);
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const entries = pdf.slice(xrefAt).split("\n").slice(3, 8);
    entries.forEach((line, i) => {
      const offset = Number(line.slice(0, 10));
      expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it("declares a stream length equal to the stream's bytes", () => {
    const m = /\/Length (\d+) >>\nstream\n/.exec(pdf)!;
    const start = m.index + m[0].length;
    expect(pdf.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe("\nendstream");
  });

  it("writes only single-byte text, escaped", () => {
    expect(pdf).toContain("(Presenter: Zo? \\(Desk\\) \\\\ Ops) Tj");
    expect(pdf).toContain("(-) Tj");
    expect([...pdf].every((c) => c.charCodeAt(0) < 0x80)).toBe(true);
  });
});
