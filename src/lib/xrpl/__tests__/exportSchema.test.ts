import { describe, expect, it } from "vitest";
import { applySchema, sanitizeFields, serialize, valueAt } from "../../../../supabase/functions/_shared/exportSchema.ts";

const event = {
  id: 7,
  type: "payment_in",
  tx_hash: "9D10722A2FD8AAB5DCD5BD1166A06884F881A7724AE57E686E51EDD553C434AD",
  data: { delivered: { currency: "XRP", issuer: null, value: 0.000001 }, memos: ["🎁 Visit - XAMAN.LA - to claim it."] },
  screening: { verdict: "review" },
};

describe("export schemas", () => {
  it("reads dotted paths, null when absent", () => {
    expect(valueAt(event, "data.delivered.value")).toBe(0.000001);
    expect(valueAt(event, "data.delivered.issuer")).toBeNull();
    expect(valueAt(event, "data.nothing.here")).toBeNull();
  });

  it("shapes records into the organization's columns", () => {
    const fields = sanitizeFields([
      { path: "tx_hash", as: "hash" },
      { path: "data.delivered.value", as: "amount" },
      { path: "screening.verdict", as: "verdict" },
      { path: "data;drop table", as: "x" },
    ]);
    expect(fields.map((f) => f.as)).toEqual(["hash", "amount", "verdict"]);
    expect(applySchema([event], fields)).toEqual([{ hash: event.tx_hash, amount: 0.000001, verdict: "review" }]);
  });

  it("writes CSV that a spreadsheet will not evaluate, and NDJSON one record per line", () => {
    const rows = [{ memo: "=HYPERLINK(\"https://xaman.la\")", n: 1 }, { memo: "a,b", n: 2 }];
    const csv = serialize(rows, ["memo", "n"], "csv");
    expect(csv).toBe('memo,n\n"\'=HYPERLINK(""https://xaman.la"")",1\n"a,b",2\n');
    expect(serialize(rows, [], "ndjson").trim().split("\n")).toHaveLength(2);
  });
});
