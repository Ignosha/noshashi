import { describe, it, expect } from "vitest";
import {
  authorityChecks,
  verdictFor,
  certificateFrom,
  primaryCurrency,
  type AuthoritySurface,
} from "../authority";
import { digestOf, receiptDigest, type PolicyReceipt } from "@/lib/policy";
import type { ControlSurface, SignerEntry } from "../control";
import type { IssuanceReport, CurrencySurveillance } from "../issuance";

/**
 * The authority certificate.
 *
 * The claim under test is "can any single party still act on this
 * issuance". Every dangerous wrong answer points the same way — toward
 * calling something safe. A signer list reads as shared control until
 * one member carries the quorum; a cleared freeze flag reads as
 * surrender until you notice the issuer simply has not used it yet; a
 * concentration figure reads as knowledge until you notice the walk saw
 * a third of the supply. The tests below are built from those failures
 * rather than from the happy path.
 *
 * The last block is the important one and is not about this module at
 * all: it pins the settlement digest. Adding a second receipt kind is
 * exactly the change that silently alters the first one, and a drifted
 * digest means every receipt already on a customer's disk stops
 * verifying.
 */

const control = (over: Partial<ControlSurface> = {}): ControlSurface => ({
  address: "rIssuer",
  masterKeyEnabled: false,
  signers: {
    present: true,
    quorum: 3,
    signers: [
      { account: "rA", weight: 1 },
      { account: "rB", weight: 1 },
      { account: "rC", weight: 1 },
    ] as SignerEntry[],
    totalWeight: 3,
    minimumSigners: 3,
    unilateralSigners: [],
  },
  ownerCount: 0,
  reserveLockedXrp: 0,
  reserveBaseXrp: 1,
  reserveIncrementXrp: 0.2,
  balanceXrp: 100,
  escrows: [],
  escrowedXrp: 0,
  truncated: false,
  ledgerIndex: 84_112_907,
  readAt: "2026-09-20T00:00:00.000Z",
  ...over,
});

const posture = (over: Record<string, unknown> = {}) =>
  ({
    address: "rIssuer",
    noFreeze: true,
    globalFreeze: false,
    requireAuth: false,
    masterDisabled: true,
    transferRateBps: 0,
    ...over,
  }) as AuthoritySurface["posture"];

const currency = (over: Partial<CurrencySurveillance> = {}): CurrencySurveillance => ({
  currency: "USD",
  outstanding: 1_000_000,
  observedHeld: 1_000_000,
  holders: 400,
  activeHolders: 380,
  hhi: 400,
  topHolderPct: 4,
  topFivePct: 12,
  frozenSeen: 0,
  authorizedSeen: 0,
  coverage: 1,
  top: [],
  ...over,
});

const issuance = (c: CurrencySurveillance[] = [currency()]): IssuanceReport => ({
  issuer: "rIssuer",
  currencies: c,
  linesWalked: 400,
  truncated: false,
  requiresAuth: false,
  canFreeze: false,
  globalFreeze: false,
  ledgerIndex: 84_112_907,
  readAt: "2026-09-20T00:00:00.000Z",
});

const surface = (over: Partial<AuthoritySurface> = {}): AuthoritySurface => ({
  issuer: "rIssuer",
  control: control(),
  posture: posture(),
  issuance: issuance(),
  unreadable: [],
  ledgerIndex: 84_112_907,
  readAt: "2026-09-20T00:00:00.000Z",
  ...over,
});

const byId = (s: AuthoritySurface, id: string) =>
  authorityChecks(s).find((c) => c.id === id)!;

describe("unilateral control — a committee's clothes", () => {
  it("fails when one signer's weight alone reaches quorum", () => {
    const s = surface({
      control: control({
        signers: {
          present: true,
          quorum: 3,
          signers: [
            { account: "rBoss", weight: 3 },
            { account: "rA", weight: 1 },
            { account: "rB", weight: 1 },
          ],
          totalWeight: 5,
          minimumSigners: 1,
          unilateralSigners: ["rBoss"],
        },
      }),
    });
    expect(byId(s, "NO_UNILATERAL_SIGNER").passed).toBe(false);
    expect(verdictFor(authorityChecks(s))).toBe("no-go");
  });

  it("passes when the quorum genuinely needs more than one signer", () => {
    expect(byId(surface(), "NO_UNILATERAL_SIGNER").passed).toBe(true);
  });

  it("fails on an enabled master key with no signer list", () => {
    const s = surface({
      control: control({
        masterKeyEnabled: true,
        signers: { present: false, quorum: 0, signers: [], totalWeight: 0, minimumSigners: 0, unilateralSigners: [] },
      }),
    });
    expect(byId(s, "NO_UNILATERAL_SIGNER").passed).toBe(false);
  });

  it("does not treat a five-signer list as safe on headcount alone", () => {
    const s = surface({
      control: control({
        signers: {
          present: true,
          quorum: 4,
          signers: [
            { account: "rBoss", weight: 4 },
            { account: "rA", weight: 1 },
            { account: "rB", weight: 1 },
            { account: "rC", weight: 1 },
            { account: "rD", weight: 1 },
          ],
          totalWeight: 8,
          minimumSigners: 1,
          unilateralSigners: ["rBoss"],
        },
      }),
    });
    expect(verdictFor(authorityChecks(s))).toBe("no-go");
  });
});

