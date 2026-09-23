import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  diffParams,
  judge,
  measure,
  policyHash,
  refOf,
  toChecks,
  validateParams,
  RULE_IDS,
  type Measurements,
  type PolicyFacts,
  type PolicyParams,
  type RuleKey,
} from "../institutional";
import { receiptDigest, runPolicy, verdictForChecks, type PermissionedDomain } from "@/lib/policy";
import { receiptToEntry } from "../ledger";
import { verifyEntry } from "../evidence";
import type { AccountInfo, IssuerPosture, TrustLine, WalletTransaction } from "@/lib/xrpl/types";

/**
 * Institutional policy rules. Each rule is checked below, at and above its
 * threshold and with its data missing, and complete verdicts are pinned as
 * regression fixtures so presentation changes can never alter them.
 *
 * Fixtures here are unit-test inputs to a pure function; nothing in this
 * file is shown to a user.
 */

const params = (over: Partial<PolicyParams> = {}): PolicyParams => ({
  hhiLimit: 2500,
  counterpartyShareLimitPct: 25,
  travelRule: { thresholdFiat: 1000, currency: "USD", xrpReferenceRate: 2 },
  reserveHeadroomMinXrp: 30,
  strictFreeze: true,
  outcomes: { hhi: "review", counterparty: "review", travelRule: "review", reserve: "review", freeze: "fail" },
  ...over,
});

const tx = (counterparty: string, amountXrp: number, ledgerIndex = 100): WalletTransaction => ({
  hash: `H${counterparty}${amountXrp}`,
  transactionType: "Payment",
  result: "tesSUCCESS",
  ledgerIndex,
  date: "",
  timestamp: 0,
  direction: "out",
  counterparty,
  amountXrp,
  feeXrp: "0.00001",
});

const account = (over: Partial<AccountInfo> = {}): AccountInfo => ({
  address: "rSubject",
  balanceXrp: "100",
  sequence: 5,
  ownerCount: 5,
  domain: "example.com",
  ...over,
});

const posture = (address: string, over: Partial<IssuerPosture> = {}): IssuerPosture => ({
  address,
  noFreeze: false,
  globalFreeze: false,
  requireAuth: false,
  masterDisabled: false,
  transferRateBps: 0,
  ...over,
});

const line = (issuer: string, balance = 10, over: Partial<TrustLine> = {}): TrustLine => ({
  issuer,
  currency: "USD",
  balance,
  limit: 1000,
  frozen: false,
  frozenByIssuer: false,
  noRipple: true,
  authorized: false,
  requiresAuth: false,
  ...over,
});

const facts = (over: Partial<PolicyFacts> = {}): PolicyFacts => ({
  amountXrp: 10,
  account: account(),
  reserve: { baseXrp: 1, incXrp: 0.2, source: "server_info" },
  transactions: [tx("rA", 50), tx("rB", 50)],
  trustLines: [],
  postures: [],
  ...over,
});

const result = (key: RuleKey, f: PolicyFacts, p: PolicyParams = params()) =>
  judge(measure(f), p).find((r) => r.key === key)!;

/** Two counterparties at shares a and b percent give HHI a² + b². */
const book = (a: number, b: number) => [tx("rA", a), tx("rB", b)];

describe("HHI limit", () => {
  // 50/50 → 5000; 30/70 → 5800; shares chosen to hit the limit exactly.
  it("passes below the limit", () => {
    expect(result("hhi", facts({ transactions: book(50, 50) }), params({ hhiLimit: 6000 })).state).toBe("PASS");
  });
  it("passes exactly at the limit", () => {
    const r = result("hhi", facts({ transactions: book(50, 50) }), params({ hhiLimit: 5000 }));
    expect(r.state).toBe("PASS");
    expect(r.observed).toBe("5,000");
    expect(r.delta).toBe("0");
  });
  it("triggers the configured outcome above the limit", () => {
    const r = result("hhi", facts({ transactions: book(30, 70) }), params({ hhiLimit: 5000 }));
    expect(r.state).toBe("REVIEW");
    expect(r.observed).toBe("5,800");
    expect(r.configured).toBe("5,000");
    expect(r.delta).toBe("+800");
    const fail = result("hhi", facts({ transactions: book(30, 70) }), params({ hhiLimit: 5000, outcomes: { ...params().outcomes, hhi: "fail" } }));
    expect(fail.state).toBe("FAIL");
  });
  it("is INSUFFICIENT DATA when history could not be read, never a failure", () => {
    const r = result("hhi", facts({ transactions: null }));
    expect(r.state).toBe("INSUFFICIENT_DATA");
    expect(r.observed).toBeNull();
  });
  it("is NOT APPLICABLE when there were no counterparty transfers", () => {
    expect(result("hhi", facts({ transactions: [] })).state).toBe("NOT_APPLICABLE");
  });
  it("counts this settlement toward the book when a destination is named", () => {
    const r = result("hhi", facts({ transactions: [tx("rA", 100)], destination: "rB", amountXrp: 100 }), params({ hhiLimit: 5000 }));
    expect(r.observed).toBe("5,000");
    expect(r.calculation).toContain("including this settlement");
  });
});

