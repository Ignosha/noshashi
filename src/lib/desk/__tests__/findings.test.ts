import { describe, it, expect } from "vitest";
import { settlementFindings, interpretTransaction, type SettlementReport } from "../settlement";
import { issuanceFindings, type IssuanceReport } from "../issuance";
import {
  provenanceFindings,
  readControlEvents,
  type ProvenanceReport,
} from "../provenance";
import { ammFindings, type AmmReport } from "../amm";

/**
 * These functions make safety claims.
 *
 * "Only 0.4% of the requested amount arrived." "Concentration cannot be
 * measured." "Minimum signers: 1." An operator acts on those sentences, and
 * every one of them is a place where a plausible refactor could quietly
 * invert the meaning — a comparison flipped, a threshold moved, an early
 * return added. The build would stay green and the console would start
 * lying.
 *
 * So what is asserted here is not shape or coverage. It is the specific
 * dangerous case each module exists to catch, plus the cases where the
 * honest answer is to say nothing at all.
 */

const settlement = (over: Partial<SettlementReport> = {}): SettlementReport => ({
  hash: "A".repeat(64),
  validated: true,
  transactionType: "Payment",
  result: "tesSUCCESS",
  succeeded: true,
  account: "rSender",
  destination: "rDest",
  ledgerIndex: 100,
  feeDrops: 12,
  requested: { kind: "iou", currency: "LRC", issuer: "rIss", value: 999_332.87 },
  delivered: { kind: "iou", currency: "LRC", issuer: "rIss", value: 3_958.64 },
  deliveredUnavailable: false,
  partialFlagSet: true,
  deliveredFraction: 3_958.64 / 999_332.87,
  readAt: "2026-08-28T00:00:00Z",
  ...over,
});

describe("settlementFindings — the partial-payment vector", () => {
  it("raises CRITICAL on a tesSUCCESS payment that delivered a fraction", () => {
    // The real mainnet case: success code, 0.396% delivered.
    const f = settlementFindings(settlement());
    const shortfall = f.find((x) => x.id === "partial-shortfall");
    expect(shortfall).toBeDefined();
    expect(shortfall!.severity).toBe("critical");
    expect(shortfall!.title).toContain("0.3961%");
    // It must tell the operator what to credit, not merely that it is odd.
    expect(shortfall!.action).toMatch(/delivered_amount/);
  });

  it("never reports a shortfall as settled-in-full", () => {
    const f = settlementFindings(settlement());
    expect(f.find((x) => x.id === "settled")).toBeUndefined();
    expect(f.some((x) => x.severity === "ok")).toBe(false);
  });

  it("treats an unrecorded delivered_amount as unknown, never as zero", () => {
    const f = settlementFindings(
      settlement({ deliveredUnavailable: true, delivered: undefined, deliveredFraction: undefined })
    );
    const unavailable = f.find((x) => x.id === "delivered-unavailable");
    expect(unavailable).toBeDefined();
    // Must not claim a shortfall it cannot compute.
    expect(f.find((x) => x.id === "partial-shortfall")).toBeUndefined();
    expect(unavailable!.detail).toMatch(/not zero/i);
  });

  it("refuses to describe an unvalidated transaction as settled", () => {
    const f = settlementFindings(settlement({ validated: false }));
    const nv = f.find((x) => x.id === "not-validated");
    expect(nv?.severity).toBe("critical");
    expect(f[0].id).toBe("not-validated"); // ranked first
  });

  it("reports a full delivery as settled when the flag is absent", () => {
    const f = settlementFindings(
      settlement({
        partialFlagSet: false,
        delivered: { kind: "iou", currency: "LRC", issuer: "rIss", value: 999_332.87 },
        deliveredFraction: 1,
      })
    );
    expect(f.find((x) => x.id === "settled")?.severity).toBe("ok");
  });

  it("still warns when the partial flag is set but delivery was complete", () => {
    // The flag is a property of the instruction, not of this outcome — the
    // same sender can deliver less next time under the same flag.
    const f = settlementFindings(settlement({ deliveredFraction: 1, delivered: { kind: "iou", currency: "LRC", issuer: "rIss", value: 999_332.87 } }));
    expect(f.find((x) => x.id === "partial-full")?.severity).toBe("warn");
  });

  it("does not treat a non-Payment's missing delivery as a delivery of nothing", () => {
    const f = settlementFindings(
      settlement({ transactionType: "OfferCreate", requested: undefined, delivered: undefined, deliveredFraction: undefined, partialFlagSet: false })
    );
    expect(f.find((x) => x.id === "not-payment")).toBeDefined();
    expect(f.find((x) => x.id === "partial-shortfall")).toBeUndefined();
  });
});

