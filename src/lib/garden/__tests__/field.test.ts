import { describe, expect, it } from "vitest";
import { waterAt } from "../field";

const origin = { x: 0.7, y: 0.45 };

describe("waterAt — the garden pond", () => {
  it("stays within 0..1 everywhere, even under stacked rings", () => {
    const rings = Array.from({ length: 24 }, (_, i) => ({ x: 0.3 + i * 0.01, y: 0.5, born: 0.5, strength: 1 }));
    for (let t = 0; t < 12; t += 1.7) {
      for (let u = 0; u <= 1; u += 0.05) {
        for (let v = 0; v <= 1; v += 0.05) {
          const w = waterAt(u, v, t, 16 / 9, rings, origin);
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("leaves the pool under the flower clear, so glyphs never overprint it", () => {
    const rings = [{ ...origin, born: 0, strength: 1 }];
    for (let t = 0; t < 7; t += 0.5) expect(waterAt(origin.x, origin.y, t, 16 / 9, rings, origin)).toBe(0);
  });

  it("moves a ring outward over time", () => {
    const ring = [{ x: 0.2, y: 0.5, born: 0, strength: 1 }];
    const at = (d: number, t: number) => waterAt(0.2 + d / (16 / 9), 0.5, t, 16 / 9, ring, null);
    const bare = (d: number, t: number) => waterAt(0.2 + d / (16 / 9), 0.5, t, 16 / 9, [], null);
    // The crest sits at RING_SPEED * age from its centre.
    expect(at(0.16, 1) - bare(0.16, 1)).toBeGreaterThan(0.2);
    expect(at(0.32, 2) - bare(0.32, 2)).toBeGreaterThan(0.1);
    expect(at(0.32, 1) - bare(0.32, 1)).toBeLessThan(0.02);
  });
});
