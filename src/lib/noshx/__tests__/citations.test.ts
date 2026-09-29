import { describe, expect, it } from "vitest";
import cases from "@/lib/net/__tests__/agreement.cases.json";
import book from "@/lib/desk/__tests__/fixtures/book-usd-bitstamp-107312802.json";
import { citationFor, ledgerIndexIn } from "../citations";

/** Citations read the ledger index from the reading itself, on real mainnet replies. */

describe("citations", () => {
  it("finds the ledger a real reply was read at", () => {
    const reply = (cases.bitstamp_107305907 as Record<string, any>)["https://xrplcluster.com/"];
    expect(ledgerIndexIn(reply)).toBe(107_305_907);
    expect(ledgerIndexIn(book)).toBe(107_312_802);
  });

  it("never mistakes an account Sequence or a balance for a ledger index", () => {
    const reply = (cases.bitstamp_107305907 as Record<string, any>)["https://xrplcluster.com/"];
    const data = reply.result.account_data;
    expect(ledgerIndexIn({ Sequence: data.Sequence, Balance: data.Balance })).toBeUndefined();
  });

  it("names the screen, the question asked and where 'open' goes, and says so when there is no ledger index", () => {
    const c = citationFor("read_book", "Order Book", { currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" }, book, new Date("2026-09-29T10:00:00Z"));
    expect(c).toMatchObject({ tool: "read_book", screen: "Order Book", scene: "book", ledgerIndex: 107_312_802, subject: "USD · rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" });
    expect(citationFor("search_noshashi", "NOSHASHI pages", { query: "receipt" }, [{ title: "Evidence" }]).ledgerIndex).toBeUndefined();
  });
});
