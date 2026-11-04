import { describe, expect, it } from "vitest";
import {
  DEFAULT_TREASURY_POLICY,
  treasuryPolicy,
  xrpDrops,
  formatDrops,
  treasuryFlow,
  evaluateTreasury,
  reviewTreasuryProposal,
  readTreasuryActivity,
  type TreasuryFlow,
} from "../treasury";
const address = "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX",
  dest = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const now = Date.parse("2026-11-04T12:00:00Z"),
  date = now / 1000 - 946684800;
const policy = () => ({
  ...DEFAULT_TREASURY_POLICY,
  singleXrp: "1000",
  windowXrp: "2000",
  balancePercent: 20,
  allowlist: [dest],
});
function row(
  drops = "1000000000",
  before = "10000000000",
  extra: Record<string, unknown> = {},
) {
  return {
    validated: true,
    ledger_index: 101,
    hash: "A".repeat(64),
    tx_json: {
      Account: address,
      Destination: dest,
      TransactionType: "Payment",
      Amount: drops,
      Fee: "12",
      date,
    },
    meta: {
      TransactionResult: "tesSUCCESS",
      TransactionIndex: 1,
      delivered_amount: drops,
      AffectedNodes: [
        {
          ModifiedNode: {
            LedgerEntryType: "AccountRoot",
            PreviousFields: { Balance: before },
            FinalFields: {
              Account: address,
              Balance: String(BigInt(before) - BigInt(drops) - 12n),
            },
          },
        },
      ],
    },
    ...extra,
  };
}
const flow = (
  hash: string,
  amount: string,
  destination = dest,
  at = now,
): TreasuryFlow => ({
  hash: hash.repeat(64),
  ledger: 101,
  at,
  destination,
  drops: xrpDrops(amount).toString(),
  beforeDrops: xrpDrops("1000000").toString(),
  feeDrops: "12",
  afterDrops: "1",
  transactionIndex: 1,
  type: "Payment",
});
describe("Treasury Guard evidence and exact amounts", () => {
  it("preserves exact large XRP/drop values and rejects invalid limits", () => {
    expect(xrpDrops("100000000000")).toBe(100000000000000000n);
    expect(formatDrops("100000000000000001")).toBe("100000000000.000001");
    for (const s of ["1e6", "-1", "0.0000001", "100000000001"])
      expect(() => xrpDrops(s)).toThrow();
    expect(() => treasuryPolicy({ ...policy(), windowMinutes: 0 })).toThrow();
  });
  it("uses actual delivered XRP and sender delta, never requested amount or fees", () => {
    const r = row();
    r.tx_json.Amount = "99999999999999999";
    expect(treasuryFlow(address, r).flow).toMatchObject({
      drops: "1000000000",
      feeDrops: "12",
      beforeDrops: "10000000000",
    });
    expect(treasuryFlow(address, row("5000000000")).flow?.drops).toBe(
      "5000000000",
    );
  });
  it("rejects incomplete, unvalidated, mismatched and unsupported payment evidence", () => {
    const base = row();
    for (const r of [
      { ...base, validated: false },
      { ...base, meta: { TransactionResult: "tesSUCCESS" } },
      { ...base, meta: { ...base.meta, delivered_amount: "999" } },
      { ...base, tx_json: { ...base.tx_json, Paths: [] } },
      {
        ...base,
        tx_json: { ...base.tx_json, TransactionType: "AccountDelete" },
      },
    ]) {
      expect(treasuryFlow(address, r).flow).toBeNull();
      expect(treasuryFlow(address, r).issue).toBeTruthy();
    }
  });
  it("ignores failed, incoming and self payments", () => {
    const base = row();
    expect(
      treasuryFlow(address, {
        ...base,
        meta: { ...base.meta, TransactionResult: "tecPATH_DRY" },
      }).issue,
    ).toBeNull();
    expect(
      treasuryFlow(address, {
        ...base,
        tx_json: { ...base.tx_json, Account: dest },
      }).flow,
    ).toBeNull();
  });
  it("accepts renamed API v2 DeliverMax without substituting requested value", () => {
    const r: any = row();
    r.tx_json.DeliverMax = r.tx_json.Amount;
    delete r.tx_json.Amount;
    delete r.tx_json.date;
    r.close_time_iso = new Date(now).toISOString();
    expect(treasuryFlow(address, r).flow?.drops).toBe("1000000000");
    r.close_time_iso = "invalid";
    expect(treasuryFlow(address, r).flow).toBeNull();
  });
});
describe("owner-configured bank-style flags", () => {
  it("flags inclusive single/balance thresholds and an unlisted destination", () => {
    const f = flow("A", "1000");
    f.beforeDrops = xrpDrops("5000").toString();
    expect(
      evaluateTreasury({ ...policy(), allowlist: [] }, [f], now).map(
        (f) => f.kind,
      ),
    ).toEqual(["large_payment", "balance_share", "unlisted_destination"]);
  });
  it("detects split payments across six destinations without requiring a large single payment", () => {
    const addresses = [
      dest,
      address,
      "rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ",
      "rDS6r59hQ3X95a2jeguAdTRMvC3b5xaMan",
      "rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN",
      "r3LQQNg7hEdbbNK3w4ykfLRDQWAc7xAmAn",
    ];
    const flows = addresses.map((a, i) =>
      flow(String(i + 1), "400", a, now + i * 1000),
    );
    const r = evaluateTreasury(
      { ...policy(), distinctDestinations: 6, flagUnlisted: false },
      flows,
      now + 6000,
    );
    expect(r.some((f) => f.kind === "large_payment")).toBe(false);
    const split = r.find((f) => f.kind === "split_transfers")!;
    expect(split.destinations).toHaveLength(6);
    expect(split.drops).toBe("2400000000");
  });
  it("deduplicates hashes, expires window members and preserves historical single flags", () => {
    const old = flow("A", "1000", dest, now - 7200000);
    expect(
      evaluateTreasury(policy(), [old, old, flow("B", "999")], now).filter(
        (f) => f.kind === "window_volume",
      ),
    ).toHaveLength(0);
    expect(
      evaluateTreasury(policy(), [old], now).some(
        (f) => f.kind === "large_payment",
      ),
    ).toBe(true);
  });
  it("does not retrigger a cumulative crossing for every subsequent transfer", () => {
    expect(
      evaluateTreasury(
        { ...policy(), flagUnlisted: false },
        [flow("A", "1100"), flow("B", "1100"), flow("C", "1100")],
        now,
      ).filter((f) => f.kind === "window_volume"),
    ).toHaveLength(1);
  });
});
describe("pre-sign advisory, never an approval", () => {
  const tx = {
    TransactionType: "Payment",
    Account: address,
    Destination: dest,
    Amount: "1000000000",
  };
  it("requires review at limits and keeps missing checks explicit", () => {
    const r = reviewTreasuryProposal(address, policy(), tx);
    expect(r.status).toBe("review_required");
    expect(r.unchecked.length).toBeGreaterThan(0);
    expect(r.limitation).toContain("No signing");
    expect(
      reviewTreasuryProposal(address, policy(), { ...tx, Amount: "1" }).status,
    ).toBe("no_static_rule_triggered");
  });
  it("refuses signed, cross-currency, partial, wrong-source and malformed proposals", () => {
    for (const change of [
      { TxnSignature: "signed" },
      { Signers: [] },
      { Account: dest },
      { Amount: { currency: "USD" } },
      { Flags: 131072 },
      { Paths: [] },
      { Amount: "0" },
    ])
      expect(() =>
        reviewTreasuryProposal(address, policy(), { ...tx, ...change }),
      ).toThrow();
  });
});
describe("bounded, pinned monitoring reads", () => {
  const anchor = {
    validated: true,
    ledger_index: 101,
    ledger_hash: "B".repeat(64),
    ledger: { close_time: date },
  };
  it("establishes a starting cursor without claiming historical coverage", async () => {
    const requests: string[] = [];
    const r = await readTreasuryActivity(
      address,
      null,
      async (c) => {
        requests.push(c);
        return c === "account_info"
          ? {
              validated: true,
              ledger_index: 101,
              account_data: { Account: address, Balance: "10000000000" },
            }
          : anchor;
      },
      now,
    );
    expect(r.cursor.ledger).toBe(101);
    expect(requests).toEqual(["ledger", "account_info"]);
    expect(r.rows).toEqual([]);
  });
  it("pins the account_tx upper bound and resumes a marker at the same scope", async () => {
    const calls: any[] = [];
    let i = 0;
    const r = await readTreasuryActivity(
      address,
      { ledger: 100 },
      async (c, p) => {
        calls.push(p);
        if (c === "ledger") return anchor;
        return {
          validated: true,
          ledger_index_min: 101,
          ledger_index_max: 101,
          transactions: [row()],
          marker: { page: ++i },
        };
      },
      now,
    );
    expect(r.complete).toBe(false);
    expect(r.cursor.ledger).toBe(100);
    expect(r.cursor.pending?.to).toBe(101);
    expect(calls.slice(1).every((p) => p.ledger_index_max === 101)).toBe(true);
    const resumed = await readTreasuryActivity(
      address,
      r.cursor,
      async (c, p) => {
        if (c === "ledger") return { ...anchor, ledger_index: 102 };
        expect(p!.ledger_index_max).toBe(101);
        expect(p!.marker).toEqual({ page: 4 });
        return {
          validated: true,
          ledger_index_min: 101,
          ledger_index_max: 101,
          transactions: [],
        };
      },
      now,
    );
    expect(resumed.cursor.ledger).toBe(101);
  });
  it("rejects stale nodes, unvalidated rows, missing coverage and repeated markers", async () => {
    await expect(
      readTreasuryActivity(
        address,
        null,
        async () => ({ ...anchor, validated: false }),
        now,
      ),
    ).rejects.toThrow("anchor");
    for (const page of [
      { transactions: [] },
      {
        validated: true,
        ledger_index_min: 101,
        ledger_index_max: 101,
        transactions: [row("1", "100", { validated: false })],
      },
      {
        validated: true,
        ledger_index_min: 101,
        ledger_index_max: 101,
        transactions: [row()],
        marker: { same: true },
      },
    ])
      await expect(
        readTreasuryActivity(
          address,
          { ledger: 100 },
          async (c) => (c === "ledger" ? anchor : page),
          now,
        ),
      ).rejects.toThrow();
  });
});
