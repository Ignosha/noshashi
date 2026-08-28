import { describe, it, expect } from "vitest";
import {
  evaluatePolicy,
  heldCredentialTypes,
  reserveRequirementXrp,
  receiptDigest,
  DOMAIN_REGISTRY,
  type PermissionedDomain,
  type PolicyReceipt,
} from "../policy";
import type { AccountInfo, CredentialRecord } from "@/lib/xrpl/types";

/**
 * The adjudication engine.
 *
 * This is the highest-stakes code in the product and it had no tests. It
 * produces the GO / HOLD / NO-GO verdict the whole thing is sold on, and
 * every other screen defers to it — the compliance agent is explicitly
 * told it does not decide verdicts, this does.
 *
 * Two properties matter more than the rest:
 *
 *   1. A blocking failure must NEVER be reachable as anything but no-go.
 *      Every dangerous outcome here is the same shape: a settlement that
 *      should have been stopped coming back green.
 *
 *   2. The receipt digest must be byte-stable. It is offered as a
 *      tamper-evident record and exported as a chain of custody for
 *      examiners; a digest that drifts for the same facts, or holds steady
 *      when a verdict flips, is worse than no digest at all.
 */

const domain = (over: Partial<PermissionedDomain> = {}): PermissionedDomain => ({
  id: "d-test",
  name: "TEST_DOMAIN",
  code: "TEST",
  institution: "Test",
  requirements: ["KYC_LEVEL_1"],
  transferCeilingXrp: 250_000,
  governance: "active",
  members: 1,
  ...over,
});

const account = (over: Partial<AccountInfo> = {}): AccountInfo => ({
  address: "rSubject",
  balanceXrp: "1000",
  sequence: 42,
  ownerCount: 5,
  domain: "example.com",
  ...over,
});

const credential = (over: Partial<CredentialRecord> = {}): CredentialRecord => ({
  subject: "rSubject",
  issuer: "rIssuer",
  credentialType: "KYC_LEVEL_1",
  accepted: true,
  revoked: false,
  ...over,
});

const evaluate = (over: Partial<Parameters<typeof evaluatePolicy>[0]> = {}) =>
  evaluatePolicy({
    account: account(),
    credentials: [credential()],
    domain: domain(),
    amountXrp: 100,
    ...over,
  });

describe("heldCredentialTypes — what counts as held", () => {
  it("counts an accepted, unrevoked credential", () => {
    expect(heldCredentialTypes([credential()]).has("KYC_LEVEL_1")).toBe(true);
  });

  it("does NOT count a revoked credential", () => {
    // The one that matters: a revoked credential satisfying a requirement
    // would clear a settlement for someone whose standing was withdrawn.
    expect(heldCredentialTypes([credential({ revoked: true })]).has("KYC_LEVEL_1")).toBe(
      false
    );
  });

  it("does NOT count an unaccepted credential", () => {
    // Issued but never accepted on-ledger is not held. XLS-70 requires the
    // subject to accept before it means anything.
    expect(heldCredentialTypes([credential({ accepted: false })]).has("KYC_LEVEL_1")).toBe(
      false
    );
  });

  it("normalises case so a lowercase type still matches", () => {
    expect(
      heldCredentialTypes([credential({ credentialType: "kyc_level_1" })]).has("KYC_LEVEL_1")
    ).toBe(true);
  });
});

describe("reserveRequirementXrp", () => {
  it("is 1 XRP base plus 0.2 per owned object", () => {
    expect(reserveRequirementXrp(0)).toBe(1);
    expect(reserveRequirementXrp(5)).toBeCloseTo(2, 10);
    expect(reserveRequirementXrp(100)).toBeCloseTo(21, 10);
  });
});

describe("evaluatePolicy — no blocking failure may reach GO", () => {
  it("returns go when every check passes", () => {
    expect(evaluate().verdict).toBe("go");
  });

  it("blocks when a required credential is missing", () => {
    expect(evaluate({ credentials: [] }).verdict).toBe("no-go");
  });

  it("blocks when the required credential was revoked", () => {
    const r = evaluate({ credentials: [credential({ revoked: true })] });
    expect(r.verdict).toBe("no-go");
    expect(r.checks.find((c) => c.id === "CREDENTIAL_KYC_LEVEL_1")?.passed).toBe(false);
  });

  it("blocks when there is no account at all", () => {
    expect(evaluate({ account: null }).verdict).toBe("no-go");
  });

  it("blocks an account that exists but has no validated sequence", () => {
    expect(evaluate({ account: account({ sequence: 0 }) }).verdict).toBe("no-go");
  });

  it("blocks when the balance does not clear the reserve", () => {
    // 5 owned objects require 2 XRP; this holds 1.5.
    const r = evaluate({ account: account({ balanceXrp: "1.5", ownerCount: 5 }) });
    expect(r.verdict).toBe("no-go");
    expect(r.checks.find((c) => c.id === "RESERVE_SOLVENCY")?.passed).toBe(false);
  });

  it("blocks a transfer larger than the spendable balance", () => {
    // 1000 XRP with 5 objects leaves 998 spendable.
    expect(evaluate({ amountXrp: 999 }).verdict).toBe("no-go");
  });

  it("counts reserve against spendable, not just against balance", () => {
    // Exactly at the edge: 998 spendable, 998 requested.
    expect(evaluate({ amountXrp: 998 }).verdict).toBe("go");
    expect(evaluate({ amountXrp: 998.01 }).verdict).toBe("no-go");
  });

  it("blocks a transfer above the domain ceiling", () => {
    const r = evaluate({
      account: account({ balanceXrp: "10000000" }),
      domain: domain({ transferCeilingXrp: 1_000 }),
      amountXrp: 1_001,
    });
    expect(r.verdict).toBe("no-go");
    expect(r.checks.find((c) => c.id === "TRANSFER_CEILING")?.passed).toBe(false);
  });

  it("treats a zero ceiling as settlement closed, not as unlimited", () => {
    // The subtle branch: 0 could plausibly be read as "no cap". It means
    // the domain is not settling, and reading it the other way would let
    // any size through a closed domain.
    const r = evaluate({ domain: domain({ transferCeilingXrp: 0 }), amountXrp: 1 });
    expect(r.verdict).toBe("no-go");
    expect(r.checks.find((c) => c.id === "TRANSFER_CEILING")?.detail).toMatch(
      /settlement is closed/i
    );
  });

  it("blocks on a suspended domain but only holds on one under review", () => {
    expect(evaluate({ domain: domain({ governance: "suspended" }) }).verdict).toBe("no-go");
    expect(evaluate({ domain: domain({ governance: "review" }) }).verdict).toBe("hold");
  });
});

