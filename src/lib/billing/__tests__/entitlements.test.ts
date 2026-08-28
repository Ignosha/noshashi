import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLANS, planFor, type PlanId } from "../catalog";
import { DEMO_LOCKED } from "@/lib/edition";

/**
 * Entitlement invariants.
 *
 * A scene is reachable only if some plan grants the feature it gates on.
 * Nothing enforces that: `requires` is a free-form string in App.tsx and
 * `grants` is a free-form string array here, so a typo in either makes a
 * screen permanently unreachable — it renders a paywall to every customer,
 * including the ones who paid for it, and nothing fails.
 *
 * The nesting check backs a claim the pricing page makes in words.
 * "Everything in Operator" and "Everything in Desk" are commitments, and
 * they are true only while each tier's grants are a superset of the one
 * below. A grant dropped from Desk while left in Operator would make the
 * cheaper plan strictly better in one respect and the sentence false.
 */

const root = resolve(import.meta.dirname, "../../../..");
const appSource = readFileSync(resolve(root, "src/App.tsx"), "utf8");

/** Every distinct `requires:` value in SCENES. */
function sceneRequirements(): { id: string; requires: string }[] {
  const start = appSource.indexOf("const SCENES: SceneDef[] = [");
  const body = appSource.slice(start, appSource.indexOf("\n];", start));
  const out: { id: string; requires: string }[] = [];
  for (const chunk of body.split(/\n  \{\n/).slice(1)) {
    const id = /id:\s*"([\w-]+)"/.exec(chunk)?.[1];
    const requires = /requires:\s*"([\w_]+)"/.exec(chunk)?.[1];
    if (id && requires) out.push({ id, requires });
  }
  return out;
}

const grantsOf = (id: PlanId) => new Set(PLANS.find((p) => p.id === id)!.grants);
const everyGrant = new Set(PLANS.flatMap((p) => p.grants));

describe("entitlement invariants", () => {
  it("finds the gated scenes it is meant to check", () => {
    // Without this the suite would pass vacuously if App.tsx were restructured.
    const reqs = sceneRequirements();
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs.map((r) => r.id)).toContain("settlement");
  });

  it("has a plan granting every feature a scene gates on", () => {
    const unreachable = sceneRequirements()
      .filter((r) => !everyGrant.has(r.requires))
      .map((r) => `${r.id} requires "${r.requires}" — no plan grants it`);
    // A scene in this list is dead: every customer sees a paywall, forever.
    expect(unreachable).toEqual([]);
  });

  it("locks in the demo only features that really exist", () => {
    const bogus = Object.keys(DEMO_LOCKED).filter((f) => !everyGrant.has(f));
    expect(bogus).toEqual([]);
  });

  it("keeps the tiers strictly nested, as the pricing page claims", () => {
    const operator = grantsOf("operator");
    const desk = grantsOf("desk");
    const institution = grantsOf("institution");

    const missingFromDesk = [...operator].filter((g) => !desk.has(g));
    expect(missingFromDesk, '"Everything in Operator" must hold').toEqual([]);

    const missingFromInstitution = [...desk].filter((g) => !institution.has(g));
    expect(missingFromInstitution, '"Everything in Desk" must hold').toEqual([]);
  });

  it("gives each paid tier something the one below does not have", () => {
    // The converse of nesting: if Desk added nothing over Operator, the
    // upgrade would be a price rise dressed as a plan.
    const operator = grantsOf("operator");
    const desk = grantsOf("desk");
    const institution = grantsOf("institution");
    expect([...desk].some((g) => !operator.has(g))).toBe(true);
    expect([...institution].some((g) => !desk.has(g))).toBe(true);
  });

  it("charges nothing for the free tier and something for the paid ones", () => {
    const operator = PLANS.find((p) => p.id === "operator")!;
    expect(operator.priceId).toBeNull();
    for (const id of ["desk", "institution"] as const) {
      expect(PLANS.find((p) => p.id === id)!.priceId).toBeTruthy();
    }
  });

  it("falls back to the free tier for an unknown subscription tier", () => {
    // An unrecognised tier must never resolve to a paid plan — that would
    // grant paid capability on a malformed or stale entitlement record.
    expect(planFor("nonsense-tier").id).toBe("operator");
    expect(planFor("").id).toBe("operator");
  });

  it("resolves each known tier to itself", () => {
    for (const plan of PLANS) {
      expect(planFor(plan.id).id).toBe(plan.id);
    }
  });
});
