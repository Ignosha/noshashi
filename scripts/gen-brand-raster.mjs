#!/usr/bin/env node
/**
 * Raster brand files, rendered with the bundled Chromium.
 *
 *   Desktop launcher/tray icons are delegated to gen-app-icons.mjs after
 *   the existing website artwork is rendered. They use the circular seal
 *   and separate Academy wordmark, with transparent desktop corners.
 *   site/assets/flower-mark-{64,128,180}.png, public/brand/flower-mark-128.png
 *                              the artwork itself as the logo: square, cropped
 *                              around its lit core, transparent (favicons embed
 *                              the 64px one; headers and console marks use 128).
 *   site/assets/flower.webp    the artwork at hero size, transparent, for the
 *                              website hero (the 1.4 MB PNG
 *                              source is too heavy to serve).
 *
 *   node scripts/gen-brand.mjs && node scripts/gen-brand-raster.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataUrl = (rel, type) =>
  `data:${type};base64,${readFileSync(resolve(root, rel)).toString("base64")}`;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);

async function render(html, px, out) {
  const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await page.screenshot({ path: resolve(root, out), omitBackground: true });
  await page.close();
  console.log(`wrote ${out}`);
}

// Where the artwork sits in its source image: the point the marks centre
// on, the source width, and the half-size of the square that holds every
// petal tip. ART_V1 is the previous green flower (1263x1245).
const ART = { cx: 954, cy: 568, w: 1920, half: 920, ground: ["#13213D", "#0A1224", "#050912"] };
// Offset the artwork so its centre, not the image box, lands on the icon's centre.
const flower = dataUrl("brand/flower-source.png", "image/png");

// Web copies of the artwork: WebP keeps the alpha channel at a fraction
// of the PNG's weight.
{
  const page = await browser.newPage();
  const webp = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = 960;
    const h = Math.round((img.height * w) / img.width);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/webp", 0.9).split(",")[1];
  }, flower);
  const bytes = Buffer.from(webp, "base64");
  for (const out of ["site/assets/flower.webp"]) {
    mkdirSync(dirname(resolve(root, out)), { recursive: true });
    writeFileSync(resolve(root, out), bytes);
    console.log(`wrote ${out} (${(bytes.length / 1024).toFixed(0)} KB)`);
  }
  await page.close();
}

// The logo marks: the artwork, square, centred on its core.
{
  const page = await browser.newPage();
  const sizes = [64, 128, 180];
  const pngs = await page.evaluate(
    async ({ src, sizes, art }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const { cx, cy, half } = art;
      return sizes.map((px) => {
        const c = document.createElement("canvas");
        c.width = c.height = px;
        const g = c.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(img, cx - half, cy - half, half * 2, half * 2, 0, 0, px, px);
        return c.toDataURL("image/png").split(",")[1];
      });
    },
    { src: flower, sizes, art: ART }
  );
  const outs = {
    64: ["site/assets/flower-mark-64.png"],
    128: ["site/assets/flower-mark-128.png", "public/brand/flower-mark-128.png"],
    180: ["site/assets/flower-mark-180.png"],
  };
  sizes.forEach((px, i) => {
    for (const out of outs[px]) {
      writeFileSync(resolve(root, out), Buffer.from(pngs[i], "base64"));
      console.log(`wrote ${out}`);
    }
  });
  await page.close();
}

// The website touch icons: the ledger mark (site/assets/ledger-mark.svg)
// full-bleed, since iOS rounds its own corners.
const ledger = dataUrl("site/assets/ledger-mark.svg", "image/svg+xml");
for (const [px, out] of [[180, "site/assets/ledger-mark-180.png"], [512, "site/assets/ledger-mark-512.png"]]) {
  await render(
    `<div style="width:${px}px;height:${px}px;background:#0B0B0C;overflow:hidden"><img src="${ledger}" style="display:block;width:${px * 1.08}px;height:${px * 1.08}px;margin:${-px * 0.04}px"></div>`,
    px,
    out
  );
}

await browser.close();
await import("./gen-app-icons.mjs");
