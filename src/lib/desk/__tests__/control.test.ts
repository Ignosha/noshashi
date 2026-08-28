import { describe, it, expect } from "vitest";
import {
  minimumSignersForQuorum,
  controlFindings,
  rippleTimeToDate,
  type ControlSurface,
  type SignerEntry,
} from "../control";
import { syncFindings, type SyncReport } from "@/lib/net/sync";

/**
 * Control surface and multi-node sync.
 *
 * The claim under test in the first half is "how few people can move this
 * treasury". Every wrong answer here is dangerous in the same direction: a
 * count of signers reads as safety, so an account with five signers where
 * one carries the whole quorum looks like a committee and behaves like a
 * single key. The tests below are built from that failure, not from the
 * happy path.
 *
 * The second half tests the opposite failure: crying wolf. Nodes sitting a
 * ledger or two apart are mid-close, and a sync tool that calls that
 * "divergence" every three seconds trains its operator to ignore it.
 */

const sig = (...weights: number[]): SignerEntry[] =>
  weights.map((weight, i) => ({ account: `rSigner${i}`, weight }));

describe("minimumSignersForQuorum — quorum is weight, not headcount", () => {
  it("returns 1 when one signer's weight alone meets quorum", () => {
    // Five signers. Looks like a committee. Is a single key.
    expect(minimumSignersForQuorum(sig(3, 1, 1, 1, 1), 3)).toBe(1);
  });

  it("returns the real count for an evenly weighted list", () => {
    // The mainnet case verified earlier: 3 signers, weights 1/1/1, quorum 2.
    expect(minimumSignersForQuorum(sig(1, 1, 1), 2)).toBe(2);
  });

  it("takes the heaviest first — order of the input must not matter", () => {
    expect(minimumSignersForQuorum(sig(1, 1, 5), 5)).toBe(1);
    expect(minimumSignersForQuorum(sig(5, 1, 1), 5)).toBe(1);
  });

  it("returns Infinity when the quorum can never be reached", () => {
    // Total weight 3 against a quorum of 10: the account cannot be signed
    // for at all. Reporting "3 signers" here would be actively misleading.
    expect(minimumSignersForQuorum(sig(1, 1, 1), 10)).toBe(Infinity);
  });

  it("handles an empty signer list without claiming anyone can sign", () => {
    expect(minimumSignersForQuorum([], 1)).toBe(Infinity);
  });

  it("needs every signer when quorum equals total weight", () => {
    expect(minimumSignersForQuorum(sig(1, 1, 1, 1), 4)).toBe(4);
  });
});

const surface = (over: Partial<ControlSurface> = {}): ControlSurface => ({
  address: "rTreasury",
  masterKeyEnabled: false,
  signers: {
    present: true,
    quorum: 2,
    signers: sig(1, 1, 1),
    totalWeight: 3,
    minimumSigners: 2,
    unilateralSigners: [],
  },
  ownerCount: 5,
  reserveLockedXrp: 3,
  reserveBaseXrp: 1,
  reserveIncrementXrp: 0.4,
  balanceXrp: 1_000,
  escrows: [],
  escrowedXrp: 0,
  truncated: false,
  ledgerIndex: 106_581_413,
  readAt: "2026-08-28T00:00:00Z",
  ...over,
});

describe("controlFindings — what a treasury actually requires to move", () => {
  it("raises the alarm when a signer list still resolves to one key", () => {
    const f = controlFindings(
      surface({
        signers: {
          present: true,
          quorum: 3,
          signers: sig(3, 1, 1, 1, 1),
          totalWeight: 7,
          minimumSigners: 1,
          unilateralSigners: ["rSigner0"],
        },
      })
    );
    const single = f.find((x) => x.id === "effective-single");
    expect(single).toBeDefined();
    expect(["critical", "warn"]).toContain(single!.severity);
  });

  it("does not raise that alarm for a genuine multi-party list", () => {
    const f = controlFindings(surface());
    expect(f.find((x) => x.id === "effective-single")).toBeUndefined();
    expect(f.find((x) => x.id === "quorum-ok")).toBeDefined();
  });

  it("flags a live master key as a bypass of the signer list", () => {
    // The signer list can be impeccable and irrelevant: the master key
    // signs alone regardless of quorum.
    const f = controlFindings(surface({ masterKeyEnabled: true }));
    const bypass = f.find((x) => x.id === "master-still-live");
    expect(bypass).toBeDefined();
    expect(bypass!.severity).toBe("critical");
  });

  it("reports an unreachable quorum rather than a signer count", () => {
    const f = controlFindings(
      surface({
        signers: {
          present: true,
          quorum: 10,
          signers: sig(1, 1, 1),
          totalWeight: 3,
          minimumSigners: Infinity,
          unilateralSigners: [],
        },
      })
    );
    expect(f.find((x) => x.id === "quorum-unreachable")).toBeDefined();
  });

  it("treats an account with no signer list as single-key", () => {
    const f = controlFindings(
      surface({
        signers: {
          present: false,
          quorum: 0,
          signers: [],
          totalWeight: 0,
          minimumSigners: 0,
          unilateralSigners: [],
        },
        masterKeyEnabled: true,
      })
    );
    expect(f.find((x) => x.id === "single-key")).toBeDefined();
  });

  it("says so when pagination means the counts are only a floor", () => {
    const f = controlFindings(surface({ truncated: true }));
    expect(f.find((x) => x.id === "truncated")).toBeDefined();
  });
});

