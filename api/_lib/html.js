/*
 * Escaping and small formatting helpers shared by every server-rendered
 * page.
 *
 * Everything the news module returns is third-party text fetched from a
 * public feed. It is interpolated into HTML we serve from our own
 * origin, which makes escaping a security control rather than a nicety:
 * one unescaped headline is a stored XSS on noshashi.app. Nothing in
 * this codebase interpolates a feed value without passing it through
 * `esc` or `attr` first, and the render tests assert that.
 */

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for an HTML text node or a double-quoted attribute. */
export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/**
 * Escape a URL for an href.
 *
 * Escaping alone is not enough here: `javascript:` survives entity
 * escaping intact and still executes on click. Only http(s) and mailto
 * are allowed through; anything else collapses to "#", which is inert.
 */
export function attrUrl(value) {
  const raw = String(value || "").trim();
  if (!/^(https?:|mailto:|\/|#)/i.test(raw)) return "#";
  return esc(raw);
}

/** Decode the handful of entities RSS feeds emit, before we re-escape. */
export function decodeEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Strip any markup a feed put inside a title or summary. */
export function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Trim to a whole word, with an ellipsis only when something was cut. */
export function clamp(value, max) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,.;:\-–—]$/, "") + "…";
}

/**
 * Relative age, in the units an operator reads at a glance.
 *
 * Deliberately coarse. A headline that says "6m ago" to the second
 * implies a precision the feed does not have — items carry a publisher's
 * timestamp, rounded to the minute at best, and the page may be served
 * from cache minutes later.
 */
export function ago(iso, now = Date.now()) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.round(hours / 24);
  if (days < 30) return days + "d ago";
  const months = Math.round(days / 30);
  return months < 12 ? months + "mo ago" : Math.round(months / 12) + "y ago";
}

/** YYYY-MM-DD, UTC. The format every timestamp on this site uses. */
export function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Bytes as the size a download page should state. */
export function megabytes(bytes) {
  const mb = Number(bytes) / 1_000_000;
  if (!Number.isFinite(mb)) return "";
  return (mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)) + " MB";
}

/**
 * Cache headers for a server-rendered page.
 *
 * The CDN holds the rendered HTML for `sMaxAge` seconds and keeps
 * serving the stale copy while it re-renders behind the request, so a
 * slow upstream feed never becomes a slow page. The browser is told not
 * to hold its own copy: the whole point of these pages is that a reload
 * shows what the server has now.
 */
export function cacheHeaders(res, sMaxAge = 300, swr = 3600) {
  res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`);
  return res;
}

/** Fetch with a hard deadline, so one hung feed cannot hang a render. */
export async function fetchWithTimeout(url, { timeout = 6000, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
