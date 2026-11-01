import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepthComparison } from "./DepthComparison";

const render = (quoted: number, funded: number) =>
  renderToStaticMarkup(
    createElement(DepthComparison, { quoted, funded, ledgerIndex: 107585800 }),
  );
const width = (html: string, series: string) =>
  Number(
    html.match(new RegExp(`data-series="${series}"[^>]*width="([^"]+)"`))?.[1],
  );

describe("Ledger Desk depth figure", () => {
  it("preserves the exact funded-to-quoted ratio, including small funded quantities", () => {
    const html = render(1_000_000, 100);
    expect(width(html, "funded") / width(html, "quoted")).toBeCloseTo(
      0.0001,
      10,
    );
    expect(html).toContain("ledger 107585800");
    expect(html).toContain("funded ask depth 100 USD");
  });
  it("draws zero funded depth with zero width", () => {
    expect(width(render(1_000, 0), "funded")).toBe(0);
  });
  it("uses the same scale without clipping if funded depth exceeds quoted depth", () => {
    const html = render(100, 200);
    expect(width(html, "quoted") / width(html, "funded")).toBe(0.5);
    expect(width(html, "funded")).toBe(284);
  });
  it.each([
    [0, 0],
    [-1, 0],
    [100, -1],
    [NaN, 1],
    [100, Infinity],
  ])("withholds invalid quantities (%s, %s)", (quoted, funded) => {
    expect(render(quoted, funded)).toBe("");
  });
});
