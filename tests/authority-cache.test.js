import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../api/authority.js";

const ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const snapshot = () => ({
  validated: true,
  ledger_index: 108049990,
  account_data: { Account: ISSUER, Flags: 0 },
  signer_lists: [],
});
const call = async (query = { issuer: ISSUER }, method = "GET") => {
  const res = {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ query, method }, res);
  return res;
};
afterEach(() => vi.unstubAllGlobals());

describe("authority retry and cache policy", () => {
  it("caches a readable no-walk record with its original issuer/ledger scope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: snapshot() }))));
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
    expect(res.body.issuer).toBe(ISSUER);
    expect(res.body.ledgerIndex).toBe(108049990);
    expect(res.body.unreadable).toBeUndefined();
  });

  it("does not cache a failed read and allows the next attempt to recover", async () => {
    let available = false;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (!available) throw new Error("node unavailable");
      return new Response(JSON.stringify({ result: snapshot() }));
    }));
    const failed = await call();
    expect(failed.statusCode).toBe(200); // Existing unreadable-certificate contract.
    expect(failed.body.checks).toMatchObject([{ id: "AUTHORITY_READABLE", passed: false }]);
    expect(failed.headers["cache-control"]).toBe("no-store");
    available = true;
    const retried = await call();
    expect(retried.body.unreadable).toBeUndefined();
    expect(retried.body.ledgerIndex).toBe(108049990);
    expect(retried.headers["cache-control"]).toContain("s-maxage=300");
  });

  it("does not cache an incomplete account reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: { ...snapshot(), signer_lists: undefined } }))));
    const res = await call();
    expect(res.body.unreadable).not.toEqual([]);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("keeps an unexpected handler failure noncacheable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: snapshot() }))));
    vi.stubGlobal("crypto", { subtle: { digest: async () => { throw new Error("digest unavailable"); } } });
    const res = await call();
    expect(res.statusCode).toBe(502);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it.each([
    [{ issuer: "invalid" }, "GET", 400],
    [{}, "GET", 400],
    [{ issuer: ISSUER }, "POST", 405],
  ])("keeps invalid requests noncacheable", async (query, method, status) => {
    const res = await call(query, method);
    expect(res.statusCode).toBe(status);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
