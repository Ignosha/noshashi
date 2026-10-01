import { describe, expect, it } from "vitest";
import mainnet from "../../desk/__tests__/fixtures/xrpl-mainnet-107193471.json";
import {
  AMM_HUB,
  DEX_HUB,
  RIPPLE_EPOCH,
  RULES,
  assess,
  buildGraph,
  compareSources,
  measureSignals,
  parseLedgerReply,
  parseTx,
  pushWindow,
  read,
  shortAddress,
  utcClock,
  type ReadLedger,
} from "../analyze";

// Real mainnet accounts and a real validated ledger hash, from the
// recorded replies in the desk fixture. The shapes below follow the
// `ledger` command with transactions expanded (API v1: fields at the top
// level, metadata in metaData); the counts are arranged per test.
const PAY_FROM = mainnet.tx_payment.Account;
const PAY_TO = mainnet.tx_payment.Destination;
const MAKER = mainnet.tx_offer_cancel.Account;
const ISSUER = mainnet.account_info_bitstamp.account_data.Account;
const HASH = mainnet.server_info.info.validated_ledger.hash;
const INDEX = mainnet.server_info.info.validated_ledger.seq;

const v1 = (type: string, account: string, destination?: string, result = "tesSUCCESS") => ({
  TransactionType: type,
  Account: account,
  ...(destination ? { Destination: destination } : {}),
  Fee: "12",
  metaData: { TransactionIndex: 0, TransactionResult: result },
});

const reply = (txs: unknown[], over: Record<string, unknown> = {}) => ({
  result: {
    ledger_hash: HASH,
    ledger_index: INDEX,
    validated: true,
    ledger: { ledger_hash: HASH, ledger_index: INDEX, close_time: 843528850, parent_close_time: 843528842, transactions: txs },
    ...over,
  },
});

const ledger = (index: number, txs: ReturnType<typeof v1>[], close = 843528850, parent = close - 4): ReadLedger => ({
  index,
  hash: HASH,
  closeTime: close + RIPPLE_EPOCH,
  parentCloseTime: parent + RIPPLE_EPOCH,
  txs: txs.map((t) => parseTx(t)!),
});

describe("parseTx", () => {
  it("reads the v1 shape the public servers return", () => {
    expect(parseTx(mainnet.tx_payment)).toEqual({ type: "Payment", account: PAY_FROM, destination: PAY_TO, result: "tesSUCCESS" });
  });
  it("reads the v2 shape (tx_json + meta)", () => {
    const tx = parseTx({ tx_json: { TransactionType: "OfferCancel", Account: MAKER }, meta: { TransactionResult: "tesSUCCESS" } });
    expect(tx).toEqual({ type: "OfferCancel", account: MAKER, destination: null, result: "tesSUCCESS" });
  });
  it("rejects anything without a type and a valid account", () => {
    expect(parseTx({ TransactionType: "Payment", Account: "not-an-address" })).toBeNull();
    expect(parseTx("A".repeat(64))).toBeNull();
  });
});

describe("parseLedgerReply", () => {
  it("accepts a validated, expanded ledger and moves times to Unix seconds", () => {
    const l = parseLedgerReply(reply([v1("Payment", PAY_FROM, PAY_TO)]))!;
    expect(l.index).toBe(INDEX);
    expect(l.hash).toBe(HASH);
    expect(l.closeTime).toBe(843528850 + RIPPLE_EPOCH);
    expect(l.parentCloseTime).toBe(843528842 + RIPPLE_EPOCH);
    expect(l.txs).toHaveLength(1);
  });
  it("refuses a ledger the server does not mark validated", () => {
    expect(parseLedgerReply(reply([], { validated: false }))).toBeNull();
  });
  it("refuses an unexpanded ledger (hashes only)", () => {
    expect(parseLedgerReply(reply([HASH]))).toBeNull();
  });
  it("refuses an error reply", () => {
    expect(parseLedgerReply({ error: "lgrNotFound", status: "error" })).toBeNull();
  });
});

describe("pushWindow", () => {
  it("keeps the newest ledgers, one per index, in order", () => {
    let w: ReadLedger[] = [];
    for (const i of [5, 3, 4, 6, 7, 8, 4]) w = pushWindow(w, ledger(i, []), 4);
    expect(w.map((l) => l.index)).toEqual([5, 6, 7, 8]);
  });
});

describe("buildGraph", () => {
  const g = buildGraph([
    ledger(1, [
      v1("Payment", PAY_FROM, PAY_TO),
      v1("Payment", PAY_FROM, PAY_TO),
      v1("Payment", PAY_TO, ISSUER),
      v1("OfferCreate", MAKER),
      v1("OfferCancel", MAKER),
      v1("AMMDeposit", ISSUER),
      v1("AccountSet", "rLtCVnojydtQy7GYGTmDegkM15hLX8VuZk"),
    ]),
  ]);

  it("joins payments sender to receiver, and offers and AMM to their hubs", () => {
    const pair = g.edges.find((e) => [e.a, e.b].includes(PAY_FROM) && [e.a, e.b].includes(PAY_TO))!;
    expect(pair.weight).toBe(2);
    expect(g.edges.some((e) => [e.a, e.b].includes(DEX_HUB) && [e.a, e.b].includes(MAKER))).toBe(true);
    expect(g.edges.some((e) => [e.a, e.b].includes(AMM_HUB) && [e.a, e.b].includes(ISSUER))).toBe(true);
    expect(g.nodes.find((n) => n.id === DEX_HUB)!.kind).toBe("hub");
  });

  it("groups connected nodes of three or more into clusters", () => {
    // PAY_FROM - PAY_TO - ISSUER - AMM is one component of four.
    expect(g.clusters).toHaveLength(1);
    expect(new Set(g.clusters[0])).toEqual(new Set([PAY_FROM, PAY_TO, ISSUER, AMM_HUB]));
    // MAKER - DEX is a pair, so not a cluster.
    expect(g.nodes.find((n) => n.id === MAKER)!.cluster).toBe(-1);
  });
});

