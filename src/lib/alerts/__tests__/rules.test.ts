import { describe, it, expect } from "vitest";
import { describeRule, dueFirings, evaluate, sanitizeRules, type AlertRule, type MetricFacts } from "../rules";

const facts = (over: Partial<MetricFacts> = {}): MetricFacts => ({
  recovery_ratio: 0.9,
  freezable_share: 0.1,
  days_to_exit: 1,
  trapped_xrp: 0,
  mark_xrp: 10_000,
  frozen_positions: 0,
  freezable_positions: 1,
  ...over,
});

const rule = (over: Partial<AlertRule> = {}): AlertRule => ({
  id: "r1",
  name: "Book cannot be raised",
  conditions: [{ metric: "recovery_ratio", op: "<", threshold: 0.6 }],
  match: "all",
  scope: "all",
  destinations: ["console"],
  enabled: true,
  cooldownHours: 24,
  ...over,
});

const H = 3_600_000;

describe("evaluate", () => {
  it("tests each operator against the measured figure", () => {
    expect(evaluate(rule(), facts({ recovery_ratio: 0.59 }))).toBe(true);
    expect(evaluate(rule(), facts({ recovery_ratio: 0.6 }))).toBe(false);
    expect(evaluate(rule({ conditions: [{ metric: "recovery_ratio", op: "<=", threshold: 0.6 }] }), facts({ recovery_ratio: 0.6 }))).toBe(true);
    expect(evaluate(rule({ conditions: [{ metric: "days_to_exit", op: ">", threshold: 5 }] }), facts({ days_to_exit: 7 }))).toBe(true);
    expect(evaluate(rule({ conditions: [{ metric: "frozen_positions", op: ">=", threshold: 1 }] }), facts({ frozen_positions: 1 }))).toBe(true);
  });

  it("joins conditions with ALL or ANY", () => {
    const both = rule({
      conditions: [
        { metric: "recovery_ratio", op: "<", threshold: 0.6 },
        { metric: "freezable_share", op: ">", threshold: 0.25 },
      ],
    });
    const oneOnly = facts({ recovery_ratio: 0.5, freezable_share: 0.1 });
    expect(evaluate(both, oneOnly)).toBe(false);
    expect(evaluate({ ...both, match: "any" }, oneOnly)).toBe(true);
    expect(evaluate(both, facts({ recovery_ratio: 0.5, freezable_share: 0.4 }))).toBe(true);
  });

  it("never fires on a figure that was not measured", () => {
    expect(evaluate(rule(), facts({ recovery_ratio: Number.NaN }))).toBe(false);
    expect(evaluate(rule({ conditions: [{ metric: "recovery_ratio", op: ">", threshold: -1 }] }), facts({ recovery_ratio: Number.NaN }))).toBe(false);
  });
});

describe("dueFirings", () => {
  const wallets = [
    { address: "rA", label: "Treasury", facts: facts({ recovery_ratio: 0.4 }) },
    { address: "rB", facts: facts({ recovery_ratio: 0.95 }) },
  ];

  it("fires for each wallet in scope that breaches, with the measured values", () => {
    const { firings } = dueFirings([rule()], wallets, {}, 1_000);
    expect(firings.map((f) => f.address)).toEqual(["rA"]);
    expect(firings[0].values).toEqual([{ metric: "recovery_ratio", value: 0.4, threshold: 0.6, op: "<" }]);
    expect(firings[0].description).toBe("Recovery ratio below 60.0%");
  });

  it("stays quiet within the cooldown while the breach holds, then fires again", () => {
    const first = dueFirings([rule()], wallets, {}, 0);
    expect(dueFirings([rule()], wallets, first.lastFired, 23 * H).firings).toHaveLength(0);
    expect(dueFirings([rule()], wallets, first.lastFired, 24 * H).firings).toHaveLength(1);
  });

  it("re-arms at once when the breach clears", () => {
    const first = dueFirings([rule()], wallets, {}, 0);
    const cleared = dueFirings([rule()], [{ address: "rA", facts: facts({ recovery_ratio: 0.9 }) }], first.lastFired, H);
    expect(cleared.lastFired).toEqual({});
    expect(dueFirings([rule()], wallets, cleared.lastFired, 2 * H).firings).toHaveLength(1);
  });

  it("honours scope and paused rules", () => {
    expect(dueFirings([rule({ scope: ["rB"] })], wallets, {}, 0).firings).toHaveLength(0);
    expect(dueFirings([rule({ enabled: false })], wallets, {}, 0).firings).toHaveLength(0);
  });
});

describe("sanitizeRules", () => {
  it("keeps good rules and drops malformed ones", () => {
    const out = sanitizeRules([
      rule(),
      { id: "x", name: "", conditions: [] },
      { id: "y", name: "Bad metric", conditions: [{ metric: "price", op: "<", threshold: 1 }] },
      { id: "z", name: "Partial", conditions: [{ metric: "trapped_xrp", op: ">", threshold: 100 }, { metric: "x", op: "<", threshold: 1 }], destinations: ["pager"], cooldownHours: 9999 },
      null,
      "junk",
    ]);
    expect(out.map((r) => r.id)).toEqual(["r1", "z"]);
    expect(out[1].conditions).toHaveLength(1);
    expect(out[1].destinations).toEqual(["console"]);
    expect(out[1].cooldownHours).toBe(24);
  });

  it("survives anything stored", () => {
    for (const raw of [null, undefined, 3, "x", {}, [[]]]) expect(sanitizeRules(raw)).toEqual([]);
  });
});

describe("describeRule", () => {
  it("reads as a sentence in the metric's units", () => {
    expect(
      describeRule({
        match: "any",
        conditions: [
          { metric: "days_to_exit", op: ">=", threshold: 3 },
          { metric: "trapped_xrp", op: ">", threshold: 1500 },
        ],
      })
    ).toBe("Days to exit at or above 3.0 days or trapped value above 1,500 XRP");
  });
});