const issuance = (coverage: number, hhi: number): IssuanceReport => ({
  issuer: "rIssuer",
  currencies: [
    {
      currency: "USD",
      outstanding: 8_095_033,
      observedHeld: 8_095_033 * coverage,
      holders: 1_712,
      activeHolders: 576,
      hhi,
      topHolderPct: 0.436,
      topFivePct: 0.738,
      frozenSeen: 0,
      authorizedSeen: 0,
      coverage,
      top: [],
    },
  ],
  linesWalked: 20_000,
  truncated: true,
  requiresAuth: false,
  canFreeze: true,
  globalFreeze: false,
  ledgerIndex: 106_581_413,
  readAt: "2026-08-28T00:00:00Z",
});

describe("issuanceFindings — coverage gates every concentration claim", () => {
  it("withholds concentration entirely when coverage is far below the floor", () => {
    // The real defect this catches: an HHI of 2,205 computed over 0.5% of
    // supply was being reported as "holdings are distributed" at severity ok.
    const f = issuanceFindings(issuance(0.005, 2_205));
    expect(f.find((x) => x.id === "hhi-ok-USD")).toBeUndefined();
    expect(f.find((x) => x.id === "hhi-USD")).toBeUndefined();
    const unknown = f.find((x) => x.id === "hhi-unknown-USD");
    expect(unknown?.severity).toBe("warn");
    expect(unknown!.title).toMatch(/cannot be measured/i);
  });

  it("withholds a HIGH reading on thin coverage too, not just a low one", () => {
    // Partial-walk error has no known direction: a red finding on 0.5% of
    // supply is as unfounded as a green one.
    const f = issuanceFindings(issuance(0.005, 8_000));
    expect(f.find((x) => x.id === "hhi-USD")).toBeUndefined();
    expect(f.find((x) => x.id === "hhi-unknown-USD")).toBeDefined();
  });

  it("reports concentration once coverage is adequate", () => {
    const f = issuanceFindings(issuance(0.99, 5_875));
    const hhi = f.find((x) => x.id === "hhi-USD");
    expect(hhi?.severity).toBe("critical");
  });

  it("gives a clean all-clear only on adequate coverage AND low concentration", () => {
    const f = issuanceFindings(issuance(0.99, 800));
    expect(f.find((x) => x.id === "hhi-ok-USD")?.severity).toBe("ok");
  });
});

const provenance = (over: Partial<ProvenanceReport> = {}): ProvenanceReport => ({
  address: "rAcct",
  balanceXrp: 33.21,
  ownerCount: 1,
  sequence: 92_835_117,
  originLedger: 92_835_117,
  originDate: new Date("2024-12-17T16:06:00Z"),
  originType: "AMMCreate",
  approxSentCount: 0,
  historyIncomplete: false,
  nodeHistoryFrom: 32_570,
  ageDays: 618,
  controlEvents: [],
  controlHistoryPartial: false,
  readAt: "2026-08-28T00:00:00Z",
  ...over,
});

