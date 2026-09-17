#!/usr/bin/env node
/*
 * Surface router for the omniroute skill.
 *
 * Given a path or a topic, says which surface owns it, whether it is a
 * source or a build artifact, how to verify a change to it, and what is
 * coupled to it.
 *
 *   node .claude/skills/omniroute/scripts/route.mjs [path-or-topic]
 *
 * Read-only. The generated/source distinction is declared here rather
 * than inferred, because inferring it from the filesystem is exactly
 * the mistake the skill exists to prevent: a generated file looks
 * identical to a hand-written one.
 */

import path from "node:path";

const SURFACES = [
  {
    id: "site-generated",
    match: [/^site\/index\.html$/, /^site\/(news|status|progress|contact)\//, /^site\/sitemap\.xml$/],
    name: "Public website — GENERATED",
    generated: true,
    source: "templates/home.html, api/_lib/sections.js, api/_lib/shell.js, site/data/updates.json",
    verify: "node scripts/build-site.mjs && node scripts/dev-site.mjs",
    couples: ["release metadata comes from the GitHub Releases API at build time — never typed in",
              "nav and footer are defined in api/_lib/shell.js and inline in templates/home.html"],
  },
  {
    id: "site-template",
    match: [/^templates\//],
    name: "Public website — landing page template",
    generated: false,
    source: "this is the source; site/index.html is its output",
    verify: "node scripts/build-site.mjs",
    couples: ["every <!--SLOT:NAME--> must be filled by scripts/build-site.mjs or the build fails",
              "nav and footer here must match api/_lib/shell.js"],
  },
  {
    id: "site-static",
    match: [/^site\/(pricing|guide|research|legal|downloads)\//],
    name: "Public website — hand-written page",
    generated: false,
    source: "this is the source; edit in place",
    verify: "node scripts/dev-site.mjs, then read the page",
    couples: ["nav and footer must match api/_lib/shell.js and templates/home.html"],
  },
  {
    id: "site-assets",
    match: [/^site\/assets\//, /^site\/fonts\//, /^site\/data\//],
    name: "Public website — shared assets and data",
    generated: false,
    source: "this is the source",
    verify: "node scripts/build-site.mjs && node scripts/dev-site.mjs",
    couples: ["modules.css is linked by both the landing page and the generated pages",
              "site/data/updates.json drives the mission log and the status board"],
  },
  {
    id: "api",
    match: [/^api\//],
    name: "Serverless functions (Vercel)",
    generated: false,
    source: "this is the source",
    verify: "node scripts/dev-site.mjs, then curl the endpoint",
    couples: ["deploys with installCommand empty — no node_modules, so no dependencies",
              "api/_lib/* is shared and is NOT routable: underscore files are excluded",
              "api/_lib/kb.js feeds both the support console and the landing page questions"],
  },
  {
    id: "app",
    match: [/^src\//],
    name: "Desktop application (React + Vite)",
    generated: false,
    source: "this is the source",
    verify: "npm run build && npm test",
    couples: ["src/lib/supabase/client.ts origin is allowlisted in both src-tauri CSPs",
              "src/index.css holds the design tokens; DESIGN.md is the authority"],
  },
  {
    id: "tauri",
    match: [/^src-tauri\//],
    name: "Native shell (Tauri)",
    generated: false,
    source: "this is the source",
    verify: "npm run tauri:build",
    couples: ["the CSP allowlist must agree with src/lib/supabase/client.ts, https and wss",
              "tauri.conf.json and tauri.demo.conf.json must both be changed"],
  },
  {
    id: "supabase",
    match: [/^supabase\//],
    name: "Edge functions (Deno)",
    generated: false,
    source: "this is the source",
    verify: "npm run check:functions",
    couples: ["the service-role key lives only here and must never reach the repository"],
  },
  {
    id: "scripts",
    match: [/^scripts\//],
    name: "Build and tooling",
    generated: false,
    source: "this is the source",
    verify: "run the script",
    couples: ["build-site.mjs writes into site/ — changing it changes the deployed site"],
  },
  {
    id: "dist",
    match: [/^dist/, /^node_modules\//, /^src-tauri\/target\//],
    name: "Build output",
    generated: true,
    source: "npm run build (or cargo)",
    verify: "n/a",
    couples: ["never edited, never committed"],
  },
];

const TOPICS = {
  news: "site-assets", newsroom: "site-assets", feed: "api",
  stripe: "api", checkout: "api", billing: "api", payment: "api",
  contact: "api", support: "api", bot: "api", chat: "api",
  download: "site-generated", release: "site-generated", version: "site-generated",
  nav: "site-template", footer: "site-template", landing: "site-template", home: "site-template",
  pricing: "site-static", legal: "site-static", guide: "site-static",
  css: "site-assets", style: "site-assets", font: "site-assets", theme: "site-assets",
  status: "site-assets", maintenance: "site-assets", incident: "site-assets", log: "site-assets",
  test: "app", component: "app", token: "app",
  tauri: "tauri", updater: "tauri", csp: "tauri",
  edge: "supabase", deno: "supabase",
};

function printSurface(surface) {
  console.log(`\n  surface   ${surface.name}`);
  console.log(`  kind      ${surface.generated ? "ARTIFACT — do not edit" : "source"}`);
  console.log(`  ${surface.generated ? "edit" : "note"}      ${surface.source}`);
  console.log(`  verify    ${surface.verify}`);
  if (surface.couples?.length) {
    console.log("  couples");
    for (const c of surface.couples) console.log(`    · ${c}`);
  }
  if (surface.generated) {
    console.log("\n  ⚠ An edit here is erased by the next build. Restate the task");
    console.log("    against the source above before changing anything.");
  }
}

const query = process.argv.slice(2).join(" ").trim();

if (!query) {
  console.log("── SURFACE MAP ───────────────────────────────────────────────");
  for (const surface of SURFACES) {
    console.log(`\n${surface.name}${surface.generated ? "  [artifact]" : ""}`);
    console.log(`  paths   ${surface.match.map((r) => r.source).join(", ")}`);
    console.log(`  verify  ${surface.verify}`);
  }
  console.log("\nGive a path or a topic to route one change.");
  process.exit(0);
}

// A path if it looks like one; otherwise a topic keyword.
const normalised = query.replace(/^\.\//, "").replace(/^\/+/, "");
let surface = SURFACES.find((s) => s.match.some((r) => r.test(normalised)));

if (!surface) {
  const word = query.toLowerCase().split(/\s+/).find((w) => TOPICS[w]);
  if (word) {
    surface = SURFACES.find((s) => s.id === TOPICS[word]);
    console.log(`── ROUTE ─────────────────────────────────────────────────────`);
    console.log(`  query     ${query}  (matched topic "${word}")`);
  }
} else {
  console.log(`── ROUTE ─────────────────────────────────────────────────────`);
  console.log(`  query     ${normalised}`);
}

if (!surface) {
  console.log("── ROUTE ─────────────────────────────────────────────────────");
  console.log(`  query     ${query}`);
  console.log("\n  No surface claims this.");
  console.log("  Do not guess from the filename. Find what writes the file:");
  console.log("    grep -rn '<filename>' scripts/ package.json vercel.json");
  console.log("  A file nothing generates is a source. Run with no argument");
  console.log("  for the full map.");
  process.exit(0);
}

printSurface(surface);
console.log(`\n  ${path.basename(process.cwd())} · omniroute`);
