import { beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

vi.mock("../api/_lib/authority.js", async (orig) => ({ ...(await orig()), rippleRpcWithSource: vi.fn() }));
vi.mock("../api/_lib/rate-limit.js", () => ({ clientKey: () => "test", take: vi.fn(() => ({ ok: true })) }));

import { rippleRpcWithSource } from "../api/_lib/authority.js";
import { take } from "../api/_lib/rate-limit.js";
import { analyseRippling, TF_SET_NO_RIPPLE, ASF_DEFAULT_RIPPLE } from "../api/_lib/rippling.js";
import handler from "../api/_lib/routes/rippling.js";

// Two real Mainnet accounts, read on 2026-11-20 (account_info and every
// account_lines page at one validated ledger).
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/rippling-${name}.json`, import.meta.url)));
const exposed = fixture("exposed-holder");
const noRoom = fixture("no-room-holder");
const run = (f) => analyseRippling({ account: f.account, accountInfo: f.account_info, lines: f.lines });

describe("analyseRippling on Mainnet data", () => {
  it("finds the USD that can be swapped between the account's own lines", () => {
    const r = run(exposed);
    expect(r.verdict).toBe("EXPOSED");
    expect(r.role).toBe("holder");
    const usd = r.exposures.find((e) => e.currency === "USD");
    expect(usd.exposed).toBe(true);
    expect(usd.open_lines).toBe(3);
    // 20 USD held on the Bitstamp line, and 100 of room on another open
    // USD line: all 20 can move.
    expect(usd.movable_at_par).toBe("20");
    expect(usd.lines_at_risk).toEqual([{ peer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", balance: "20", can_lose: "20" }]);
  });

  it("offers one unsigned NoRipple TrustSet per open line of the exposed currency", () => {
    const r = run(exposed);
    const usdOpen = exposed.lines.filter((l) => l.currency === "USD" && !l.no_ripple);
    const trustSets = r.fixes.filter((f) => f.TransactionType === "TrustSet");
    expect(trustSets).toHaveLength(usdOpen.length);
    for (const fix of trustSets) {
      expect(fix.Flags).toBe(TF_SET_NO_RIPPLE);
      expect(fix.Account).toBe(exposed.account);
      expect(fix.LimitAmount.currency).toBe("USD");
      expect(fix).not.toHaveProperty("TxnSignature");
      expect(fix).not.toHaveProperty("SigningPubKey");
    }
  });

  it("is CLEAR when rippling is on but no open line has room to receive", () => {
    const r = run(noRoom);
    const usd = r.exposures.find((e) => e.currency === "USD");
    expect(usd.open_lines).toBeGreaterThanOrEqual(2);
    expect(Number(usd.held_on_open_lines)).toBeGreaterThan(17000);
    expect(usd.receiving_room).toBe("0");
    expect(usd.exposed).toBe(false);
    expect(r.verdict).toBe("CLEAR");
    expect(r.fixes).toEqual([]);
  });
});

describe("analyseRippling rules", () => {
  const line = (o) => ({ account: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", currency: "USD", balance: "0", limit: "0", limit_peer: "0", ...o });
  const info = (flags = {}) => ({ account_flags: { defaultRipple: false, ...flags } });

  it("never counts a NoRipple line", () => {
    const r = analyseRippling({ account: "rA", accountInfo: info(), lines: [line({ balance: "5", no_ripple: true }), line({ account: "rB", limit: "100" })] });
    expect(r.verdict).toBe("CLEAR");
  });

  it("treats three or more holders as an issuance and flags DefaultRipple off", () => {
    const lines = ["rH1", "rH2", "rH3"].map((a) => line({ account: a, balance: "-10" }));
    const r = analyseRippling({ account: "rI", accountInfo: info(), lines });
    expect(r.role).toBe("issuer");
    expect(r.issued[0].outstanding).toBe("30");
    expect(r.findings.map((f) => f.code)).toContain("ISSUER_DEFAULT_RIPPLE_OFF");
    expect(r.fixes).toContainEqual({ TransactionType: "AccountSet", Account: "rI", SetFlag: ASF_DEFAULT_RIPPLE });
  });

  it("flags DefaultRipple on for an account that issues nothing", () => {
    const r = analyseRippling({ account: "rA", accountInfo: info({ defaultRipple: true }), lines: [] });
    expect(r.findings.map((f) => f.code)).toEqual(["HOLDER_DEFAULT_RIPPLE_ON"]);
  });

  it("says INCOMPLETE rather than CLEAR when not every line was read", () => {
    const r = analyseRippling({ account: "rA", accountInfo: info(), lines: [], truncated: true });
    expect(r.verdict).toBe("INCOMPLETE");
  });
});

describe("GET /api/v1/rippling", () => {
  const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
  const req = (account, method = "GET") => ({ method, headers: {}, query: { account } });

  beforeEach(() => {
    vi.clearAllMocks();
    take.mockReturnValue({ ok: true });
    rippleRpcWithSource.mockImplementation(async (command) =>
      command === "account_info"
        ? { result: exposed.account_info, endpoint: exposed.source }
        : { result: { lines: exposed.lines, ledger_index: exposed.ledger_index }, endpoint: exposed.source });
  });

  it("reads both methods at one validated ledger and hashes the exact report", async () => {
    const r = res();
    await handler(req(exposed.account), r);
    expect(r.code).toBe(200);
    expect(r.body.verdict).toBe("EXPOSED");
    expect(rippleRpcWithSource).toHaveBeenCalledWith("account_info", { account: exposed.account, ledger_index: "validated" }, 6000);
    expect(rippleRpcWithSource).toHaveBeenCalledWith("account_lines", { account: exposed.account, ledger_index: Number(exposed.account_info.ledger_index), limit: 400 }, 8000);
    const { receipt, limitation, ...report } = r.body;
    expect(receipt.digest).toBe(createHash("sha256").update(JSON.stringify(report)).digest("hex"));
    expect(limitation).toContain("unsigned");
  });

  it.each([["rBADADDRESS", 400], ["rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59C", 400]])("rejects %s before any ledger read", async (account, code) => {
    const r = res();
    await handler(req(account), r);
    expect(r.code).toBe(code);
    expect(rippleRpcWithSource).not.toHaveBeenCalled();
  });

  it("refuses other methods", async () => {
    const r = res();
    await handler(req(exposed.account, "POST"), r);
    expect(r.code).toBe(405);
  });

  it("honours the rate limit without a ledger read", async () => {
    take.mockReturnValue({ ok: false, retryAfter: 9 });
    const r = res();
    await handler(req(exposed.account), r);
    expect(r.code).toBe(429);
    expect(r.headers["Retry-After"]).toBe("9");
    expect(rippleRpcWithSource).not.toHaveBeenCalled();
  });

  it("fails closed without upstream detail", async () => {
    rippleRpcWithSource.mockRejectedValue(new Error("upstream secret detail"));
    const r = res();
    await handler(req(exposed.account), r);
    expect(r.code).toBe(503);
    expect(r.body.verdict).toBe("UNRESOLVED");
    expect(JSON.stringify(r.body)).not.toContain("secret");
  });
});
