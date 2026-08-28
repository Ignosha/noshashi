import { describe, it, expect } from "vitest";
import {
  analyseIssuers,
  issuerFindings,
  analyseTravelRule,
  analyseConcentration,
  concentrationFindings,
} from "../risk";
import type { TrustLine, WalletTransaction, IssuerPosture } from "@/lib/xrpl/types";

/**
 * Issuer exposure, Travel Rule scope and counterparty concentration.
 *
 * All three are paid Desk capabilities and none had tests. The failure
 * shape they share is reading a present hazard as a future possibility, or
 * as nothing at all — a frozen balance described as freezable, a
 * settlement in scope reported as out of it.
 */

const line = (over: Partial<TrustLine> = {}): TrustLine => ({
  issuer: "rIssuer",
  currency: "USD",
  balance: 1_000,
  limit: 1_000_000,
  frozen: false,
  frozenByIssuer: false,
  noRipple: true,
  authorized: false,
  requiresAuth: false,
  ...over,
});

const posture = (over: Partial<IssuerPosture> = {}): IssuerPosture => ({
  address: "rIssuer",
  noFreeze: false,
  globalFreeze: false,
  requireAuth: false,
  masterDisabled: false,
  transferRateBps: 0,
  ...over,
});

const postures = (p: IssuerPosture = posture()) => new Map([[p.address, p]]);

describe("analyseIssuers — freeze posture", () => {
  it("ignores a zero-balance line, which carries no exposure", () => {
    expect(analyseIssuers([line({ balance: 0 })], postures())).toHaveLength(0);
  });

  it("reports an active global freeze as critical", () => {
    const [e] = analyseIssuers([line()], postures(posture({ globalFreeze: true })));
    expect(e.severity).toBe("critical");
    expect(e.headline).toMatch(/immobilised now/i);
  });

  it("reports a line the issuer has frozen as critical", () => {
    const [e] = analyseIssuers([line({ frozenByIssuer: true })], postures());
    expect(e.severity).toBe("critical");
  });

  it("reports a DEEP-frozen line as critical, not as a future possibility", () => {
    // XLS-77. This module read only frozenByIssuer, so a deep freeze with
    // no ordinary freeze came back "issuer retains the right to freeze" at
    // severity info — a total immobilisation described as a hazard.
    const [e] = analyseIssuers([line({ deepFrozenByIssuer: true })], postures());
    expect(e.severity).toBe("critical");
    expect(e.headline).toMatch(/deep-frozen/i);
    expect(e.headline).toMatch(/neither be sent nor added to/i);
  });

  it("distinguishes deep freeze from an ordinary one in the headline", () => {
    const [deep] = analyseIssuers([line({ deepFrozenByIssuer: true })], postures());
    const [ordinary] = analyseIssuers([line({ frozenByIssuer: true })], postures());
    expect(deep.headline).not.toBe(ordinary.headline);
  });

  it("treats a surrendered freeze right as genuinely safe", () => {
    const [e] = analyseIssuers([line()], postures(posture({ noFreeze: true })));
    expect(e.severity).toBe("ok");
    expect(e.headline).toMatch(/cannot be immobilised/i);
  });

  it("does NOT call an unreadable issuer safe", () => {
    // No posture supplied at all: the default must assume freeze is
    // possible, and say the posture is unknown rather than passing it.
    const [e] = analyseIssuers([line()], new Map());
    expect(e.severity).toBe("warn");
    expect(e.headline).toMatch(/could not be read/i);
    expect(e.posture.noFreeze).toBe(false);
  });

  it("sums balances per issuer and lists each currency once", () => {
    const [e] = analyseIssuers(
      [
        line({ balance: 100, currency: "USD" }),
        line({ balance: 250, currency: "EUR" }),
        line({ balance: 50, currency: "USD" }),
      ],
      postures()
    );
    expect(e.balance).toBe(400);
    expect(e.currencies.sort()).toEqual(["EUR", "USD"]);
  });

  it("sorts the worst exposure first, then by size", () => {
    const frozen = line({ issuer: "rFrozen", balance: 1 });
    const safe = line({ issuer: "rSafe", balance: 10_000 });
    const map = new Map([
      ["rFrozen", posture({ address: "rFrozen", globalFreeze: true })],
      ["rSafe", posture({ address: "rSafe", noFreeze: true })],
    ]);
    const out = analyseIssuers([safe, frozen], map);
    // A tiny frozen balance outranks a large safe one.
    expect(out[0].issuer).toBe("rFrozen");
  });

  it("produces a finding for a frozen exposure", () => {
    const findings = issuerFindings(
      analyseIssuers([line()], postures(posture({ globalFreeze: true })))
    );
    expect(findings.some((f) => f.severity === "critical")).toBe(true);
  });
});

const tx = (over: Partial<WalletTransaction> = {}): WalletTransaction => ({
  hash: "H1",
  transactionType: "Payment",
  result: "tesSUCCESS",
  ledgerIndex: 1,
  date: "2026-08-28",
  timestamp: 0,
  direction: "out",
  counterparty: "rOther",
  amountXrp: 5_000,
  feeXrp: "0.000012",
  ...over,
});