describe("evaluatePolicy — hold is for warnings only", () => {
  it("holds when only a warning check fails", () => {
    // A missing domain attestation is a warning, not a block.
    const r = evaluate({ account: account({ domain: undefined }) });
    expect(r.verdict).toBe("hold");
    expect(r.checks.find((c) => c.id === "DOMAIN_ATTESTATION")?.passed).toBe(false);
  });

  it("lets a blocking failure outrank a warning", () => {
    // Both fail; the verdict must be the more severe of the two.
    const r = evaluate({ account: account({ domain: undefined }), credentials: [] });
    expect(r.verdict).toBe("no-go");
  });

  it("requires every credential a domain lists, not just one", () => {
    const twoRequirements = domain({
      requirements: ["KYC_LEVEL_1", "SANCTIONS_CLEARANCE"],
    });
    expect(evaluate({ domain: twoRequirements }).verdict).toBe("no-go");
    expect(
      evaluate({
        domain: twoRequirements,
        credentials: [credential(), credential({ credentialType: "SANCTIONS_CLEARANCE" })],
      }).verdict
    ).toBe("go");
  });
});

describe("receiptDigest — tamper evidence", () => {
  const body = (over: Partial<PolicyReceipt> = {}) =>
    ({
      verdict: "go",
      domainId: "d-test",
      subject: "rSubject",
      amountXrp: 100,
      evaluatedAt: "2026-08-28T00:00:00.000Z",
      checks: [
        { id: "A", label: "a", severity: "block", passed: true, detail: "" },
        { id: "B", label: "b", severity: "warn", passed: true, detail: "" },
      ],
      ...over,
    }) as Omit<PolicyReceipt, "digest" | "latencyMs">;

  it("is stable for identical facts", async () => {
    expect(await receiptDigest(body())).toBe(await receiptDigest(body()));
  });

  it("is a 64-character uppercase hex SHA-256", async () => {
    expect(await receiptDigest(body())).toMatch(/^[0-9A-F]{64}$/);
  });

  it("changes when the verdict changes", async () => {
    expect(await receiptDigest(body())).not.toBe(
      await receiptDigest(body({ verdict: "no-go" }))
    );
  });

  it("changes when a single check result flips", async () => {
    const flipped = body({
      checks: [
        { id: "A", label: "a", severity: "block", passed: false, detail: "" },
        { id: "B", label: "b", severity: "warn", passed: true, detail: "" },
      ],
    });
    expect(await receiptDigest(body())).not.toBe(await receiptDigest(flipped));
  });

  it("changes when the amount or subject changes", async () => {
    const base = await receiptDigest(body());
    expect(await receiptDigest(body({ amountXrp: 101 }))).not.toBe(base);
    expect(await receiptDigest(body({ subject: "rOther" }))).not.toBe(base);
  });

  it("ignores presentational fields that carry no adjudication meaning", async () => {
    // label and detail are copy. If they entered the digest, rewording a
    // sentence would invalidate every historical receipt.
    const reworded = body({
      checks: [
        { id: "A", label: "REWORDED", severity: "block", passed: true, detail: "changed" },
        { id: "B", label: "b", severity: "warn", passed: true, detail: "" },
      ],
    });
    expect(await receiptDigest(reworded)).toBe(await receiptDigest(body()));
  });
});

describe("DOMAIN_REGISTRY", () => {
  it("has unique ids and codes", () => {
    const ids = DOMAIN_REGISTRY.map((d) => d.id);
    const codes = DOMAIN_REGISTRY.map((d) => d.code);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("never lists a negative transfer ceiling", () => {
    for (const d of DOMAIN_REGISTRY) {
      expect(d.transferCeilingXrp).toBeGreaterThanOrEqual(0);
    }
  });
});
