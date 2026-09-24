import { describe, it, expect } from "vitest";
import mainnet from "@/lib/desk/__tests__/fixtures/xrpl-mainnet-107193471.json";
import recorded from "@/lib/learn/misread.cases.json";
import { interpretTransaction, settlementFindings } from "@/lib/desk/settlement";
import type { TrustLine, WalletTransaction } from "@/lib/xrpl/types";
import {
  GEOMETRY,
  accountColumn,
  accountNode,
  askAiPrompt,
  assetsOf,
  evidenceColumn,
  holdersColumn,
  holdingsOf,
  layoutGarden,
  markIssuer,
  subjectKind,
  transactionsOf,
  txNode,
} from "../graph";

/*
 * Transactions here are real mainnet replies recorded in the repo
 * (ledger 107193471, and the partial payment from the misread cases).
 * Trust lines and obligations are built in the shape the app's readers
 * return, around those same real accounts, to pin the ledger's sign
 * convention: from an issuer's side a holder's balance is negative.
 */
const BITSTAMP = mainnet.account_info_bitstamp.account_data.Account;
const PAYMENT = interpretTransaction(mainnet.tx_payment);
const PARTIAL = interpretTransaction(recorded.partialPayment.reply);
const CANCEL = interpretTransaction(mainnet.tx_offer_cancel);

const line = (over: Partial<TrustLine>): TrustLine => ({
  issuer: BITSTAMP,
  currency: "USD",
  balance: 0,
  limit: 0,
  frozen: false,
  frozenByIssuer: false,
  noRipple: false,
  authorized: false,
  requiresAuth: false,
  ...over,
});

/** The recorded payment, as fetchWalletTransactions maps it for its sender. */
const SENT: WalletTransaction = {
  hash: mainnet.tx_payment.hash,
  transactionType: mainnet.tx_payment.TransactionType,
  result: mainnet.tx_payment.meta.TransactionResult,
  ledgerIndex: mainnet.tx_payment.ledger_index,
  date: "",
  timestamp: 0,
  direction: "out",
  counterparty: mainnet.tx_payment.Destination,
  feeXrp: "0.000021",
};

describe("what a pasted value is", () => {
  it("tells an address from a transaction hash from neither", () => {
    expect(subjectKind(BITSTAMP)).toBe("address");
    expect(subjectKind(` ${PAYMENT.hash.toLowerCase()} `)).toBe("tx");
    expect(subjectKind("USD")).toBeNull();
    expect(subjectKind(PAYMENT.hash.slice(1))).toBeNull();
  });
});

describe("issuer → assets", () => {
  it("lists what is outstanding, largest first, and drops nothing-outstanding", () => {
    const nodes = assetsOf({ issuer: BITSTAMP, obligations: { EUR: 10, USD: 250.5, BTC: 0 }, ledgerIndex: 107193471 });
    expect(nodes.map((n) => n.label)).toEqual(["USD", "EUR"]);
    expect(nodes[0]).toMatchObject({ kind: "asset", group: "ISSUES", ref: { issuer: BITSTAMP, currency: "USD" }, expandable: true });
    expect(nodes[0].detail).toBe("250.5 outstanding");
  });

  it("decodes a hex currency code", () => {
    const hex = "524C555344000000000000000000000000000000"; // RLUSD
    expect(assetsOf({ issuer: BITSTAMP, obligations: { [hex]: 1 }, ledgerIndex: 1 })[0].label).toBe("RLUSD");
  });
});