describe("analyseTravelRule — what falls in scope", () => {
  const config = { thresholdFiat: 3_000, currency: "USD", xrpRate: 0.5 };
  // 3,000 USD at 0.5 USD/XRP = 6,000 XRP.

  it("puts a transfer above the threshold in scope", () => {
    const r = analyseTravelRule([tx({ amountXrp: 7_000 })], config);
    expect(r.inScope).toHaveLength(1);
    expect(r.inScope[0].amountFiat).toBe(3_500);
  });

  it("leaves a transfer below the threshold out of scope", () => {
    expect(analyseTravelRule([tx({ amountXrp: 5_000 })], config).inScope).toHaveLength(0);
  });

  it("includes a transfer exactly at the threshold", () => {
    // At-threshold is in scope under FATF R.16, not below it.
    expect(analyseTravelRule([tx({ amountXrp: 6_000 })], config).inScope).toHaveLength(1);
  });

  it("excludes a cross entry, which is not a transfer between parties", () => {
    const r = analyseTravelRule([tx({ amountXrp: 7_000, direction: "cross" })], config);
    expect(r.inScope).toHaveLength(0);
    expect(r.totalConsidered).toBe(0);
  });

  it("marks a counterparty it holds no identity for as unresolved", () => {
    const r = analyseTravelRule([tx({ amountXrp: 7_000 })], config);
    expect(r.inScope[0].counterpartyUnknown).toBe(true);
    expect(r.unresolved).toBe(1);
  });

  it("does not mark a known counterparty unresolved", () => {
    const r = analyseTravelRule([tx({ amountXrp: 7_000 })], config, new Set(["rOther"]));
    expect(r.inScope[0].counterpartyUnknown).toBe(false);
    expect(r.unresolved).toBe(0);
  });

  it("sorts the largest in-scope transfer first", () => {
    const r = analyseTravelRule(
      [tx({ hash: "small", amountXrp: 7_000 }), tx({ hash: "big", amountXrp: 90_000 })],
      config
    );
    expect(r.inScope[0].hash).toBe("big");
  });

  it("puts nothing in scope when no reference rate is supplied", () => {
    // Documents current behaviour rather than endorsing it. With no rate
    // the threshold is Infinity, so a report comes back empty — which
    // reads as "no obligations" when the truth is "cannot be determined".
    // See the note in risk.ts; the UI must not present this as an all-clear.
    const r = analyseTravelRule([tx({ amountXrp: 1_000_000 })], { ...config, xrpRate: 0 });
    expect(r.inScope).toHaveLength(0);
    expect(r.thresholdXrp).toBe(Infinity);
  });
});

describe("analyseConcentration", () => {
  it("computes share and HHI over transferred volume", () => {
    const r = analyseConcentration([
      tx({ counterparty: "rA", amountXrp: 750 }),
      tx({ counterparty: "rB", amountXrp: 250 }),
    ]);
    expect(r.totalVolumeXrp).toBe(1_000);
    expect(r.topSharePct).toBeCloseTo(75, 6);
    // 75^2 + 25^2 = 5625 + 625 = 6250
    expect(r.hhi).toBe(6_250);
  });

  it("reaches 10,000 for a single counterparty", () => {
    const r = analyseConcentration([tx({ counterparty: "rOnly", amountXrp: 100 })]);
    expect(r.hhi).toBe(10_000);
  });

  it("ignores the placeholder counterparty", () => {
    const r = analyseConcentration([tx({ counterparty: "—", amountXrp: 500 })]);
    expect(r.counterparties).toHaveLength(0);
    expect(r.totalVolumeXrp).toBe(0);
  });

  it("splits inbound and outbound for the same counterparty", () => {
    const r = analyseConcentration([
      tx({ counterparty: "rA", amountXrp: 300, direction: "in" }),
      tx({ counterparty: "rA", amountXrp: 700, direction: "out" }),
    ]);
    expect(r.counterparties[0].inbound).toBe(300);
    expect(r.counterparties[0].outbound).toBe(700);
    expect(r.counterparties[0].transfers).toBe(2);
  });

  it("raises nothing on an empty book rather than dividing by zero", () => {
    const r = analyseConcentration([]);
    expect(r.hhi).toBe(0);
    expect(concentrationFindings(r)).toEqual([]);
  });
});

describe("concentrationFindings — thresholds", () => {
  const at = (hhi: number, topSharePct: number) =>
    concentrationFindings({
      counterparties: [
        { address: "rA", transfers: 1, volumeXrp: 1, sharePct: topSharePct, inbound: 0, outbound: 1 },
      ],
      totalVolumeXrp: 1,
      topSharePct,
      hhi,
    });

  it("stays quiet below the concentration threshold", () => {
    expect(at(2_400, 10).find((f) => f.id === "hhi")).toBeUndefined();
  });

  it("warns above 2,500 and escalates above 5,000", () => {
    expect(at(2_600, 10).find((f) => f.id === "hhi")?.severity).toBe("warn");
    expect(at(6_000, 10).find((f) => f.id === "hhi")?.severity).toBe("critical");
  });

  it("flags a counterparty at or above a quarter of volume", () => {
    expect(at(1_000, 25).find((f) => f.id === "dominant")).toBeDefined();
    expect(at(1_000, 24).find((f) => f.id === "dominant")).toBeUndefined();
  });
});
