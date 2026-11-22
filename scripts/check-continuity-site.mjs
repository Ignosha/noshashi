// Regression checks: Continuity uses the existing Ledger Desk hero, not a competing visual system.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const html = readFileSync("site/index.html", "utf8");
const template = readFileSync("templates/home.html", "utf8");
const product = readFileSync("site/continuity-v2/index.html", "utf8");
for (const page of [template, html]) {
  assert.match(page, /class="rh-title lx-hero"/);
  assert.match(page, /class="lx-headline rf-headline"/);
  assert.match(page, /Know before\.<br>Act with<br><em>evidence\.<\/em>/);
  assert.match(page, /href="\/continuity-v2\/"/);
  assert.match(page, /href="\/design-partners\/#partner-form"/);
  assert.match(page, /No signing, custody or transaction submission/);
  assert.doesNotMatch(page, /id="continuity-v2"/);
  assert.ok(page.indexOf('class="rh-title lx-hero"') < page.indexOf('id="vx-products"'), "Continuity must lead the homepage");
}
assert.match(product, /href="\/design-partners\/#partner-form"/);
assert.match(product, /No signing, custody or transaction submission/);
assert.match(product, /Not yet validated/);
assert.match(product, /prefers-reduced-motion:reduce/);
const app = readFileSync("continuity/ContinuityApp.tsx", "utf8");
assert.match(app, /h-dvh/);
assert.match(app, /min-w-0 w-full/);
assert.match(app, /overflow-auto/);
assert.match(app, /aria-label="Continuity review results"/);
assert.match(app, /No private keys/);
console.log("Continuity Ledger Desk homepage and narrow-window static checks passed.");
