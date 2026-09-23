#!/usr/bin/env node
/**
 * Raster brand files, rendered with the bundled Chromium.
 *
 *   app-icon-master.png        1024px app icon: the owner's flower artwork
 *                              (brand/flower-source.png) on the garden ground.
 *                              Source for `npm run icon` (tauri icon).
 *   src-tauri/icons/tray.png   macOS menu-bar template images from the
 *   src-tauri/icons/tray@2x.png  single-colour vector (brand/flower-mono.svg).
 *   site/assets/flower-mark-{64,128,180}.png, public/brand/flower-mark-128.png
 *                              the artwork itself as the logo: square, cropped
 *                              around its lit core, transparent (favicons embed
 *                              the 64px one; headers and console marks use 128).
 *   site/assets/flower.webp    the artwork at hero size, transparent, for the
 *   public/brand/flower.webp   website hero and the console (the 1.4 MB PNG
 *                              source is too heavy to serve).
 *
 * Full-bleed ground by design: every OS applies its own corner mask, and a
 * second rounding under theirs is what once left white icon corners.
 *
 *   node scripts/gen-brand.mjs && node scripts/gen-brand-raster.mjs && npm run icon
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

// The artwork's core sits at (628, 578) of 1263x1245; offset it so the
// core, not the image box, lands on the icon's centre.
const flower = dataUrl("brand/flower-source.png", "image/png");
await render(
  `<div style="width:1024px;height:1024px;position:relative;overflow:hidden;
     background:radial-gradient(circle at 50% 50%,#17301D 0%,#0C1710 52%,#060B07 100%)">
     <img src="${flower}" style="position:absolute;width:880px;
       left:${512 - 628 * (880 / 1263)}px;top:${512 - 578 * (880 / 1263)}px">
   </div>`,
  1024,
  "app-icon-master.png"
);

const mono = dataUrl("brand/flower-mono.svg", "image/svg+xml");
for (const [px, pad, out] of [
  [44, 3, "src-tauri/icons/tray.png"],
  [88, 6, "src-tauri/icons/tray@2x.png"],
]) {
  await render(
    `<img src="${mono}" style="display:block;width:${px - pad * 2}px;height:${px - pad * 2}px;margin:${pad}px">`,
    px,
    out
  );
}

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
  for (const out of ["site/assets/flower.webp", "public/brand/flower.webp"]) {
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
    async ({ src, sizes }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      // Core at (628, 578); every petal tip lies within 600px of it.
      const half = 600;
      return sizes.map((px) => {
        const c = document.createElement("canvas");
        c.width = c.height = px;
        const g = c.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(img, 628 - half, 578 - half, half * 2, half * 2, 0, 0, px, px);
        return c.toDataURL("image/png").split(",")[1];
      });
    },
    { src: flower, sizes }
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

await browser.close();
