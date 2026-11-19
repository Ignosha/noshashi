/*
 * MPT issuer controls (api/_lib/mpt-authority.js). These check each rule
 * against the flag values XLS-33 defines. A reading of a live mainnet
 * issuance is added as a fixture once one has been read.
 */
import { describe, it, expect } from "vitest";
import { issuanceFacts, issuanceIdOf, accountIdHex, decodeMetadata, keyControl, readMptAuthority, MPT_FLAGS } from "../api/_lib/mpt-authority.js";
import handler from "../api/_lib/routes/mpt-authority.js";
import { readFileSync } from "node:fs";
import { findings, reportModel } from "../supabase/functions/_shared/evidenceReport.ts";

const live = JSON.parse(readFileSync(new URL("./fixtures/mpt-authority-2026-11-19.json", import.meta.url), "utf8"));

describe("live mainnet issuances (XRPTokenizer, ledger 108423383)", () => {
  const [x40am, datec] = live.issuances.map(issuanceFacts);

  it("computes the same issuance IDs the ledger reports", () => {
    for (const e of live.issuances) expect(issuanceIdOf(e.Sequence, e.Issuer)).toBe(e.mpt_issuance_id);
  });

  it("X40AM: no powers kept, 40 billion issued, 38 billion of it in escrow", () => {
    expect(x40am.name).toBe("X40AM · X40AM Utility Token");
    expect(x40am.retained_powers).toEqual([]);
    expect(x40am.outstanding).toBe("40000000000");
    expect(x40am.maximum).toBe("40000000000");
    expect(x40am.locked_amount).toBe("38000000000");
    expect(x40am.can_escrow).toBe(true);
  });

  it("DateC: the issuer kept the power to lock holders, and it can trade", () => {
    expect(datec.name).toBe("DATEC · DateC");
    expect(datec.retained_powers).toEqual(["CAN_LOCK"]);
    expect(datec.can_trade).toBe(true);
    expect(datec.locked_now).toBe(false);
    expect(datec.outstanding).toBe("2000000000");
  });
});

const ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const hex = (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

describe("issuance IDs", () => {
  it("are the sequence then the AccountID, 48 hex characters", () => {
    expect(accountIdHex("rrrrrrrrrrrrrrrrrrrrrhoLvTp")).toBe("0".repeat(40));
    const id = issuanceIdOf(5, ISSUER);
    expect(id).toHaveLength(48);
    expect(id.slice(0, 8)).toBe("00000005");
    expect(id.slice(8)).toBe(accountIdHex(ISSUER));
  });
});

describe("what the issuer can do", () => {
  const entry = (Flags, extra = {}) => ({ Issuer: ISSUER, Sequence: 7, Flags, AssetScale: 2, OutstandingAmount: "123456", ...extra });

  it("reads clawback, lock and approval from the flags", () => {
    const f = issuanceFacts(entry(MPT_FLAGS.canClawback | MPT_FLAGS.canLock | MPT_FLAGS.requireAuth | MPT_FLAGS.canTransfer));
    expect(f.retained_powers).toEqual(["CAN_CLAWBACK", "CAN_LOCK", "REQUIRE_AUTH"]);
    expect(f.powers.find((p) => p.id === "TRANSFERABLE").means).toMatch(/^Yes/);
  });

  it("an issuance with no powers retains none, and cannot be passed between holders without canTransfer", () => {
    const f = issuanceFacts(entry(0));
    expect(f.retained_powers).toEqual([]);
    expect(f.powers.find((p) => p.id === "TRANSFERABLE").means).toMatch(/only send it back to the issuer/);
  });

  it("says when holders are locked right now", () => {
    expect(issuanceFacts(entry(MPT_FLAGS.locked | MPT_FLAGS.canLock)).locked_now).toBe(true);
  });

  it("states amounts at the asset scale and the fee as a percent", () => {
    const f = issuanceFacts(entry(0, { MaximumAmount: "1000000", TransferFee: 250 }));
    expect(f.outstanding).toBe("1234.56");
    expect(f.maximum).toBe("10000");
    expect(f.transfer_fee_percent).toBe(0.25);
  });

  it("decodes the issuer's JSON metadata and names the token", () => {
    const meta = hex(JSON.stringify({ ticker: "TBILL", name: "T-Bill Fund" }));
    expect(decodeMetadata(meta)).toEqual({ ticker: "TBILL", name: "T-Bill Fund" });
    expect(issuanceFacts(entry(0, { MPTokenMetadata: meta })).name).toBe("TBILL · T-Bill Fund");
    expect(decodeMetadata("ZZ")).toBeNull();
  });
});

describe("who controls the issuer", () => {
  const info = (Flags, extra = {}, lists = []) => ({ account_data: { Account: ISSUER, Flags, ...extra }, signer_lists: lists });

  it("a live master key is one key", () => {
    expect(keyControl(info(0)).single_key).toBe(true);
  });

  it("master disabled with a 2-of-3 signer list needs two keys", () => {
    const list = { SignerQuorum: 2, SignerEntries: [1, 2, 3].map((i) => ({ SignerEntry: { Account: `r${i}`, SignerWeight: 1 } })) };
    const k = keyControl(info(0x00100000, {}, [list]));
    expect(k.single_key).toBe(false);
    expect(k.summary).toBe("2 of 3 signers must agree to act for this issuer.");
  });

  it("an unreadable signer list is said to be unreadable", () => {
    expect(keyControl({ account_data: { Flags: 0 } }).readable).toBe(false);
  });
});

describe("reading", () => {
  it("pages through every issuance and pins each read to a validated ledger", async () => {
    const calls = [];
    const rpc = async (command, params) => {
      calls.push([command, params]);
      if (command === "account_objects") {
        return params.marker
          ? { account_objects: [{ Issuer: ISSUER, Sequence: 9, Flags: 0, OutstandingAmount: "1" }], ledger_index: 10 }
          : { account_objects: [{ Issuer: ISSUER, Sequence: 8, Flags: MPT_FLAGS.canClawback, OutstandingAmount: "1" }], marker: "m", ledger_index: 10 };
      }
      return { account_data: { Account: ISSUER, Flags: 0 }, signer_lists: [], ledger_index: 10 };
    };
    const r = await readMptAuthority({ issuer: ISSUER }, { rpc });
    expect(r.issuances).toHaveLength(2);
    expect(r.coverage.complete).toBe(true);
    expect(calls.every(([, p]) => p.ledger_index === "validated")).toBe(true);
  });
});

describe("GET /api/mpt-authority", () => {
  function call(query, rpc) {
    const res = {
      statusCode: 0,
      headers: {},
      body: undefined,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    return handler({ method: "GET", query }, res, { rpc }).then(() => res);
  }

  it("refuses a bad address or ID", async () => {
    expect((await call({ issuer: "nope" })).statusCode).toBe(400);
    expect((await call({ id: "abc" })).statusCode).toBe(400);
  });

  it("reads one issuance by ID", async () => {
    const id = issuanceIdOf(3, ISSUER);
    const rpc = async (command) =>
      command === "ledger_entry"
        ? { node: { Issuer: ISSUER, Sequence: 3, Flags: MPT_FLAGS.canLock, OutstandingAmount: "5" }, ledger_index: 99 }
        : { account_data: { Account: ISSUER, Flags: 0 }, signer_lists: [] };
    const res = await call({ id }, rpc);
    expect(res.statusCode).toBe(200);
    expect(res.body.issuances[0].mpt_issuance_id).toBe(id);
    expect(res.body.issuances[0].retained_powers).toEqual(["CAN_LOCK"]);
    expect(res.headers["cache-control"]).toContain("s-maxage=300");
  });
});

describe("in the Ledger Evidence Report", () => {
  const reply = { issuer: live.issuer, ledger_index: live.ledger_index, key_control: { summary: "2 of 10 signers must agree to act for this issuer." }, issuances: live.issuances.map(issuanceFacts) };
  const sources = [{ kind: "mpt", subject: live.issuer, request: "/api/mpt-authority", reply }];

  it("names the MPT whose issuer can still freeze holders", () => {
    expect(findings(sources)).toEqual(["The issuer of the MPT DATEC · DateC can still freeze holders."]);
  });

  it("lists every MPT with its powers and the amount in escrow", () => {
    const model = reportModel({ reference: "NER-TEST", tier: "issuer", organization: null, scope: { issuers: [live.issuer], wallets: [], books: [] }, periodEnd: null, generatedAt: "2026-11-19T02:40:36Z", sources, digest: "0".repeat(64) });
    const text = JSON.stringify(model.blocks);
    expect(text).toContain("Multi-Purpose Tokens");
    expect(text).toContain("40000000000 of 40000000000 (38000000000 in escrow)");
    expect(text).toContain("060B0AEA9FE7F2B50E46A1E9127A580EB575FA6850C683F7");
  });

  it("an issuer with no MPTs adds no section", () => {
    const model = reportModel({ reference: "NER-TEST", tier: "issuer", organization: null, scope: { issuers: [live.issuer], wallets: [], books: [] }, periodEnd: null, generatedAt: "2026-11-19T02:40:36Z", sources: [{ ...sources[0], reply: { ...reply, issuances: [] } }], digest: "0".repeat(64) });
    expect(JSON.stringify(model.blocks)).not.toContain("Multi-Purpose Tokens");
  });
});
