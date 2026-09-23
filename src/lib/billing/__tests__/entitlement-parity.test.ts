import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PLANS, FEATURE_CATALOG, type PlanId } from "../catalog";

/**
 * What a plan promises, what it grants, and what a customer receives
 * are three different files, and they have to agree.
 *
 *   src/lib/billing/catalog.ts   PLANS[].grants — what the UI unlocks
 *                                FEATURE_CATALOG — what each flag means
 *   supabase/functions/noshashi-stripe-webhook/index.ts
 *                                TIER_FEATURES — what is actually
 *                                written to noshashi.entitlements when
 *                                a card clears
 *
 * Nothing links them. The console cannot import from an Edge Function
 * and the Edge Function cannot import from src, so the same table is
 * typed out twice and drifts silently.
 *
 * The drift is not theoretical and it is not cosmetic. `compliance_api`
 * was in the catalog and absent from the webhook, so Pro was sold
 * "5,000 API verifications included", charged $749, granted the 5,000
 * credits — and answered 403 to every call that tried to spend them.
 * Four Institutional flags (sso, audit_log, bulk_monitoring,
 * custom_alert_logic) were in the same state at $4,000 a month.
 *
 * Both directions matter and they fail differently:
 *
 *   catalog ⊄ webhook   sold and not delivered. A billing dispute.
 *   webhook ⊄ catalog   delivered and not sold. Revenue given away,
 *                       and a feature nothing in the UI will reveal.
 *
 * This test reads the Edge Function as text because it is Deno source
 * that this Vite project cannot import. Parsing is deliberately narrow:
 * if the shape of TIER_FEATURES changes, the extraction throws rather
 * than quietly comparing nothing and passing.
 */

const root = resolve(import.meta.dirname, "../../../..");
const WEBHOOK = "supabase/functions/noshashi-stripe-webhook/index.ts";

/** Pull TIER_FEATURES out of the Edge Function source. */
function webhookTierFeatures(): Record<string, string[]> {
  const source = readFileSync(resolve(root, WEBHOOK), "utf8");

  const start = source.indexOf("const TIER_FEATURES");
  if (start === -1) {
    throw new Error(
      `Could not find TIER_FEATURES in ${WEBHOOK}. If it was renamed, this ` +
        "test must be updated with it — do not delete it, it is the only " +
        "thing connecting the pricing page to what a paying account receives."
    );
  }
  const open = source.indexOf("{", start);
  const close = source.indexOf("\n};", open);
  if (open === -1 || close === -1) throw new Error(`Malformed TIER_FEATURES in ${WEBHOOK}`);
  const bodyText = source.slice(open + 1, close);

  const table: Record<string, string[]> = {};
  // Each entry is `tier: [ "a", "b", ... ]`, possibly over several lines
  // and with comments between the strings.
  const entry = /(\w+)\s*:\s*\[([^\]]*)\]/g;
  for (let m = entry.exec(bodyText); m; m = entry.exec(bodyText)) {
    table[m[1]] = Array.from(m[2].matchAll(/"([^"]+)"/g), (s) => s[1]);
  }
  if (Object.keys(table).length === 0) {
    throw new Error(`Parsed no tiers out of TIER_FEATURES in ${WEBHOOK}`);
  }
  return table;
}

/** Tiers sold via Stripe (free + self_serve). Contact-sales tiers are handled manually. */
const STRIPE_TIERS: PlanId[] = ["operator", "desk", "institution"];

describe("entitlement parity — catalog against the webhook", () => {
  const webhook = webhookTierFeatures();

  it("describes every Stripe-sold tier the catalog sells", () => {
    expect(Object.keys(webhook).sort()).toEqual([...STRIPE_TIERS].sort());
  });

  for (const tier of STRIPE_TIERS) {
    const plan = PLANS.find((p) => p.id === tier)!;

    it(`grants ${tier} exactly what the catalog promises`, () => {
      // Sorted and compared whole rather than with two subset assertions,
      // so the failure message names every flag on both sides at once
      // instead of one per run.
      expect([...(webhook[tier] ?? [])].sort()).toEqual([...plan.grants].sort());
    });
  }

  it("never grants a flag no plan has defined", () => {
    const known = new Set(PLANS.flatMap((plan) => plan.grants));
    const granted = new Set(Object.values(webhook).flat());
    expect([...granted].filter((flag) => !known.has(flag))).toEqual([]);
  });
});

