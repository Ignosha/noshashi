// A fixed, fictional issuer portfolio. Only sample IDs match this snapshot.
export const snapshot = {
  asOf: "2026-11-20", issuer: "Sample issuer", asset: "DEMO",
  wallets: { "case-a": { wallet: "Sample wallet A", balance: "2000" },
    "case-b": { wallet: "Sample wallet B", balance: "100" },
    "case-c": { wallet: "Sample wallet C", balance: "0" } }
};
export const example = [
  { id: "case-a", closed: "2026-10-01" }, { id: "case-b", closed: "2026-11-08" },
  { id: "case-c", closed: "2026-10-01" }, { id: "case-d", closed: "2026-10-02" }
];
export function evaluate(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw Error("Choose a list of 1–500 sample cases.");
  const seen = new Set();
  return rows.map(({ id, closed }) => {
    const date = new Date(closed + "T00:00:00Z");
    if (typeof id !== "string" || !/^case-[a-z0-9-]{1,40}$/.test(id) || seen.has(id) ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== closed || closed > snapshot.asOf)
      throw Error("Each row needs a unique sample case ID and a valid closure date through " + snapshot.asOf + ".");
    seen.add(id);
    const facts = Object.hasOwn(snapshot.wallets, id) ? snapshot.wallets[id] : null;
    const days = (Date.parse(snapshot.asOf + "T00:00:00Z") - date.getTime()) / 86400000;
    let result = "Unable to verify wallet";
    if (facts) result = facts.balance === "0" ? "Zero balance" : days < 30 ? "Within redemption window" : "Balance requires review";
    return { id, closed, days, result, facts };
  });
}
