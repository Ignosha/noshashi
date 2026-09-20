import { describe, expect, it } from "vitest";
import {
  VERDICT_COPY,
  VERDICT_DOT_CLASS,
  VERDICT_STAT_TONE,
  VERDICT_TEXT_CLASS,
  VERDICT_TONE,
} from "../policy";
import type { Status } from "../xrpl/types";

const ALL: Status[] = ["go", "hold", "no-go", "insufficient-data"];

describe("verdict presentation maps", () => {
  it("covers every verdict in every map", () => {
    for (const map of [VERDICT_COPY, VERDICT_TONE, VERDICT_STAT_TONE, VERDICT_TEXT_CLASS, VERDICT_DOT_CLASS]) {
      for (const status of ALL) {
        expect(map[status], `missing ${status}`).toBeTruthy();
      }
      // No stragglers: a map with a key no verdict uses is dead styling.
      expect(Object.keys(map).sort()).toEqual([...ALL].sort());
    }
  });

  it("never dresses INSUFFICIENT DATA as a pass or a failure", () => {
    // The bug this guards. Four inline ternaries branched on verdict and
    // their final branch absorbed the new state: two rendered it with the
    // GO treatment — a false clearance on a certificate that established
    // nothing — and one with NO-GO, a false allegation. The same unknown
    // verdict appeared as a pass in one panel and a failure in another.
    expect(VERDICT_TONE["insufficient-data"]).toBe("default");
    expect(VERDICT_STAT_TONE["insufficient-data"]).toBe("default");
    for (const cls of [VERDICT_TEXT_CLASS, VERDICT_DOT_CLASS]) {
      const value = cls["insufficient-data"];
      expect(value).toContain("muted");
      expect(value).not.toMatch(/\b(go|hold|no-go)\b/);
    }
  });

  it("keeps a pass unemphasised where only problems carry colour", () => {
    // StatCell has no "go" tone on purpose: spending colour on a pass
    // leaves nothing to distinguish the rows that need attention.
    expect(VERDICT_STAT_TONE.go).toBe("default");
    expect(VERDICT_STAT_TONE["no-go"]).toBe("no-go");
  });
});
