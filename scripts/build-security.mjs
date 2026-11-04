import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
const output = new URL("../site/assets/security-lab.js", import.meta.url);
const r = await build({
  entryPoints: [
    new URL("../src/site/security-entry.ts", import.meta.url).pathname,
  ],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  write: false,
});
const text =
  "/* NOSHASHI local quorum lab. Built from src/site/security-entry.ts. */\n" +
  r.outputFiles[0].text;
if (process.argv.includes("--check")) {
  if ((await readFile(output, "utf8")) !== text)
    throw Error("Rebuild the security lab with npm run site:security");
} else await writeFile(output, text);
