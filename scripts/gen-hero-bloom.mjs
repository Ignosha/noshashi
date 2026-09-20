/*
 * Generates the landing hero's decorative bloom: templates/hero-bloom.svg.
 *
 * Run: node scripts/gen-hero-bloom.mjs
 *
 * WHY A GENERATOR AND NOT A HAND-DRAWN ASSET
 *
 * The form has to be ours, self-hosted and free — a stock render would
 * be a third-party asset that `default-src 'self'` refuses and that we
 * would not own. Generating it means the shapes are reviewable as code,
 * the seed makes the output reproducible, and regenerating is one
 * command rather than a round trip through a drawing tool.
 *
 * WHAT IT MUST NOT LOOK LIKE
 *
 * This is decoration, and DESIGN.md's ban on "decorative data" is still
 * in force. Nothing here may read as a figure: no axis, no baseline, no
 * trace, no tick, nothing a visitor could mistake for a measurement.
 * Organic, obviously ornamental, obviously not a chart.
 *
 * COLOUR
 *
 * Every stop is `currentColor`, so the one `color` set on the container
 * carries the whole form. That is what lets the light theme flip it: on
 * #F4F7FA a white translucent petal is invisible.
 */

import { writeFile } from "node:fs/promises";

/* Fixed seed: the composition is reviewed, so it must not move under us
 * on the next run. Change it to explore, commit only what you looked at. */
const SEED = 20260920;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const r = (lo, hi) => lo + (hi - lo) * rnd();
const n = (v) => Number(v.toFixed(2));

/*
 * One petal, drawn from its base at the origin pointing up (-y).
 *
 * The two flanks use different control points on purpose. A petal with
 * mirrored flanks reads as a leaf clip-art; the asymmetry plus `twist`
 * (which slides the tip off the axis) is most of what makes the shape
 * look grown rather than constructed.
 */
function petalPath(len, wid, twist) {
  const tipX = twist;
  return [
    `M0 0`,
    `C${n(wid)} ${n(-len * 0.19)} ${n(wid * 0.88 + twist)} ${n(-len * 0.63)} ${n(tipX)} ${n(-len)}`,
    `C${n(-wid * 0.81 + twist)} ${n(-len * 0.61)} ${n(-wid * 0.95)} ${n(-len * 0.22)} 0 0`,
    `Z`,
  ].join(" ");
}

/* A vein runs base-to-tip inside the petal, a shade brighter than the
 * fill. Three of them is the difference between a silhouette and
 * something that looks lit from behind. */
function veinPath(len, wid, twist, bias) {
  const off = wid * bias;
  return `M0 ${n(-len * 0.04)} C${n(off * 0.7)} ${n(-len * 0.34)} ${n(off + twist * 0.5)} ${n(-len * 0.66)} ${n(twist * 0.9)} ${n(-len * 0.93)}`;
}

/* A whorl of petals around one centre. `depth` dims the back layer so
 * the two whorls read as in front of and behind each other. */
function whorl({ count, len, wid, rot0, depth, spread }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rot0 + (360 / count) * i + r(-9, 9);
    const L = len * r(0.84, 1.16);
    const W = wid * r(0.82, 1.18);
    const twist = r(-W * 0.42, W * 0.42);
    const sc = spread * r(0.94, 1.06);
    out.push(
      `<g transform="rotate(${n(a)}) scale(${n(sc)})" opacity="${n(depth * r(0.8, 1.05))}">` +
        `<path d="${petalPath(L, W, twist)}" fill="url(#hb-petal)" stroke="currentColor" stroke-opacity=".30" stroke-width="${n(0.9 / sc)}"/>` +
        `<path d="${veinPath(L, W, twist, 0.05)}" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="${n(0.7 / sc)}"/>` +
        `<path d="${veinPath(L, W, twist, 0.42)}" fill="none" stroke="currentColor" stroke-opacity=".11" stroke-width="${n(0.6 / sc)}"/>` +
        `<path d="${veinPath(L, W, twist, -0.38)}" fill="none" stroke="currentColor" stroke-opacity=".11" stroke-width="${n(0.6 / sc)}"/>` +
      `</g>`
    );
  }
  return out.join("");
}

function bloom({ cx, cy, scale, rot, alpha }) {
  return (
    `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n(scale)})" opacity="${n(alpha)}">` +
      whorl({ count: 5, len: 188, wid: 54, rot0: rot, depth: 0.55, spread: 1 }) +
      whorl({ count: 4, len: 126, wid: 40, rot0: rot + 34, depth: 0.9, spread: 0.92 }) +
      `<ellipse rx="19" ry="25" fill="url(#hb-core)"/>` +
      `<ellipse rx="7" ry="10" fill="currentColor" opacity=".30"/>` +
    `</g>`
  );
}

/* The trailing filaments. Long, thin, tapering off — they are what stop
 * the three blooms reading as three stickers dropped on a background. */
function filament(x0, y0, dx, dy, sway, w) {
  const x1 = x0 + dx, y1 = y0 + dy;
  const d =
    `M${n(x0)} ${n(y0)} ` +
    `C${n(x0 + sway)} ${n(y0 + dy * 0.3)} ${n(x1 - sway * 1.4)} ${n(y0 + dy * 0.55)} ${n(x0 + dx * 0.62)} ${n(y0 + dy * 0.72)} ` +
    `S${n(x1 - sway * 0.3)} ${n(y1 - dy * 0.08)} ${n(x1)} ${n(y1)}`;
  return `<path d="${d}" fill="none" stroke="currentColor" stroke-opacity=".17" stroke-width="${n(w)}" stroke-linecap="round"/>`;
}

const filaments = [];
for (let i = 0; i < 18; i++) {
  filaments.push(
    filament(r(300, 760), r(150, 430), r(-230, 130), r(180, 380), r(-150, 150), r(0.5, 1.5))
  );
}

const svg = `<svg class="hi-bloom" viewBox="0 0 1000 760" fill="none"
     xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"
     preserveAspectRatio="xMidYMid slice">
  <defs>
    <!-- IDs are prefixed per DESIGN.md: two inline marks on one page
         must not be able to collide on a gradient id. -->
    <radialGradient id="hb-petal" cx="50%" cy="86%" r="74%">
      <stop offset="0%" stop-color="currentColor" stop-opacity=".44"/>
      <stop offset="46%" stop-color="currentColor" stop-opacity=".21"/>
      <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="hb-core" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="currentColor" stop-opacity=".60"/>
      <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g class="hb-filaments">${filaments.join("")}</g>
${[
  bloom({ cx: 660, cy: 225, scale: 1.28, rot: 8, alpha: 0.95 }),
  bloom({ cx: 372, cy: 432, scale: 1.02, rot: 142, alpha: 0.8 }),
  // Kept left of 300: further right and this one sits behind the brief
  // card, where it is both invisible and in the way of the copy.
  bloom({ cx: 214, cy: 610, scale: 0.66, rot: 62, alpha: 0.66 }),
].join("\n")}
</svg>
`;

await writeFile(new URL("../templates/hero-bloom.svg", import.meta.url), svg);
console.log(`hero-bloom.svg written (${svg.length} bytes, seed ${SEED})`);
