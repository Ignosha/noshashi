import { describe, expect, it, vi } from "vitest";
import { liveTreasuryPreflight } from "../treasuryPreflight";
import { DEFAULT_TREASURY_POLICY } from "../treasury";
const source = "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX",
  destination = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
  now = Date.parse("2026-11-04T12:00:00Z");
const tx = () => ({
  TransactionType: "Payment",
  Account: source,
  Destination: destination,
  Amount: "100000000",
  Fee: "12",
  Sequence: 1,
  LastLedgerSequence: 120,
});
const policy = () => ({ ...DEFAULT_TREASURY_POLICY, allowlist: [destination] });
const request = async (c: string) =>
  c === "ledger"
    ? {
        validated: true,
        ledger_index: 100,
        ledger_hash: "A".repeat(64),
        ledger: { close_time: now / 1000 - 946684800 },
      }
    : c === "account_info"
      ? {
          validated: true,
          ledger_index: 100,
          account_data: {
            Account: source,
            Balance: "10000000000",
            Sequence: 1,
          },
        }
      : {
          validated: true,
          ledger_index_min: 1,
          ledger_index_max: 100,
          transactions: [],
        };
describe("live desktop treasury preflight", () => {
  it("reads the balance and complete requested window at one ledger, without issuing authorization", async () => {
    const calls: any[] = [];
    const r = await liveTreasuryPreflight(
      source,
      policy(),
      tx(),
      async (c, p) => {
        calls.push([c, p]);
        return request(c);
      },
      now,
    );
    expect(r.status).toBe("eligible_for_independent_review");
    expect(r.coverageComplete).toBe(true);
    expect(r.balanceDrops).toBe("10000000000");
    expect(calls[1][1].ledger_hash).toBe("A".repeat(64));
    expect(calls[2][1].ledger_index_max).toBe(100);
    expect(r.unchecked.join(" ")).toContain("Enforced hold");
    expect(r.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("flags excess balance, wrong sequence and expired ledger limits", async () => {
    const r = await liveTreasuryPreflight(
      source,
      policy(),
      { ...tx(), Amount: "11000000000", Sequence: 2, LastLedgerSequence: 99 },
      request,
      now,
    );
    expect(r.status).toBe("review_required");
    expect(r.reasons.join(" ")).toContain("exceeds");
    expect(r.reasons.join(" ")).toContain("Sequence");
    expect(r.reasons.join(" ")).toContain("expired");
  });
  it("keeps truncated history incomplete instead of assuming zero outflow", async () => {
    const r = await liveTreasuryPreflight(
      source,
      policy(),
      tx(),
      async (c) =>
        c === "account_tx"
          ? {
              validated: true,
              ledger_index_min: 50,
              ledger_index_max: 100,
              transactions: [],
            }
          : request(c),
      now,
    );
    expect(r.status).toBe("incomplete");
    expect(r.coverageComplete).toBe(false);
  });
  it("rejects mismatched anchors, signed/unsupported proposals and missing required fields", async () => {
    await expect(
      liveTreasuryPreflight(
        source,
        policy(),
        { ...tx(), TxnSignature: "signed" },
        request,
        now,
      ),
    ).rejects.toThrow();
    await expect(
      liveTreasuryPreflight(
        source,
        policy(),
        { ...tx(), Fee: "" },
        request,
        now,
      ),
    ).rejects.toThrow();
    await expect(
      liveTreasuryPreflight(
        source,
        policy(),
        tx(),
        async (c) =>
          c === "account_info"
            ? { ...(await request(c)), ledger_index: 99 }
            : request(c),
        now,
      ),
    ).rejects.toThrow("same ledger");
  });
  it("has a bounded unavailable-data state", async () => {
    vi.useFakeTimers();
    try {
      const run = liveTreasuryPreflight(
        source,
        policy(),
        tx(),
        () => new Promise(() => {}),
        now,
      );
      const check = expect(run).rejects.toThrow("deadline");
      await vi.advanceTimersByTimeAsync(12001);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });
});
