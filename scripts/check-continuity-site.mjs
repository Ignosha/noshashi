// Static regression checks for the Continuity V2 homepage introduction.
// No browser dependencies or network access required.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync("site/index.html", "utf8");
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
console.log("Continuity V2 homepage integration: static checks passed.");
