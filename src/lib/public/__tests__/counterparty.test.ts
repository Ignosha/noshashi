import { describe, it, expect } from "vitest";
import { assessCounterparty, type CounterpartyFacts } from "../counterparty";
import type {
  AccountInfo,
  CredentialRecord,
  IssuerPosture,
  TrustLine,
  WalletTransaction,
} from "@/lib/xrpl/types";

/**
 * The free address check.
 *
 * This is the most-used surface in the product and the first thing a
 * prospect touches, and it renders a verdict on a real person's address —
 * one of which is AVOID. That makes its false positives a different kind
 * of problem from the rest of the codebase: everywhere else a wrong answer
 * costs the operator money, here it can also defame whoever is being
 * looked up.
 *
 * So the weighting is deliberate. As many cases assert that an ordinary
 * account comes back clear as assert that a dangerous one does not, and
 * the verdict ladder is pinned at both ends.
 */

const account = (over: Partial<AccountInfo> = {}): AccountInfo => ({
  address: "rSubject",
  balanceXrp: "5000",
  sequence: 100,
  ownerCount: 2,
  ...over,
});

const facts = (over: Partial<CounterpartyFacts> = {}): CounterpartyFacts => ({
  address: "rSubject",
  account: account(),
  credentials: [],
  lines: [],
  transactions: [],
  obligations: null,
  posture: undefined,
  ...over,
});

const line = (over: Partial<TrustLine> = {}): TrustLine => ({
  issuer: "rIssuer",
  currency: "USD",
  balance: 10,
  limit: 1000,
  frozen: false,
  frozenByIssuer: false,
  noRipple: true,
  authorized: false,
  requiresAuth: false,
  ...over,
});

const tx = (over: Partial<WalletTransaction> = {}): WalletTransaction => ({
  hash: "H",
  transactionType: "Payment",
  result: "tesSUCCESS",
  ledgerIndex: 1,
  date: "2026-08-28",
  timestamp: 0,
  direction: "in",
  counterparty: "rOther",
  amountXrp: 10,
  feeXrp: "0.000012",
  ...over,
});

const posture = (over: Partial<IssuerPosture> = {}): IssuerPosture => ({
  address: "rSubject",
  noFreeze: false,
  globalFreeze: false,
  requireAuth: false,
  masterDisabled: false,
  transferRateBps: 0,
  ...over,
});