describe("provenanceFindings — the sequence-is-not-a-count trap", () => {
  it("explains a ledger-seeded sequence rather than reporting it as activity", () => {
    // Real account: Sequence 92,835,117, created at ledger 92,835,117,
    // zero transactions actually sent.
    const f = provenanceFindings(provenance());
    const activity = f.find((x) => x.id === "activity");
    expect(activity).toBeDefined();
    expect(activity!.title).toContain("0 transactions");
    expect(activity!.detail).toMatch(/not a count/i);
  });

  it("counts upward from one for a pre-seeding account", () => {
    const f = provenanceFindings(
      provenance({ sequence: 4_827, originLedger: 242_756, approxSentCount: 4_826 })
    );
    expect(f.find((x) => x.id === "activity")!.title).toContain("4,826");
  });

  it("reports age as a floor when the node's history may not reach the origin", () => {
    const f = provenanceFindings(
      provenance({ historyIncomplete: true, nodeHistoryFrom: 90_000_000 })
    );
    const inc = f.find((x) => x.id === "history-incomplete");
    expect(inc?.severity).toBe("warn");
    // And it must NOT also assert an established age.
    expect(f.find((x) => x.id === "established")).toBeUndefined();
  });
});

const amm = (over: Partial<AmmReport> = {}): AmmReport => ({
  account: "rAmm",
  pair: "XRP / MTG",
  tradingFeePct: 1,
  participation: 0.00345,
  votes: [
    { account: "rWhale", votedFeePct: 1, weightOfSupply: 0.00345, weightOfCast: 1 },
  ],
  auction: undefined,
  lpTokenSupply: 156_546_816,
  assetFrozen: undefined,
  asset2Frozen: false,
  ledgerCloseTime: new Date("2026-08-28T00:00:00Z"),
  ledgerIndex: 106_581_413,
  readAt: "2026-08-28T00:00:00Z",
  ...over,
});

describe("ammFindings — governance capture and thin participation", () => {
  it("flags a single account controlling the whole vote", () => {
    const f = ammFindings(amm());
    const capture = f.find((x) => x.id === "vote-capture");
    expect(capture?.severity).toBe("critical");
  });

  it("separately flags that the fee rests on a fraction of the liquidity", () => {
    // 100% of votes cast, but only 0.345% of LP supply voted at all. Those
    // are two different findings and both matter.
    const f = ammFindings(amm());
    expect(f.find((x) => x.id === "thin-participation")?.severity).toBe("warn");
  });

  it("does not report an expired auction slot as an active discount", () => {
    const f = ammFindings(
      amm({
        auction: {
          holder: "rHolder",
          discountedFeePct: 0.1,
          expiresAt: new Date("2024-12-18T16:05:51Z"),
          expired: true,
          pricePaid: 0,
          authAccounts: [],
        },
      })
    );
    expect(f.find((x) => x.id === "auction-active")).toBeUndefined();
    expect(f.find((x) => x.id === "auction-expired")?.severity).toBe("info");
  });

  it("flags an active auction slot as an asymmetry", () => {
    const f = ammFindings(
      amm({
        auction: {
          holder: "rHolder",
          discountedFeePct: 0.1,
          expiresAt: new Date("2027-01-01T00:00:00Z"),
          expired: false,
          pricePaid: 0,
          authAccounts: [],
        },
      })
    );
    expect(f.find((x) => x.id === "auction-active")?.severity).toBe("warn");
  });

  it("does not claim XRP is unfrozen when freezing does not apply to it", () => {
    // assetFrozen is undefined for XRP: not-applicable, not false.
    const f = ammFindings(amm({ assetFrozen: undefined }));
    expect(f.some((x) => String(x.id).startsWith("frozen-"))).toBe(false);
  });
});

/**
 * Parsing tests, added because a mutation exposed their absence.
 *
 * Setting `deliveredUnavailable` to a constant `false` — silently treating
 * an unrecorded delivery as a recorded one — passed all nineteen tests
 * above. Every one of them hand-built its report and none went through the
 * parsing, so the layer that actually reads the ledger was the layer with
 * no coverage. These use real response shapes captured from mainnet.
 */
