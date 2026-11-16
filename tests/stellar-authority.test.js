/*
 * The Stellar authority certificate. The first block runs on live
 * Horizon replies for Circle's USDC issuer (tests/fixtures), so the
 * rules are checked against an issuer whose configuration is public and
 * known; the rest varies one field at a time to exercise each branch.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  isStellarAccountId,
  minimumSigners,
  readStellarSurface,
  stellarChecks,
  stellarCertificateFrom,
  primaryAsset,
} from "../api/_lib/stellar.js";
import handler from "../api/_lib/routes/stellar-authority.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/stellar-circle-usdc-2026-11-16.json", import.meta.url), "utf8"));
const CIRCLE = fixture.account.id;

/** A fetch that answers from the live fixture, by Horizon path. */
function horizonFrom(replies) {
  return async (url) => {
    const path = new URL(url).pathname;
    const body = path.startsWith("/accounts/")
      ? replies.account
      : path === "/assets"
        ? replies.assets
        : path === "/ledgers"
          ? replies.ledger
          : undefined;
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body };
  };
}

const byId = (checks, id) => checks.find((c) => c.id === id);

function surfaceWith(over = {}) {
  const account = { ...fixture.account, ...over.account };
  if (over.flags) account.flags = { ...fixture.account.flags, ...over.flags };
  return {
    issuer: CIRCLE,
    account,
    assets: fixture.assets._embedded.records,
    ledgerIndex: 65504184,
    ledgerClosedAt: "2026-11-16T05:29:22Z",
    unreadable: [],
    readAt: "2026-11-16T05:30:00.000Z",
    ...over.surface,
  };
}

describe("account IDs", () => {
  it("accepts a real account ID and verifies its checksum", () => {
    expect(isStellarAccountId(CIRCLE)).toBe(true);
    for (const s of fixture.account.signers) expect(isStellarAccountId(s.key)).toBe(true);
  });

  it("rejects a one-character typo, an XRPL address and junk", () => {
    const typo = CIRCLE.slice(0, 20) + (CIRCLE[20] === "A" ? "B" : "A") + CIRCLE.slice(21);
    expect(isStellarAccountId(typo)).toBe(false);
    expect(isStellarAccountId("rNqGa93B8ewQP9mUwpwqA19SApbf62U7PY")).toBe(false);
    expect(isStellarAccountId("G" + "A".repeat(55))).toBe(false);
    expect(isStellarAccountId(undefined)).toBe(false);
  });
});

describe("signing power", () => {
  it("counts the fewest signers that reach a threshold", () => {
    expect(minimumSigners(fixture.account.signers, 2)).toBe(2);
    expect(minimumSigners([{ weight: 5 }, { weight: 1 }], 5)).toBe(1);
    expect(minimumSigners([{ weight: 1 }], 3)).toBe(Infinity);
  });

  it("treats a zero threshold as needing one real signature", () => {
    expect(minimumSigners([{ weight: 0 }], 0)).toBe(Infinity);
    expect(minimumSigners([{ weight: 1 }], 0)).toBe(1);
  });
});

describe("Circle USDC, live", () => {
  it("reads the three Horizon sources and certifies", async () => {
    const surface = await readStellarSurface(CIRCLE, { fetchImpl: horizonFrom(fixture) });
    expect(surface.unreadable).toEqual([]);
    expect(surface.ledgerIndex).toBe(65504184);
    const cert = await stellarCertificateFrom(surface);
    expect(cert.network).toBe("stellar-pubnet");
    expect(cert.homeDomain).toBe("circle.com");
    expect(cert.asset.code).toBe("USDC");
    expect(cert.asset.trustLinesAuthorized).toBe(2550362);
    expect(cert.digest).toMatch(/^[0-9A-F]{64}$/);
    expect(cert.rulesVersion).toBe(1);
  });

  it("can freeze, cannot claw back, and needs two of four signers", () => {
    const checks = stellarChecks(surfaceWith());
    expect(byId(checks, "FREEZE_SURRENDERED").passed).toBe(false);
    expect(byId(checks, "FREEZE_SURRENDERED").detail).toContain("AUTH_REVOCABLE is set");
    // Clawback is clear, but flags are not locked and 2 of 4 reach high.
    expect(byId(checks, "CLAWBACK_SURRENDERED").passed).toBe(false);
    expect(byId(checks, "CLAWBACK_SURRENDERED").detail).toContain("can turn clawback on");
    expect(byId(checks, "OPEN_HOLDING").passed).toBe(true);
    expect(byId(checks, "NO_UNILATERAL_SIGNER").passed).toBe(true);
    expect(byId(checks, "NO_UNILATERAL_SIGNER").detail).toContain("2 of 4 signers");
  });

  it("is HOLD, not NO-GO: retained powers, but no single key", async () => {
    expect((await stellarCertificateFrom(surfaceWith())).verdict).toBe("hold");
  });

  it("gives the same digest for the same reading", async () => {
    const a = await stellarCertificateFrom(surfaceWith());
    const b = await stellarCertificateFrom(surfaceWith());
    expect(a.digest).toBe(b.digest);
    const later = await stellarCertificateFrom(surfaceWith({ surface: { ledgerIndex: 65504185 } }));
    expect(later.digest).not.toBe(a.digest);
  });
});

