import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  canonicalCertificate,
  completeCertificate,
  verifyCertificate,
  ADDRESS_RE,
  capturedView,
  readVerifiedAuthority,
  readingProvenance,
} from "../site/assets/desk-experience-core.mjs";
import { digestOf } from "../api/_lib/authority.js";

const bitstamp = JSON.parse(
  readFileSync("tests/fixtures/authority-bitstamp-107585800.json", "utf8"),
);
const solo = JSON.parse(
  readFileSync("tests/fixtures/authority-solo-107585799.json", "utf8"),
);
const rlusd = JSON.parse(readFileSync("tests/fixtures/authority-rlusd-108049990.json", "utf8"));

describe("homepage investigation evidence", () => {
  for (const [name, certificate] of [
    ["RLUSD (conditional fee check absent)", rlusd],
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
  it("does not fill in a missing conditional finding or compare different scopes", async () => {
    expect(rlusd.checks.some(k => k.id === 'NO_TRANSFER_FEE')).toBe(false);
    const before = JSON.stringify(rlusd);
    expect(await verifyCertificate(rlusd, rlusd.issuer)).toBe(true);
    expect(JSON.stringify(rlusd)).toBe(before);
    const feeRemoved = { ...bitstamp, checks: bitstamp.checks.filter(k => k.id !== 'NO_TRANSFER_FEE') };
    expect(completeCertificate(feeRemoved, bitstamp.issuer)).toBe(true);
    expect(await verifyCertificate(feeRemoved, bitstamp.issuer)).toBe(false);
  });
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
    ["unsupported rules", { ...bitstamp, rulesVersion: 3 }],
    ["unknown state", { ...bitstamp, checks: bitstamp.checks.map(k => ({ ...k, state: "UNKNOWN" })) }],
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

describe('bounded authority transport and freshness', () => {
  afterEach(() => vi.useRealTimers());
  const reply = (certificate = rlusd, headers = {}) => ({ ok: true, json: async () => certificate, headers: new Headers(headers) });
  it('verifies the exact reply and reports stale edge data without calling it live', async () => {
    const fetcher = vi.fn(async () => reply(rlusd, { 'x-vercel-cache': 'STALE', age: '2709' }));
    const result = await readVerifiedAuthority(rlusd.issuer, { fetcher, now: () => Date.parse(rlusd.evaluatedAt) + 2709000 });
    expect(result.certificate).toBe(rlusd);
    expect(result.provenance).toMatchObject({ stale: true, cached: true, ageSeconds: 2709 });
    expect(result.provenance.label).toContain('Stale cached reading');
    expect(fetcher.mock.calls[0][0]).toBe('/api/authority?issuer=' + rlusd.issuer);
  });
  it('labels fresh cached replies and conservatively labels responses without cache metadata', () => {
    const now = Date.parse(rlusd.evaluatedAt) + 1000;
    expect(readingProvenance(rlusd, new Headers({ 'x-vercel-cache': 'HIT' }), now)).toMatchObject({ cached: true, stale: false });
    expect(readingProvenance(rlusd, new Headers(), now).label).toContain('cache status not established');
    expect(readingProvenance(rlusd, new Headers(), now + 301000).stale).toBe(true);
  });
  it.each([
    ['HTTP error', async () => ({ ok: false }), 'http'],
    ['malformed JSON', async () => ({ ok: true, json: async () => { throw Error('bad JSON'); } }), 'unavailable'],
    ['incomplete record', async () => reply({ ...rlusd, checks: [] }), 'incomplete'],
    ['unreadable data', async () => reply({ ...rlusd, unreadable: ['control: timeout'] }), 'incomplete'],
    ['tampered payload', async () => reply({ ...rlusd, ledgerIndex: rlusd.ledgerIndex + 1 }), 'integrity'],
  ])('withholds %s and allows a fresh retry', async (_, fetcher, code) => {
    await expect(readVerifiedAuthority(rlusd.issuer, { fetcher })).rejects.toMatchObject({ code });
    expect((await readVerifiedAuthority(rlusd.issuer, { fetcher: async () => reply() })).certificate).toBe(rlusd);
  });
  it.each(['request', 'body'])('bounds a stalled %s even if the transport ignores abort', async phase => {
    vi.useFakeTimers();
    let signal;
    const pending = readVerifiedAuthority(rlusd.issuer, { timeoutMs: 20000, fetcher: async (_, options) => {
      signal = options.signal;
      const never = new Promise(() => {});
      return phase === 'request' ? never : { ok: true, json: () => never };
    } });
    const result = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(20000);
    await result;
    expect(signal.aborted).toBe(true);
  });
  it('cancels a previous subject without waiting for its network reply', async () => {
    const controller = new AbortController();
    const pending = readVerifiedAuthority(rlusd.issuer, { signal: controller.signal, fetcher: () => new Promise(() => {}) });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });
});

describe("recorded desktop capture provenance", () => {
  it("binds the caption and cache-busted image to the current capture manifest", () => {
    const manifest = JSON.parse(
      readFileSync("site/assets/shots/manifest.json", "utf8"),
    );
    const shot = manifest.shots.find((s) => s.name === "verification");
    const view = capturedView(manifest, "verification");
    expect(view.caption).toContain(shot.ledger.toLocaleString("en-US"));
    expect(view.src).toContain(encodeURIComponent(shot.captured_at));
    expect(view.alt).toBe(shot.alt);
  });
  it("never invents metadata for missing captures", () => {
    expect(capturedView({}, "verification")).toBe(null);
    expect(capturedView({ shots: [] }, "verification")).toBe(null);
    expect(capturedView({ shots: [] }, "../secret")).toBe(null);
  });
});