describe("assessCounterparty — the verdict ladder", () => {
  it("derives the verdict from the worst finding, never from a count", () => {
    // One critical among many benign findings must still be avoid: a
    // verdict averaged across findings would bury a single decisive one.
    const r = assessCounterparty(
      facts({ obligations: { obligations: { USD: 1 }, ledgerIndex: 1 } as never,
              posture: posture({ globalFreeze: true }) })
    );
    expect(r.verdict).toBe("avoid");
  });

  it("returns clear for an ordinary funded account with nothing against it", () => {
    // "Ordinary" has to include a history. An account that has never
    // transacted is genuinely worth pausing over, and the module is right
    // to say so — the first version of this test asserted `clear` for a
    // funded account with zero transactions, which is not an ordinary
    // account at all.
    const r = assessCounterparty(facts({ transactions: [tx(), tx({ direction: "out" })] }));
    expect(r.verdict).toBe("clear");
    expect(r.findings.every((f) => f.severity !== "critical")).toBe(true);
  });

  it("cautions on a funded account that has never transacted", () => {
    const r = assessCounterparty(facts({ transactions: [] }));
    expect(r.verdict).toBe("caution");
    expect(r.findings.find((f) => f.id === "no-history")?.severity).toBe("warn");
  });

  it("sorts the most severe finding to the top", () => {
    const r = assessCounterparty(
      facts({
        obligations: { obligations: { USD: 1 }, ledgerIndex: 1 } as never,
        posture: posture({ globalFreeze: true }),
      })
    );
    const ranks = r.findings.map((f) =>
      ({ critical: 0, warn: 1, info: 2, ok: 3 })[f.severity]
    );
    expect([...ranks]).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("reports the balance and activity it was given", () => {
    const r = assessCounterparty(
      facts({ account: account({ balanceXrp: "1234.5" }), transactions: [tx(), tx()] })
    );
    expect(r.balanceXrp).toBe(1234.5);
    expect(r.activityCount).toBe(2);
    expect(r.exists).toBe(true);
    expect(r.funded).toBe(true);
  });
});

describe("assessCounterparty — issuer posture", () => {
  const asIssuer = (p: Partial<IssuerPosture>) =>
    assessCounterparty(
      facts({
        obligations: { obligations: { USD: 5_000_000 }, ledgerIndex: 9 } as never,
        posture: posture(p),
      })
    );

  it("identifies an account that issues a currency", () => {
    const r = asIssuer({});
    expect(r.isIssuer).toBe(true);
    expect(r.issuedCurrencies).toEqual(["USD"]);
  });

  it("treats an active global freeze as critical", () => {
    expect(asIssuer({ globalFreeze: true }).verdict).toBe("avoid");
  });

  it("does not condemn an issuer merely for retaining freeze rights", () => {
    // Almost every legitimate issuer on the ledger can freeze. Treating
    // that alone as AVOID would mark the entire gateway ecosystem
    // dangerous and make the tool worthless.
    const r = asIssuer({});
    expect(r.verdict).not.toBe("avoid");
  });

  it("recognises an issuer that has surrendered freeze permanently", () => {
    const r = asIssuer({ noFreeze: true });
    expect(r.verdict).not.toBe("avoid");
    expect(r.findings.some((f) => f.severity === "ok")).toBe(true);
  });
});

describe("assessCounterparty — freezing others", () => {
  it("notes an account that has frozen counterparties", () => {
    const r = assessCounterparty(facts({ lines: [line({ frozenByIssuer: true })] }));
    const f = r.findings.find((x) => x.id === "freezes-others");
    expect(f).toBeDefined();
    // It is evidence of capability and willingness, not proof of wrongdoing.
    expect(f!.severity).toBe("warn");
    expect(f!.detail).toMatch(/may be entirely legitimate/i);
  });

  it("counts a deep freeze as freezing someone", () => {
    const r = assessCounterparty(facts({ lines: [line({ deepFrozenByIssuer: true })] }));
    expect(r.findings.some((x) => x.id === "freezes-others")).toBe(true);
  });

  it("says nothing when the account has frozen nobody", () => {
    const r = assessCounterparty(facts({ lines: [line(), line({ currency: "EUR" })] }));
    expect(r.findings.some((x) => x.id === "freezes-others")).toBe(false);
  });
});

describe("assessCounterparty — identity signals", () => {
  it("notes a published domain", () => {
    const r = assessCounterparty(facts({ account: account({ domain: "example.com" }) }));
    expect(r.domain).toBe("example.com");
  });

  it("does not treat a missing domain as suspicious on its own", () => {
    // Most ordinary wallets publish nothing. A missing Domain field must
    // not push an account toward avoid.
    const r = assessCounterparty(facts({ account: account({ domain: undefined }) }));
    expect(r.verdict).not.toBe("avoid");
  });

  it("carries accepted credentials through to the report", () => {
    const credentials: CredentialRecord[] = [
      {
        subject: "rSubject",
        issuer: "rIssuer",
        credentialType: "KYC_LEVEL_1",
        accepted: true,
        revoked: false,
      },
    ];
    expect(assessCounterparty(facts({ credentials })).credentials).toHaveLength(1);
  });
});

describe("assessCounterparty — a quiet account is not a guilty one", () => {
  it("cautions but never condemns an account with no history", () => {
    // A silent account warrants a pause, not an accusation. AVOID needs
    // evidence of something done, not an absence of evidence.
    const r = assessCounterparty(facts({ transactions: [], lines: [] }));
    expect(r.verdict).toBe("caution");
    expect(r.verdict).not.toBe("avoid");
  });

  it("never returns unknown once an account has been read", () => {
    // `unknown` is reserved for the paths where nothing could be read at
    // all. Reaching the assessment means facts exist.
    expect(assessCounterparty(facts()).verdict).not.toBe("unknown");
  });
});
