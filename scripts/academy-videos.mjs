#!/usr/bin/env node
/**
 * Copy the course videos into the Academy desktop build (academy/dist/videos/),
 * so they play with no internet connection. Run after the Vite build by
 * `npm run academy:build`. The website build does not run it: on the site
 * the same files are already served from /learn/videos/.
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FROM = path.join(ROOT, "site/learn/videos");
const TO = path.join(ROOT, "academy/dist/videos");
mkdirSync(TO, { recursive: true });
const files = readdirSync(FROM).filter((f) => /\.(mp4|jpg)$/.test(f));
for (const f of files) copyFileSync(path.join(FROM, f), path.join(TO, f));
console.log(`academy: ${files.length} video files bundled for offline use`);