/**
 * A flag that gates something must be granted by the plan that sells it.
 *
 * FEATURE_CATALOG is not purely a gate table. Most of its entries are
 * descriptions — a label and a blurb for a capability the plan includes
 * but that nothing checks a flag for, because the capability is simply
 * part of a scene the plan already unlocks. Requiring every catalogued
 * flag to appear in some `grants` array would mean writing nine flags
 * into every paying account's entitlements row that no code reads, so
 * that stricter rule is deliberately NOT enforced here.
 *
 * What is enforced is the narrow contract that actually broke: a flag
 * the UI gates on — `<Gated feature="x">` in a component, or
 * `requires: "x"` on a scene — has to be granted by the tier
 * FEATURE_CATALOG names, and by every tier above it. When it is not,
 * the customer buys the plan, the upgrade prompt tells them this plan
 * unlocks it, and the gate stays shut anyway.
 *
 * The gated set is discovered by reading the source rather than listed
 * here, so a new gate is covered the day it is written instead of the
 * day somebody remembers this file.
 */
const rank: Record<PlanId, number> = { operator: 0, desk: 1, institution: 2, enterprise: 3, strategic: 4 };

/** Every flag the UI actually gates on, read out of the components. */
function gatedFlags(): string[] {
  const sources = [
    "src/App.tsx",
    ...globComponents(),
  ];
  const found = new Set<string>();
  for (const file of sources) {
    const text = readFileSync(resolve(root, file), "utf8");
    for (const m of text.matchAll(/feature="([a-z_]+)"/g)) found.add(m[1]);
    for (const m of text.matchAll(/requires:\s*"([a-z_]+)"/g)) found.add(m[1]);
  }
  return [...found].sort();
}

function globComponents(): string[] {
  const dir = resolve(root, "src/components/scenes");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => `src/components/scenes/${name}`);
}

describe("every flag the UI gates on is granted by the plan that sells it", () => {
  const gated = gatedFlags();

  it("found some gates to check", () => {
    // If this ever reads zero, the discovery above has broken and every
    // assertion below is vacuously passing.
    expect(gated.length).toBeGreaterThan(0);
  });

  for (const flag of gated) {
    it(`${flag} is described in FEATURE_CATALOG`, () => {
      expect(
        FEATURE_CATALOG[flag],
        `The UI gates on "${flag}" but FEATURE_CATALOG has no entry for it, ` +
          "so the upgrade prompt cannot say what is behind the gate or which plan opens it."
      ).toBeDefined();
    });

    it(`${flag} is granted by every plan at or above its tier`, () => {
      const requires = FEATURE_CATALOG[flag]?.requires;
      if (!requires) return; // reported by the assertion above
      for (const plan of PLANS) {
        const shouldGrant = rank[plan.id] >= rank[requires];
        expect(
          { plan: plan.id, granted: plan.grants.includes(flag) },
          shouldGrant
            ? `${plan.id} is at or above ${requires}, which FEATURE_CATALOG says unlocks ${flag}`
            : `${plan.id} is below ${requires} and must not grant ${flag}`
        ).toEqual({ plan: plan.id, granted: shouldGrant });
      }
    });
  }
});

/**
 * A catalogued flag that IS granted must be granted consistently.
 *
 * Weaker than the rule above and aimed at a different mistake: a flag
 * handed to Pro while FEATURE_CATALOG advertises it as Institutional.
 * That inversion gives away the more expensive tier's differentiator
 * without anybody deciding to, and no gate has to exist for it to be
 * wrong.
 */
describe("granted flags agree with the tier they are catalogued at", () => {
  for (const plan of PLANS) {
    it(`${plan.id} grants nothing catalogued above its own tier`, () => {
      const tooHigh = plan.grants.filter((flag) => {
        const entry = FEATURE_CATALOG[flag];
        return entry && rank[plan.id] < rank[entry.requires];
      });
      expect(tooHigh).toEqual([]);
    });
  }
});
