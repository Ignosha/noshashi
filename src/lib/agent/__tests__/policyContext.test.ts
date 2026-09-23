import { describe, it, expect } from "vitest";
import { buildPolicyBrief, parseWhatIf, simulationFact } from "../policyContext";
import { judge, measure, refOf, toChecks, type InstitutionalPolicy, type PolicyParams } from "@/lib/desk/institutional";
import { runPolicy, type PermissionedDomain } from "@/lib/policy";
import { receiptToEntry } from "@/lib/desk/ledger";

const params = (over: Partial<PolicyParams> = {}): PolicyParams => ({
  hhiLimit: 2500,
  counterpartyShareLimitPct: 90,
  travelRule: { thresholdFiat: 1000, currency: "USD", xrpReferenceRate: 2 },
  reserveHeadroomMinXrp: null,
  strictFreeze: false,
  outcomes: { hhi: "review", counterparty: "review", travelRule: "review", reserve: "review", freeze: "fail" },
  ...over,
});
const policy = (p = params()): InstitutionalPolicy => ({
  id: "policy_settlement", name: "Institutional Settlement", version: 4, status: "active", params: p, hash: "A".repeat(64), createdAt: "", updatedAt: "", effectiveAt: "2026-09-23T14:02:00.000Z",
});
const domain: PermissionedDomain = { id: "d", name: "D", code: "D", institution: "D", requirements: [], transferCeilingXrp: 1e6, governance: "active", members: 1 };
const pay = (c: string, a: number) => ({ hash: c + a, transactionType: "Payment", result: "tesSUCCESS", ledgerIndex: 1, date: "", timestamp: 0, direction: "out" as const, counterparty: c, amountXrp: a, feeXrp: "0" });

async function entry(p: InstitutionalPolicy, txs: ReturnType<typeof pay>[]) {
  const acct = { address: "rS", balanceXrp: "1000", sequence: 2, ownerCount: 0, domain: "x.com" };
  const m = measure({ amountXrp: 10, account: acct, reserve: { baseXrp: 1, incXrp: 0.2, source: "server_info" }, transactions: txs, trustLines: [], postures: [] });
  const results = judge(m, p.params);
  const r = await runPolicy({ account: acct, credentials: [], domain, amountXrp: 10, policy: refOf(p), policyChecks: toChecks(results, p.params) });
  return receiptToEntry(r, { domainCode: "D", measurements: m, policyResults: results });
}

describe("parseWhatIf", () => {
  it("reads an explicit hypothetical change to a named rule", () => {
    const r = parseWhatIf("What happens if we increase the HHI limit to 3,000?", params());
    expect(r?.candidate.hhiLimit).toBe(3000);
    expect(r?.changes).toEqual([{ field: "hhiLimit", label: "HHI limit", from: "2,500", to: "3,000" }]);
    expect(parseWhatIf("what if counterparty share were 30%", params())?.candidate.counterpartyShareLimitPct).toBe(30);
    expect(parseWhatIf("simulate strict freeze on", params())?.candidate.strictFreeze).toBe(true);
  });
  it("runs nothing for a question that is not a hypothetical, or an invalid value", () => {
    expect(parseWhatIf("Why is the HHI 3000?", params())).toBeNull();
    expect(parseWhatIf("what if the HHI limit were 20000", params())).toBeNull();
    expect(parseWhatIf("what if we changed things", params())).toBeNull();
  });
});

describe("policy facts for the agent", () => {
  it("states the active policy and the latest verdict's recorded rule results", async () => {
    const p = policy();
    const e = await entry(p, [pay("rA", 60), pay("rB", 40)]);
    const brief = buildPolicyBrief(p, e);
    expect(brief).toContain("ACTIVE_POLICY: Institutional Settlement v4");
    expect(brief).toContain("LATEST_VERDICT: HOLD");
    expect(brief).toContain("POLICY RULE HHI limit: REVIEW · observed 5,200 · configured 2,500 · delta +2,700");
    expect(buildPolicyBrief(null, null)).toContain("ACTIVE_POLICY: none");
  });

  it("the simulation block carries the engine's numbers and says what it is", async () => {
    const p = policy();
    const entries = [await entry(p, [pay("rA", 60), pay("rB", 40)]), await entry(p, [pay("rA", 1), pay("rB", 1), pay("rC", 1), pay("rD", 1), pay("rE", 1)])];
    const parsed = parseWhatIf("what if the HHI limit were 6000?", p.params)!;
    const text = simulationFact(entries, p, parsed);
    expect(text).toContain("computed by the NOSHASHI deterministic policy engine, not by the model");
    expect(text).toContain("Dataset: 2 recorded verdicts");
    expect(text).toContain("HOLD: current 1 → simulated 0 (-1)");
    expect(text).toContain("HHI exceptions: 1 → 0");
    expect(text).toContain("does not change the active policy and is not a prediction");
  });
});
