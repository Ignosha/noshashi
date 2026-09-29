import { describe, expect, it } from "vitest";
import cases from "./agreement.cases.json";
import { agreementCheck, offlineAgreementCheck, readingFromReplies, summarize, type AgreementReport } from "../agreement";
import { evaluatePolicy, verdictForChecks, DOMAIN_REGISTRY, type PolicyCheck } from "@/lib/policy";
import type { AccountInfo } from "@/lib/xrpl/types";

/**
 * The SOURCE_AGREEMENT rule, on real mainnet replies from three public nodes
 * at ledger 107,305,907. The disagreement case pairs two real readings from
 * different ledgers under one index, which is exactly what a node serving a
 * different chain (or a stale or tampered node) would return.
 */

const L = cases.ledger_107305907 as Record<string, any>;
const B = cases.bitstamp_107305907 as Record<string, any>;
const NODES = ["https://xrplcluster.com/", "https://s2.ripple.com:51234/", "https://xrpl.ws/"];

const bitstamp: AccountInfo = { address: "rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1", balanceXrp: "200.00", sequence: 60300, ownerCount: 37 };

function report(sources: AgreementReport["sources"]): AgreementReport {
  return { ledgerIndex: 107_305_907, sources, readAt: "2026-09-29T02:50:30Z" };
}

const agreed = report(NODES.map((u) => readingFromReplies(u, L[u], B[u])));

describe("reading a node's replies", () => {
  it("takes the ledger hash and AccountRoot from real replies", () => {
    const r = readingFromReplies(NODES[0], L[NODES[0]], B[NODES[0]]);
    expect(r.ledgerHash).toBe("3334A8AD946A8E07C08FE66B9E66BF0E12D5DEFA1689CD44E9DADBD01CAB2784");
    expect(r.account).toEqual({ balanceDrops: "200000021", sequence: 60300, ownerCount: 37, flags: 131072, previousTxnId: "9EC02A92353CCAC1DA0A4BAAB90B19FCB1891C9AEAECD82DB0D4FD9F54C69A2F" });
  });

  it("keeps an error reply as an error, not as an absent account", () => {
    const r = readingFromReplies(NODES[0], L[NODES[0]], (cases.malformed as any)[NODES[0]]);
    expect(r.account).toBeUndefined();
    expect(r.error).toBe("actMalformed");
  });

  it("refuses a ledger reply that is not validated", () => {
    const r = readingFromReplies(NODES[0], { result: { status: "error", error: "lgrNotFound" } }, B[NODES[0]]);
    expect(r.ledgerHash).toBeUndefined();
    expect(r.error).toBe("lgrNotFound");
  });
});

describe("SOURCE_AGREEMENT", () => {
  it("passes when three nodes return the same ledger hash and account state that the verdict used", () => {
    expect(summarize(agreed, bitstamp)).toMatchObject({ outcome: "agreed", agreeing: 3, answered: 3 });
    const c = agreementCheck(agreed, bitstamp);
    expect(c.passed).toBe(true);
    expect(c.detail).toContain("3 of 3 public nodes returned ledger hash 3334A8AD946A8E07");
  });

  it("holds when one node returns a different ledger under the same index", () => {
    const other = cases.ledger_107305906 as Record<string, any>;
    const split = report([
      agreed.sources[0],
      agreed.sources[1],
      readingFromReplies(NODES[2], other["https://xrplcluster.com/"], B[NODES[2]]),
    ]);
    expect(summarize(split, bitstamp)).toMatchObject({ outcome: "disagreed", agreeing: 2 });
    const c = agreementCheck(split, bitstamp);
    expect(c.passed).toBe(false);
    expect(c.severity).toBe("warn");
    expect(c.detail).toContain("No GO is issued while sources disagree");
  });

  it("holds when only one node answered", () => {
    const lone = report([agreed.sources[0], { url: NODES[1], error: "no answer within 8s" }, { url: NODES[2], error: "connection refused or blocked" }]);
    expect(summarize(lone, bitstamp).outcome).toBe("uncorroborated");
    expect(agreementCheck(lone, bitstamp).detail).toContain("Only 1 of 3");
  });

  it("holds when the nodes agree on state the verdict did not use: the account moved after it was read", () => {
    const s = cases.sender as Record<string, any>;
    const before = s.at_107305906.result.account_data;
    const used: AccountInfo = { address: before.Account, balanceXrp: (Number(before.Balance) / 1e6).toFixed(2), sequence: before.Sequence, ownerCount: before.OwnerCount };
    const now = report(NODES.slice(0, 2).map((u) => readingFromReplies(u, L[u], s.at_107305907)));
    expect(summarize(now, used).outcome).toBe("moved");
    const current: AccountInfo = { ...used, sequence: s.at_107305907.result.account_data.Sequence };
    expect(summarize(now, current).outcome).toBe("agreed");
  });

  it("is not applicable offline, and says so rather than passing silently", () => {
    const c = offlineAgreementCheck(107_305_907);
    expect(c.state).toBe("NOT_APPLICABLE");
    expect(c.passed).toBe(true);
  });
});

describe("the gate", () => {
  const base = { account: bitstamp, credentials: [], domain: DOMAIN_REGISTRY[0], amountXrp: 1 };
  const withoutAgreement = (checks: PolicyCheck[]) => checks.filter((c) => c.id !== "SOURCE_AGREEMENT");

  it("never lets a disagreement produce GO: it can only lower the verdict to HOLD", () => {
    const pass = agreementCheck(agreed, bitstamp);
    const fail = agreementCheck(report([agreed.sources[0]]), bitstamp);
    const go: PolicyCheck[] = [{ id: "X", label: "x", severity: "block", passed: true, detail: "" }];
    expect(verdictForChecks([...go, pass])).toBe("go");
    expect(verdictForChecks([...go, fail])).toBe("hold");
    const blocked: PolicyCheck[] = [{ id: "X", label: "x", severity: "block", passed: false, detail: "" }];
    expect(verdictForChecks([...blocked, fail])).toBe("no-go");
  });

  it("is recorded in the receipt's checks, beside the rules it did not change", () => {
    const a = evaluatePolicy({ ...base, agreement: agreementCheck(agreed, bitstamp) });
    const b = evaluatePolicy(base);
    expect(a.checks.find((c) => c.id === "SOURCE_AGREEMENT")?.passed).toBe(true);
    expect(withoutAgreement(a.checks).map((c) => [c.id, c.passed])).toEqual(b.checks.map((c) => [c.id, c.passed]));
  });
});
