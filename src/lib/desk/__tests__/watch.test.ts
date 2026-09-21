import { describe, it, expect } from "vitest";
import { diffPosture, postureLabel } from "../watch";
import { describeStaleness, captureSnapshot, provenanceLine } from "../offline";
import type { IssuerPosture, AccountInfo } from "@/lib/xrpl/types";

/**
 * Issuer drift monitoring and offline adjudication.
 *
 * Both are paid capabilities and both fail silently, which is what makes
 * them worth pinning.
 *
 * A monitor that misses a change raises nothing, and nothing looks exactly
 * like everything being fine — an issuer can freeze the operator's entire
 * position and the console stays quiet. A monitor that fires on no change
 * is the same failure wearing the opposite costume: alerts nobody reads
 * are alerts nobody reads when it matters.
 *
 * Offline adjudication runs on segregated networks, by definition where
 * nobody can check the answer against a live ledger. Its staleness
 * disclosure is the only thing standing between a captured verdict and
 * someone treating it as current.
 */

const posture = (over: Partial<IssuerPosture> = {}): IssuerPosture => ({
  address: "rIssuer",
  noFreeze: false,
  globalFreeze: false,
  requireAuth: false,
  masterDisabled: false,
  transferRateBps: 0,
  ...over,
});

describe("diffPosture — silence must mean nothing changed", () => {
  it("raises nothing when the posture is identical", () => {
    expect(diffPosture(posture(), posture())).toEqual([]);
  });

  it("raises nothing when unrelated metadata differs", () => {
    // A domain appearing is not a posture change and must not fire an alert.
    expect(
      diffPosture(posture(), posture({ domain: "example.com" }))
    ).toEqual([]);
  });
});

describe("diffPosture — freeze", () => {
  it("treats a freeze being SET as critical", () => {
    const [alert] = diffPosture(posture(), posture({ globalFreeze: true }));
    expect(alert.severity).toBe("critical");
    expect(alert.field).toBe("lsfGlobalFreeze");
    expect(alert.to).toBe("set");
  });

  it("treats a freeze being LIFTED as merely informational", () => {
    // Deliberately asymmetric. Losing access is urgent; regaining it is
    // news. Ranking them alike would train the operator to skim both.
    const [alert] = diffPosture(posture({ globalFreeze: true }), posture());
    expect(alert.severity).toBe("info");
    expect(alert.to).toBe("clear");
  });

  it("says the right retains itself after a freeze is lifted", () => {
    const [alert] = diffPosture(posture({ globalFreeze: true }), posture());
    expect(alert.detail).toMatch(/retains the right to set it a second time/i);
  });
});

describe("diffPosture — the irreversible flag that must never reverse", () => {
  it("raises critical when lsfNoFreeze disappears", () => {
    // lsfNoFreeze cannot be unset on-ledger. Observing it vanish means one
    // of the two readings is wrong, which the operator needs to know before
    // trusting either — this is a contradiction, not a state change.
    const [alert] = diffPosture(posture({ noFreeze: true }), posture());
    expect(alert.severity).toBe("critical");
    expect(alert.detail).toMatch(/irreversible|contradicts/i);
  });

  it("treats a freeze surrender being granted as good news", () => {
    const [alert] = diffPosture(posture(), posture({ noFreeze: true }));
    expect(alert.severity).toBe("info");
    expect(alert.detail).toMatch(/cannot be undone/i);
  });
});

describe("diffPosture — authorisation, keys and fees", () => {
  it("warns when authorisation becomes required, informs when dropped", () => {
    expect(
      diffPosture(posture(), posture({ requireAuth: true }))[0].severity
    ).toBe("warn");
    expect(
      diffPosture(posture({ requireAuth: true }), posture())[0].severity
    ).toBe("info");
  });

  it("reports a master key change in either direction", () => {
    // Disabling is usually hardening and enabling is usually not, but both
    // change who can sign, so neither is allowed to pass unremarked.
    const disabled = diffPosture(posture(), posture({ masterDisabled: true }));
    const enabled = diffPosture(posture({ masterDisabled: true }), posture());
    expect(disabled[0].severity).toBe("warn");
    expect(enabled[0].severity).toBe("warn");
    expect(enabled[0].detail).toMatch(/active again/i);
  });

  it("warns on a fee rise and informs on a fee cut", () => {
    const up = diffPosture(posture(), posture({ transferRateBps: 200 }));
    const down = diffPosture(posture({ transferRateBps: 200 }), posture());
    expect(up[0].severity).toBe("warn");
    expect(up[0].headline).toMatch(/raised/i);
    expect(down[0].severity).toBe("info");
  });

  it("reports several simultaneous changes rather than only the first", () => {
    const alerts = diffPosture(
      posture(),
      posture({ globalFreeze: true, requireAuth: true, transferRateBps: 500 })
    );
    expect(alerts).toHaveLength(3);
    expect(alerts.map((a) => a.field).sort()).toEqual([
      "TransferRate",
      "lsfGlobalFreeze",
      "lsfRequireAuth",
    ]);
  });
});

