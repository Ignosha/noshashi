import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { memory, rpc, notify, write } = vi.hoisted(() => ({
  memory: new Map<string, unknown>(),
  rpc: vi.fn(),
  notify: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@/lib/store", () => ({
  readSetting: async (k: string, fallback: unknown) =>
    memory.get(k) ?? fallback,
  writeSetting: write,
}));
vi.mock("@/lib/xrpl/client", () => ({
  isValidAddress: (a: string) =>
    typeof a === "string" && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a),
  rpc,
}));
vi.mock("../treasuryNotify", () => ({ notifyTreasury: notify }));
const address = "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX",
  dest = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const now = Date.parse("2026-11-04T12:00:00Z");
let ledger = 100;
const row = () => ({
  validated: true,
  ledger_index: 101,
  hash: "A".repeat(64),
  tx_json: {
    Account: address,
    Destination: dest,
    TransactionType: "Payment",
    Amount: "1000000000",
    Fee: "12",
    date: now / 1000 - 946684800,
  },
  meta: {
    TransactionIndex: 1,
    TransactionResult: "tesSUCCESS",
    delivered_amount: "1000000000",
    AffectedNodes: [
      {
        ModifiedNode: {
          LedgerEntryType: "AccountRoot",
          PreviousFields: { Balance: "10000000000" },
          FinalFields: { Account: address, Balance: "8999999988" },
        },
      },
    ],
  },
});
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  memory.clear();
  ledger = 100;
  vi.useFakeTimers();
  vi.setSystemTime(now);
  write.mockImplementation(async (k: string, v: unknown) =>
    memory.set(k, JSON.parse(JSON.stringify(v))),
  );
  notify.mockResolvedValue("permission_required");
  rpc.mockImplementation(async (c: string) =>
    c === "account_info"
      ? {
          validated: true,
          ledger_index: ledger,
          account_data: { Account: address, Balance: "10000000000" },
        }
      : c === "ledger"
        ? {
            validated: true,
            ledger_index: ledger,
            ledger_hash: "B".repeat(64),
            ledger: { close_time: now / 1000 - 946684800 },
          }
        : {
            validated: true,
            ledger_index_min: 101,
            ledger_index_max: ledger,
            transactions: [row()],
          },
  );
});
afterEach(() => vi.useRealTimers());
async function setup() {
  const s = await import("../treasuryStore");
  const { DEFAULT_TREASURY_POLICY } = await import("../treasury");
  await s.saveTreasuryWatch(
    {
      address,
      authorized: true,
      enabled: true,
      policy: {
        ...DEFAULT_TREASURY_POLICY,
        singleXrp: "1000",
        allowlist: [dest],
      },
    },
    3,
  );
  return s;
}
describe("functional local treasury monitoring", () => {
  it("arms once, flags a new validated payment, persists before notifying and deduplicates rereads", async () => {
    const s = await setup();
    await s.pollTreasury(3);
    expect(s.getTreasurySnapshot().monitors[address].cursor?.ledger).toBe(100);
    expect(notify).not.toHaveBeenCalled();
    ledger = 101;
    await s.pollTreasury(3);
    const snap = s.getTreasurySnapshot();
    expect(snap.alerts).toHaveLength(1);
    expect(snap.alerts[0].finding.kind).toBe("large_payment");
    expect(snap.notification).toBe("permission_required");
    expect((memory.get("security.treasury.v1") as any).alerts).toHaveLength(1);
    await s.pollTreasury(3);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(s.getTreasurySnapshot().alerts).toHaveLength(1);
  });
  it("records an unrecognized-payment review without sending or approving any transaction", async () => {
    const s = await setup();
    await s.pollTreasury(3);
    ledger = 101;
    await s.pollTreasury(3);
    rpc.mockClear();
    await s.reviewTreasuryAlert(
      s.getTreasurySnapshot().alerts[0].id,
      "not_recognized",
    );
    expect(s.getTreasurySnapshot().alerts[0].review).toBe("not_recognized");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("preserves the cursor and surfaces unavailable reads, without a notification storm", async () => {
    const s = await setup();
    await s.pollTreasury(3);
    rpc.mockRejectedValue(Error("node unavailable"));
    await s.pollTreasury(3);
    expect(s.getTreasurySnapshot().monitors[address]).toMatchObject({
      error: "node unavailable",
      cursor: { ledger: 100 },
      complete: false,
    });
    await s.pollTreasury(3);
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it("refuses corrupt saved state rather than claiming an empty safe queue", async () => {
    memory.set("security.treasury.v1", {
      schema: "wrong",
      watches: [],
      alerts: [{ bad: true }],
      monitors: {},
    });
    const s = await import("../treasuryStore");
    await s.pollTreasury(3);
    expect(s.getTreasurySnapshot().error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not continue monitoring when persistence cannot be confirmed", async () => {
    const s = await setup();
    await s.pollTreasury(3);
    write.mockResolvedValue(undefined);
    ledger = 101;
    await s.pollTreasury(3);
    expect(s.getTreasurySnapshot().error).toContain("storage");
    rpc.mockClear();
    await s.pollTreasury(3);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("pauses monitoring and enforces configured-address capacity", async () => {
    const s = await setup();
    await s.pauseTreasuryWatch(address);
    await s.pollTreasury(3);
    expect(rpc).not.toHaveBeenCalled();
    const { DEFAULT_TREASURY_POLICY } = await import("../treasury");
    await expect(
      s.saveTreasuryWatch(
        {
          address: dest,
          authorized: true,
          enabled: true,
          policy: DEFAULT_TREASURY_POLICY,
        },
        1,
      ),
    ).rejects.toThrow("1");
  });
  it("accepts reordered native JSON keys when confirming persistence", async () => {
    const reorder = (v: any): any =>
      Array.isArray(v)
        ? v.map(reorder)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, reorder(v[k])]),
            )
          : v;
    write.mockImplementation(async (k: string, v: unknown) =>
      memory.set(k, reorder(v)),
    );
    const s = await setup();
    await s.pollTreasury(3);
    expect(s.getTreasurySnapshot().error).toBeNull();
  });
});
