import { describe, it, expect } from "vitest";
import {
  claimFindings,
  formatClaim,
  interpretChecks,
  type ClaimsReport,
  type InboundClaim,
} from "../claims";

/**
 * Unsolicited claims.
 *
 * This module accuses people, which makes its false-positive behaviour as
 * important as its true-positive behaviour. Calling a legitimate new token
 * uncashable would libel an honest issuer and teach the operator to ignore
 * the warning; missing an impersonation costs them money. The tests below
 * are weighted accordingly — as many cases assert that nothing is raised as
 * assert that something is.
 *
 * The decisive combination is a borrowed ticker AND an issuer with no
 * obligations. Neither alone is evidence: a new token has no holders yet,
 * and an obscure ticker on a real issuer is just an obscure token.
 */

const claim = (over: Partial<InboundClaim> = {}): InboundClaim => ({
  index: "ABC123DEF456",
  from: "rSpammer",
  amount: { kind: "iou", currency: "USDT", issuer: "rFakeIssuer", value: 5_980 },
  issuerObligations: 0,
  issuerOwesNothing: true,
  borrowedTicker: true,
  issuerDomain: "usdxrp.net",
  ...over,
});

const report = (inbound: InboundClaim[], outboundCount = 0): ClaimsReport => ({
  address: "rVictim",
  inbound,
  outboundCount,
  ledgerIndex: 106_599_202,
  readAt: "2026-08-28T00:00:00Z",
});

describe("claimFindings — impersonation", () => {
  it("raises CRITICAL on a borrowed ticker from an issuer that owes nothing", () => {
    // The live mainnet case: 5,980 "USDT" from an issuer with no obligations.
    const f = claimFindings(report([claim()]));
    const bad = f.find((x) => x.id.startsWith("impersonation-"));
    expect(bad?.severity).toBe("critical");
    expect(bad!.detail).toMatch(/NO obligations/i);
  });

  it("tells the operator the claim is inert, not that their funds are at risk", () => {
    // Getting this wrong panics someone over a thing that cannot touch them.
    const f = claimFindings(report([claim()]));
    const bad = f.find((x) => x.id.startsWith("impersonation-"));
    expect(bad!.action).toMatch(/cannot move your funds|inert/i);
  });

  it("always states that receiving costs nothing", () => {
    const f = claimFindings(report([claim()]));
    const reserve = f.find((x) => x.id === "reserve");
    expect(reserve).toBeDefined();
    expect(reserve!.detail).toMatch(/counts against the reserve of whoever created it/i);
  });
});

describe("claimFindings — what must NOT be accused", () => {
  it("does not call a new token uncashable when its ticker is not borrowed", () => {
    // Zero obligations alone is not evidence: every token starts there.
    const f = claimFindings(
      report([
        claim({
          amount: { kind: "iou", currency: "WIDGET", issuer: "rNewIssuer", value: 10 },
          borrowedTicker: false,
          issuerObligations: 0,
          issuerOwesNothing: true,
        }),
      ])
    );
    expect(f.some((x) => x.id.startsWith("impersonation-"))).toBe(false);
    expect(f.some((x) => x.severity === "critical")).toBe(false);
  });

  it("downgrades a borrowed ticker to a warning when the issuer really owes something", () => {
    // A real issuer using a common code is a naming collision, not a fraud.
    const f = claimFindings(
      report([claim({ issuerObligations: 4_200_000, issuerOwesNothing: false })])
    );
    expect(f.some((x) => x.id.startsWith("impersonation-"))).toBe(false);
    expect(f.find((x) => x.id.startsWith("ticker-"))?.severity).toBe("warn");
  });

  it("raises nothing at all for an account with no claims against it", () => {
    const f = claimFindings(report([]));
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("ok");
    // And it must not imply the account has never been targeted.
    expect(f[0].detail).toMatch(/cancelled/i);
  });

  it("ignores checks the account created itself", () => {
    // The spammer's own account: 34 outbound, nothing addressed to it.
    const f = claimFindings(report([], 34));
    expect(f).toHaveLength(1);
    expect(f[0].id).toBe("none");
  });
});