describe("postureLabel", () => {
  it("puts an active freeze ahead of a surrendered right", () => {
    // Both flags set is contradictory, but if it is ever read that way the
    // label must show the worse of the two.
    expect(postureLabel(posture({ globalFreeze: true, noFreeze: true }))).toBe("FROZEN");
  });

  it("labels the ordinary and surrendered cases", () => {
    expect(postureLabel(posture())).toBe("FREEZE AVAILABLE");
    expect(postureLabel(posture({ noFreeze: true }))).toBe("FREEZE SURRENDERED");
  });
});

const agoIso = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("describeStaleness — a captured verdict is never current", () => {
  it("is fresh under an hour", () => {
    expect(describeStaleness(agoIso(30 * MIN)).severity).toBe("fresh");
  });

  it("warns from an hour", () => {
    expect(describeStaleness(agoIso(HOUR + MIN)).severity).toBe("warn");
  });

  it("is critical from a day", () => {
    expect(describeStaleness(agoIso(25 * HOUR)).severity).toBe("critical");
  });

  it("always discloses that this is not a live read", () => {
    // Every severity, including the freshest, must say so. A snapshot
    // presented as current is the failure this whole module guards.
    for (const age of [1 * MIN, 2 * HOUR, 48 * HOUR]) {
      expect(describeStaleness(agoIso(age)).disclosure).toMatch(
        /not a live read|as captured|re-read/i
      );
    }
  });

  it("tells the operator not to settle on a day-old verdict", () => {
    expect(describeStaleness(agoIso(48 * HOUR)).disclosure).toMatch(
      /do not settle .* without a live re-read/i
    );
  });

  it("clamps a future timestamp to zero rather than reporting negative age", () => {
    const future = new Date(Date.now() + HOUR).toISOString();
    const s = describeStaleness(future);
    expect(s.ageMs).toBe(0);
    expect(s.severity).toBe("fresh");
  });
});

describe("captureSnapshot and provenanceLine", () => {
  const account: AccountInfo = {
    address: "rSubject",
    balanceXrp: "100",
    sequence: 1,
    ownerCount: 0,
  };

  it("records the ledger index the verdict will rest on", () => {
    const snap = captureSnapshot({
      ledger: { ledgerIndex: 106_599_989, ledgerHash: "ABC" } as never,
      account,
      credentials: [],
    });
    expect(snap.ledgerIndex).toBe(106_599_989);
    expect(snap.ledgerHash).toBe("ABC");
  });

  it("does not invent a ledger index when there is no ledger", () => {
    const snap = captureSnapshot({ ledger: null, account, credentials: [] });
    expect(snap.ledgerIndex).toBe(0);
    expect(snap.ledgerHash).toBeUndefined();
  });

  it("defaults missing collections to empty rather than undefined", () => {
    const snap = captureSnapshot({ ledger: null, account, credentials: [] });
    expect(snap.trustLines).toEqual([]);
    expect(snap.postures).toEqual([]);
  });

  it("names in one line exactly what an examiner is being shown", () => {
    const snap = captureSnapshot({
      ledger: { ledgerIndex: 42, ledgerHash: "H" } as never,
      account,
      credentials: [],
      trustLines: [],
      postures: [],
    });
    const line = provenanceLine(snap);
    expect(line).toMatch(/Adjudicated offline against ledger 42/);
    expect(line).toMatch(/0 credentials, 0 trust lines, 0 issuer postures/);
    // And it must carry the age, so a stale record cannot be read as fresh.
    expect(line).toMatch(/old\)|under a minute old\)/);
  });
});
