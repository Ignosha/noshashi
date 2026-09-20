import { describe, expect, it } from "vitest";
import { freshnessOf, isLive, FRESHNESS_LABEL, type Freshness } from "../live";

const INTERVAL = 10_000;
const now = 1_000_000;
const agoIntervals = (n: number) => now - n * INTERVAL;

describe("freshnessOf", () => {
  it("is unavailable before anything has been read", () => {
    expect(freshnessOf({ lastRunAt: null, intervalMs: INTERVAL, now })).toBe("unavailable");
  });

  it("is unavailable when paused having never read", () => {
    // Not "cached": there is no reading being held.
    expect(
      freshnessOf({ lastRunAt: null, intervalMs: INTERVAL, paused: true, now })
    ).toBe("unavailable");
  });

  it("is live inside one interval, with grace for the read itself", () => {
    expect(freshnessOf({ lastRunAt: agoIntervals(0.5), intervalMs: INTERVAL, now })).toBe("live");
    expect(freshnessOf({ lastRunAt: agoIntervals(1.2), intervalMs: INTERVAL, now })).toBe("live");
  });

  it("degrades with age: recent, delayed, stale", () => {
    expect(freshnessOf({ lastRunAt: agoIntervals(1.8), intervalMs: INTERVAL, now })).toBe("recent");
    expect(freshnessOf({ lastRunAt: agoIntervals(4), intervalMs: INTERVAL, now })).toBe("delayed");
    expect(freshnessOf({ lastRunAt: agoIntervals(20), intervalMs: INTERVAL, now })).toBe("stale");
  });

  it("never reports live after a failed attempt, however young the reading", () => {
    // §65: when the condition cannot be verified, say something weaker,
    // not something reassuring. A read that just failed means the figure
    // is no longer being maintained.
    const justRead = { lastRunAt: agoIntervals(0.1), intervalMs: INTERVAL, now };
    expect(freshnessOf(justRead)).toBe("live");
    expect(freshnessOf({ ...justRead, failed: true })).toBe("delayed");
    expect(isLive(freshnessOf({ ...justRead, failed: true }))).toBe(false);
  });

  it("calls a paused reading cached, not live", () => {
    const fresh = { lastRunAt: agoIntervals(0.1), intervalMs: INTERVAL, now };
    expect(freshnessOf({ ...fresh, paused: true })).toBe("cached");
    expect(isLive(freshnessOf({ ...fresh, paused: true }))).toBe(false);
  });

  it("expires a paused reading rather than holding it as cached forever", () => {
    expect(
      freshnessOf({ lastRunAt: agoIntervals(50), intervalMs: INTERVAL, paused: true, now })
    ).toBe("stale");
  });

  it("scales to the scene's own cadence, not to a fixed number of seconds", () => {
    // The same 30s-old reading is live for a 5-minute panel and stale
    // for a 4-second book. A global threshold could not be right for both.
    const thirtySecondsAgo = now - 30_000;
    expect(freshnessOf({ lastRunAt: thirtySecondsAgo, intervalMs: 300_000, now })).toBe("live");
    expect(freshnessOf({ lastRunAt: thirtySecondsAgo, intervalMs: 4_000, now })).toBe("stale");
  });

  it("labels every state", () => {
    const all: Freshness[] = ["live", "recent", "cached", "delayed", "stale", "unavailable"];
    for (const state of all) expect(FRESHNESS_LABEL[state]).toBeTruthy();
  });

  it("treats a zero interval as one millisecond rather than dividing by zero", () => {
    expect(freshnessOf({ lastRunAt: agoIntervals(0), intervalMs: 0, now })).toBe("live");
  });
});