describe("rippleTimeToDate — the 2000-01-01 epoch", () => {
  it("offsets from the Ripple epoch, not the Unix one", () => {
    // Ripple time 0 is 2000-01-01T00:00:00Z. Reading it as Unix time would
    // put every escrow thirty years early.
    expect(rippleTimeToDate(0).toISOString()).toBe("2000-01-01T00:00:00.000Z");
  });

  it("matches a known escrow FinishAfter", () => {
    // 1564704000 -> 2049-08-01, verified against a live escrow object.
    expect(rippleTimeToDate(1_564_704_000).toISOString().slice(0, 10)).toBe("2049-08-01");
  });
});

const node = (over: Partial<SyncReport["nodes"][number]> = {}) => ({
  url: "wss://example.com",
  reachable: true,
  roundTripMs: 100,
  ledgerSeq: 106_581_345,
  ledgerAge: 3,
  version: "3.3.0",
  serverState: "full",
  peers: 30,
  historyFrom: 32_570,
  ...over,
});

const sync = (over: Partial<SyncReport> = {}): SyncReport => ({
  nodes: [node(), node({ url: "wss://b.com" })],
  reachableCount: 2,
  leaderSeq: 106_581_345,
  spread: 0,
  fee: {
    source: "wss://example.com",
    pressure: 1,
    queueSize: 0,
    maxQueueSize: 15_400,
    expectedLedgerSize: 770,
    minimumFeeDrops: 10,
    openLedgerFeeDrops: 10,
  },
  readAt: "2026-08-28T00:00:00Z",
  ...over,
});

describe("syncFindings — divergence versus normal cadence", () => {
  it("does not call a one-ledger spread divergence", () => {
    // Ledgers close every 3-4s. Flagging this would cry wolf on every read.
    // The second node must really BE a ledger behind: a fixture that only
    // sets `spread` while both nodes report the same sequence tests nothing,
    // and let a threshold mutation through when this suite was first run.
    const f = syncFindings(
      sync({
        nodes: [node(), node({ url: "wss://b.com", ledgerSeq: 106_581_344 })],
        spread: 1,
      })
    );
    expect(f.find((x) => x.id === "node-lag")).toBeUndefined();
    expect(f.find((x) => x.id === "in-sync")?.severity).toBe("ok");
  });

  it("does not flag a node three ledgers back — still within cadence", () => {
    const f = syncFindings(
      sync({
        nodes: [node(), node({ url: "wss://b.com", ledgerSeq: 106_581_342 })],
        spread: 3,
      })
    );
    expect(f.find((x) => x.id === "node-lag")).toBeUndefined();
  });

  it("flags a node that is genuinely trailing", () => {
    const f = syncFindings(
      sync({
        nodes: [node(), node({ url: "wss://slow.com", ledgerSeq: 106_581_300 })],
        spread: 45,
      })
    );
    expect(f.find((x) => x.id === "node-lag")?.severity).toBe("warn");
    expect(f.find((x) => x.id === "in-sync")).toBeUndefined();
  });

  it("reports an undisclosed version as a choice, not as a fault", () => {
    // s1/s2.ripple.com redact build_version. That is not a gap.
    const f = syncFindings(
      sync({ nodes: [node(), node({ url: "wss://s1.ripple.com", version: undefined })] })
    );
    const und = f.find((x) => x.id === "undisclosed");
    expect(und?.severity).toBe("info");
    expect(und!.detail).toMatch(/not a fault/i);
  });

  it("blames this machine, not the ledger, when every node is unreachable", () => {
    const f = syncFindings(
      sync({
        nodes: [node({ reachable: false }), node({ url: "wss://b.com", reachable: false })],
        reachableCount: 0,
        leaderSeq: undefined,
        spread: undefined,
      })
    );
    const all = f.find((x) => x.id === "all-unreachable");
    expect(all?.severity).toBe("critical");
    expect(all!.detail).toMatch(/this machine/i);
  });

  it("reports fee pressure only when it is above the reference fee", () => {
    expect(syncFindings(sync()).find((x) => x.id === "fee-clear")?.severity).toBe("ok");
    const busy = syncFindings(
      sync({ fee: { ...sync().fee!, pressure: 12, openLedgerFeeDrops: 3_000 } })
    );
    expect(busy.find((x) => x.id === "fee-pressure")?.severity).toBe("warn");
  });

  it("flags an amendment-blocked node as unusable, not merely slow", () => {
    const f = syncFindings(
      sync({ nodes: [node(), node({ url: "wss://old.com", amendmentBlocked: true })] })
    );
    expect(f.find((x) => x.id === "amendment-blocked")?.severity).toBe("critical");
  });
});