describe("Counterparty share", () => {
  it("passes below the limit", () => {
    expect(result("counterparty", facts({ transactions: book(20, 80) }), params({ counterpartyShareLimitPct: 90 })).state).toBe("PASS");
  });
  it("passes exactly at the limit", () => {
    expect(result("counterparty", facts({ transactions: book(20, 80) }), params({ counterpartyShareLimitPct: 80 })).state).toBe("PASS");
  });
  it("triggers above the limit, naming the counterparty and the delta", () => {
    const r = result("counterparty", facts({ transactions: book(20, 80) }), params({ counterpartyShareLimitPct: 75 }));
    expect(r.state).toBe("REVIEW");
    expect(r.observed).toBe("80%");
    expect(r.delta).toBe("+5 pts");
    expect(r.reason).toContain("rB");
  });
  it("looks at the destination when one is named", () => {
    const r = result("counterparty", facts({ transactions: book(20, 80), destination: "rA", amountXrp: 0 }), params({ counterpartyShareLimitPct: 25 }));
    expect(r.state).toBe("PASS");
    expect(r.reason).toContain("destination");
  });
  it("is INSUFFICIENT DATA when history could not be read", () => {
    expect(result("counterparty", facts({ transactions: null })).state).toBe("INSUFFICIENT_DATA");
  });
});

describe("Travel Rule threshold", () => {
  // Rate 2: 499 XRP → 998, 500 → 1000, 501 → 1002 against a 1,000 threshold.
  it("passes below the threshold", () => {
    expect(result("travelRule", facts({ amountXrp: 499 })).state).toBe("PASS");
  });
  it("is in scope exactly at the threshold", () => {
    const r = result("travelRule", facts({ amountXrp: 500 }));
    expect(r.state).toBe("REVIEW");
    expect(r.observed).toBe("1,000 USD");
  });
  it("is in scope above, with policy wording, never a legal claim", () => {
    const r = result("travelRule", facts({ amountXrp: 501 }));
    expect(r.state).toBe("REVIEW");
    expect(r.reason).toContain("configured institutional policy");
    expect(r.reason).toContain("not a determination that a legal obligation applies");
  });
  it("is NOT APPLICABLE with no amount, INSUFFICIENT without a reference rate", () => {
    expect(result("travelRule", facts({ amountXrp: 0 })).state).toBe("NOT_APPLICABLE");
    const noRate = params({ travelRule: { thresholdFiat: 1000, currency: "USD", xrpReferenceRate: null } });
    expect(result("travelRule", facts({ amountXrp: 501 }), noRate).state).toBe("INSUFFICIENT_DATA");
  });
});

describe("Reserve headroom", () => {
  // Balance 100, reserve 1 + 0.2×5 = 2, so headroom = 98 − amount.
  it("passes above the minimum", () => {
    expect(result("reserve", facts({ amountXrp: 60 })).state).toBe("PASS"); // 38 ≥ 30
  });
  it("passes exactly at the minimum", () => {
    const r = result("reserve", facts({ amountXrp: 68 }));
    expect(r.state).toBe("PASS");
    expect(r.observed).toBe("30 XRP");
  });
  it("triggers below the minimum", () => {
    const r = result("reserve", facts({ amountXrp: 69 }));
    expect(r.state).toBe("REVIEW");
    expect(r.delta).toBe("-1 XRP");
  });
  it("uses the live reserve values it was given", () => {
    const r = result("reserve", facts({ amountXrp: 0, reserve: { baseXrp: 10, incXrp: 2, source: "server_info" } }));
    expect(r.observed).toBe("80 XRP"); // 100 − (10 + 2×5)
  });
  it("is INSUFFICIENT DATA when reserve values are unavailable", () => {
    expect(result("reserve", facts({ reserve: null })).state).toBe("INSUFFICIENT_DATA");
  });
});

