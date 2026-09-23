import { describe, expect, it } from "vitest";
import { waterAt, xrpInk } from "../field";

const main = { x: 0.7, y: 0.45, r: 0.3 };
const aspect = 16 / 9;

describe("waterAt — the garden pond", () => {
  it("stays within 0..1 everywhere, even under stacked rings and the mark", () => {
    const rings = Array.from({ length: 40 }, (_, i) => ({ x: 0.3 + i * 0.01, y: 0.5, born: 0.5, strength: 1 }));
    const mark = { x: 0.5, y: 0.5, size: 0.4 };
    for (let t = 0; t < 12; t += 1.7) {
      for (let u = 0; u <= 1; u += 0.05) {
        for (let v = 0; v <= 1; v += 0.05) {
          const w = waterAt(u, v, t, aspect, rings, [main], mark);
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("leaves the pool under every flower clear, so glyphs never overprint one", () => {
    const small = { x: 0.2, y: 0.8, r: 0.1 };
    const rings = [{ x: main.x, y: main.y, born: 0, strength: 1 }];
    const mark = { x: main.x, y: main.y, size: main.r * 1.55 };
    for (let t = 0; t < 7; t += 0.5) {
      expect(waterAt(main.x, main.y, t, aspect, rings, [main, small], mark)).toBe(0);
      expect(waterAt(small.x, small.y, t, aspect, rings, [main, small], mark)).toBe(0);
    }
  });

  it("moves a ring outward over time", () => {
    const ring = [{ x: 0.2, y: 0.5, born: 0, strength: 1 }];
    const at = (d: number, t: number) => waterAt(0.2 + d / aspect, 0.5, t, aspect, ring, []);
    const bare = (d: number, t: number) => waterAt(0.2 + d / aspect, 0.5, t, aspect, [], []);
    expect(at(0.16, 1) - bare(0.16, 1)).toBeGreaterThan(0.2);
    expect(at(0.32, 2) - bare(0.32, 2)).toBeGreaterThan(0.1);
    expect(at(0.32, 1) - bare(0.32, 1)).toBeLessThan(0.02);
  });

  it("draws the XRP mark into the water", () => {
    const mark = { x: 0.5, y: 0.5, size: 0.4 };
    // On the upper stroke's rounded bottom, just above centre.
    const onStroke = waterAt(0.5, 0.5 - 0.2 * 0.4, 3, aspect, [], [], mark);
    expect(onStroke).toBeGreaterThanOrEqual(0.46);
  });
});

describe("xrpInk — the XRP mark", () => {
  it("is two cupped arcs: ink on both, a gap between them, nothing at the sides", () => {
    expect(xrpInk(0, -0.2)).toBe(1); // bottom of the upper arc
    expect(xrpInk(0, 0.2)).toBe(1); // top of the lower arc
    expect(xrpInk(0, 0)).toBe(0); // the gap at the centre
    expect(xrpInk(-1, -1)).toBe(1); // top-left arm tip
    expect(xrpInk(1, 1)).toBe(1); // bottom-right arm tip
    expect(xrpInk(1, 0)).toBe(0); // between the arms
    expect(xrpInk(2, 2)).toBe(0); // outside
  });
});
