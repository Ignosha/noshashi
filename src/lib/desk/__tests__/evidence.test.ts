import { describe, it, expect } from "vitest";
import { runPolicy, type PermissionedDomain } from "@/lib/policy";
import { receiptToEntry, type LedgerEntry } from "../ledger";
import { verifyEntry, verdictConsistent, buildChain, explain, decidingCheck } from "../evidence";
import type { AccountInfo, CredentialRecord } from "@/lib/xrpl/types";

/**
 * The evidence chain is offered as proof that a stored verdict is the
 * verdict that was issued. The properties that matter: an untouched
 * entry verifies, any edit to the body is caught, and an entry that
 * cannot be checked never reports as verified.
 */

const domain: PermissionedDomain = {
  id: "d-test",
  name: "TEST_DOMAIN",
  code: "TEST",
  institution: "Test",
  requirements: ["KYC_LEVEL_1"],
  transferCeilingXrp: 250_000,
  governance: "active",
  members: 1,
};

const account: AccountInfo = {
  address: "rSubject",
  balanceXrp: "1000",
  sequence: 42,
  ownerCount: 5,
  domain: "example.com",
};

const kyc: CredentialRecord = {
  subject: "rSubject",
  issuer: "rIssuer",
  credentialType: "KYC_LEVEL_1",
  accepted: true,
  revoked: false,
};

async function entryFor(credentials: CredentialRecord[], amountXrp = 10): Promise<LedgerEntry> {
  const receipt = await runPolicy({ account, credentials, domain, amountXrp });
  return receiptToEntry(receipt, { domainCode: domain.code });
}

describe("verifyEntry", () => {
  it("verifies an untouched entry against its issued digest", async () => {
    const entry = await entryFor([kyc]);
    const result = await verifyEntry(entry);
    expect(result).toEqual({ state: "verified", digest: entry.digest });
  });

  it("catches a flipped verdict", async () => {
    const entry = await entryFor([]);
    expect(entry.verdict).toBe("no-go");
    const result = await verifyEntry({ ...entry, verdict: "go" });
    expect(result.state).toBe("mismatch");
  });

  it("catches an edited amount, time, subject or rule result", async () => {
    const entry = await entryFor([kyc]);
    const edits: Partial<LedgerEntry>[] = [
      { amountXrp: entry.amountXrp + 1 },
      { at: new Date(Date.parse(entry.at) + 1000).toISOString() },
      { subject: "rSomeoneElse" },
      { checks: entry.checks!.map((c, i) => (i === 0 ? { ...c, passed: !c.passed } : c)) },
    ];
    for (const edit of edits) {
      expect((await verifyEntry({ ...entry, ...edit })).state).toBe("mismatch");
    }
  });

  it("never passes an entry recorded without its check list", async () => {
    const entry = await entryFor([kyc]);
    const legacy = { ...entry, checks: undefined, domainId: undefined };
    expect((await verifyEntry(legacy)).state).toBe("unverifiable");
    expect(verdictConsistent(legacy)).toBeNull();
  });
});

describe("chain and explanation", () => {
  it("walks state → policy → every rule → decision → receipt", async () => {
    const entry = await entryFor([]);
    const chain = buildChain(entry);
    expect(chain[0].kind).toBe("state");
    expect(chain[1].kind).toBe("policy");
    expect(chain.filter((s) => s.kind === "rule")).toHaveLength(entry.checks!.length);
    expect(chain[chain.length - 2].kind).toBe("decision");
    expect(chain[chain.length - 1]).toMatchObject({ kind: "receipt", value: entry.digest });
  });

  it("names the rule that decided a NO-GO and agrees with the engine", async () => {
    const entry = await entryFor([]);
    const decider = decidingCheck(entry.checks!);
    expect(decider?.severity).toBe("block");
    expect(decider?.passed).toBe(false);
    expect(verdictConsistent(entry)).toBe(true);
    expect(explain(entry).why).toContain(decider!.label);
  });

  it("flags a stored verdict the check list does not support", async () => {
    const entry = await entryFor([]);
    expect(verdictConsistent({ ...entry, verdict: "go" })).toBe(false);
  });
});
