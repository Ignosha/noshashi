/*
 * The issuer authority history. The first block runs on the earliest
 * validated transactions of Sologenic's SOLO issuer (tests/fixtures),
 * read live on 2026-11-18: it set a 0.01% transfer fee, gave up freeze
 * for good, set its regular key to the black-hole address and disabled
 * its master key, all on 2019-12-07. The rest checks each rule.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { eventOf, eventsFrom, tally, readIssuerHistory, SEVERITY } from "../api/_lib/issuer-history.js";
import handler from "../api/_lib/routes/issuer-history.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/issuer-history-solo-2026-11-18.json", import.meta.url), "utf8"));
const SOLO = fixture.issuer;

describe("SOLO, live", () => {
  const events = eventsFrom(fixture.transactions, SOLO);

  it("keeps only the issuer's own authority changes, oldest first", () => {
    expect(events.map((e) => e.summary)).toEqual([
      "Transfer fee set to 0.01%",
      "Turned on: freeze permanently given up (NoFreeze)",
      "Regular key set to rrrrrrrrrrrrrrrrrrrrBZbvji",
      "Turned on: master key disabled",
    ]);
    expect(events[0].date).toBe("2019-12-07T00:11:01Z");
    expect(events.every((e) => e.hash && e.ledger_index)).toBe(true);
  });

  it("ignores holders' trust lines and flags that change nothing for holders", () => {
    const holderLines = fixture.transactions.filter((t) => t.tx_json.Account !== SOLO);
    expect(holderLines.length).toBeGreaterThan(0);
    for (const t of holderLines) expect(eventOf(t, SOLO)).toBeNull();
    expect(events.some((e) => /disallow XRP|default rippling/.test(e.summary))).toBe(false);
  });

  it("counts no power ever used", () => {
    expect(tally(events)).toEqual({ freezes: 0, clawbacks: 0, key_changes: 2, power_changes: 2 });
  });
});

const ISSUER = "rHashLabsu2H6hXDSunL8AcVDmTyE17Z35";
const entry = (tx_json, result = "tesSUCCESS", ledger_index = 100) => ({
  hash: `H${ledger_index}${tx_json.TransactionType}`,
  ledger_index,
  close_time_iso: "2026-01-01T00:00:00Z",
  validated: true,
  tx_json: { Account: ISSUER, ...tx_json },
  meta: { TransactionResult: result },
});

describe("each kind of event", () => {
  it("a freeze of a holder is a power used", () => {
    const e = eventOf(entry({ TransactionType: "TrustSet", Flags: 0x00100000, LimitAmount: { currency: "USD", issuer: "rHolder1111111111111111111111", value: "0" } }), ISSUER);
    expect(e.severity).toBe(SEVERITY.power_used);
    expect(e.summary).toBe("Froze the USD line of rHolder1111111111111111111111");
  });

  it("an unfreeze is recorded but not counted as a freeze", () => {
    const e = eventOf(entry({ TransactionType: "TrustSet", Flags: 0x00200000, LimitAmount: { currency: "USD", issuer: "rHolder1111111111111111111111", value: "0" } }), ISSUER);
    expect(e.summary).toMatch(/^Unfroze/);
    expect(tally([e]).freezes).toBe(0);
  });

  it("a clawback names the amount and the holder", () => {
    const e = eventOf(entry({ TransactionType: "Clawback", Amount: { currency: "USD", issuer: "rHolder1111111111111111111111", value: "25" } }), ISSUER);
    expect(e.summary).toBe("Clawed back 25 USD from rHolder1111111111111111111111");
    expect(tally([e]).clawbacks).toBe(1);
  });

  it("clawback switched on and signer lists are recorded", () => {
    expect(eventOf(entry({ TransactionType: "AccountSet", SetFlag: 16 }), ISSUER).summary).toMatch(/clawback enabled/);
    expect(eventOf(entry({ TransactionType: "SignerListSet", SignerQuorum: 2, SignerEntries: [{}, {}, {}] }), ISSUER).summary).toBe("Signer list set: 3 signers, quorum 2");
    expect(eventOf(entry({ TransactionType: "SignerListSet", SignerQuorum: 0 }), ISSUER).summary).toBe("Signer list removed");
  });

  it("a failed transaction or one sent by someone else is not an event", () => {
    expect(eventOf(entry({ TransactionType: "Clawback", Amount: {} }, "tecNO_PERMISSION"), ISSUER)).toBeNull();
    expect(eventOf(entry({ TransactionType: "SetRegularKey" }), "rSomeoneElse11111111111111111")).toBeNull();
  });
});

describe("coverage", () => {
  const page = (txs, marker) => ({ transactions: txs, ...(marker ? { marker } : {}), ledger_index_max: 200 });

  it("a history read in one page is complete", async () => {
    const rpc = async () => page([entry({ TransactionType: "SetRegularKey", RegularKey: "rK" })]);
    const h = await readIssuerHistory(ISSUER, { rpc });
    expect(h.coverage.complete).toBe(true);
    expect(h.events).toHaveLength(1);
  });

  it("a long history whose middle was not read says so", async () => {
    const rpc = async (_c, params) =>
      params.forward ? page([entry({ TransactionType: "SetRegularKey", RegularKey: "rK" }, "tesSUCCESS", 1)], "m1") : page([entry({ TransactionType: "Payment" }, "tesSUCCESS", 900)], "m2");
    const h = await readIssuerHistory(ISSUER, { rpc, recentPages: 2 });
    expect(h.coverage.complete).toBe(false);
    expect(h.coverage.note).toMatch(/not/);
  });

  it("the backward reading meeting the forward one closes the gap", async () => {
    const shared = entry({ TransactionType: "AccountSet", SetFlag: 6 }, "tesSUCCESS", 5);
    const rpc = async (_c, params) => (params.forward ? page([shared], "m1") : page([shared], "m2"));
    const h = await readIssuerHistory(ISSUER, { rpc });
    expect(h.coverage.complete).toBe(true);
    expect(h.events).toHaveLength(1);
  });
});

describe("GET /api/issuer-history", () => {
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

  it("answers from the ledger and caches", async () => {
    const res = await call({ issuer: SOLO }, async () => ({ transactions: fixture.transactions, ledger_index_max: fixture.ledger_index_max }));
    expect(res.statusCode).toBe(200);
    expect(res.body.events).toHaveLength(4);
    expect(res.headers["cache-control"]).toContain("s-maxage=900");
  });

  it("refuses a bad address", async () => {
    expect((await call({ issuer: "GABC" })).statusCode).toBe(400);
  });
});
