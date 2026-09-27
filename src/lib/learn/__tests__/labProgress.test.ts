import { describe, it, expect } from "vitest";
import {
  DAY_MS,
  EMPTY_PROGRESS,
  INTERVAL_DAYS,
  TOP_BOX,
  completeStep,
  dueKeys,
  dueLabel,
  labStatus,
  nextDue,
  recordReview,
  retention,
  sanitizeProgress,
  shuffled,
  stepKey,
} from "../labProgress";

const T0 = Date.UTC(2026, 8, 27, 12);
const KNOWN = new Set(["a/1", "a/2", "b/1"]);
const lab = { id: "a", steps: [{ id: "1" }, { id: "2" }] };

describe("completing a step", () => {
  it("marks it done and deals its question into the deck, due tomorrow", () => {
    const p = completeStep(EMPTY_PROGRESS, "a/1", T0);
    expect(p.done["a/1"]).toBe(T0);
    expect(p.cards["a/1"]).toEqual({ box: 1, due: T0 + DAY_MS, reviews: 0, lapses: 0 });
    expect(dueKeys(p, T0, KNOWN)).toEqual([]);
    expect(dueKeys(p, T0 + DAY_MS, KNOWN)).toEqual(["a/1"]);
  });

  it("changes nothing the second time, so redoing a lab never resets a card", () => {
    const once = recordReview(completeStep(EMPTY_PROGRESS, "a/1", T0), "a/1", true, T0 + DAY_MS);
    expect(completeStep(once, "a/1", T0 + 5 * DAY_MS)).toBe(once);
  });
});

describe("reviewing", () => {
  it("spaces a card out 1, 3, 7, 16, 35 days as it is answered right, and caps at the top box", () => {
    let p = completeStep(EMPTY_PROGRESS, "a/1", T0);
    let now = T0;
    const gaps: number[] = [];
    for (let i = 0; i < 6; i++) {
      now = p.cards["a/1"].due;
      p = recordReview(p, "a/1", true, now);
      gaps.push((p.cards["a/1"].due - now) / DAY_MS);
    }
    expect(gaps).toEqual([3, 7, 16, 35, 35, 35]);
    expect(INTERVAL_DAYS.slice(1)).toEqual([1, 3, 7, 16, 35]);
    expect(p.cards["a/1"].box).toBe(TOP_BOX);
    expect(p.cards["a/1"].reviews).toBe(6);
  });

  it("sends a missed card back to box 1 for tomorrow and counts the lapse", () => {
    let p = completeStep(EMPTY_PROGRESS, "a/1", T0);
    p = recordReview(p, "a/1", true, T0 + DAY_MS);
    p = recordReview(p, "a/1", true, T0 + 4 * DAY_MS);
    p = recordReview(p, "a/1", false, T0 + 11 * DAY_MS);
    expect(p.cards["a/1"]).toEqual({ box: 1, due: T0 + 12 * DAY_MS, reviews: 3, lapses: 1 });
  });

  it("lists due cards oldest first and ignores steps that no longer exist", () => {
    let p = completeStep(EMPTY_PROGRESS, "b/1", T0);
    p = completeStep(p, "a/2", T0 + 1000);
    p = completeStep(p, "gone/1", T0);
    expect(dueKeys(p, T0 + 2 * DAY_MS, KNOWN)).toEqual(["b/1", "a/2"]);
    expect(nextDue(p, KNOWN)).toBe(T0 + DAY_MS);
    expect(nextDue(EMPTY_PROGRESS, KNOWN)).toBeNull();
  });

  it("counts a card as retained from box 3", () => {
    let p = completeStep(completeStep(EMPTY_PROGRESS, "a/1", T0), "a/2", T0);
    p = recordReview(p, "a/1", true, T0 + DAY_MS);
    p = recordReview(p, "a/1", true, T0 + 4 * DAY_MS);
    expect(retention(p, KNOWN)).toEqual({ cards: 2, retained: 1, mastered: 0 });
  });
});

describe("lab status", () => {
  it("points at the first unfinished step, and past the end when complete", () => {
    expect(labStatus(lab, EMPTY_PROGRESS)).toEqual({ done: 0, total: 2, complete: false, next: 0 });
    const half = completeStep(EMPTY_PROGRESS, stepKey("a", "2"), T0);
    expect(labStatus(lab, half).next).toBe(0);
    const all = completeStep(half, stepKey("a", "1"), T0);
    expect(labStatus(lab, all)).toEqual({ done: 2, total: 2, complete: true, next: 2 });
  });
});

describe("stored progress is sanitised", () => {
  it("survives anything a settings file could hold", () => {
    for (const raw of [null, undefined, "x", 3, [], { done: [], cards: "no" }]) {
      expect(sanitizeProgress(raw)).toEqual(EMPTY_PROGRESS);
    }
  });

  it("keeps good entries, drops broken ones and clamps boxes", () => {
    const p = sanitizeProgress({
      done: { "a/1": T0, "a/2": "yesterday", "b/1": Number.NaN },
      cards: {
        "a/1": { box: 9, due: T0, reviews: 2.4 },
        "a/2": { box: 1 },
        "b/1": null,
        "c/1": { box: 0, due: T0, lapses: -3 },
      },
    });
    expect(p.done).toEqual({ "a/1": T0 });
    expect(p.cards).toEqual({
      "a/1": { box: TOP_BOX, due: T0, reviews: 2, lapses: 0 },
      "c/1": { box: 1, due: T0, reviews: 0, lapses: 0 },
    });
  });
});

describe("option order", () => {
  const options = ["right", "wrong one", "wrong two"];

  it("is a permutation that keeps track of the right answer", () => {
    for (const seed of ["a", "b", "a/1#0", "a/1#1", "address/fee"]) {
      const q = shuffled(options, 0, seed);
      expect([...q.options].sort()).toEqual([...options].sort());
      expect(q.options[q.answer]).toBe("right");
    }
  });

  it("is stable for a seed and varies across seeds", () => {
    expect(shuffled(options, 0, "x")).toEqual(shuffled(options, 0, "x"));
    const positions = new Set(Array.from({ length: 12 }, (_, i) => shuffled(options, 0, `k#${i}`).answer));
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe("due labels", () => {
  it("reads naturally", () => {
    expect(dueLabel(T0 - 1, T0)).toBe("now");
    expect(dueLabel(T0 + DAY_MS, T0)).toBe("tomorrow");
    expect(dueLabel(T0 + 3 * DAY_MS, T0)).toBe("in 3 days");
  });
});
