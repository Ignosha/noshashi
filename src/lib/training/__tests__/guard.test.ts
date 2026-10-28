import { describe, it, expect } from "vitest";
import { LAB_SUBJECTS } from "@/lib/learn/labs";
import { TrainingGuard, TrainingLimit, identifiers, labSubjects, type GuardEvent } from "../guard";
import book from "@/lib/desk/__tests__/fixtures/book-usd-bitstamp-107312802.json";

// A real mainnet account that is not in any lab: the first bid's owner in the
// recorded Bitstamp USD book is used where a lab-linked account is needed, and
// this one (Ripple's genesis account) where an unrelated one is.
const OUTSIDE = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

function bookParams() {
  return { taker_gets: { currency: "XRP" }, taker_pays: { currency: "USD", issuer: LAB_SUBJECTS.bitstamp }, limit: 16 };
}

describe("training copy guard", () => {
  it("knows every address and hash the labs hand to a screen", () => {
    const subjects = labSubjects();
    for (const value of Object.values(LAB_SUBJECTS)) expect(subjects.has(value.toUpperCase())).toBe(true);
    expect(subjects.has(OUTSIDE.toUpperCase())).toBe(false);
  });

  it("finds identifiers but not ledger hashes or paging cursors", () => {
    const found = identifiers({ account: LAB_SUBJECTS.bitstamp, ledger_hash: LAB_SUBJECTS.partialXrp, marker: LAB_SUBJECTS.cscPayment });
    expect(found).toEqual([LAB_SUBJECTS.bitstamp]);
  });

  it("reads anything on a free screen", () => {
    const guard = new TrainingGuard();
    expect(() => guard.admit("account_info", { account: OUTSIDE })).not.toThrow();
  });

  it("on a paid screen reads the labs' addresses and refuses others", () => {
    const guard = new TrainingGuard();
    const events: GuardEvent[] = [];
    guard.on((e) => events.push(e));
    guard.paid(1);
    expect(() => guard.admit("book_offers", bookParams())).not.toThrow();
    expect(() => guard.admit("account_info", { account: OUTSIDE })).toThrow(TrainingLimit);
    expect(events).toEqual([{ kind: "blocked", command: "account_info", value: OUTSIDE }]);
    guard.paid(-1);
    expect(() => guard.admit("account_info", { account: OUTSIDE })).not.toThrow();
  });

  it("lets a paid screen follow what the ledger linked to a lab subject", () => {
    const guard = new TrainingGuard();
    guard.paid(1);
    const owner = book.bids[0].Account;
    expect(() => guard.admit("account_lines", { account: owner })).toThrow(TrainingLimit);
    guard.answered("book_offers", bookParams(), { offers: book.bids });
    expect(() => guard.admit("account_lines", { account: owner })).not.toThrow();
  });

  it("does not open accounts named by a read that names no subject", () => {
    const guard = new TrainingGuard();
    guard.paid(1);
    guard.answered("ledger", { transactions: true }, { offers: book.asks });
    expect(() => guard.admit("account_info", { account: book.asks[0].Account })).toThrow(TrainingLimit);
  });

  it("reports a read only once the ledger has answered it", () => {
    const guard = new TrainingGuard();
    const events: GuardEvent[] = [];
    guard.on((e) => events.push(e));
    guard.admit("account_info", { account: LAB_SUBJECTS.bitstamp });
    expect(events).toEqual([]);
    guard.answered("account_info", { account: LAB_SUBJECTS.bitstamp }, {});
    expect(events).toEqual([{ kind: "read", command: "account_info", values: [LAB_SUBJECTS.bitstamp], paid: false }]);
  });
});
