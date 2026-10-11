/*
 * The issuer authority badge, rendered from real certificates captured
 * from production (tests/fixtures/README.md says where each came from).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { badgeFacts, worstTone, flatBadge, cardBadge } from "../api/_lib/badge.js";

const solo = JSON.parse(readFileSync("tests/fixtures/authority-solo-107585799.json", "utf8"));
const bitstamp = JSON.parse(readFileSync("tests/fixtures/authority-bitstamp-107585800.json", "utf8"));
const value = (facts, key) => facts.find((f) => f.key === key)?.value;

describe("badge facts from a real certificate", () => {
  it("reads SOLO as blackholed, freeze surrendered, 0.01% fee", () => {
    const { readable, facts } = badgeFacts(solo);
    expect(readable).toBe(true);
    expect(value(facts, "signer")).toBe("blackholed");
    expect(value(facts, "freeze")).toBe("surrendered");
    expect(value(facts, "fee")).toBe("0.01%");
    expect(value(facts, "global freeze")).toBe("off");
    expect(value(facts, "holding")).toBe("open");
    // A fee is a retained power, so amber — not green.
    expect(worstTone(facts)).toBe("hold");
  });

  it("reads Bitstamp USD as one key signing alone, freeze retained", () => {
    const { facts } = badgeFacts(bitstamp);
    expect(value(facts, "signer")).toBe("single key");
    expect(value(facts, "freeze")).toBe("retained");
    expect(value(facts, "fee")).toBe("0.15%");
    // A failed block check is red, as verdictFor() would have it.
    expect(worstTone(facts)).toBe("nogo");
  });

  it("never lists supply concentration, which a flags-only read cannot answer", () => {
    expect(badgeFacts(solo).facts.map((f) => f.id)).not.toContain("SUPPLY_CONCENTRATION");
  });

  it("treats an unreadable issuer as unreadable, never as clean", () => {
    const failed = {
      issuer: solo.issuer,
      checks: [{ id: "AUTHORITY_READABLE", severity: "block", passed: false, detail: "posture: timeout" }],
    };
    expect(badgeFacts(failed).readable).toBe(false);
    // The handler's error path renders with no certificate at all.
    expect(badgeFacts(null).readable).toBe(false);
    expect(flatBadge({ certificate: null, issuer: solo.issuer })).not.toContain("0%");
    const svg = flatBadge({ certificate: failed, issuer: solo.issuer });
    expect(svg).toContain("unreadable");
    expect(svg).toContain("#6b7068");
  });
});

describe("the SVG", () => {
  it("states the ledger and digest it was read at", () => {
    const svg = cardBadge({ certificate: solo, issuer: solo.issuer });
    expect(svg).toContain("ledger 107585799");
    expect(svg).toContain(solo.digest);
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("is wide enough for its own text", () => {
    const svg = flatBadge({ certificate: bitstamp, issuer: bitstamp.issuer });
    const width = Number(/width="(\d+)"/.exec(svg)[1]);
    const text = "XRPL authority" + "signer single key · freeze retained · fee 0.15%";
    expect(width).toBeGreaterThanOrEqual(Math.ceil(text.length * 11 * 0.6));
  });

  it("escapes everything that came from the ledger", () => {
    const hostile = structuredClone(solo);
    hostile.currencyLabel = '<script>alert(1)</script>';
    const svg = cardBadge({ certificate: hostile, issuer: solo.issuer });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("has a dark theme", () => {
    expect(cardBadge({ certificate: solo, issuer: solo.issuer, theme: "dark" })).toContain("#15171a");
  });
});