describe("seizure and admission", () => {
  it("a live global freeze is blocking", () => {
    const s = surface({ posture: posture({ globalFreeze: true }) });
    expect(byId(s, "NOT_GLOBALLY_FROZEN").passed).toBe(false);
    expect(verdictFor(authorityChecks(s))).toBe("no-go");
  });

  it("retained freeze rights degrade to HOLD rather than passing", () => {
    const s = surface({ posture: posture({ noFreeze: false }) });
    expect(byId(s, "FREEZE_SURRENDERED").passed).toBe(false);
    expect(verdictFor(authorityChecks(s))).toBe("hold");
  });

  it("requireAuth means the issuer chooses who may hold", () => {
    const s = surface({ posture: posture({ requireAuth: true }) });
    expect(byId(s, "OPEN_HOLDING").passed).toBe(false);
  });

  it("reports a transfer fee only when one is charged", () => {
    expect(authorityChecks(surface()).some((c) => c.id === "NO_TRANSFER_FEE")).toBe(false);
    const s = surface({ posture: posture({ transferRateBps: 25 }) });
    expect(byId(s, "NO_TRANSFER_FEE").detail).toContain("0.25%");
  });
});

describe("concentration abstains rather than guesses", () => {
  it("reports no figure when coverage is below the floor", () => {
    const s = surface({ issuance: issuance([currency({ coverage: 0.42, hhi: 9000 })]) });
    const check = byId(s, "SUPPLY_CONCENTRATION");
    expect(check.passed).toBe(false);
    // The point: the HHI it happens to hold must not be published.
    expect(check.detail).not.toContain("9000");
    expect(check.detail).toContain("42.0%");
  });

  it("abstains when supply was never walked, and says so", () => {
    const check = byId(surface({ issuance: null }), "SUPPLY_CONCENTRATION");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("abstention");
  });

  it("reports the figure once coverage is sufficient", () => {
    const s = surface({ issuance: issuance([currency({ coverage: 0.99, hhi: 5200 })]) });
    const check = byId(s, "SUPPLY_CONCENTRATION");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("5200");
  });

  it("scopes to the largest outstanding currency", () => {
    const report = issuance([
      currency({ currency: "EUR", outstanding: 10 }),
      currency({ currency: "USD", outstanding: 9_000_000 }),
    ]);
    expect(primaryCurrency(report)?.currency).toBe("USD");
  });
});

describe("an unreadable issuer is never a pass", () => {
  it("blocks when the account could not be read", () => {
    const s = surface({ control: null, posture: null, unreadable: ["control: timeout"] });
    const checks = authorityChecks(s);
    expect(checks).toHaveLength(1);
    expect(checks[0].id).toBe("AUTHORITY_READABLE");
    expect(verdictFor(checks)).toBe("no-go");
  });
});

describe("the certificate digest", () => {
  it("is stable for identical facts", async () => {
    const a = await certificateFrom(surface());
    const b = await certificateFrom(surface());
    expect(a.digest).toBe(b.digest);
    expect(a.digest).toMatch(/^[0-9A-F]{64}$/);
  });

  it("changes when the verdict changes", async () => {
    const a = await certificateFrom(surface());
    const b = await certificateFrom(surface({ posture: posture({ globalFreeze: true }) }));
    expect(a.digest).not.toBe(b.digest);
  });

  it("changes with the ledger index — a certificate is about one ledger", async () => {
    const a = await certificateFrom(surface());
    const b = await certificateFrom(surface({ ledgerIndex: 84_112_908 }));
    expect(a.digest).not.toBe(b.digest);
  });

  it("cannot collide with another receipt kind over the same checks", async () => {
    const checks = [{ id: "X", passed: true }];
    const args = { subject: "rIssuer", scope: {}, checks, evaluatedAt: "2026-09-20T00:00:00.000Z" };
    expect(await digestOf({ ...args, kind: "authority" })).not.toBe(
      await digestOf({ ...args, kind: "settlement" })
    );
  });

  it("ignores the order scope keys are written in", async () => {
    const base = { kind: "authority", subject: "r", checks: [], evaluatedAt: "t" };
    expect(await digestOf({ ...base, scope: { a: 1, b: 2 } })).toBe(
      await digestOf({ ...base, scope: { b: 2, a: 1 } })
    );
  });
});

/**
 * The settlement digest is frozen by contract.
 *
 * Pinned to a literal rather than compared against a re-computation,
 * because a re-computation moves with the code and would pass through
 * exactly the change this guards against. If this test fails, every
 * settlement receipt already written to a customer's disk has stopped
 * verifying — the fix is to restore the canonical body in policy.ts,
 * never to update the constant below.
 */
describe("settlement receipts issued before today still verify", () => {
  it("digests a known settlement body to its known hex", async () => {
    const body = {
      verdict: "go",
      domainId: "dom-institutional-settlement",
      subject: "rPT4sRcvaUyGfvnLPaJLBXnpWCxFCWTsAo",
      amountXrp: 25000,
      evaluatedAt: "2026-08-22T09:14:02.000Z",
      checks: [
        { id: "DOMAIN_ACTIVE", label: "", severity: "block", passed: true, detail: "" },
        { id: "TRANSFER_CEILING", label: "", severity: "block", passed: true, detail: "" },
      ],
    } as Omit<PolicyReceipt, "digest" | "latencyMs">;

    expect(await receiptDigest(body)).toBe(
      "E1891C65FBE8CE5D76036EB805658218FCD741B5912B09D23FE5C53598AB3FBF"
    );
  });
});
