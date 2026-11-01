import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  canonicalCertificate,
  completeCertificate,
  verifyCertificate,
  ADDRESS_RE,
} from "../site/assets/desk-experience-core.mjs";
import { digestOf } from "../api/_lib/authority.js";

const bitstamp = JSON.parse(
  readFileSync("tests/fixtures/authority-bitstamp-107585800.json", "utf8"),
);
const solo = JSON.parse(
  readFileSync("tests/fixtures/authority-solo-107585799.json", "utf8"),
);

describe("homepage investigation evidence", () => {
  for (const [name, certificate] of [
    ["Bitstamp", bitstamp],
    ["SOLO", solo],
  ]) {
    it(`verifies the unmodified recorded ${name} certificate in the browser contract`, async () => {
      expect(completeCertificate(certificate, certificate.issuer)).toBe(true);
      expect(await verifyCertificate(certificate, certificate.issuer)).toBe(
        true,
      );
      const { scope, ...fields } = JSON.parse(
        canonicalCertificate(certificate),
      );
      expect(
        await digestOf({
          ...fields,
          scope: Object.fromEntries(scope),
          checks: certificate.checks,
        }),
      ).toBe(certificate.digest);
    });
  }
  it("keeps the supply-walk abstention instead of inventing a concentration finding", () => {
    expect(
      bitstamp.checks.find((k) => k.id === "SUPPLY_CONCENTRATION").state,
    ).toBe("INSUFFICIENT_DATA");
    expect(completeCertificate(bitstamp, bitstamp.issuer)).toBe(true);
  });
  it.each([
    ["ledger", { ledgerIndex: bitstamp.ledgerIndex + 1 }],
    ["rules", { rulesVersion: bitstamp.rulesVersion + 1 }],
    ["verdict", { verdict: "go" }],
    ["source", { source: "ledger" }],
    ["currency", { currency: "USD" }],
    ["timestamp", { evaluatedAt: "2026-11-01T00:00:00.000Z" }],
    [
      "check result",
      {
        checks: bitstamp.checks.map((k, i) =>
          i === 0 ? { ...k, passed: !k.passed } : k,
        ),
      },
    ],
    [
      "abstention state",
      {
        checks: bitstamp.checks.map((k) =>
          k.id === "SUPPLY_CONCENTRATION"
            ? { ...k, state: "NOT_APPLICABLE" }
            : k,
        ),
      },
    ],
  ])(
    "rejects a changed %s even when the response remains structurally complete",
    async (_, override) => {
      expect(
        await verifyCertificate({ ...bitstamp, ...override }, bitstamp.issuer),
      ).toBe(false);
    },
  );
  it.each([
    ["no reply", null],
    ["empty reply", {}],
    ["missing ledger", { ...bitstamp, ledgerIndex: undefined }],
    ["missing source", { ...bitstamp, source: undefined }],
    ["missing rules", { ...bitstamp, rulesVersion: undefined }],
    ["empty checks", { ...bitstamp, checks: [] }],
    ["missing check", { ...bitstamp, checks: bitstamp.checks.slice(1) }],
    [
      "duplicate checks",
      { ...bitstamp, checks: [...bitstamp.checks, bitstamp.checks[0]] },
    ],
    ["partial issuer read", { ...bitstamp, unreadable: ["control: timeout"] }],
    [
      "unreadable core check",
      {
        ...bitstamp,
        checks: bitstamp.checks.map((k, i) =>
          i === 0 ? { ...k, state: "INSUFFICIENT_DATA" } : k,
        ),
      },
    ],
    [
      "non-boolean result",
      {
        ...bitstamp,
        checks: bitstamp.checks.map((k) => ({ ...k, passed: "false" })),
      },
    ],
    ["invalid digest", { ...bitstamp, digest: "invalid" }],
    ["invalid date", { ...bitstamp, evaluatedAt: "not a date" }],
  ])("withholds %s", async (_, certificate) => {
    expect(await verifyCertificate(certificate, bitstamp.issuer)).toBe(false);
  });
  it("refuses a valid certificate for a different subject", async () => {
    expect(await verifyCertificate(bitstamp, solo.issuer)).toBe(false);
  });
  it("accepts public classic addresses and rejects secret-shaped or malformed input", () => {
    expect(ADDRESS_RE.test(bitstamp.issuer)).toBe(true);
    for (const input of ["", "r<script>", "sExampleSecret", "0x1234"])
      expect(ADDRESS_RE.test(input)).toBe(false);
  });
});