describe("asset → holders", () => {
  const issuerLines = [
    line({ issuer: PAYMENT.account, balance: -12.5, limit: 0 }),
    line({ issuer: PAYMENT.destination!, balance: -900, limit: 0, frozen: true }),
    line({ issuer: CANCEL.account, balance: 0 }), // holder with an empty line
    line({ issuer: PARTIAL.account, currency: "EUR", balance: -5 }),
  ];

  it("reads holders from the issuer's negative balances, largest first", () => {
    const col = holdersColumn(`asset:${BITSTAMP}.USD`, BITSTAMP, "USD", issuerLines, issuerLines.length);
    expect(col.nodes.map((n) => n.ref.address)).toEqual([PAYMENT.destination, PAYMENT.account]);
    expect(col.nodes[0].detail).toBe("holds 900 USD · FROZEN BY ISSUER");
    expect(col.nodes[0].tone).toBe("no-go");
    expect(col.note).toBeUndefined();
  });

  it("says when the lines read were only the ledger's first page", () => {
    const col = holdersColumn("x", BITSTAMP, "USD", issuerLines, 200);
    expect(col.note).toMatch(/Only the first 200 of rvYAfW…s59B's trust lines were read, in ledger order/);
    expect(col.note).toMatch(/Issuance walks every line/);
  });

  it("says when nobody holds it among the lines read", () => {
    expect(holdersColumn("x", BITSTAMP, "JPY", issuerLines, 4).note).toBe("No holder of JPY among the 4 lines read.");
  });
});

describe("account → holdings and transactions", () => {
  it("counts a holding only on this account's side of a line", () => {
    const nodes = holdingsOf([
      line({ balance: 3, limit: 100 }),
      line({ currency: "EUR", balance: 0, limit: 50 }), // empty, but this account set the limit
      line({ issuer: PAYMENT.account, balance: -4 }), // owed, not held
      line({ issuer: CANCEL.account, balance: 0, limit: 0 }), // a holder's empty line, seen from an issuer
      line({ currency: "BTC", balance: 1, frozenByIssuer: true }),
    ]);
    expect(nodes.map((n) => n.label)).toEqual(["USD · rvYAfW…s59B", "BTC · rvYAfW…s59B", "EUR · rvYAfW…s59B"]);
    expect(nodes[1]).toMatchObject({ tone: "no-go", detail: "1 held · FROZEN BY ISSUER" });
    expect(nodes[2].detail).toBe("0 held · empty line");
  });

  it("maps the recorded payment for its sender", () => {
    const [node] = transactionsOf([SENT]);
    expect(node).toMatchObject({ kind: "tx", label: "Payment", tone: "neutral", ref: { hash: PAYMENT.hash } });
    expect(node.detail).toBe("to rJWhov…GZeU · ledger 107,193,471");
  });

  it("builds one column with issues, holds and transactions, and names its ledger", () => {
    const col = accountColumn(
      `addr:${BITSTAMP}`,
      { issuer: BITSTAMP, obligations: { USD: 1 }, ledgerIndex: 107193471 },
      [line({ issuer: PAYMENT.account, balance: 2, limit: 5 })],
      [SENT]
    );
    expect(col.title).toBe("ISSUER");
    expect(col.state).toBe("VALIDATED · LEDGER 107,193,471");
    expect(col.nodes.map((n) => n.group)).toEqual(["ISSUES", "HOLDS", "TRANSACTIONS"]);
  });

  it("says so when the ledger reports nothing, and when obligations were unreadable", () => {
    const col = accountColumn("x", { issuer: BITSTAMP, obligations: {}, ledgerIndex: 0, unreadable: "timeout" }, [], []);
    expect(col.title).toBe("ACCOUNT");
    expect(col.note).toBe("Issued assets could not be read: timeout. The ledger reports nothing issued, held or sent by this account.");
  });

  it("an address that turns out to issue keeps its place in the path", () => {
    const root = accountNode(BITSTAMP, false);
    const marked = markIssuer({ parentId: null, title: "START", nodes: [root], state: "" }, root.id);
    expect(marked.nodes[0]).toMatchObject({ id: root.id, kind: "issuer" });
  });
});

describe("transaction → evidence", () => {
  it("the recorded full payment: delivered in full, and both parties to walk on to", () => {
    const col = evidenceColumn(txNode(PAYMENT.hash).id, PAYMENT, settlementFindings(PAYMENT));
    expect(col.state).toBe("VALIDATED · LEDGER 107,193,471");
    expect(col.nodes[0]).toMatchObject({ kind: "evidence", label: "Delivered 287.022082836 DIP", tone: "go", expandable: false });
    const parties = col.nodes.filter((n) => n.group === "PARTIES");
    expect(parties.map((n) => [n.ref.address, n.detail])).toEqual([
      [PAYMENT.account, "sent it"],
      [PAYMENT.destination, "destination"],
    ]);
  });

  it("the recorded partial payment: what arrived is the evidence, and it is marked", () => {
    const col = evidenceColumn("x", PARTIAL, settlementFindings(PARTIAL));
    const delivered = col.nodes[0];
    expect(delivered.tone).toBe("no-go");
    expect(delivered.detail).toMatch(/^Requested /);
    const shortfall = col.nodes.find((n) => n.id === `evidence:${PARTIAL.hash}:partial-shortfall`);
    expect(shortfall).toMatchObject({ group: "FINDINGS", tone: "no-go" });
    // Paying itself through the exchange: one party, not the same one twice.
    expect(col.nodes.filter((n) => n.group === "PARTIES")).toHaveLength(1);
  });

  it("the recorded offer cancel: no delivered line, its findings, its one party", () => {
    const col = evidenceColumn("x", CANCEL, settlementFindings(CANCEL));
    expect(col.nodes.some((n) => n.label.startsWith("Delivered"))).toBe(false);
    expect(col.nodes.find((n) => n.group === "FINDINGS")?.label).toBe("This is a OfferCancel, not a Payment");
    expect(col.nodes.filter((n) => n.group === "PARTIES").map((n) => n.ref.address)).toEqual([CANCEL.account]);
  });

  it("an unvalidated transaction's column says nothing in it is final", () => {
    const col = evidenceColumn("x", { ...PAYMENT, validated: false }, settlementFindings({ ...PAYMENT, validated: false }));
    expect(col.state).toBe("NOT VALIDATED — NOT FINAL");
  });
});

describe("the question handed to the agent", () => {
  it("carries the full path with full addresses and the hash, and asks to stay within it", () => {
    const evidence = evidenceColumn("x", PAYMENT, settlementFindings(PAYMENT)).nodes[0];
    const prompt = askAiPrompt([
      accountNode(PAYMENT.account, false, "where this walk starts"),
      transactionsOf([SENT])[0],
      evidence,
    ]);
    expect(prompt).toContain(`1. account ${PAYMENT.account} (where this walk starts)`);
    expect(prompt).toContain(`2. transaction ${PAYMENT.hash} (Payment, to rJWhov…GZeU · ledger 107,193,471)`);
    expect(prompt).toContain('3. NOSHASHI\'s reading: "Delivered 287.022082836 DIP"');
    expect(prompt).toMatch(/Use only the facts above, and say so if they are not enough to answer\.$/);
  });
});

describe("layout", () => {
  const root = accountNode(BITSTAMP, true);
  const columns = [
    { parentId: null, title: "START", nodes: [root], state: "" },
    accountColumn(root.id, { issuer: BITSTAMP, obligations: { USD: 2, EUR: 1 }, ledgerIndex: 1 }, [], [SENT]),
  ];
  const layout = layoutGarden(columns, [root.id, columns[1].nodes[2].id]);

  it("places columns side by side and leaves room for group headings", () => {
    const { colWidth, colGap, header, nodeHeight, nodeGap, groupGap } = GEOMETRY;
    const second = layout.nodes.filter((p) => p.column === 1);
    expect(second.every((p) => p.x === colWidth + colGap)).toBe(true);
    expect(second.map((p) => p.y)).toEqual([
      header + groupGap,
      header + groupGap + nodeHeight + nodeGap,
      header + groupGap * 2 + (nodeHeight + nodeGap) * 2,
    ]);
    expect(layout.groups.map((g) => g.text)).toEqual(["ISSUES", "TRANSACTIONS"]);
    expect(layout.width).toBe(colWidth * 2 + colGap);
  });

  it("grows one stem from the parent's right edge to each child's left edge, and marks the chosen one", () => {
    expect(layout.stems).toHaveLength(3);
    const parent = layout.nodes[0];
    for (const stem of layout.stems) {
      const child = layout.nodes.find((p) => p.column === 1 && p.node.id === stem.to)!;
      expect(stem.d.startsWith(`M${parent.x + parent.w} ${parent.y + parent.h / 2} C`)).toBe(true);
      expect(stem.d.endsWith(` ${child.x} ${child.y + child.h / 2}`)).toBe(true);
    }
    expect(layout.stems.filter((s) => s.selected).map((s) => s.to)).toEqual([`tx:${PAYMENT.hash}`]);
    expect(layout.nodes.filter((p) => p.selected)).toHaveLength(2);
  });
});
