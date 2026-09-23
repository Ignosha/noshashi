import { describe, it, expect } from "vitest";
import { evaluatePolicy, runPolicy, verdictForChecks, type PermissionedDomain } from "@/lib/policy";
import { receiptToEntry, type LedgerEntry } from "../ledger";
import { EMPTY_SCENARIO, HHI_RULE_ID, recordedRules, simulate, simulateEntry, simulationToCsv } from "../simulate";
import type { AccountInfo, CredentialRecord } from "@/lib/xrpl/types";

/**
 * A simulation is only worth showing if an unchanged policy reproduces
 * every recorded verdict exactly, and each change moves only the
 * verdicts the recorded facts say it should.
 */

const domain = (over: Partial<PermissionedDomain> = {}): PermissionedDomain => ({
  id: "d-test",
  name: "TEST_DOMAIN",
  code: "TEST",
  institution: "Test",
  requirements: ["KYC_LEVEL_1"],
  transferCeilingXrp: 1_000,
  governance: "active",
  members: 1,
  ...over,
});

const account = (over: Partial<AccountInfo> = {}): AccountInfo => ({
  address: "rSubject",
  balanceXrp: "5000",
  sequence: 42,
  ownerCount: 5,
  domain: "example.com",
  ...over,
});

const kyc: CredentialRecord = {
  subject: "rSubject",
  issuer: "rIssuer",
  credentialType: "KYC_LEVEL_1",
  accepted: true,
  revoked: false,
};

async function entry(opts: {
  acct?: Partial<AccountInfo>;
  creds?: CredentialRecord[];
  dom?: Partial<PermissionedDomain>;
  amount?: number;
  hhi?: number;
  evidenceUnavailable?: string[];
}): Promise<LedgerEntry> {
  const receipt = await runPolicy({
    account: account(opts.acct),
    credentials: opts.creds ?? [kyc],
    domain: domain(opts.dom),
    amountXrp: opts.amount ?? 100,
    evidenceUnavailable: opts.evidenceUnavailable,
  });
  return receiptToEntry(receipt, { domainCode: "TEST", hhi: opts.hhi });
}

describe("verdictForChecks", () => {
  it("is the rule evaluatePolicy decides by, including unreadable evidence", () => {
    const cases = [
      { credentials: [kyc] },
      { credentials: [] },
      { credentials: [kyc], evidenceUnavailable: ["trust lines"] },
      { credentials: [], evidenceUnavailable: ["trust lines"] },
      { credentials: [kyc], acct: { domain: undefined } },
      { credentials: [kyc], dom: { governance: "review" as const } },
    ];
    for (const c of cases) {
      const body = evaluatePolicy({
        account: account(c.acct),
        credentials: c.credentials,
        domain: domain(c.dom),
        amountXrp: 100,
        evidenceUnavailable: c.evidenceUnavailable,
      });
      expect(verdictForChecks(body.checks)).toBe(body.verdict);
    }
  });
});

