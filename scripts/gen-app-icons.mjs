#!/usr/bin/env node
/**
 * Launcher icons only. Keeps the existing web/BIMI artwork independent.
 * Run after gen-brand.mjs and gen-academy-brand.py. Requires Playwright's
 * Chromium (or CHROMIUM_PATH). Tauri creates native ICO/ICNS containers.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function raster(svg, size, output, background = "transparent") {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  try {
    const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    await page.setContent(`<body style="margin:0;background:${background}"><img width="${size}" height="${size}" src="${src}"></body>`);
    await page.locator("img").evaluate(img => img.decode());
    mkdirSync(dirname(resolve(root, output)), { recursive: true });
    await page.screenshot({ path: resolve(root, output), omitBackground: true });
    console.log(`wrote ${output}`);
  } finally { await page.close(); }
}
try {
  for (const [svgPath, master, dest] of [
    ["public/app-icon.svg", "app-icon-master.png", "src-tauri/icons"],
    ["public/brand/academy-icon.svg", "academy/app-icon-master.png", "academy/src-tauri/icons"],
  ]) {
    const svg = readFileSync(resolve(root, svgPath), "utf8");
    await raster(svg, 1024, master);
    const temp = mkdtempSync(join(tmpdir(), "noshashi-icons-"));
    try {
      execFileSync(process.execPath, [resolve(root, "node_modules/@tauri-apps/cli/tauri.js"), "icon", resolve(root, master), "--output", temp], { cwd: root, stdio: "pipe" });
      // Only replace the desktop bundle's referenced assets, not iOS or
      // Android icon sets with their different platform masking rules.
      for (const file of ["32x32.png", "128x128.png", "128x128@2x.png", "icon.png", "icon.ico", "icon.icns"]) {
        copyFileSync(join(temp, file), resolve(root, dest, file));
      }
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
  copyFileSync(resolve(root, "app-icon-master.png"), resolve(root, "public/icon.png"));
  const academy = readFileSync(resolve(root, "public/brand/academy-icon.svg"), "utf8");
  for (const [size, file, opaque] of [[192, "icon-192.png", false], [512, "icon-512.png", false], [512, "icon-maskable-512.png", true], [180, "apple-touch-icon.png", true]]) {
    await raster(academy, size, `academy/pwa/${file}`, opaque ? "#0B0B0C" : "transparent");
  }
  copyFileSync(resolve(root, "public/brand/academy-icon.svg"), resolve(root, "academy/pwa/app-icon.svg"));
  // Template tray image: a simple N and ring remain readable at menu-bar
  // sizes; fine seal lettering belongs in the larger launcher icon.
  const seal = readFileSync(resolve(root, "site/brand/logos/seal.svg"), "utf8");
  const paths = [...seal.matchAll(/<path\b[^>]*\/>/g)];
  const nPath = paths.at(-1)?.[0];
  if (!nPath) throw new Error("The seal must contain its outlined N before building tray icons.");
  const n = nPath.replaceAll("#EDEDED", "#000000");
  const tray = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 264 264"><circle cx="120" cy="120" r="112" fill="none" stroke="#000" stroke-width="9"/>${n}</svg>`;
  await raster(tray, 44, "src-tauri/icons/tray.png");
  await raster(tray, 88, "src-tauri/icons/tray@2x.png");
} finally { await browser.close(); }
