// Regression checks: Continuity uses the existing Ledger Desk hero, not a competing visual system.
import { readFileSync, statSync } from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const html = readFileSync("site/index.html", "utf8");
const template = readFileSync("templates/home.html", "utf8");
const product = readFileSync("site/continuity-v2/index.html", "utf8");
const guide = readFileSync("site/continuity-v2/guide/index.html", "utf8");
const demo = "/continuity-rehearsal/continuity/demo/index.html";
const download = "/downloads/noshashi-continuity-browser.zip";
for (const page of [template, html]) {
  assert.match(page, /class="rh-title lx-hero"/);
  assert.match(page, /class="lx-headline rf-headline"/);
  assert.match(page, /NOSHASHI:<br><em>Continuity<\/em>/);
  assert.match(page, /href="\/continuity-v2\/"/);
  assert.match(page, /href="\/design-partners\/#partner-form"/);
  assert.match(page, /No signing, custody or transaction submission/);
  assert.ok(page.includes(`href="${demo}"`));
  assert.ok(page.includes(`href="${download}" download`));
  assert.match(page, /<video controls playsinline preload="none"/);
  assert.match(page, /<track kind="captions" src="\/assets\/continuity-rehearsal\/walkthrough\.vtt"/);
  assert.doesNotMatch(page, /id="continuity-v2"/);
  assert.ok(page.indexOf('class="rh-title lx-hero"') < page.indexOf('id="vx-products"'), "Continuity must lead the homepage");
}
assert.match(product, /href="\/design-partners\/#partner-form"/);
assert.match(product, /No signing, custody or transaction submission/);
assert.match(product, /Not yet validated/);
assert.match(product, /prefers-reduced-motion:reduce/);
for (const page of [product, guide]) {
  assert.ok(page.includes(demo));
  assert.ok(page.includes(download));
}
assert.ok(statSync("site" + demo).isFile());
for (const file of ["walkthrough.mp4", "walkthrough.vtt", "poster.webp"]) {
  assert.ok(statSync(`site/assets/continuity-rehearsal/${file}`).size > 0);
}
const archive = readFileSync("site" + download);
const checksum = createHash("sha256").update(archive).digest("hex");
assert.equal(readFileSync(`site${download}.sha256`, "utf8"), `${checksum}  noshashi-continuity-browser.zip\n`);
const app = readFileSync("continuity/ContinuityApp.tsx", "utf8");
assert.match(app, /h-dvh/);
assert.match(app, /min-w-0 w-full/);
assert.match(app, /overflow-auto/);
assert.match(app, /aria-label="Continuity review results"/);
assert.match(app, /No private keys/);
console.log("Continuity Ledger Desk homepage and narrow-window static checks passed.");
