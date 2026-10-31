#!/usr/bin/env node
/**
 * The NOSHASHI flower — one geometry, every vector brand file.
 *
 * The logo is the owner's flower artwork itself (brand/flower-source.png):
 * the app icon, favicons, site header and every colour mark in the console
 * use it directly, via the square marks gen-brand-raster.mjs crops from it.
 *
 * What stays vector is the single-colour silhouette: macOS menu-bar
 * template images and currentColor chrome must be one flat colour, which a
 * photograph-like artwork cannot be. It is traced from the artwork, measured
 * in the source image's own pixels and normalised to a 100-unit box: four
 * cardinal petals, four diagonals (the lower pair longer, as drawn) and
 * four inner petals, cut apart by transparent gaps.
 *
 *   node scripts/gen-brand.mjs          write every file
 *   node scripts/gen-brand.mjs --check  fail if any file is stale (CI)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const r = (n) => Math.round(n * 100) / 100;

// Measured in the source image: core at (628, 578); a 1210px square
// around it holds every petal tip. Map that square to 0..100.
const SRC = { cx: 628, cy: 578, box: 1210 };
const k = 100 / SRC.box;

/** A vesica petal, pointed at both ends, from the core to (dx, dy) source pixels, half-width hw source pixels. */
function petal(dx, dy, hw) {
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len; // along the petal
  const nx = -uy, ny = ux; // across it
  const at = (along, across) =>
    `${r(50 + (ux * along + nx * across) * k)} ${r(50 + (uy * along + ny * across) * k)}`;
  return (
    `M${at(0, 0)}` +
    `C${at(len * 0.22, hw * 1.25)} ${at(len * 0.64, hw * 1.2)} ${at(len, 0)}` +
    `C${at(len * 0.64, -hw * 1.2)} ${at(len * 0.22, -hw * 1.25)} ${at(0, 0)}Z`
  );
}

export const FLOWER = {
  viewBox: "0 0 100 100",
  // Back to front.
  diagonal: [
    petal(-348, 397, 98), petal(350, 397, 98), // lower pair, longer
    petal(-285, -320, 86), petal(290, -320, 86), // upper pair
  ],
  cardinal: [petal(0, -549, 132), petal(0, 558, 122), petal(-582, 2, 112), petal(587, 2, 112)],
  inner: [petal(-120, -250, 56), petal(120, -250, 56), petal(-150, 330, 64), petal(150, 330, 64)],
  veins: [
    `M${r(50)} ${r(50 - 549 * k)}V${r(50 + 558 * k)}`,
    `M${r(50 - 582 * k)} ${r(50 + 2 * k)}H${r(50 + 587 * k)}`,
  ],
};

const ALL = () => [...FLOWER.diagonal, ...FLOWER.cardinal, ...FLOWER.inner];

/** The flat rendering: cardinals cut out of the diagonals, veins cut through. */
export function flowerMono({ id = "nm", fill = "currentColor" } = {}) {
  const gap = 2.4;
  return (
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">` +
    FLOWER.diagonal.map((d) => `<path d="${d}" fill="#fff"/>`).join("") +
    FLOWER.cardinal
      .map((d) => `<path d="${d}" fill="#000" stroke="#000" stroke-width="${gap * 2}" stroke-linejoin="round"/><path d="${d}" fill="#fff"/>`)
      .join("") +
    FLOWER.veins.map((d) => `<path d="${d}" stroke="#000" stroke-width="1.6"/>`).join("") +
    `<circle cx="50" cy="50" r="6.5" fill="#fff"/>` +
    `</mask>` +
    `<rect width="100" height="100" fill="${fill}" mask="url(#${id})"/>`
  );
}

// The website mark (2026-10-31, second edition): the NOSHASHI monogram, a
// serif N (Instrument Serif, outlined) on still water: a firm outer ring
// and one ripple inside it, with the letter cut clear of the ripple by a
// knockout in the ground colour. Original geometry; nothing from the XRP or
// Ripple marks. The full-size monogram and its variations are drawn by
// scripts/gen-logo-variations.py. The flower stays the desktop app icon,
// tray and BIMI logo.
const MONO_N = "M19.02 22.77Q18.72 22.77 18.51 22.32L13.36 11.14Q13.3 11.01 13.22 11.03Q13.13 11.05 13.13 11.2V20.97Q13.13 21.5 13.31 21.77Q13.49 22.05 13.97 22.12L14.21 22.16Q14.46 22.18 14.46 22.39Q14.46 22.6 14.18 22.6H11.46Q11.17 22.6 11.17 22.39Q11.17 22.18 11.42 22.16L11.67 22.12Q12.16 22.05 12.35 21.77Q12.54 21.5 12.54 20.97V10.17Q12.54 9.78 12.42 9.64Q12.3 9.51 11.86 9.43L11.42 9.36Q11.17 9.3 11.17 9.13Q11.17 8.92 11.46 8.92H13.49Q13.97 8.92 14.16 9.34L18.64 19.2Q18.7 19.31 18.78 19.29Q18.87 19.28 18.87 19.16V10.55Q18.87 9.95 18.66 9.71Q18.45 9.47 18.13 9.41L17.79 9.36Q17.54 9.3 17.54 9.13Q17.54 8.92 17.82 8.92H20.54Q20.83 8.92 20.83 9.13Q20.83 9.34 20.58 9.36L20.33 9.4Q19.84 9.47 19.65 9.71Q19.46 9.95 19.46 10.55V22.16Q19.46 22.51 19.33 22.64Q19.21 22.77 19.02 22.77Z";
export const siteMark = (ground = "var(--ground)") =>
  `<circle cx="16" cy="16" r="14.6" fill="none" stroke="currentColor" stroke-width="1.7"/>` +
  `<circle cx="16" cy="16" r="10.6" fill="none" stroke="currentColor" stroke-width=".9" opacity=".5"/>` +
  `<path d="${MONO_N}" fill="${ground}" stroke="${ground}" stroke-width="2.2" stroke-linejoin="round"/>` +
  `<path d="${MONO_N}" fill="currentColor"/>`;
