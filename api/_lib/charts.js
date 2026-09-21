/*
 * Server-rendered SVG for the XRP panel.
 *
 * Drawn here rather than in the browser so the shapes are in the HTML
 * that is served — and so the page has a chart before any JavaScript
 * runs. Script adds the crosshair and the tooltip; it never draws the
 * data.
 *
 * DESIGN.md governs every choice below and is worth restating, because
 * a market chart is exactly where a codebase starts growing colours:
 *
 *   - The trace is --brand. Not green, not red. Status colour is spent
 *     on GO/HOLD/NO-GO and nothing else, and a price going up is not a
 *     verdict about anything. Direction is carried by a glyph and a
 *     signed number, which also survives being read by someone who
 *     cannot distinguish the two colours.
 *   - The gradient under the trace is the house style the brand board
 *     specifies — strong at the line, gone at the baseline. It is the
 *     one gradient this codebase allows, and it encodes nothing.
 *   - Axes are labelled with units, numerals are tabular, and every
 *     chart carries its question above it.
 *   - No glow, no drop shadow, no second encoding, no chart junk.
 */

import { esc } from "./html.js";

/** Nice-ish round numbers for an axis, without a library. */
function bounds(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1 };
  if (min === max) return { lo: min * 0.995, hi: max * 1.005 };
  // 8% headroom so the trace never touches the frame, which reads as
  // clipped data rather than as a maximum.
  const pad = (max - min) * 0.08;
  return { lo: min - pad, hi: max + pad };
}

function fmtPrice(value) {
  return value >= 1 ? `$${value.toFixed(3)}` : `$${value.toFixed(4)}`;
}

function fmtDay(ms) {
  return new Date(ms).toISOString().slice(5, 10).replace("-", "/");
}

/**
 * Seven days of price as an area chart.
 *
 * `points` is [{t, v}] in ascending time. Returns an <svg> carrying its
 * own series so the crosshair script needs no second request.
 */
export function priceChart(points, { id = "xrp-price", label = "USD" } = {}) {
  if (!points || points.length < 8) {
    return `<div class="chart-empty">Price history was not available when this page was rendered.
      It is not drawn from a guess.</div>`;
  }

  const W = 1000, H = 260;
  const L = 8, R = 62, T = 14, B = 26;      // plot insets: room for labels
  const x0 = L, x1 = W - R, y0 = T, y1 = H - B;

  const values = points.map((p) => p.v);
  const { lo, hi } = bounds(values);
  const sx = (i) => x0 + ((x1 - x0) * i) / (points.length - 1);
  const sy = (v) => y1 - ((y1 - y0) * (v - lo)) / (hi - lo);

  const line = points.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(2)} ${sy(p.v).toFixed(2)}`).join(" ");
  const area = `${line} L${x1.toFixed(2)} ${y1} L${x0.toFixed(2)} ${y1} Z`;

  // Four horizontal references, labelled. An unlabelled gridline is
  // decoration; a labelled one is an axis.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = lo + (hi - lo) * f;
    const y = sy(v);
    return { y, v };
  });

  const grid = ticks
    .map(
      (t) =>
        `<line class="grid" x1="${x0}" x2="${x1}" y1="${t.y.toFixed(2)}" y2="${t.y.toFixed(2)}"/>` +
        `<text class="axis" x="${x1 + 8}" y="${(t.y + 3.5).toFixed(2)}">${esc(fmtPrice(t.v))}</text>`
    )
    .join("");

  // Day markers across the foot, thinned so they never collide.
  const step = Math.max(1, Math.floor(points.length / 7));
  const days = points
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % step === 0 && i < points.length - step / 2)
    .map(
      ({ p, i }) =>
        `<text class="axis" x="${sx(i).toFixed(2)}" y="${H - 8}" text-anchor="middle">${esc(fmtDay(p.t))}</text>`
    )
    .join("");

  const first = points[0].v;
  const last = points[points.length - 1].v;

  // Compact enough for an attribute: time is delta-encoded from the
  // first point and price is rounded to six places, which takes the
  // 169-point week from ~6 KB to well under 2 KB.
  const series = JSON.stringify({
    t0: points[0].t,
    t: points.map((p) => p.t - points[0].t),
    v: points.map((p) => Number(p.v.toFixed(6))),
    box: [x0, x1, y0, y1],
    range: [lo, hi],
    w: W,
    h: H,
  });

  return `<figure class="chart" data-chart="${esc(id)}">
    <svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet"
         aria-label="XRP price in ${esc(label)} over the last seven days, from ${esc(fmtPrice(first))} to ${esc(fmtPrice(last))}"
         data-series="${esc(series)}">
      <defs>
        <linearGradient id="${esc(id)}-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--brand)" stop-opacity=".26"/>
          <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <path class="area" d="${area}" fill="url(#${esc(id)}-fill)"/>
      <path class="trace" d="${line}"/>
      ${days}
      <g class="cross" hidden>
        <line class="cross-x" y1="${y0}" y2="${y1}"/>
        <circle class="cross-dot" r="3.5"/>
      </g>
    </svg>
    <div class="chart-tip" hidden aria-hidden="true"></div>
  </figure>`;
}

/**
 * Reported 24-hour volume across the same week.
 *
 * Bars, not a line: volume is a quantity per bucket, and a bar anchored
 * at zero is the honest encoding for that. Anchored at zero for the
 * same reason — a volume axis that does not start at zero misstates
 * every ratio on it.
 */
export function volumeBars(points, { id = "xrp-volume" } = {}) {
  if (!points || points.length < 8) return "";

  const W = 1000, H = 90;
  const L = 8, R = 62, T = 8, B = 16;
  const x0 = L, x1 = W - R, y0 = T, y1 = H - B;

  const max = Math.max(...points.map((p) => p.v));
  if (!Number.isFinite(max) || max <= 0) return "";

  const slot = (x1 - x0) / points.length;
  const width = Math.max(1, slot * 0.62);

  const bars = points
    .map((p, i) => {
      const height = ((y1 - y0) * p.v) / max;
      const x = x0 + slot * i + (slot - width) / 2;
      return `<rect x="${x.toFixed(2)}" y="${(y1 - height).toFixed(2)}" width="${width.toFixed(2)}" height="${Math.max(0.6, height).toFixed(2)}"/>`;
    })
    .join("");

  const peak = max >= 1e9 ? `$${(max / 1e9).toFixed(1)}B` : `$${(max / 1e6).toFixed(0)}M`;

  return `<figure class="chart volume" data-chart="${esc(id)}">
    <svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet"
         aria-label="Reported 24-hour trading volume over the last seven days, peaking at ${esc(peak)}">
      <line class="grid" x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}"/>
      <g class="bars">${bars}</g>
      <text class="axis" x="${x1 + 8}" y="${y0 + 10}">${esc(peak)}</text>
      <text class="axis" x="${x1 + 8}" y="${y1 + 3}">$0</text>
    </svg>
  </figure>`;
}
