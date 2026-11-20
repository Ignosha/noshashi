import { beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

vi.mock("../api/_lib/authority.js", async (orig) => ({ ...(await orig()), rippleRpcWithSource: vi.fn() }));
vi.mock("../api/_lib/rate-limit.js", () => ({ clientKey: () => "test", take: vi.fn(() => ({ ok: true })) }));

import { rippleRpcWithSource } from "../api/_lib/authority.js";
import { take } from "../api/_lib/rate-limit.js";
import { parseKeys, planFor, RIPPLING_PLANS } from "../api/_lib/rippling-keys.js";
import { batch, issuerScan, ledgerCurrency, pool, PAGE_HOLDERS } from "../api/_lib/routes/rippling-pro.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/rippling-${name}.json`, import.meta.url)));
const exposed = fixture("exposed-holder");
const noRoom = fixture("no-room-holder");
const BITSTAMP = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";

const KEY = "nsh_rip_" + "unit_test_key_0000000000000";
const hash = createHash("sha256").update(KEY).digest("hex");
const auth = { authorization: `Bearer ${KEY}` };
const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });

// Serve each fixture account's own replies; the issuer's lines list both
// fixture accounts as USD holders, as Bitstamp's real lines do.
function serve() {
  const byAccount = { [exposed.account]: exposed, [noRoom.account]: noRoom };
  rippleRpcWithSource.mockImplementation(async (command, params) => {
    if (params.account === BITSTAMP) {
      if (command === "account_info") return { result: { ledger_index: 108456800, account_data: { Account: BITSTAMP } }, endpoint: "test" };
      return { result: { lines: [
        { account: exposed.account, currency: "USD", balance: "-20", limit: "0" },
        { account: noRoom.account, currency: "USD", balance: "-17651.09704977037", limit: "0" },
        { account: exposed.account, currency: "BTC", balance: "-1", limit: "0" },
      ] }, endpoint: "test" };
    }
    const f = byAccount[params.account];
    if (!f) throw Object.assign(new Error("not found"), { code: "actNotFound" });
    return command === "account_info" ? { result: f.account_info, endpoint: f.source } : { result: { lines: f.lines }, endpoint: f.source };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  take.mockReturnValue({ ok: true });
  process.env.RIPPLING_API_KEYS = `desk:${hash}`;
  serve();
});

describe("keys and plans", () => {
  it("prices the plans so two Institution clients exceed $7,000 a month", () => {
    expect(RIPPLING_PLANS.institution.monthly_usd * 2).toBeGreaterThanOrEqual(7000);
    expect(RIPPLING_PLANS.free.batch).toBe(0);
    expect(RIPPLING_PLANS.starter.issuer_holders).toBe(0);
  });
  it("stores only hashes and ignores malformed entries", () => {
    expect(parseKeys(`desk:${hash},bogus:${hash},starter:nothex,free:${hash}`)).toEqual([{ plan: "desk", hash }]);
  });
  it("is free without a key, a plan with a known key, and invalid otherwise", () => {
    expect(planFor({ headers: {} })).toBe("free");
    expect(planFor({ headers: auth })).toBe("desk");
    expect(planFor({ headers: { authorization: "Bearer nsh_rip_" + "x".repeat(30) } })).toBeNull();
    expect(planFor({ headers: auth }, { RIPPLING_API_KEYS: "" })).toBeNull();
  });
});

describe("helpers", () => {
  it("writes currencies as the ledger does", () => {
    expect(ledgerCurrency("USD")).toBe("USD");
    expect(ledgerCurrency("RLUSD")).toBe("524C555344000000000000000000000000000000");
    expect(ledgerCurrency("xrp")).toBeNull();
  });
  it("stops starting work after the deadline", async () => {
    const { results, skipped } = await pool([1, 2, 3], 1, async (x) => x * 2, 0);
    expect(results.filter(Boolean)).toEqual([]);
    expect(skipped).toBe(3);
  });
});

describe("POST /api/v1/rippling/batch", () => {
  const req = (accounts, headers = auth) => ({ method: "POST", headers, body: { accounts } });

  it("asks for a plan without a key, before any ledger read", async () => {
    const r = res();
    await batch(req([exposed.account], {}), r);
    expect(r.code).toBe(402);
    expect(rippleRpcWithSource).not.toHaveBeenCalled();
  });

  it("refuses an invalid key", async () => {
    const r = res();
    await batch(req([exposed.account], { authorization: "Bearer nsh_rip_" + "y".repeat(30) }), r);
    expect(r.code).toBe(401);
  });

  it("reads every account and totals the exposure by currency", async () => {
    const r = res();
    await batch(req([exposed.account, noRoom.account, exposed.account]), r);
    expect(r.code).toBe(200);
    expect(r.body.summary).toMatchObject({ accounts: 2, exposed: 1, clear: 1 });
    expect(r.body.exposed_by_currency.USD).toEqual({ accounts_exposed: 1, movable_at_par: "20" });
    const { receipt, limitation, ...report } = r.body;
    expect(receipt.digest).toBe(createHash("sha256").update(JSON.stringify(report)).digest("hex"));
  });

  it("enforces the plan's batch size", async () => {
    const r = res();
    await batch(req(Array(RIPPLING_PLANS.desk.batch + 1).fill(0).map((_, i) => `r${i}`)), r);
    expect(r.code).toBe(413);
  });
});

describe("GET /api/v1/rippling/issuer", () => {
  const req = (query, headers = auth) => ({ method: "GET", headers, query: { issuer: BITSTAMP, currency: "USD", ...query } });

  it("needs Desk or Institution", async () => {
    process.env.RIPPLING_API_KEYS = `starter:${hash}`;
    const r = res();
    await issuerScan(req({}), r);
    expect(r.code).toBe(402);
  });

  it("finds the holders whose balance of this token can be swapped out", async () => {
    const r = res();
    await issuerScan(req({}), r);
    expect(r.code).toBe(200);
    expect(r.body.scope).toMatchObject({ holders_found: 2, all_issuer_lines_read: true, holders_checked: 2, next_offset: null });
    expect(r.body.summary).toMatchObject({ holders_exposed: 1, can_be_swapped_out: "20" });
    // Largest holder first; it holds more but has no room to receive.
    expect(r.body.holders.map((h) => h.verdict)).toEqual(["CLEAR", "EXPOSED"]);
  });

  it("pages with offset and caps a call at PAGE_HOLDERS", async () => {
    const r = res();
    await issuerScan(req({ offset: "1", holders: "1" }), r);
    expect(r.body.holders.map((h) => h.account)).toEqual([exposed.account]);
    expect(PAGE_HOLDERS).toBeLessThanOrEqual(200);
  });

  it("stops at the plan's holder cap", async () => {
    const r = res();
    await issuerScan(req({ offset: String(RIPPLING_PLANS.desk.issuer_holders) }), r);
    expect(r.code).toBe(402);
  });

  it("rejects a bad issuer or currency before any ledger read", async () => {
    const r = res();
    await issuerScan(req({ currency: "XRP" }), r);
    expect(r.code).toBe(400);
    expect(rippleRpcWithSource).not.toHaveBeenCalled();
  });
});