describe("interpretTransaction — reading the raw response", () => {
  it("maps a literal 'unavailable' delivered_amount to unknown, not zero", () => {
    const r = interpretTransaction({
      validated: true,
      ledger_index: 5_000_000,
      TransactionType: "Payment",
      Account: "rA",
      Destination: "rB",
      Amount: "322366649",
      Fee: "10",
      Flags: 0,
      meta: { TransactionResult: "tesSUCCESS", delivered_amount: "unavailable" },
    });
    expect(r.deliveredUnavailable).toBe(true);
    expect(r.delivered).toBeUndefined();
    // Critically: no fabricated fraction from a missing numerator.
    expect(r.deliveredFraction).toBeUndefined();
  });

  it("reads the real partial-payment shape and computes the shortfall", () => {
    // Captured from mainnet tx B76F0202…, 0.396% delivered on tesSUCCESS.
    const r = interpretTransaction({
      validated: true,
      ledger_index: 106_581_413,
      TransactionType: "Payment",
      Account: "rhTsmUJFpiju7syo8V5UbCQoaJjKWSvZju",
      Destination: "rhTsmUJFpiju7syo8V5UbCQoaJjKWSvZju",
      DeliverMax: { currency: "LRC", issuer: "rE1Sw", value: "999332.8758813435" },
      Amount: { currency: "LRC", issuer: "rE1Sw", value: "999332.8758813435" },
      Fee: "12",
      Flags: 131072, // tfPartialPayment
      meta: {
        TransactionResult: "tesSUCCESS",
        delivered_amount: { currency: "LRC", issuer: "rE1Sw", value: "3958.6406220523" },
      },
    });
    expect(r.partialFlagSet).toBe(true);
    expect(r.deliveredFraction).toBeCloseTo(0.003961, 6);
    expect(settlementFindings(r).find((f) => f.id === "partial-shortfall")?.severity).toBe(
      "critical"
    );
  });

  it("does not treat an unvalidated response as validated", () => {
    const r = interpretTransaction({
      TransactionType: "Payment",
      Account: "rA",
      Amount: "1000",
      meta: { TransactionResult: "tesSUCCESS", delivered_amount: "1000" },
    });
    expect(r.validated).toBe(false);
  });

  it("refuses to compare amounts across different currencies", () => {
    // A cross-currency payment: requested USD, delivered EUR. A ratio
    // between them would be a number with no meaning.
    const r = interpretTransaction({
      validated: true,
      TransactionType: "Payment",
      Account: "rA",
      Amount: { currency: "USD", issuer: "rIss", value: "100" },
      Fee: "10",
      Flags: 131072,
      meta: {
        TransactionResult: "tesSUCCESS",
        delivered_amount: { currency: "EUR", issuer: "rIss", value: "90" },
      },
    });
    expect(r.deliveredFraction).toBeUndefined();
  });

  it("reads XRP drops as XRP, not as a raw integer", () => {
    const r = interpretTransaction({
      validated: true,
      TransactionType: "Payment",
      Account: "rA",
      Amount: "319847",
      Fee: "12",
      Flags: 131072,
      meta: { TransactionResult: "tesSUCCESS", delivered_amount: "213231" },
    });
    expect(r.requested).toEqual({ kind: "xrp", drops: 319_847, value: 0.319847 });
    expect(r.deliveredFraction).toBeCloseTo(0.666666, 5);
  });
});

/**
 * Control-change forensics.
 *
 * These events are rare — 7,965 consecutive mainnet transactions on
 * 2026-08-28 contained no SetRegularKey and no SignerListSet at all — and
 * that rarity is what makes each one worth surfacing rather than what
 * makes it unimportant.
 *
 * The finding that matters combines two facts, neither suspicious alone:
 * an account established for years, whose signing authority moved days
 * ago. Businesses rotate keys and dormant accounts wake up; it is the
 * conjunction that looks like a stolen key.
 */