describe("Strict freeze", () => {
  const withIssuer = (p: Partial<IssuerPosture> = {}, l: Partial<TrustLine> = {}) =>
    facts({ trustLines: [line("rIssuer", 10, l)], postures: [posture("rIssuer", p)] });

  it("enabled + freeze capability detected → configured outcome", () => {
    const r = result("freeze", withIssuer());
    expect(r.state).toBe("FAIL");
    expect(r.observed).toContain("1 of 1 issuer can freeze");
  });
  it("enabled + no freeze capability → PASS", () => {
    expect(result("freeze", withIssuer({ noFreeze: true })).state).toBe("PASS");
  });
  it("disabled + freeze detected → the fact is shown, no verdict impact", () => {
    const r = result("freeze", withIssuer(), params({ strictFreeze: false }));
    expect(r.state).toBe("NOT_APPLICABLE");
    expect(r.observed).toContain("can freeze");
    expect(r.reason).toContain("no verdict impact");
    expect(toChecks([r], params({ strictFreeze: false }))).toEqual([]);
  });
  it("enabled + missing issuer information → INSUFFICIENT DATA", () => {
    expect(result("freeze", facts({ trustLines: null, postures: null })).state).toBe("INSUFFICIENT_DATA");
    expect(result("freeze", withIssuer({ unreadable: "timeout" })).state).toBe("INSUFFICIENT_DATA");
  });
  it("records a freeze already in effect", () => {
    expect(result("freeze", withIssuer({}, { frozenByIssuer: true })).observed).toContain("1 with a freeze in effect now");
  });
});

describe("aggregation through the engine's verdict rule", () => {
  it("REVIEW → HOLD, FAIL → NO-GO, INSUFFICIENT → INSUFFICIENT DATA, NOT APPLICABLE takes no part", () => {
    const p = params();
    const decide = (f: PolicyFacts) => verdictForChecks(toChecks(judge(measure(f), p), p));
    expect(decide(facts({ transactions: book(10, 10) }))).toBe("hold"); // HHI 5000 > 2500
    expect(decide(facts({ transactions: [], amountXrp: 1 }))).toBe("go");
    expect(decide(facts({ transactions: [], amountXrp: 1, trustLines: [line("rI")], postures: [posture("rI")] }))).toBe("no-go");
    expect(decide(facts({ transactions: null, amountXrp: 1 }))).toBe("insufficient-data");
  });
});

/* ── Regression fixtures: complete verdicts, pinned ───────────────── */

const fixtures: Array<{ name: string; facts: PolicyFacts; params: PolicyParams; expect: Record<RuleKey, string>; verdict: string }> = [
  {
    name: "fixture-001 concentrated book, freezable issuer",
    facts: facts({
      amountXrp: 400,
      account: account({ balanceXrp: "1000" }),
      transactions: [tx("rA", 683), tx("rB", 200), tx("rC", 117)],
      trustLines: [line("rI")],
      postures: [posture("rI")],
    }),
    params: params({ outcomes: { hhi: "review", counterparty: "fail", travelRule: "review", reserve: "review", freeze: "review" } }),
    expect: { hhi: "REVIEW", counterparty: "FAIL", travelRule: "PASS", reserve: "PASS", freeze: "REVIEW" },
    verdict: "no-go",
  },
  {
    name: "fixture-002 diversified, small transfer, no issued positions",
    facts: facts({
      amountXrp: 50,
      account: account({ balanceXrp: "500" }),
      transactions: [tx("rA", 10), tx("rB", 10), tx("rC", 10), tx("rD", 10), tx("rE", 10)],
    }),
    params: params(),
    expect: { hhi: "PASS", counterparty: "PASS", travelRule: "PASS", reserve: "PASS", freeze: "NOT_APPLICABLE" },
    verdict: "go",
  },
];

describe("regression fixtures", () => {
  for (const f of fixtures) {
    it(f.name, () => {
      const results = judge(measure(f.facts), f.params);
      const got = Object.fromEntries(results.map((r) => [r.key, r.state]));
      expect(got).toEqual(f.expect);
      expect(verdictForChecks(toChecks(results, f.params))).toBe(f.verdict);
    });
  }
});

/* ── Model: validation, canonical hash, diff ──────────────────────── */

