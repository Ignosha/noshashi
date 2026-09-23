import { describe, it, expect } from "vitest";
import * as app from "@/lib/desk/institutional";
import type { PolicyParams } from "@/lib/desk/institutional";
import * as server from "../../../../supabase/functions/noshashi-policy-activate/policy";

/**
 * One policy, two runtimes.
 *
 * The app hashes and validates a draft (src/lib/desk/institutional.ts);
 * the activation function recomputes both on the server
 * (supabase/functions/noshashi-policy-activate/policy.ts) before the
 * database will activate it. If the two drift, every genuine policy is
 * refused as VALIDATION_FAILED, or — worse — the server accepts
 * parameters the app would reject. The Deno module is pure, so it is
 * executed here unmodified against the same inputs.
 */

const base: PolicyParams = {
  hhiLimit: 2500,
  counterpartyShareLimitPct: 40,
  travelRule: { thresholdFiat: 1000, currency: "USD", xrpReferenceRate: 0.52 },
  reserveHeadroomMinXrp: 20,
  strictFreeze: true,
  outcomes: { hhi: "review", counterparty: "review", travelRule: "review", reserve: "fail", freeze: "fail" },
};

const variants: Array<[string, unknown]> = [
  ["valid", base],
  ["all rules off", { ...base, hhiLimit: null, counterpartyShareLimitPct: null, travelRule: null, reserveHeadroomMinXrp: null, strictFreeze: false }],
  ["hhi too high", { ...base, hhiLimit: 10_001 }],
  ["hhi negative", { ...base, hhiLimit: -1 }],
  ["hhi NaN", { ...base, hhiLimit: Number.NaN }],
  ["hhi string", { ...base, hhiLimit: "2500" }],
  ["share zero", { ...base, counterpartyShareLimitPct: 0 }],
  ["share over 100", { ...base, counterpartyShareLimitPct: 100.5 }],
  ["travel no rate", { ...base, travelRule: { ...base.travelRule!, xrpReferenceRate: null } }],
  ["travel bad currency", { ...base, travelRule: { ...base.travelRule!, currency: "usd" } }],
  ["travel negative threshold", { ...base, travelRule: { ...base.travelRule!, thresholdFiat: -5 } }],
  ["reserve negative", { ...base, reserveHeadroomMinXrp: -0.1 }],
  ["freeze not boolean", { ...base, strictFreeze: "yes" }],
  ["bad outcome", { ...base, outcomes: { ...base.outcomes, reserve: "block" } }],
  ["outcomes missing", { ...base, outcomes: undefined }],
  ["everything wrong", { hhiLimit: 99_999, counterpartyShareLimitPct: -1, travelRule: { thresholdFiat: -1, currency: "x", xrpReferenceRate: 0 }, reserveHeadroomMinXrp: -1, strictFreeze: 1, outcomes: {} }],
];

describe("policy validation — app and activation function agree", () => {
  for (const [name, params] of variants) {
    it(name, () => {
      expect(server.validateParams(params)).toEqual(app.validateParams(params as PolicyParams));
    });
  }

  it("the server refuses malformed parameters instead of throwing", () => {
    for (const bad of [null, [], "params", 7]) {
      expect(server.validateParams(bad)).toEqual([{ field: "params", message: "Policy parameters are missing or malformed." }]);
    }
  });
});

describe("policy hash — app and activation function agree", () => {
  const policies = [
    { id: "policy_settlement", name: "Institutional Settlement", version: 1, params: base },
    { id: "policy_settlement", name: "Institutional Settlement", version: 2, params: { ...base, hhiLimit: 3000 } },
    { id: "treasury_ops", name: "Treasury — ops “desk”", version: 17, params: { ...base, travelRule: null } },
  ];

  for (const p of policies) {
    it(`${p.id} v${p.version}`, async () => {
      const [a, s] = await Promise.all([app.policyHash(p), server.policyHash(p)]);
      expect(s).toBe(a);
      expect(s).toMatch(/^[0-9A-F]{64}$/);
    });
  }

  it("key order in stored JSON does not change the hash", async () => {
    const reordered = JSON.parse(JSON.stringify({ outcomes: base.outcomes, strictFreeze: true, reserveHeadroomMinXrp: 20, travelRule: base.travelRule, counterpartyShareLimitPct: 40, hhiLimit: 2500 }));
    const p = { id: "policy_settlement", name: "Institutional Settlement", version: 1 };
    expect(await server.policyHash({ ...p, params: reordered })).toBe(await app.policyHash({ ...p, params: base }));
  });

  it("any parameter change changes the hash", async () => {
    const p = { id: "policy_settlement", name: "Institutional Settlement", version: 1 };
    const a = await server.policyHash({ ...p, params: base });
    const b = await server.policyHash({ ...p, params: { ...base, reserveHeadroomMinXrp: 21 } });
    expect(a).not.toBe(b);
  });

  it("engine versions match", () => {
    expect(server.POLICY_ENGINE_VERSION).toBe(app.POLICY_ENGINE_VERSION);
  });
});
