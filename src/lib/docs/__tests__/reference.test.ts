import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { buildReference } from "../reference";

/**
 * The /docs/ pages render src/lib/docs/reference.json. This keeps that
 * file equal to what the code produces, and checks that the hand-written
 * API and webhook references still cover everything the code serves.
 *
 * Regenerate after an intended change:
 *   UPDATE_DOCS=1 npx vitest run src/lib/docs
 */
const JSON_PATH = "src/lib/docs/reference.json";
const read = (p: string) => readFileSync(p, "utf8");

const reference = buildReference({
  context: read("src/lib/agent/context.ts"),
  link: read("src/lib/xrpl/link.ts"),
  verify: read("supabase/functions/noshashi-verify/index.ts"),
  edgeFunctions: readdirSync("supabase/functions").filter(
    (name) => statSync(`supabase/functions/${name}`).isDirectory() && existsSync(`supabase/functions/${name}/index.ts`)
  ),
});

describe("the documentation reference is the code's", () => {
  it("reference.json equals what the code produces", () => {
    const current = `${JSON.stringify(reference, null, 2)}\n`;
    if (process.env.UPDATE_DOCS) writeFileSync(JSON_PATH, current);
    expect(read(JSON_PATH)).toBe(current);
  });

  it("lists every scene in the app, each with a plan", () => {
    const app = read("src/App.tsx");
    const block = app.slice(app.indexOf("const SCENES: SceneDef[] = ["), app.indexOf("\n];", app.indexOf("const SCENES")));
    const visible = block.split(/\n  \{\n/).slice(1).filter((c) => !/group:\s*"hidden"/.test(c)).length;
    expect(reference.scenes.length).toBeGreaterThanOrEqual(visible);
    for (const scene of reference.scenes) expect(["Free", "Desk", "Institution", "Enterprise", "Strategic"], scene.name).toContain(scene.plan);
    expect(reference.scenes.find((s) => s.name === "Ledger Garden")?.plan).toBe("Desk");
    expect(reference.scenes.find((s) => s.name === "Issuance")?.plan).toBe("Institution");
  });

  it("finds every rule the rule set can produce, and the API's verbs", () => {
    const ids = new Set(reference.rules.map((r) => r.id));
    for (const id of ["ACCOUNT_ACTIVATED", "RESERVE_SOLVENCY", "SPENDABLE_BALANCE", "TRANSFER_CEILING", "DOMAIN_GOVERNANCE", "DOMAIN_ATTESTATION"]) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(reference.verbs.map((v) => v.path)).toEqual([
      "(bare path)",
      "authority/check",
      "receipts/{digest}",
      "analyze/issuer",
      "analyze/address",
      "analyze/transaction",
    ]);
    expect(reference.servers.length).toBeGreaterThan(1);
  });
});

describe("the hand-written references cover what the code serves", () => {
  it("COMPLIANCE_API.md documents every verb", () => {
    const api = read("docs/api/COMPLIANCE_API.md");
    for (const verb of reference.verbs) if (verb.path !== "(bare path)") expect(api, verb.path).toContain(`\`${verb.path}\``);
  });

  it("WEBHOOKS.md documents every event the app offers", () => {
    const hooks = read("docs/api/WEBHOOKS.md");
    for (const event of reference.webhookEvents) expect(hooks, event.id).toContain(`\`${event.id}\``);
  });
});
