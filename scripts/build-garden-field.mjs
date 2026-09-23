#!/usr/bin/env node
/**
 * Bundle the garden field for the website: src/lib/garden/site-entry.ts
 * (with asciify-engine) -> site/assets/garden-field.js.
 *
 * The output is committed, like every other site asset, because the site
 * is served as static files. `--check` rebuilds in memory and fails when
 * the committed file is stale, so CI catches a source change pushed
 * without its bundle.
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "site/assets/garden-field.js");

const result = await build({
  entryPoints: [resolve(root, "src/lib/garden/site-entry.ts")],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  legalComments: "eof",
  write: false,
  logLevel: "silent",
  banner: {
    js: "/* NOSHASHI garden field. Built by scripts/build-garden-field.mjs; do not edit. Includes asciify-engine (MIT) github.com/ayangabryl/asciify-engine */",
  },
});
const code = result.outputFiles[0].text;

if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(out, "utf8"); } catch {}
  if (current !== code) {
    console.error("stale: site/assets/garden-field.js — run node scripts/build-garden-field.mjs");
    process.exit(1);
  }
} else {
  writeFileSync(out, code);
  console.log(`wrote site/assets/garden-field.js (${(code.length / 1024).toFixed(1)} KB)`);
}