describe("each rule in both directions", () => {
  const lockedSigners = [{ key: CIRCLE, weight: 0, type: "ed25519_public_key" }];

  it("a locked account cannot freeze even with AUTH_REVOCABLE set", () => {
    const checks = stellarChecks(surfaceWith({ account: { signers: lockedSigners } }));
    expect(byId(checks, "FREEZE_SURRENDERED").passed).toBe(true);
    expect(byId(checks, "FREEZE_SURRENDERED").detail).toContain("can never be used");
    expect(byId(checks, "CLAWBACK_SURRENDERED").passed).toBe(true);
    expect(byId(checks, "NO_UNILATERAL_SIGNER").passed).toBe(true);
  });

  it("AUTH_IMMUTABLE with freeze clear is a permanent surrender", () => {
    const checks = stellarChecks(surfaceWith({ flags: { auth_revocable: false, auth_immutable: true } }));
    expect(byId(checks, "FREEZE_SURRENDERED").passed).toBe(true);
    expect(byId(checks, "CLAWBACK_SURRENDERED").passed).toBe(true);
  });

  it("freeze clear but flags unlocked is not a surrender", () => {
    const checks = stellarChecks(surfaceWith({ flags: { auth_revocable: false } }));
    expect(byId(checks, "FREEZE_SURRENDERED").passed).toBe(false);
    expect(byId(checks, "FREEZE_SURRENDERED").detail).toContain("can turn freezing on");
  });

  it("clawback enabled with signers able to act fails", () => {
    const checks = stellarChecks(surfaceWith({ flags: { auth_clawback_enabled: true } }));
    expect(byId(checks, "CLAWBACK_SURRENDERED").passed).toBe(false);
    expect(byId(checks, "CLAWBACK_SURRENDERED").detail).toContain("taken back by the issuer");
  });

  it("one key reaching medium is NO-GO", async () => {
    const one = [{ key: CIRCLE, weight: 2, type: "ed25519_public_key" }];
    const surface = surfaceWith({ account: { signers: one } });
    expect(byId(stellarChecks(surface), "NO_UNILATERAL_SIGNER").passed).toBe(false);
    expect((await stellarCertificateFrom(surface)).verdict).toBe("no-go");
  });

  it("AUTH_REQUIRED fails open holding", () => {
    expect(byId(stellarChecks(surfaceWith({ flags: { auth_required: true } })), "OPEN_HOLDING").passed).toBe(false);
  });

  it("an account that does not exist is blocking, not a pass", () => {
    const checks = stellarChecks(surfaceWith({ surface: { account: { notFound: true } } }));
    expect(checks).toHaveLength(1);
    expect(checks[0].id).toBe("AUTHORITY_READABLE");
    expect(checks[0].passed).toBe(false);
  });

  it("a failed read is insufficient data, never GO", async () => {
    const surface = await readStellarSurface(CIRCLE, {
      fetchImpl: horizonFrom({ ...fixture, ledger: new Error("timeout") }),
    });
    expect(surface.unreadable).toEqual(["ledger: timeout"]);
    const cert = await stellarCertificateFrom(surface);
    expect(["insufficient-data", "no-go", "hold"]).toContain(cert.verdict);
    expect(cert.verdict).not.toBe("go");
  });
});

describe("asset selection", () => {
  it("picks the asked-for code, else the largest", () => {
    const assets = [
      { asset_code: "SMALL", balances: { authorized: "1" } },
      { asset_code: "BIG", balances: { authorized: "1000" } },
    ];
    expect(primaryAsset(assets).asset_code).toBe("BIG");
    expect(primaryAsset(assets, "SMALL").asset_code).toBe("SMALL");
    expect(primaryAsset(assets, "NONE")).toBeNull();
    expect(primaryAsset([], undefined)).toBeNull();
  });
});

describe("GET /api/stellar/authority", () => {
  function call(query) {
    const res = {
      statusCode: 0,
      headers: {},
      body: undefined,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    return handler({ method: "GET", query, url: "/api/stellar/authority" }, res, { fetchImpl: horizonFrom(fixture) }).then(() => res);
  }

  it("certifies a valid issuer and caches it", async () => {
    const res = await call({ issuer: CIRCLE });
    expect(res.statusCode).toBe(200);
    expect(res.body.verdict).toBe("hold");
    expect(res.headers["cache-control"]).toContain("s-maxage=300");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("refuses a bad ID before reaching Horizon", async () => {
    const res = await call({ issuer: "rNqGa93B8ewQP9mUwpwqA19SApbf62U7PY" });
    expect(res.statusCode).toBe(400);
  });

  it("404s an asset code the issuer does not issue", async () => {
    const res = await call({ issuer: CIRCLE, asset: "NOPE" });
    expect(res.statusCode).toBe(404);
  });
});
