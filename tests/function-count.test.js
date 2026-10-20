/*
 * Vercel's Hobby plan deploys at most twelve serverless functions, and a
 * deployment over the limit fails outright ("exceeded_serverless_functions_
 * per_deployment") rather than dropping one. Every .js file directly under
 * api/ is a function; api/_lib/ is not. Add a route to api/tools.js and a
 * rewrite in vercel.json instead of a new file.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

describe("serverless functions", () => {
  it("stays within the Hobby plan's twelve", () => {
    const functions = readdirSync("api").filter((f) => f.endsWith(".js"));
    expect(functions.length).toBeLessThanOrEqual(12);
  });

  it("rewrites every public tool URL to a route that exists", async () => {
    const { rewrites = [] } = JSON.parse(readFileSync("vercel.json", "utf8"));
    const tools = rewrites.filter((r) => r.destination.startsWith("/api/tools?tool="));
    expect(tools.map((r) => r.source).sort()).toEqual(["/api/badge", "/api/book", "/api/delivered", "/api/issuer-state", "/api/treasury"]);
    const source = readFileSync("api/tools.js", "utf8");
    for (const r of tools) expect(source).toContain(r.destination.split("=")[1]);
  });
});