describe("readControlEvents and the findings over them", () => {
  const A = "rSubject";
  const tx = (over: Record<string, any> = {}) => ({
    ledger_index: 1_000,
    tx_json: { Account: A, date: 800_000_000, ...over },
  });

  it("reads a regular key being assigned and removed differently", () => {
    const events = readControlEvents(
      [
        tx({ TransactionType: "SetRegularKey", RegularKey: "rOther", date: 100 }),
        tx({ TransactionType: "SetRegularKey", date: 200 }), // no RegularKey = removed
      ],
      A
    );
    expect(events.map((e) => e.kind)).toEqual(["regular-key-set", "regular-key-removed"]);
  });

  it("treats a zero quorum as the signer list being deleted", () => {
    // SignerListSet with SignerQuorum 0 removes the list rather than
    // configuring one — reading it as "configured" would report the
    // removal of multi-party approval as its introduction.
    const [e] = readControlEvents(
      [tx({ TransactionType: "SignerListSet", SignerQuorum: 0 })],
      A
    );
    expect(e.kind).toBe("signer-list-removed");
  });

  it("reads the master key flag in both directions", () => {
    const events = readControlEvents(
      [
        tx({ TransactionType: "AccountSet", SetFlag: 4 }),
        tx({ TransactionType: "AccountSet", ClearFlag: 4 }),
      ],
      A
    );
    expect(events.map((e) => e.kind)).toEqual([
      "master-key-disabled",
      "master-key-enabled",
    ]);
  });

  it("ignores an AccountSet that changes no control flag", () => {
    // Setting a Domain is an AccountSet too, and is not a control change.
    expect(readControlEvents([tx({ TransactionType: "AccountSet", SetFlag: 5 })], A)).toEqual(
      []
    );
  });

  it("ignores transactions sent BY someone else", () => {
    // Only the account acting on itself changes its own control.
    expect(
      readControlEvents(
        [tx({ TransactionType: "SetRegularKey", RegularKey: "x", Account: "rStranger" })],
        A
      )
    ).toEqual([]);
  });

  it("raises a warning only when an OLD account changes control RECENTLY", () => {
    const recent = new Date(Date.now() - 3 * 86_400_000);
    const event = {
      ledgerIndex: 9,
      at: recent,
      kind: "regular-key-set" as const,
      label: "A regular key was assigned",
    };
    // Old account, recent change -> warn.
    const alarming = provenanceFindings(
      provenance({ ageDays: 2_000, controlEvents: [event] })
    ).find((f) => f.id === "control-changed");
    expect(alarming?.severity).toBe("warn");
    expect(alarming!.action).toMatch(/does not depend on this account/i);

    // Young account, same recent change -> info, no alarm.
    const ordinary = provenanceFindings(
      provenance({ ageDays: 10, controlEvents: [event] })
    ).find((f) => f.id === "control-changed");
    expect(ordinary?.severity).toBe("info");
  });

  it("does not claim stability it cannot prove from a partial walk", () => {
    const partial = provenanceFindings(
      provenance({ controlEvents: [], controlHistoryPartial: true })
    ).find((f) => f.id === "control-stable");
    expect(partial!.detail).toMatch(/not a guarantee/i);

    const complete = provenanceFindings(
      provenance({ controlEvents: [], controlHistoryPartial: false })
    ).find((f) => f.id === "control-stable");
    expect(complete!.detail).toMatch(/controlled it at the start controls it now/i);
  });

  it("flags approval requirements being removed", () => {
    const f = provenanceFindings(
      provenance({
        controlEvents: [
          { ledgerIndex: 1, kind: "signer-list-removed", label: "The signer list was deleted" },
        ],
      })
    );
    expect(f.find((x) => x.id === "control-weakened")?.severity).toBe("warn");
  });
});
