/*
 * Live XRP / XRPL news.
 *
 * Three public RSS feeds, read server-side and merged. Rules, in the
 * same spirit as the ledger ticker on the landing page:
 *
 *   - Nothing is invented. If every feed fails the page says so and
 *     shows no headlines, rather than showing yesterday's as if they
 *     were current.
 *   - Every item states its publisher and its age, because a headline
 *     without a source is a rumour.
 *   - One slow feed cannot hold up the page: each has its own deadline
 *     and a failure removes that source, not the section.
 *
 * These are third-party headlines, reproduced as a title and a link
 * back to the publisher. Nothing is rewritten and no article body is
 * copied — the link is the point.
 */

import { decodeEntities, stripTags, clamp, fetchWithTimeout } from "./html.js";

export const SOURCES = [
  {
    id: "google-news",
    name: "Google News",
    url: "https://news.google.com/rss/search?q=XRP+OR+XRPL+OR+Ripple&hl=en-US&gl=US&ceid=US:en",
    // An aggregator: every item is already on-topic by construction.
    filter: false,
  },
  {
    id: "cointelegraph",
    name: "Cointelegraph",
    url: "https://cointelegraph.com/rss/tag/xrp",
    filter: false,
  },
  {
    id: "coindesk",
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    // A general crypto feed, so it must be filtered down to XRP.
    filter: true,
  },
];

const TOPIC = /\b(xrp|xrpl|ripple|rlusd)\b/i;

/**
 * Pull the first occurrence of a tag's text content.
 *
 * Order matters and is not the obvious one. Decoding runs *before*
 * stripping: half these feeds wrap titles in `<![CDATA[ ... ]]>`, and
 * `<![CDATA[Ripple files]]>` matches a naive tag-stripper end to end —
 * `<` through the closing `>` — which silently deletes the headline and
 * drops the whole source. Unwrap first, then strip whatever markup the
 * publisher put inside the text.
 */
function tag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? stripTags(decodeEntities(match[1])) : "";
}

/**
 * Parse an RSS 2.0 or Atom document into items.
 *
 * A regex rather than an XML parser on purpose: this runs in a
 * serverless function with no dependencies installed, the shape being
 * read is three tags deep, and everything extracted is escaped again
 * before it reaches HTML. It tolerates the malformed markup these feeds
 * regularly ship, which a strict parser would reject outright.
 */
export function parseFeed(xml, sourceName) {
  const blocks = String(xml).match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  const items = [];

  for (const block of blocks) {
    const title = tag(block, "title");
    if (!title) continue;

    // RSS puts the URL in <link>text</link>; Atom puts it in an attribute.
    let link = tag(block, "link");
    if (!link) {
      const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = href ? decodeEntities(href[1]) : "";
    }
    if (!/^https?:/i.test(link)) continue;

    const published =
      tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || "";
    const at = Date.parse(published);

    // Google News appends " - Publisher" to every title and repeats it
    // in <source>. Prefer the tag, fall back to the suffix, and take the
    // suffix off the headline either way so it is not said twice.
    const sourceTag = tag(block, "source");
    let headline = title;
    let publisher = sourceTag || "";
    const suffix = title.match(/^(.*[^\s])\s+[-–—]\s+([^-–—]{2,40})$/);
    if (suffix) {
      headline = suffix[1];
      if (!publisher) publisher = suffix[2];
    }

    items.push({
      title: clamp(headline, 150),
      url: link,
      publisher: clamp(publisher || sourceName, 40),
      via: sourceName,
      publishedAt: Number.isFinite(at) ? new Date(at).toISOString() : null,
    });
  }
  return items;
}

/** Same story from two aggregators is one story. */
function dedupe(items) {
  const seen = new Map();
  for (const item of items) {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 70);
    if (!key) continue;
    const existing = seen.get(key);
    // Keep whichever copy carries a usable timestamp.
    if (!existing || (!existing.publishedAt && item.publishedAt)) seen.set(key, item);
  }
  return [...seen.values()];
}

/**
 * Read every source and merge.
 *
 * Never throws: a caller rendering a page needs an answer, and "no
 * sources answered" is an answer it can print honestly.
 */
export async function getNews({ limit = 12, timeout = 6000 } = {}) {
  const results = await Promise.allSettled(
    SOURCES.map(async (source) => {
      const response = await fetchWithTimeout(source.url, {
        timeout,
        headers: { "User-Agent": "noshashi.app news reader (+https://noshashi.app)" },
      });
      if (!response.ok) throw new Error(`${source.id} responded ${response.status}`);
      const parsed = parseFeed(await response.text(), source.name);
      return { source, items: source.filter ? parsed.filter((i) => TOPIC.test(i.title)) : parsed };
    })
  );

  const items = [];
  const status = [];
  results.forEach((result, index) => {
    const source = SOURCES[index];
    if (result.status === "fulfilled") {
      status.push({ id: source.id, name: source.name, ok: true, count: result.value.items.length });
      items.push(...result.value.items);
    } else {
      status.push({ id: source.id, name: source.name, ok: false, count: 0 });
    }
  });

  const ranked = dedupe(items).sort((a, b) => {
    // Undated items sort last rather than to 1970.
    const at = a.publishedAt ? Date.parse(a.publishedAt) : -Infinity;
    const bt = b.publishedAt ? Date.parse(b.publishedAt) : -Infinity;
    return bt - at;
  });

  return {
    items: ranked.slice(0, limit),
    sources: status,
    live: status.some((s) => s.ok),
    fetchedAt: new Date().toISOString(),
  };
}
