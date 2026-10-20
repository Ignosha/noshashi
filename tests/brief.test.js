/*
 * The product brief at /brief/ restates the app's screens and the prices
 * checkout charges. Restated facts drift, so each one is held here to its
 * source: a screen the app does not have, a screen the brief leaves out,
 * or a price checkout does not charge fails the build.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PLANS as BILLING, CREDIT_PACKS, FEATURE_CATALOG } from "../src/lib/billing/catalog";
import { FEATURE_GROUPS, PLANS, PACKS, PAID_FEATURES } from "../scripts/build-brief.mjs";

/** The internal business-model screen is NOSHASHI's own planning, not a feature. */
const INTERNAL = new Set(["BUSINESS MODEL (INTERNAL)"]);

describe("every screen in the build", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const scenes = app.slice(app.indexOf("const SCENES: SceneDef[]"), app.indexOf("const SCENE_BY_ID"));
  const labels = [...scenes.matchAll(/\n    label: "([^"]+)"/g)].map((m) => m[1]).filter((l) => !INTERNAL.has(l));
  const listed = FEATURE_GROUPS.flatMap((g) => g.items.map(([name]) => name));

  it("lists every screen the app has", () => {
    expect(labels.length).toBeGreaterThan(20);
    expect([...labels].sort()).toEqual([...listed].sort());
  });
});

describe("the revenue model", () => {
  it("states each plan at the price checkout charges", () => {
    for (const plan of PLANS) {
      const billed = BILLING.find((p) => p.id === plan.id);
      expect(billed, plan.id).toBeDefined();
      expect(plan.price).toBe(billed.priceLabel);
      expect(plan.cadence).toBe(billed.cadence);
      if (billed.annualUsd) expect(plan.annual).toBe(`$${billed.annualUsd.toLocaleString("en-US")} / year`);
    }
    expect(PLANS.map((p) => p.id).sort()).toEqual(BILLING.map((p) => p.id).sort());
  });

  it("states each API credit pack as checkout sells it", () => {
    expect(PACKS.map((p) => [p.id, p.price, p.unit])).toEqual(CREDIT_PACKS.map((p) => [p.id, p.priceLabel, p.unitLabel]));
    for (const pack of PACKS) {
      const billed = CREDIT_PACKS.find((p) => p.id === pack.id);
      expect(pack.checks).toBe(billed.verifications.toLocaleString("en-US"));
    }
  });

  it("lists every paid feature on the plan that first includes it", () => {
    const catalog = Object.values(FEATURE_CATALOG).map((f) => [f.label, f.requires]).sort();
    expect(PAID_FEATURES.map(([label, plan]) => [label, plan]).sort()).toEqual(catalog);
  });
});