describe("signals and assessment", () => {
  const many = (n: number, f: (i: number) => ReturnType<typeof v1>) => Array.from({ length: n }, (_, i) => f(i));

  it("flags counterparty concentration at the published threshold, with its evidence", () => {
    // 13 payments: 5 to PAY_TO (38.5%), 4 each to ISSUER and MAKER. 40 transactions in all.
    const txs = [
      ...many(5, () => v1("Payment", PAY_FROM, PAY_TO)),
      ...many(8, (i) => v1("Payment", PAY_TO, i % 2 ? ISSUER : MAKER)),
      ...many(27, (i) => v1("OfferCreate", i % 2 ? ISSUER : MAKER)),
    ];
    const ledgers = [ledger(10, txs.slice(0, 20)), ledger(11, txs.slice(20), 843528854)];
    const s = measureSignals(ledgers);
    const cp = s.find((x) => x.id === "counterparty")!;
    expect(cp.value).toBeCloseTo(5 / 13);
    expect(cp.subject).toBe(PAY_TO);
    expect(cp.basis).toBe("5 of 13 payments went to one destination");
    const a = assess(ledgers, s);
    expect(a.state).toBe("elevated");
    // Counterparty is 54% over its threshold; MAKER's 14 of 40 (35%) is 40% over.
    expect(a.contributing.map((c) => c.id)).toEqual(["counterparty", "sender"]);
    expect(a.headline).toBe("Elevated counterparty concentration and sender concentration");
  });

  it("does not run the counterparty rule on too few payments", () => {
    const txs = many(RULES.minTransactions, (i) => (i < 3 ? v1("Payment", PAY_FROM, PAY_TO) : v1("AccountSet", i % 2 ? MAKER : ISSUER)));
    const cp = measureSignals([ledger(1, txs)]).find((x) => x.id === "counterparty")!;
    expect(cp.value).toBeNull();
    expect(cp.excess).toBe(0);
  });

  it("reports velocity from ledger close times, not wall-clock time", () => {
    const ledgers = [ledger(1, many(10, () => v1("AccountSet", MAKER)), 1000, 996), ledger(2, many(10, () => v1("AccountSet", MAKER)), 1004)];
    const vel = measureSignals(ledgers).find((x) => x.id === "velocity")!;
    expect(vel.value).toBe(20 / 8);
    expect(vel.display).toBe("2.5 tx/s");
  });

  it("says when there is not enough activity instead of judging", () => {
    const ledgers = [ledger(1, [v1("Payment", PAY_FROM, PAY_TO)])];
    const a = assess(ledgers, measureSignals(ledgers));
    expect(a.state).toBe("insufficient");
    expect(a.headline).toMatch(/1 of 40/);
  });

  it("is normal when nothing reaches its threshold", () => {
    // 40 distinct senders, all succeeding, payments spread over many destinations.
    const safe = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const senders = Array.from({ length: 40 }, (_, i) => `${PAY_FROM.slice(0, 30)}${safe[i % 24]}${safe[Math.floor(i / 24)]}`);
    const txs = senders.map((s, i) => v1("Payment", s, senders[(i + 1) % senders.length]));
    const ledgers = [ledger(1, txs)];
    const a = assess(ledgers, measureSignals(ledgers));
    expect(a.state).toBe("normal");
    expect(a.contributing).toEqual([]);
  });
});

describe("compareSources", () => {
  const primary = ledger(INDEX, []);
  it("agrees only when a second hash was actually compared", () => {
    expect(compareSources(primary, { result: { ledger_hash: HASH.toLowerCase(), ledger_index: INDEX, validated: true } }).state).toBe("agree");
  });
  it("reports a different hash as a disagreement", () => {
    const other = "0".repeat(64);
    expect(compareSources(primary, { result: { ledger_hash: other, validated: true } })).toEqual({ state: "disagree", index: INDEX, hash: HASH, other });
  });
  it("treats lgrNotFound (a server not caught up yet) as pending, never as agreement", () => {
    expect(compareSources(primary, { error: "lgrNotFound", status: "error" })).toEqual({ state: "pending", index: INDEX, reason: "lgrNotFound" });
    expect(compareSources(primary, { result: { ledger_hash: HASH, validated: false } }).state).toBe("pending");
    expect(compareSources(primary, undefined).state).toBe("pending");
  });
});

describe("read", () => {
  it("counts each stage of the pipeline from the same window", () => {
    const r = read([ledger(1, [v1("Payment", PAY_FROM, PAY_TO), v1("OfferCreate", MAKER)]), ledger(2, [v1("Payment", PAY_TO, ISSUER)], 843528854)])!;
    expect(r.ledgers).toEqual({ first: 1, last: 2, count: 2 });
    expect(r.counts).toMatchObject({ transactions: 3, entities: 4, relationships: 3, clusters: 1 });
  });
  it("is null with no ledgers", () => {
    expect(read([])).toBeNull();
  });
});

describe("formatting", () => {
  it("shortens addresses for display and leaves hubs alone", () => {
    expect(shortAddress(PAY_TO)).toBe(`${PAY_TO.slice(0, 5)}…${PAY_TO.slice(-4)}`);
    expect(shortAddress(DEX_HUB)).toBe(DEX_HUB);
  });
  it("prints UTC clock time", () => {
    expect(utcClock(843528850 + RIPPLE_EPOCH)).toBe("01:34:10 UTC");
  });
});
