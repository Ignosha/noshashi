import { describe, expect, it } from "vitest";
import fx from "./recovery.mainnet.json";
import { buildLiabilities } from "../protectionClient";
import { verifyInclusion } from "../../../../supabase/functions/_shared/protection.ts";

/*
 * Building a liabilities tree from a balance export, as an institution does
 * in the app, on real balances: every AccountDelete recorded into the
 * account that 56 others swept themselves into, each sender treated as a
 * customer owed what it delivered (fixture recovery.mainnet.json).
 */

type Json = Record<string, any>;
const SWEEPER = "r344KxkFu8aBLsH1qjnKztsmzwERn696Zn";

const deliveries = new Map<string, number>();
for (const row of [...fx.sweeper_tx_newest, ...fx.sweeper_tx_oldest] as Json[]) {
  const tx = (row.tx_json ?? row.tx) as Json;
  const d = row.meta?.delivered_amount;
  if (tx.TransactionType === "AccountDelete" && tx.Destination === SWEEPER && row.meta?.TransactionResult === "tesSUCCESS" && typeof d === "string") {
    deliveries.set(tx.Account, (deliveries.get(tx.Account) ?? 0) + Number(d));
  }
}
const csv = ["customer,balance", ...[...deliveries].map(([a, drops]) => `${a},${(drops / 1e6).toFixed(6)}`)].join("\n");
const totalDrops = [...deliveries.values()].reduce((n, d) => n + d, 0);

const sha = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");

describe("liabilities built from a balance export", () => {
  it("publishes a total equal to the sum of the file, and one proof per customer", async () => {
    expect(deliveries.size).toBeGreaterThan(10);
    const built = await buildLiabilities(csv);
    expect(built.customers).toBe(deliveries.size);
    expect(Math.round(built.totalXrp * 1e6)).toBe(totalDrops);
    expect(built.root).toMatch(/^[0-9a-f]{64}$/);
    expect(built.proofs).toHaveLength(deliveries.size);
  });

  it("gives each customer a proof they can check with their own id, and nobody else's", async () => {
    const built = await buildLiabilities(csv);
    const { customer, proof } = built.proofs[3];
    expect(proof.ref).toBe(await sha(`${proof.salt}|${customer}`));
    expect(await verifyInclusion(proof, { hash: built.root, sum: proof.root.sum })).toMatchObject({ ok: true });
    // Understating a balance breaks the path to the published root.
    expect((await verifyInclusion({ ...proof, amount: "0" }, { hash: built.root, sum: proof.root.sum })).ok).toBe(false);
  });

  it("uses a fresh salt each time, so the published tree names nobody", async () => {
    const [a, b] = await Promise.all([buildLiabilities(csv), buildLiabilities(csv)]);
    expect(a.salt).not.toBe(b.salt);
    expect(a.root).not.toBe(b.root);
    expect(a.totalXrp).toBe(b.totalXrp);
  });

  it("refuses a customer listed twice and a malformed line", async () => {
    const [first] = [...deliveries.keys()];
    await expect(buildLiabilities(`${first},1\n${first},2`)).rejects.toThrow(/appears twice/);
    await expect(buildLiabilities(`${first},-1`)).rejects.toThrow(/not a non-negative amount/);
  });
});