describe("simulate", () => {
  it("an unchanged policy reproduces every recorded verdict", async () => {
    const entries = await Promise.all([
      entry({}),
      entry({ creds: [] }),
      entry({ acct: { domain: undefined } }),
      entry({ evidenceUnavailable: ["trust lines"] }),
      entry({ amount: 5_000 }),
    ]);
    const { summary, results } = simulate(entries, EMPTY_SCENARIO);
    expect(summary.changed).toBe(0);
    expect(summary.evaluated).toBe(5);
    for (const r of results) if (r.state === "evaluated") expect(r.after).toBe(r.before);
  });

  it("demoting an advisory rule clears the HOLD it caused and nothing else", async () => {
    const held = await entry({ acct: { domain: undefined } });
    const blocked = await entry({ creds: [] });
    expect(held.verdict).toBe("hold");
    const { summary, results } = simulate([held, blocked], {
      ...EMPTY_SCENARIO,
      severity: { DOMAIN_ATTESTATION: "off" },
    });
    expect(summary.transitions).toEqual({ "hold>go": 1 });
    const r = results[0];
    expect(r.state === "evaluated" && r.drivers).toEqual(["DOMAIN_ATTESTATION"]);
  });

  it("promoting an advisory rule to blocking turns HOLD into NO-GO", async () => {
    const held = await entry({ acct: { domain: undefined } });
    const r = simulateEntry(held, { ...EMPTY_SCENARIO, severity: { DOMAIN_ATTESTATION: "block" } });
    expect(r.state === "evaluated" && r.after).toBe("no-go");
  });

  it("re-runs the transfer ceiling against the recorded amount", async () => {
    const small = await entry({ amount: 100 });
    const large = await entry({ amount: 900 });
    const { summary } = simulate([small, large], { ...EMPTY_SCENARIO, ceilings: { "d-test": 500 } });
    expect(summary.transitions).toEqual({ "go>no-go": 1 });
    const closed = simulate([small], { ...EMPTY_SCENARIO, ceilings: { "d-test": 0 } });
    expect(closed.summary.transitions).toEqual({ "go>no-go": 1 });
    // Over the 1,000 ceiling but well inside the balance, so the ceiling is the only failure.
    const raised = await entry({ amount: 5_000, acct: { balanceXrp: "50000" } });
    expect(raised.verdict).toBe("no-go");
    // Raising the cap cannot clear a settlement the balance also fails.
    const unfunded = await entry({ amount: 5_000 });
    expect(simulate([unfunded], { ...EMPTY_SCENARIO, ceilings: { "d-test": 10_000 } }).summary.changed).toBe(0);
    expect(simulate([raised], { ...EMPTY_SCENARIO, ceilings: { "d-test": 10_000 } }).summary.transitions).toEqual({
      "no-go>go": 1,
    });
  });

  it("applies a proposed HHI limit only where an HHI was recorded", async () => {
    const concentrated = await entry({ hhi: 6_000 });
    const diffuse = await entry({ hhi: 900 });
    const unmeasured = await entry({});
    const { summary, results } = simulate([concentrated, diffuse, unmeasured], { ...EMPTY_SCENARIO, hhiLimit: 2_500 });
    expect(summary.transitions).toEqual({ "go>hold": 1 });
    expect(summary.hhiUnmeasured).toBe(1);
    const r = results[0];
    expect(r.state === "evaluated" && r.drivers).toEqual([HHI_RULE_ID]);
  });

  it("never re-decides an entry recorded without its check list", async () => {
    const legacy = { ...(await entry({})), checks: undefined, domainId: undefined };
    const { summary } = simulate([legacy], { ...EMPTY_SCENARIO, ceilings: { "d-test": 0 } });
    expect(summary.skipped).toBe(1);
    expect(summary.evaluated).toBe(0);
  });

  it("does not modify the recorded entry", async () => {
    const e = await entry({ acct: { domain: undefined } });
    const snapshot = JSON.stringify(e);
    simulate([e], { severity: { DOMAIN_ATTESTATION: "off" }, ceilings: { "d-test": 0 }, hhiLimit: 1 });
    expect(JSON.stringify(e)).toBe(snapshot);
  });

  it("lists recorded rules with failure counts and exports the scenario with the rows", async () => {
    const entries = [await entry({ creds: [] }), await entry({})];
    const rules = recordedRules(entries);
    expect(rules[0]).toMatchObject({ id: "CREDENTIAL_KYC_LEVEL_1", failed: 1, seen: 2 });
    const scenario = { ...EMPTY_SCENARIO, ceilings: { "d-test": 50 } };
    const csv = simulationToCsv(scenario, simulate(entries, scenario).results);
    expect(csv.split("\n")[0]).toBe(`# scenario=${JSON.stringify(scenario)}`);
    expect(csv.split("\n")).toHaveLength(4);
  });
});
