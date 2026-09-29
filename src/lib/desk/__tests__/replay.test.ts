import { describe, expect, it } from "vitest";
import fx from "./fixtures/replay-bitstamp-107305907.json";
import { DOMAIN_REGISTRY, runPolicy } from "@/lib/policy";
import type { AccountInfo } from "@/lib/xrpl/types";
import { receiptToEntry, type LedgerEntry } from "../ledger";
import { replayable, replayVerdict, type ReplayData } from "../replay";

/**
 * Replay on real mainnet state: Bitstamp's account, its (empty) credential
 * set and the reserve in force, all read at ledger 107,305,907.
 */

const d = fx.account_data;
const account: AccountInfo = { address: d.Account, balanceXrp: (Number(d.Balance) / 1e6).toFixed(2), sequence: d.Sequence, ownerCount: d.OwnerCount };
const reserve = { baseXrp: Number(fx.fee_settings.ReserveBaseDrops) / 1e6, incXrp: Number(fx.fee_settings.ReserveIncrementDrops) / 1e6 };
const data: ReplayData = { account, credentials: [], reserve, unavailable: [] };
const domain = DOMAIN_REGISTRY.find((x) => x.requirements.length === 0 && x.governance === "active") ?? DOMAIN_REGISTRY[0];

async function recorded(amountXrp = 10): Promise<LedgerEntry> {
  const receipt = await runPolicy({ account, credentials: [], domain, amountXrp, reserve });
  return receiptToEntry(receipt, { domainCode: domain.code, ledgerIndex: fx.ledger_index });
}

describe("replay", () => {
  it("reads the reserve in force at that ledger from FeeSettings: 1 XRP base, 0.2 XRP per object", () => {
    expect(reserve).toEqual({ baseXrp: 1, incXrp: 0.2 });
  });

  it("re-running a verdict on the state it was read at reproduces it exactly, digest included", async () => {
    const entry = await recorded();
    const r = await replayVerdict(entry, data);
    expect(r.state).toBe("matches");
    if (r.state === "not-replayable") return;
    expect(r.replayedDigest).toBe(entry.digest);
    expect(r.replayedVerdict).toBe(entry.verdict);
    expect(r.changed).toEqual([]);
  });

  it("a stored record whose rule results were edited no longer replays: the edit is the finding", async () => {
    const entry = await recorded(500);
    const failing = entry.checks!.find((c) => !c.passed)!;
    const tampered: LedgerEntry = { ...entry, checks: entry.checks!.map((c) => (c.id === failing.id ? { ...c, passed: true } : c)) };
    const r = await replayVerdict(tampered, data);
    expect(r.state).toBe("differs");
    if (r.state === "not-replayable") return;
    expect(r.changed.map((c) => c.id)).toContain(failing.id);
  });

  it("does not rewrite history: the entry passed in is unchanged", async () => {
    const entry = await recorded();
    const before = JSON.stringify(entry);
    await replayVerdict(entry, { ...data, account: { ...account, balanceXrp: "0.00" } });
    expect(JSON.stringify(entry)).toBe(before);
  });

  it("refuses rather than compares when the account cannot be read at that ledger", async () => {
    const entry = await recorded();
    const r = await replayVerdict(entry, { account: null, credentials: [], reserve, unavailable: ["account state at ledger 107305907 (not held by the server)"] });
    expect(r.state).toBe("not-replayable");
  });

  it("an entry with no ledger index, or adjudicated offline, is not replayable, and says why", async () => {
    const entry = await recorded();
    expect(replayable({ ...entry, ledgerIndex: undefined })).toMatch(/ledger index/);
    expect(replayable({ ...entry, offline: true })).toMatch(/snapshot/);
  });
});
