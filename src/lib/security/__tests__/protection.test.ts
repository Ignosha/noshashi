import { describe, expect, it } from "vitest";
import inst from "./institutional.mainnet.json";
import fx from "./recovery.mainnet.json";
import hardening from "./hardening.mainnet.json";
import {
  assessProtection,
  buildLiabilityTree,
  canonical,
  controlOf,
  digestOf,
  heldAccountFrom,
  proofFor,
  rootOf,
  securedXrp,
  toUnits,
  verifyInclusion,
} from "../../../../supabase/functions/_shared/protection.ts";

/*
 * Customer Asset Protection on recorded mainnet data (see the fixtures'
 * notes). Proof of liabilities is exercised on a real issued token: USDB's
 * 139 holders, whose balances the issuer owes, checked against the
 * obligations the ledger itself reports. Reserves and the protection fund
 * are read from real accounts: Ripple's escrow wallet #03 (XRP locked in
 * escrow until dates), a real 2-of-3 multisig account, Bitstamp's issuer
 * (one regular key), and an account holding 874,582 XRP.
 */

const DEC = 22;
const USDB = "5553444200000000000000000000000000000000";
const hex = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");

async function usdbLiabilities() {
  // Each holder's reference is derived from its address here; an institution uses a secret per customer instead.
  return Promise.all(
    inst.usdb_lines.filter((l: { currency: string }) => l.currency === USDB).map(async (l: { account: string; balance: string }) => ({ ref: await hex(`usdb|${l.account}`), amount: toUnits(l.balance.replace(/^-/, ""), DEC), account: l.account }))
  );
}