describe("claimFindings — honesty about what could not be checked", () => {
  it("reports an unverifiable issuer rather than passing it as fine", () => {
    const f = claimFindings(
      report([
        claim({
          issuerObligations: undefined,
          issuerOwesNothing: false,
          borrowedTicker: false,
        }),
      ])
    );
    const unver = f.find((x) => x.id === "unverified");
    expect(unver?.severity).toBe("warn");
    expect(unver!.detail).toMatch(/not the same as their being fine/i);
  });

  it("separates several claims into their own findings", () => {
    // Two impersonations must not collapse into one line that hides the
    // second sender.
    const f = claimFindings(
      report([
        claim({ index: "AAA111", from: "rOne" }),
        claim({ index: "BBB222", from: "rTwo" }),
      ])
    );
    expect(f.filter((x) => x.id.startsWith("impersonation-"))).toHaveLength(2);
  });
});

describe("formatClaim", () => {
  it("decodes a 160-bit hex currency code to its ticker", () => {
    expect(
      formatClaim({
        kind: "iou",
        currency: "5553445400000000000000000000000000000000",
        issuer: "rIss",
        value: 5_980,
      })
    ).toBe("5,980 USDT");
  });

  it("renders drops as XRP", () => {
    expect(formatClaim({ kind: "xrp", value: 0.319847 })).toBe("0.319847 XRP");
  });

  it("leaves an undecodable code alone rather than inventing a name", () => {
    const weird = "00".repeat(20);
    expect(formatClaim({ kind: "iou", currency: weird, issuer: "r", value: 1 })).toContain(
      weird
    );
  });
});

/**
 * Partitioning tests, added because a mutation exposed their absence.
 *
 * Removing the Destination filter — so an account's own outgoing checks
 * counted as claims against it — passed all seventeen tests above, since
 * every one built its report by hand. The step that decides who is being
 * targeted had no coverage at all. Shapes below are real account_objects
 * entries captured from mainnet.
 */
describe("interpretChecks — who is actually being targeted", () => {
  const SPAMMER = "rHjUEuGTbiSc2KowsvATgfFQwP8rWGyMvK";
  const VICTIM = "rBi1QrVjwaNofisZAQnovoXdHkS73FG1tJ";

  const outgoing = {
    LedgerEntryType: "Check",
    index: "OUT1",
    Account: SPAMMER,
    Destination: VICTIM,
    SendMax: {
      currency: "5553445400000000000000000000000000000000",
      issuer: "rUSzwoNtcrcXYgBNFVSB3rzqUKYipujnRj",
      value: "5980",
    },
    DestinationTag: 220852,
  };

  const issuers = new Map([
    ["rUSzwoNtcrcXYgBNFVSB3rzqUKYipujnRj|5553445400000000000000000000000000000000",
     { obligations: 0, domain: "usdxrp.net" }],
  ]);

  it("counts a check as a claim only for its destination", () => {
    const victim = interpretChecks(VICTIM, [outgoing], issuers, 1);
    expect(victim.inbound).toHaveLength(1);
    expect(victim.outboundCount).toBe(0);
  });

  it("does not report the sender's own checks as claims against the sender", () => {
    const sender = interpretChecks(SPAMMER, [outgoing], issuers, 1);
    expect(sender.inbound).toHaveLength(0);
    expect(sender.outboundCount).toBe(1);
    // And therefore raises no alarm about itself.
    expect(claimFindings(sender).some((f) => f.severity === "critical")).toBe(false);
  });

  it("flags the borrowed ticker and empty issuer from the real object shape", () => {
    const [c] = interpretChecks(VICTIM, [outgoing], issuers, 1).inbound;
    expect(c.borrowedTicker).toBe(true);
    expect(c.issuerOwesNothing).toBe(true);
    expect(c.issuerDomain).toBe("usdxrp.net");
    expect(formatClaim(c.amount)).toBe("5,980 USDT");
  });

  it("leaves an unresolved issuer unknown rather than assuming it owes nothing", () => {
    // issuerOwesNothing must be false when the lookup simply failed —
    // otherwise an unreachable node turns every claim into an accusation.
    const [c] = interpretChecks(VICTIM, [outgoing], new Map(), 1).inbound;
    expect(c.issuerObligations).toBeUndefined();
    expect(c.issuerOwesNothing).toBe(false);
  });

  it("reads an XRP check without inventing issuer facts", () => {
    const xrpCheck = { ...outgoing, index: "OUT2", SendMax: "319847" };
    const [c] = interpretChecks(VICTIM, [xrpCheck], issuers, 1).inbound;
    expect(c.amount).toEqual({ kind: "xrp", value: 0.319847 });
    expect(c.borrowedTicker).toBe(false);
    expect(c.issuerOwesNothing).toBe(false);
  });
});
