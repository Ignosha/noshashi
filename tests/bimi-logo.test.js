import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// site/bimi/logo.svg is the logo mail clients show beside mail from
// noshashi.app. Gmail, Apple Mail and Yahoo drop a logo that breaks the
// SVG Tiny PS profile without saying why, so the rules are checked here.
const svg = readFileSync(resolve(import.meta.dirname, "../site/bimi/logo.svg"), "utf8");
const root = svg.match(/<svg\b[^>]*>/)?.[0] ?? "";

describe("BIMI logo (SVG Tiny PS)", () => {
  it("declares the Tiny PS profile on the root element", () => {
    expect(root).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(root).toContain('version="1.2"');
    expect(root).toContain('baseProfile="tiny-ps"');
  });

  it("has a title and a square viewBox, and no x or y on the root", () => {
    expect(svg).toMatch(/<title>[^<]+<\/title>/);
    const [, , w, h] = root.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    expect(w).toBe(h);
    expect(root).not.toMatch(/\s(x|y)="/);
  });

  it("uses only elements the profile allows", () => {
    const allowed = new Set(["svg", "title", "desc", "defs", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "linearGradient", "radialGradient", "stop"]);
    const used = [...svg.matchAll(/<([a-zA-Z]+)\b/g)].map((m) => m[1]);
    expect(used.filter((name) => !allowed.has(name))).toEqual([]);
  });

  it("references nothing outside the file", () => {
    expect(svg).not.toMatch(/href=|xlink:|@import|javascript:|<script/i);
    for (const [, ref] of svg.matchAll(/url\(([^)]*)\)/g)) expect(ref).toMatch(/^#/);
  });

  it("draws paths without arcs, which Tiny 1.2 lacks", () => {
    for (const [, d] of svg.matchAll(/\sd="([^"]+)"/g)) expect(d).toMatch(/^[MmLlHhVvCcSsQqTtZz0-9.,\s-]+$/);
  });

  it("is under the 32 KB limit", () => {
    expect(Buffer.byteLength(svg)).toBeLessThan(32 * 1024);
  });
});