describe("proof of liabilities", () => {
  it("builds a sum tree over USDB's 138 holders whose total is what the ledger says the issuer owes", async () => {
    const entries = await usdbLiabilities();
    const levels = await buildLiabilityTree(entries);
    const root = rootOf(levels);
    expect(root.count).toBe(inst.usdb_lines.filter((l: { currency: string }) => l.currency === USDB).length);
    const owed = toUnits(inst.usdb_gateway.obligations["5553444200000000000000000000000000000000"], DEC);
    // gateway_balances rounds to 16 significant digits; the leaves are exact.
    const gap = root.sum > owed ? root.sum - owed : owed - root.sum;
    expect(gap < 10n ** BigInt(DEC - 7)).toBe(true);
    expect(root.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lets every holder prove their balance is counted, and catches a changed balance", async () => {
    const entries = await usdbLiabilities();
    const levels = await buildLiabilityTree(entries);
    const root = rootOf(levels);
    const published = { hash: root.hash, sum: root.sum.toString() };
    // The largest holder (24,625,636.43 USDB) and the last one.
    const largest = entries.findIndex((e) => e.amount === toUnits("24625636.43", DEC));
    for (const i of [largest, entries.length - 1]) {
      const proof = proofFor(levels, i, entries[i].ref);
      expect(await verifyInclusion(proof, published)).toEqual({ ok: true, reason: "Your balance is counted in the published liabilities." });
    }
    const proof = proofFor(levels, largest, entries[largest].ref);
    const understated = { ...proof, amount: (BigInt(proof.amount) - 1n).toString() };
    expect((await verifyInclusion(understated, published)).ok).toBe(false);
    const hidden = { ...proof, path: proof.path.map((s, i) => (i === 0 ? { ...s, sum: "-1" } : s)) };
    expect((await verifyInclusion(hidden, published)).reason).toMatch(/negative/);
  });

  it("refuses bad input rather than publishing a wrong root", async () => {
    await expect(buildLiabilityTree([])).rejects.toThrow(/No customer balances/);
    const ref = await hex("a");
    await expect(buildLiabilityTree([{ ref, amount: 1n }, { ref, amount: 2n }])).rejects.toThrow(/share a reference/);
    expect(() => toUnits("-5")).toThrow();
    expect(() => toUnits("1.1234567")).toThrow(/decimal places/);
    expect(toUnits("12.5")).toBe(12_500_000n);
  });
});

const CLOSE = fx.ledger.ledger.close_time;
const ESCROW = "rB3WNZc45gxzW31zxfXdkx8HusAhoqscPn";

describe("reserves, the protection fund and coverage", () => {
  // Ripple's escrow wallet, with its real 4-of-8 signer list.
  const escrowFund = heldAccountFrom(ESCROW, { ...fx.escrow_info, signer_lists: inst.ripple_escrow_signer_lists }, fx.escrow_objects, [ESCROW], CLOSE);
  const multisig = heldAccountFrom("rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX", hardening.multisig_account_info, [], [], CLOSE);
  const bitstamp = heldAccountFrom("rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", hardening.bitstamp_account_info, [], [], CLOSE);
  const sweeper = heldAccountFrom("r344KxkFu8aBLsH1qjnKztsmzwERn696Zn", fx.sweeper_info, [], [], CLOSE);

  it("reads who can move each account", () => {
    // Ripple's wallet: 3.3 billion XRP in escrow to itself, the first release on 1 October.
    expect(escrowFund).toMatchObject({ escrowedXrp: 3_300_000_000, lockedUntil: "2026-10-01T00:00:00.000Z" });
    // It also needs 4 of its 8 signers to move anything: every drop is secured.
    expect(escrowFund.minSigners).toBe(4);
    expect(controlOf(escrowFund)).toBe("multi_party");
    expect(securedXrp(escrowFund)).toBe(3_300_000_235.360668);
    // Read without its signer list, who signs is unknown and only the locked escrow counts.
    const unread = heldAccountFrom(ESCROW, fx.escrow_info, fx.escrow_objects, [ESCROW], CLOSE);
    expect(controlOf(unread)).toBe("unknown");
    expect(securedXrp(unread)).toBe(3_300_000_000);
    // 2-of-3 signers, master key disabled.
    expect(controlOf(multisig)).toBe("multi_party");
    expect(securedXrp(multisig)).toBe(1.2);
    // One regular key signs for Bitstamp's issuer.
    expect(controlOf(bitstamp)).toBe("single_key");
    expect(securedXrp(bitstamp)).toBe(0);
  });

  it("reports full backing, a fund that no single key can move, and says it is not insurance", () => {
    const program = {
      name: "Recorded-data program",
      reserveAddresses: [sweeper.address],
      fundAddresses: [multisig.address, bitstamp.address],
      coverageLimitXrp: 1,
      // What the 56 swept accounts delivered into the reserve account, in the recording: 49.300475 XRP.
      liabilities: { root: "0".repeat(64), totalXrp: 49.300475, count: 56, asOf: "2026-09-28T00:00:00.000Z" },
    };
    const r = assessProtection(program, [sweeper], [multisig, bitstamp], 107296847, "2026-09-28T17:03:11.000Z");
    expect(r.reservesXrp).toBe(874582.520313);
    expect(r.status).toBe("fully_backed");
    expect(r.coverageRatio).toBeGreaterThan(17_000);
    // Only the multisig's 1.2 XRP is secured; Bitstamp's issuer moves with one key.
    expect(r.fundSecuredXrp).toBe(1.2);
    expect(r.fundRatio).toBeCloseTo(1.2 / 49.300475, 6);
    expect(r.findings.map((f) => f.id)).toContain("fund-single-rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B");
    expect(r.findings.find((f) => f.id === "not-insurance")?.detail).toMatch(/does not guarantee deposits or pay claims/);
  });

  it("names a shortfall plainly and gives a digest anyone can recompute", async () => {
    const program = { name: "Shortfall", reserveAddresses: [ESCROW], fundAddresses: [], coverageLimitXrp: 0, liabilities: { root: "0".repeat(64), totalXrp: 5_000_000_000, count: 1000, asOf: "2026-09-28T00:00:00.000Z" } };
    const r = assessProtection(program, [escrowFund], [], 107296847, "2026-09-28T17:03:11.000Z");
    expect(r.status).toBe("under_backed");
    expect(r.findings[0]).toMatchObject({ id: "under-backed", severity: "critical" });
    const d = await digestOf(r);
    expect(d).toMatch(/^[0-9A-F]{64}$/);
    expect(await digestOf(JSON.parse(JSON.stringify(r)))).toBe(d);
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });
});
