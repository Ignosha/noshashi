import { describe, it, expect } from "vitest";
import {
  authorityChecks,
  regularKeyCanSign,
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
 * A regular key signs alone, and nothing else on the account says so.
 *
 * There are three ways to sign for an XRPL account and only two are
 * obvious. The regular key is a plain field on the account root rather
 * than an object hanging off it, so a reader looking for "a signer
 * list, or the master key" misses it entirely — and what it misses is
 * an account controlled by exactly one key.
 *
 * Live mainnet proved the cost. RLUSD's issuer has the master key
 * disabled and no signer list, so the check reported that the account
 * "cannot currently be signed for at all" and passed it. An issuance
 * being actively minted was certified as controlled by nobody.
 */
describe("a regular key is a single key", () => {
  const noList = {
    present: false, quorum: 0, signers: [],
    totalWeight: 0, minimumSigners: 0, unilateralSigners: [],
  };

  it("fails when a regular key is set and the master key is disabled", () => {
    const s = surface({
      control: control({ masterKeyEnabled: false, regularKey: "rHotKey", signers: noList }),
    });
    const check = byId(s, "NO_UNILATERAL_SIGNER");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("rHotKey");
    expect(verdictFor(authorityChecks(s))).toBe("no-go");
  });

  it("fails when a regular key is set and the master key is also enabled", () => {
    const s = surface({
      control: control({ masterKeyEnabled: true, regularKey: "rHotKey", signers: noList }),
    });
    expect(byId(s, "NO_UNILATERAL_SIGNER").passed).toBe(false);
  });

  it("still passes an account that genuinely cannot be signed for", () => {
    // All three absent. This is the only shape that earns the pass.
    const s = surface({
      control: control({ masterKeyEnabled: false, regularKey: undefined, signers: noList }),
    });
    const check = byId(s, "NO_UNILATERAL_SIGNER");
    expect(check.passed).toBe(true);
    expect(check.detail).toContain("no regular key is set");
  });

  it("does not let a regular key override a real quorum", () => {
    // A signer list is the authority when one exists; the regular key
    // cannot bypass it.
    const s = surface({ control: control({ regularKey: "rHotKey" }) });
    expect(byId(s, "NO_UNILATERAL_SIGNER").passed).toBe(true);
  });
});

/**
 * Where a number came from is part of the number.
 *
 * Every other check on a certificate is read from validated ledger
 * state and can be re-derived by anyone with a node. Concentration may
 * instead come from an indexer, because the ledger cannot produce a
 * distribution for a large issuer inside a web request — RLUSD has
 * ~98,000 trust lines and the walk needs about nine minutes.
 *
 * That is a materially weaker kind of statement, and on a document
 * whose entire value is that it was read from the ledger, letting it
 * pass unlabelled would hollow out the claim. So the source is named
 * in the finding itself, where it cannot be separated from the figure
 * it qualifies.
 */
describe("a concentration figure says where it came from", () => {
  it("names the indexer, and what reconciliation does and does not prove", () => {
    const s = surface({
      issuance: {
        ...issuance([currency({ hhi: 702, holders: 67_339, topHolderPct: 14.1 })]),
        source: "indexer",
        sourceName: "xrpscan.com",
      },
    });
    const detail = byId(s, "SUPPLY_CONCENTRATION").detail;
    expect(detail).toContain("xrpscan.com");
    expect(detail).toContain("not read from the ledger directly");
    expect(detail).toContain("reconciled");
    // The limit of the claim is stated, not implied.
    expect(detail).toContain("not that each is attributed correctly");
  });

  it("says so plainly when the ledger was read directly", () => {
    const detail = byId(surface(), "SUPPLY_CONCENTRATION").detail;
    expect(detail).toContain("read from validated ledger state");
    expect(detail).not.toContain("xrpscan");
  });

  it("treats an absent source as the ledger, the claim that asserts less", () => {
    // Existing constructions predate the field. Defaulting to
    // "indexer" would have them assert a third party they never used.
    const s = surface({ issuance: issuance([currency()]) });
    expect(byId(s, "SUPPLY_CONCENTRATION").detail).toContain("validated ledger state");
  });

  it("labels a concentrated finding too, not just a clean one", () => {
    const s = surface({
      issuance: {
        ...issuance([currency({ hhi: 7400, topHolderPct: 81.2, topFivePct: 100 })]),
        source: "indexer",
        sourceName: "xrpscan.com",
      },
    });
    const check = byId(s, "SUPPLY_CONCENTRATION");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("xrpscan.com");
  });
});

/**
 * A walk that broke is not a walk nobody asked for.
 *
 * The supply walk is optional, so a null issuance legitimately means
 * the caller declined it. But readAuthoritySurface also catches a
 * FAILED walk into `unreadable` and returns null, so both arrived at
 * the same sentence: "Supply was not walked for this certificate."
 *
 * Live mainnet showed why that matters. SOLO was certified with
 * walk=1 explicitly requested, the walk failed, and the certificate
 * reported it as not walked — indistinguishable from the caller
 * having chosen to skip it. The endpoint gave no other trace, so a
 * broken read looked like a configuration choice.
 */
describe("a failed supply walk says so", () => {
  it("reports a caught walk failure as a failed read", () => {
    const s = surface({
      issuance: null,
      unreadable: ["issuance: rippled replied 503"],
    });
    const check = byId(s, "SUPPLY_CONCENTRATION");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("could not be completed");
    expect(check.detail).toContain("rippled replied 503");
    expect(check.detail).toContain("failed read");
  });

  it("still reports a skipped walk as an abstention", () => {
    const check = byId(surface({ issuance: null, unreadable: [] }), "SUPPLY_CONCENTRATION");
    expect(check.detail).toContain("was not walked");
    expect(check.detail).toContain("abstention, not a pass");
  });

  it("does not mistake an unrelated failure for a walk failure", () => {
    // A posture or control failure short-circuits earlier, so the only
    // way to reach this branch is an entry that is genuinely the walk's.
    const check = byId(
      surface({ issuance: null, unreadable: ["control: something else"] }),
      "SUPPLY_CONCENTRATION"
    );
    expect(check.detail).toContain("was not walked");
  });
});

/**
 * A blackholed account is the strongest surrender, not the weakest.
 *
 * Setting the regular key to an address whose private key does not
 * exist and then disabling the master key is how an XRPL issuer
 * permanently gives up control. The issuance survives; the ability to
 * sign for it does not.
 *
 * Having just been taught to read the regular key, the check treated
 * every regular key as a controller — and marked Sologenic's SOLO,
 * blackholed to ACCOUNT_ONE, as controlled by rrrrrrrrrrrrrrrrrrrrBZbvji
 * "on its own". The most decentralised configuration the ledger offers
 * scored worst of all, on a page built to inform an argument about
 * decentralisation. Found on live mainnet, one issuer after the one
 * that proved the opposite bug.
 */
describe("a key nobody holds is not a controller", () => {
  const noList = {
    present: false, quorum: 0, signers: [],
    totalWeight: 0, minimumSigners: 0, unilateralSigners: [],
  };
  const blackholeKeys = [
    "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
    "rrrrrrrrrrrrrrrrrrrrBZbvji",
    "rrrrrrrrrrrrrrrrrNAMEtxvNvQ",
    "rrrrrrrrrrrrrrrrrrrn5RM1rHd",
  ];

  for (const key of blackholeKeys) {
    it(`passes an account blackholed to ${key}`, () => {
      const s = surface({
        control: control({ masterKeyEnabled: false, regularKey: key, signers: noList }),
      });
      const check = byId(s, "NO_UNILATERAL_SIGNER");
      expect(check.passed).toBe(true);
      expect(check.detail).toContain("blackholed");
      expect(check.detail).toContain("private key does not exist");
    });
  }

  it("still fails when the master key is left enabled beside a burn key", () => {
    // Half-done blackholing. The regular key cannot sign, but the
    // master key never stopped being able to, so one key still does.
    const s = surface({
      control: control({
        masterKeyEnabled: true,
        regularKey: "rrrrrrrrrrrrrrrrrrrrBZbvji",
        signers: noList,
      }),
    });
    const check = byId(s, "NO_UNILATERAL_SIGNER");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("no usable regular key");
  });

  it("does not mistake an ordinary key for a burn address", () => {
    expect(regularKeyCanSign("rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ")).toBe(true);
    expect(regularKeyCanSign("rrrrrrrrrrrrrrrrrrrrBZbvji")).toBe(false);
    expect(regularKeyCanSign(undefined)).toBe(false);
  });

  it("a signer list still decides, even beside a burn key", () => {
    const s = surface({ control: control({ regularKey: "rrrrrrrrrrrrrrrrrrrrBZbvji" }) });
    expect(byId(s, "NO_UNILATERAL_SIGNER").passed).toBe(true);
  });
});

/**
 * A signer list nobody could read is not a signer list nobody has.
 *
 * Same in-band-failure shape as the posture read below: the request is
 * tolerated so one failed object read does not lose the whole control
 * surface, and the tolerance used to turn a timeout into "no committee
 * here" — the reassuring answer.
 */
describe("an unreadable signer list is an unknown, not an absence", () => {
  it("fails the blocking check when the list could not be read", () => {
    const s = surface({
      control: control({
        masterKeyEnabled: false,
        signers: {
          present: false, unreadable: "connect ETIMEDOUT", quorum: 0, signers: [],
          totalWeight: 0, minimumSigners: 0, unilateralSigners: [],
        },
      }),
    });
    const check = byId(s, "NO_UNILATERAL_SIGNER");
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("could not be read");
    expect(check.detail).toContain("not a pass");
  });

  it("fails even when everything else about the account looks settled", () => {
    const s = surface({
      control: control({
        masterKeyEnabled: false,
        regularKey: undefined,
        signers: {
          present: false, unreadable: "no node answered", quorum: 0, signers: [],
          totalWeight: 0, minimumSigners: 0, unilateralSigners: [],
        },
      }),
    });
    expect(verdictFor(authorityChecks(s))).toBe("no-go");
  });
});

/**
 * A read that failed is not a reading of "no".
 *
 * fetchIssuerPosture does not reject when it cannot reach the ledger.
 * It resolves with `unreadable` set and every flag false, and three of
 * those falses are passes — globalFreeze on a BLOCKING check, plus
 * requireAuth and the transfer fee. So an issuer nobody could read
 * scored better than most issuers that were read, which is the exact
 * failure this module exists to prevent.
 *
 * The surfaces below are the ones certificateFrom accepts from outside:
 * captured for offline re-certification, or assembled server-side.
 * Neither can be trusted to have normalised anything first.
 */
describe("an unreadable posture never reads as a clean one", () => {
  it("refuses to certify when the posture carries a read failure", () => {
    const s = surface({
      posture: posture({
        unreadable: "connect ETIMEDOUT",
        noFreeze: false,
        globalFreeze: false,
        requireAuth: false,
      }),
    });
    const checks = authorityChecks(s);
    expect(checks).toHaveLength(1);
    expect(checks[0].id).toBe("AUTHORITY_READABLE");
    expect(checks[0].passed).toBe(false);
    expect(verdictFor(checks)).toBe("no-go");
  });

  it("says what failed, even when the surface did not record it", () => {
    const s = surface({
      posture: posture({ unreadable: "connect ETIMEDOUT" }),
      unreadable: [],
    });
    expect(authorityChecks(s)[0].detail).toContain("connect ETIMEDOUT");
  });

  it("does not emit the flag checks that a defaulted posture would pass", () => {
    const ids = authorityChecks(
      surface({ posture: posture({ unreadable: "no node answered" }) })
    ).map((c) => c.id);
    expect(ids).not.toContain("NOT_GLOBALLY_FROZEN");
    expect(ids).not.toContain("OPEN_HOLDING");
    expect(ids).not.toContain("SUPPLY_CONCENTRATION");
  });

  it("still certifies normally when unreadable is absent", () => {
    expect(verdictFor(authorityChecks(surface()))).toBe("go");
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

/**
 * A currency code a person can read, and a digest that still verifies.
 *
 * XRPL carries anything longer than three characters as 40 hex
 * characters. RLUSD is 524C555344000000000000000000000000000000 on the
 * wire, and that is what the public page printed on its first live
 * read — a check headed "524C555344000000000000000000000000000000
 * supply concentration", which tells a reader nothing.
 *
 * The fix has a trap in it, which is what these tests hold down. The
 * digest must keep hashing the RAW code. Someone re-deriving a digest
 * from a printed certificate uses the `currency` field they were
 * given, so if the certificate carried "RLUSD" while the digest was
 * taken over the hex, every genuine certificate for a long-coded
 * currency would fail verification.
 */
describe("hex currency codes are decoded for display only", () => {
  const RLUSD_HEX = "524C555344000000000000000000000000000000";

  it("labels the check with the ticker, not the hex", async () => {
    const s = surface({ issuance: issuance([currency({ currency: RLUSD_HEX })]) });
    expect(byId(s, "SUPPLY_CONCENTRATION").label).toBe("RLUSD supply not concentrated");
  });

  it("uses the ticker in the coverage abstention too", () => {
    const s = surface({
      issuance: issuance([currency({ currency: RLUSD_HEX, coverage: 0.087 })]),
    });
    const detail = byId(s, "SUPPLY_CONCENTRATION").detail;
    expect(detail).toContain("outstanding RLUSD");
    expect(detail).not.toContain(RLUSD_HEX);
  });

  it("keeps the raw code on the certificate and digests that", async () => {
    const s = surface({ issuance: issuance([currency({ currency: RLUSD_HEX })]) });
    const cert = await certificateFrom(s);
    expect(cert.currency).toBe(RLUSD_HEX);
    expect(cert.currencyLabel).toBe("RLUSD");

    // The digest is reproducible from the raw code alone, which is what
    // the verify verb re-derives it from.
    expect(cert.digest).toBe(
      await digestOf({
        kind: "authority",
        subject: s.issuer,
        scope: {
          currency: RLUSD_HEX,
          ledgerIndex: s.ledgerIndex,
          verdict: cert.verdict,
          source: cert.source,
          rules: cert.rulesVersion,
        },
        checks: authorityChecks(s),
        evaluatedAt: s.readAt,
      })
    );
  });

  it("says INSUFFICIENT DATA when a source would not read", async () => {
    // A source threw. Nothing blocking was established without it, so
    // there is no honest verdict to give — and "hold" would be a
    // conclusion we did not reach.
    const cert = await certificateFrom(
      surface({ unreadable: ["posture: node refused"] })
    );
    expect(cert.verdict).toBe("insufficient-data");
  });

  it("keeps NO-GO when a source failed AND a blocking check failed", async () => {
    // The precedence that matters most. The control surface read
    // cleanly and shows one key can sign for the issuer; that finding
    // is established and must survive an unrelated source failing.
    // If a failed read could downgrade this to "not established",
    // anyone able to break one of our reads could suppress a NO-GO.
    const controlled = surface({
      control: control({
        masterKeyEnabled: true,
        signers: {
          present: false,
          quorum: 0,
          signers: [],
          totalWeight: 0,
          minimumSigners: 0,
          unilateralSigners: [],
        },
      }),
      unreadable: ["issuance: indexer refused"],
    });
    const cert = await certificateFrom(controlled);
    expect(cert.checks.some((c) => c.severity === "block" && !c.passed)).toBe(true);
    expect(cert.verdict).toBe("no-go");
  });

  it("does not call a flags-only certificate INSUFFICIENT DATA", async () => {
    // Regression guard. The concentration checks abstain whenever no
    // supply walk was requested, which is the DEFAULT. Treating that
    // abstention as missing evidence would turn almost every
    // certificate into INSUFFICIENT DATA and make the state useless.
    const cert = await certificateFrom(surface({ issuance: null, unreadable: [] }));
    expect(cert.verdict).not.toBe("insufficient-data");
  });

  it("digests INSUFFICIENT DATA apart from HOLD", async () => {
    // verdict is inside the digest scope, so the two must not collide.
    const unread = await certificateFrom(surface({ unreadable: ["posture: timeout"] }));
    const read = await certificateFrom(surface({ unreadable: [] }));
    expect(unread.verdict).toBe("insufficient-data");
    expect(unread.digest).not.toBe(read.digest);
  });

  it("digests indexer and ledger provenance differently", async () => {
    // The point of putting `source` in the digest scope. These two
    // surfaces are identical in every respect the checks can see — same
    // issuer, same ledger, same currency, same holders, same verdict —
    // and differ only in where the holder distribution was read from.
    //
    // A ledger walk is read directly from the validated ledger. An
    // indexer's figures come from a third party and are only reconciled
    // against the ledger's obligations to within a tolerance. Those are
    // not the same evidence, so they must not share an attestation: a
    // shared digest would let the weaker one inherit the stronger one's
    // signature. digestOf hashes [id, passed] per check and not the
    // prose where the source is named, so the scope is the only place
    // this distinction can live.
    const walked = await certificateFrom(
      surface({ issuance: { ...issuance(), source: "ledger" } })
    );
    const indexed = await certificateFrom(
      surface({ issuance: { ...issuance(), source: "indexer" } })
    );

    expect(walked.verdict).toBe(indexed.verdict);
    expect(walked.source).toBe("ledger");
    expect(indexed.source).toBe("indexer");
    expect(walked.digest).not.toBe(indexed.digest);
  });

  it("digests an unread distribution as its own provenance", async () => {
    // Abstaining is a third state, and must not collide with either
    // real source.
    const none = await certificateFrom(surface({ issuance: null }));
    expect(none.source).toBe("none");

    const walked = await certificateFrom(
      surface({ issuance: { ...issuance(), source: "ledger" } })
    );
    expect(none.digest).not.toBe(walked.digest);
  });

  it("leaves a three-character code alone", async () => {
    const cert = await certificateFrom(surface());
    expect(cert.currency).toBe("USD");
    expect(cert.currencyLabel).toBe("USD");
  });

  it("leaves a hex code that is not text as hex", () => {
    // Some 160-bit codes are not ASCII at all. Mojibake would be worse
    // than the hex, which can at least be looked up.
    const odd = "0158415500000000C1F76FF6ECB0BAC600000000";
    const s = surface({ issuance: issuance([currency({ currency: odd })]) });
    expect(byId(s, "SUPPLY_CONCENTRATION").label).toBe(`${odd} supply not concentrated`);
  });
});
