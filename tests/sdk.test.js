/*
 * The SDK's request building and error handling. The responses replayed
 * here are real production responses (tests/fixtures/README.md); only the
 * transport is substituted, so no test depends on mainnet being up.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Noshashi, NoshashiError } from "../packages/sdk/index.js";

const solo = readFileSync("tests/fixtures/authority-solo-107585799.json", "utf8");

function recorder(status, body, headers = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
  };
  return { calls, fetch };
}

describe("@noshashi/sdk", () => {
  it("reads a certificate from the public endpoint with no key", async () => {
    const { calls, fetch } = recorder(200, solo);
    const cert = await new Noshashi({ fetch }).authority("rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz", { walk: true });
    expect(calls[0].url).toBe("https://www.noshashi.app/api/authority?issuer=rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz&walk=1");
    expect(calls[0].init.headers.Authorization).toBeUndefined();
    expect(cert.ledgerIndex).toBe(107585799);
  });

  it("refuses a malformed address before any request is made", async () => {
    const { calls, fetch } = recorder(200, "{}");
    const nsh = new Noshashi({ fetch });
    expect(() => nsh.authority("0xdeadbeef")).toThrow(NoshashiError);
    expect(() => nsh.sanctions(Array(51).fill("rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz"))).toThrow(/1 to 50/);
    expect(calls).toHaveLength(0);
  });

  it("will not spend a credit without a key", async () => {
    const { fetch } = recorder(200, "{}");
    await expect(new Noshashi({ fetch }).verify({ subject: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz", domain: "DEX-US", amount_xrp: 1 }))
      .rejects.toMatchObject({ code: "key_required" });
  });

  it("sends the key as a bearer token on keyed calls only", async () => {
    const { calls, fetch } = recorder(200, '{"verdict":"go"}');
    const nsh = new Noshashi({ fetch, apiKey: "nsh_live_abcdefgh1234" });
    await nsh.verify({ subject: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz", domain: "DEX-US", amount_xrp: 10 });
    expect(calls[0].init.headers.Authorization).toBe("Bearer nsh_live_abcdefgh1234");
    expect(JSON.parse(calls[0].init.body)).toEqual({ subject: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz", domain: "DEX-US", amount_xrp: 10 });
    await nsh.sanctions(["rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz"]);
    expect(calls[1].init.headers.Authorization).toBeUndefined();
  });

  it("surfaces the API's stable error code", async () => {
    const { fetch } = recorder(402, '{"error":"quota_exhausted","message":"No prepaid verification credits remain."}');
    const nsh = new Noshashi({ fetch, apiKey: "nsh_live_abcdefgh1234" });
    await expect(nsh.verify({ subject: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz", domain: "DEX-US", amount_xrp: 1 }))
      .rejects.toMatchObject({ status: 402, code: "quota_exhausted", message: "No prepaid verification credits remain." });
  });

  it("reports a failed part of screenAddress instead of dropping it", async () => {
    const fetch = async (url) => url.includes("threats")
      ? new Response('{"error":"internal"}', { status: 500 })
      : new Response('{"hits":[]}', { status: 200 });
    const out = await new Noshashi({ fetch }).screenAddress("rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz");
    expect(out.sanctions).toEqual({ hits: [] });
    expect(out.threats).toBeNull();
    expect(out.errors.threats).toBe("internal");
  });

  it("builds badge URLs without a request", () => {
    const nsh = new Noshashi({ fetch: () => { throw new Error("no"); } });
    expect(nsh.badgeUrl("rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz", { style: "card", theme: "dark" }))
      .toBe("https://www.noshashi.app/api/badge?issuer=rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz&style=card&theme=dark");
  });

  it("returns the CSV and its completeness from the headers", async () => {
    const { fetch } = recorder(200, "date_utc,ledger_index\r\n", { "x-noshashi-complete": "false", "x-noshashi-stopped-because": "page_cap" });
    const out = await new Noshashi({ fetch }).delivered("rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz", { format: "csv" });
    expect(out).toEqual({ csv: "date_utc,ledger_index\r\n", complete: false, stoppedBecause: "page_cap" });
  });

  it("rejects something that is not an nsh_live_ key", () => {
    expect(() => new Noshashi({ apiKey: "sk_live_123" })).toThrow(/nsh_live_/);
  });
});
