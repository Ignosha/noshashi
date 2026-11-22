// Static regression checks for the Continuity V2 homepage introduction.
// No browser dependencies or network access required.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync("site/index.html", "utf8");
const template = readFileSync("templates/home.html", "utf8");
assert.match(template, /id="continuity-v2"/);
assert.ok(template.indexOf('id="continuity-v2"') < template.indexOf('class="rh" data-garden-field'), "Continuity must lead the homepage");
assert.ok(html.indexOf('id="continuity-v2"') < html.indexOf('class="rh" data-garden-field'), "Built homepage must lead with Continuity");
assert.match(template, /href="\/continuity-v2\/"/);
assert.match(template, /href="\/assets\/continuity-v2\.css"/);
assert.match(template, /src="\/assets\/continuity-v2\.js"/);
const product = readFileSync("site/continuity-v2/index.html", "utf8");
assert.match(html, /href="\/continuity-v2\/"/);
assert.match(product, /href="\/design-partners\/#partner-form"/);
assert.match(product, /No signing, custody or transaction submission/);
assert.match(product, /Not yet validated/);
assert.match(product, /prefers-reduced-motion:reduce/);
const css = readFileSync("site/assets/continuity-v2.css", "utf8");
const js = readFileSync("site/assets/continuity-v2.js", "utf8");

assert.match(html, /id="continuity-v2"/);
assert.match(html, /aria-labelledby="cv2-title"/);
assert.match(html, /href="\/design-partners\/#partner-form"/);
assert.match(html, /CONTINUITY V2|Continuity V2/);
assert.match(html, /No signing, custody or transaction submission/);
assert.match(html, /href="\/assets\/continuity-v2\.css"/);
assert.match(html, /src="\/assets\/continuity-v2\.js"/);
assert.match(css, /max-width:420px/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(js, /IntersectionObserver/);
assert.match(js, /cv2-visible/);
// Guard the standalone UI's narrow-window behavior as well as the homepage.
const app = readFileSync("continuity/ContinuityApp.tsx", "utf8");
assert.match(app, /h-dvh/);
assert.match(app, /min-w-0 w-full/);
assert.match(app, /overflow-auto/);
assert.match(app, /aria-label="Continuity review results"/);
assert.match(app, /No private keys/);
console.log("Continuity V2 homepage and narrow-window static checks passed.");