describe("policy model", () => {
  it("rejects invalid values with a useful message", () => {
    const errs = validateParams(
      params({ hhiLimit: NaN, counterpartyShareLimitPct: 140, reserveHeadroomMinXrp: -1, travelRule: { thresholdFiat: Infinity, currency: "us", xrpReferenceRate: 0 } })
    );
    const fields = errs.map((e) => e.field).sort();
    expect(fields).toEqual(["counterpartyShareLimitPct", "hhiLimit", "reserveHeadroomMinXrp", "travelRule.currency", "travelRule.thresholdFiat", "travelRule.xrpReferenceRate"]);
    expect(errs.find((e) => e.field === "counterpartyShareLimitPct")!.message).toContain("100%");
    expect(validateParams(params())).toEqual([]);
  });

  it("hashes canonically: key order never changes the hash, any value change does", async () => {
    const a = { id: "p", name: "N", version: 1, params: params() };
    const reordered = JSON.parse(canonicalJson({ version: 1, params: params(), name: "N", id: "p" }));
    expect(await policyHash(a)).toBe(await policyHash(reordered));
    expect(await policyHash(a)).toMatch(/^[0-9A-F]{64}$/);
    expect(await policyHash({ ...a, params: params({ hhiLimit: 2501 }) })).not.toBe(await policyHash(a));
    expect(() => canonicalJson({ x: Infinity })).toThrow();
  });

  it("diffs versions field by field", () => {
    expect(diffParams(params(), params({ hhiLimit: 3000, strictFreeze: false }))).toEqual([
      { field: "hhiLimit", label: "HHI limit", from: "2,500", to: "3,000" },
      { field: "strictFreeze", label: "Strict freeze", from: "ON", to: "OFF" },
    ]);
  });
});

/* ── Receipts bind the policy; historical receipts stay valid ─────── */

const domain: PermissionedDomain = {
  id: "d-test", name: "TEST", code: "TEST", institution: "Test", requirements: [], transferCeilingXrp: 250_000, governance: "active", members: 1,
};

describe("receipt policy binding", () => {
  it("a receipt without a policy has exactly the digest it always had", async () => {
    const r = await runPolicy({ account: account(), credentials: [], domain, amountXrp: 10 });
    const legacy = await receiptDigest({ ...r, policy: undefined });
    expect(r.digest).toBe(legacy);
    expect(r.policy).toBeUndefined();
  });

  it("binds id, version, hash and engine into the digest", async () => {
    const p = params();
    const ref = refOf({ id: "policy_x", name: "X", version: 3, status: "active", params: p, hash: await policyHash({ id: "policy_x", name: "X", version: 3, params: p }), createdAt: "", updatedAt: "" });
    const f = facts();
    const results = judge(measure(f), p);
    const r = await runPolicy({ account: account(), credentials: [], domain, amountXrp: 10, policy: ref, policyChecks: toChecks(results, p) });
    expect(r.policy).toEqual(ref);
    expect(r.checks.some((c) => c.id === RULE_IDS.hhi)).toBe(true);
    // Claiming another policy version produced it breaks the digest.
    expect(await receiptDigest({ ...r, policy: { ...ref, version: 4 } })).not.toBe(r.digest);

    const entry = receiptToEntry(r, { domainCode: "TEST", measurements: measure(f), policyResults: results });
    expect(await verifyEntry(entry)).toEqual({ state: "verified", digest: r.digest });
    expect((await verifyEntry({ ...entry, policy: { ...ref, hash: "0".repeat(64) } })).state).toBe("mismatch");
  });

  it("a stored verdict keeps its recorded results whatever the current policy says", async () => {
    const p = params({ hhiLimit: 9000 });
    const f = facts({ transactions: book(50, 50) });
    const results = judge(measure(f), p);
    const r = await runPolicy({ account: account(), credentials: [], domain, amountXrp: 10, policy: { id: "a", name: "A", version: 1, hash: "H", engine: "1" }, policyChecks: toChecks(results, p) });
    const entry = receiptToEntry(r, { domainCode: "TEST", measurements: measure(f), policyResults: results });
    const stored = JSON.stringify(entry);
    // A stricter policy later decides the same facts differently…
    const later = judge(entry.measurements as Measurements, params({ hhiLimit: 100 }));
    expect(later.find((x) => x.key === "hhi")!.state).toBe("REVIEW");
    // …and the recorded entry is untouched.
    expect(JSON.stringify(entry)).toBe(stored);
    expect(entry.policyResults!.find((x) => x.key === "hhi")!.state).toBe("PASS");
  });
});