export const LEDGER_MARK = siteMark();

/** The mark on its tile: favicons and touch icons. */
export function ledgerTile() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<!-- NOSHASHI monogram. Generated by scripts/gen-brand.mjs; edit there. -->
<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1C1C1F"/><stop offset="1" stop-color="#0B0B0C"/></linearGradient></defs>
<rect width="32" height="32" rx="7" fill="url(#t)"/>
<rect x=".5" y=".5" width="31" height="31" rx="6.5" fill="none" stroke="#FFFFFF" stroke-opacity=".12"/>
<g transform="translate(16 16) scale(.84) translate(-16 -16)" style="color:#E8E8EA">${siteMark("#131315")}</g>
</svg>
`;
}

// Favicons embed the artwork itself (the 64px mark written by
// gen-brand-raster.mjs), so every page's existing <link rel="icon"
// href="/favicon.svg"> shows the owner's flower, not a redrawing of it.
const markPng = readFileSync(resolve(root, "site/assets/flower-mark-64.png")).toString("base64");
const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64">
<!-- NOSHASHI flower: the artwork itself. Generated by scripts/gen-brand.mjs; edit there. -->
<image width="64" height="64" href="data:image/png;base64,${markPng}"/>
</svg>
`;

const mono = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
<!-- NOSHASHI flower, single colour. Generated by scripts/gen-brand.mjs; edit there. -->
${flowerMono({ id: "nm", fill: "#000" })}
</svg>
`;

// The BIMI logo, the mark mail clients show beside a message from
// noshashi.app (DNS: default._bimi). BIMI accepts only SVG Tiny PS: no
// raster images, masks, filters or scripts, a <title>, a square box and a
// solid background. So this is the vector flower painted in layers on the
// site's ground colour, with gaps cut by painting the ground colour, and
// a radial glow standing in for the artwork's light. Mail clients crop it
// to a circle, hence the scale that keeps every petal tip inside it.
const BIMI_GROUND = "#070B14"; // --ground in site/assets/core.css
function bimiLayer(paths, gradient, gap) {
  return paths
    .map((d) =>
      (gap ? `<path d="${d}" fill="${BIMI_GROUND}" stroke="${BIMI_GROUND}" stroke-width="${gap}" stroke-linejoin="round"/>` : "") +
      `<path d="${d}" fill="url(#${gradient})"/>`)
    .join("\n");
}
const bimi = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps" viewBox="0 0 100 100">
<title>NOSHASHI</title>
<!-- Generated by scripts/gen-brand.mjs; edit there. -->
<defs>
<radialGradient id="d" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="50"><stop offset="0" stop-color="#6FCB4F"/><stop offset="1" stop-color="#0E3F18"/></radialGradient>
<radialGradient id="c" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="50"><stop offset="0" stop-color="#C6F58A"/><stop offset="0.45" stop-color="#3DA244"/><stop offset="1" stop-color="#145C22"/></radialGradient>
<radialGradient id="i" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="30"><stop offset="0" stop-color="#F4FFE0"/><stop offset="0.5" stop-color="#4C8DFF"/><stop offset="1" stop-color="#3DA244"/></radialGradient>
<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="12"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C6F58A"/></radialGradient>
</defs>
<rect width="100" height="100" fill="${BIMI_GROUND}"/>
<g transform="translate(50 50) scale(0.88) translate(-50 -50)">
${bimiLayer(FLOWER.diagonal, "d", 0)}
${bimiLayer(FLOWER.cardinal, "c", 3.2)}
${bimiLayer(FLOWER.inner, "i", 2)}
${FLOWER.veins.map((d) => `<path d="${d}" fill="none" stroke="${BIMI_GROUND}" stroke-width="0.8" stroke-opacity="0.55"/>`).join("\n")}
<circle cx="50" cy="50" r="5" fill="url(#g)"/>
</g>
</svg>
`;

const GENERATED = "Generated by scripts/gen-brand.mjs — do not edit; edit the generator.";

const flowerTs = `// ${GENERATED}
export const FLOWER = ${JSON.stringify(FLOWER, null, 2)} as const;

/** The NOSHASHI monogram's letter: Instrument Serif N, outlined, in a 32-unit box. */
export const MONOGRAM_N = ${JSON.stringify(MONO_N)};
`;

// The site header mark: the monogram, inline, in the text colour.
const brandMarkJs = `// ${GENERATED}
export const MARK = \`<svg class="brand-mark" viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true" focusable="false">${LEDGER_MARK}</svg>\`;
`;

const outputs = {
  "src/components/nova/brand/flower.ts": flowerTs,
  "api/_lib/brand-mark.js": brandMarkJs,
  "site/favicon.svg": ledgerTile(),
  "site/assets/ledger-mark.svg": ledgerTile(),
  "public/app-icon.svg": appIcon,
  "brand/flower-mono.svg": mono,
  "site/bimi/logo.svg": bimi,
};

const check = process.argv.includes("--check");
let stale = 0;
for (const [rel, body] of Object.entries(outputs)) {
  const path = resolve(root, rel);
  if (check) {
    let current = "";
    try { current = readFileSync(path, "utf8"); } catch {}
    if (current !== body) { console.error(`stale: ${rel} — run node scripts/gen-brand.mjs`); stale += 1; }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    console.log(`wrote ${rel}`);
  }
}
if (stale) process.exit(1);
