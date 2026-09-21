/*
 * GET /api/locale — which language this visitor's connection suggests.
 *
 * Reads Vercel's own geolocation header, `x-vercel-ip-country`, which
 * the platform sets at the edge from the connecting address. No
 * third-party geo-IP service is called, so this adds no egress and no
 * data sharing — which matters on a site whose security page says there
 * is none.
 *
 * It only ever *suggests*. The decision is the visitor's, and
 * site/assets/i18n.js records whatever they choose and stops asking.
 *
 * Never redirects. An IP redirect would send Googlebot — which crawls
 * from US addresses — to English every time regardless of the URL it
 * asked for, and would trap anyone travelling or on a VPN in a language
 * they cannot read well enough to find the way out.
 */

import { languageForCountry, isSupported, LANGUAGES } from "./_lib/i18n.js";

export default function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const country = req.headers["x-vercel-ip-country"] || null;

  // The browser's own preference is better evidence than the country an
  // address resolves to — someone reading Japanese in Frankfurt is
  // still reading Japanese. It wins where the two disagree.
  const header = String(req.headers["accept-language"] || "");
  const preferred = header
    .split(",")
    .map((part) => part.split(";")[0].trim().slice(0, 2).toLowerCase())
    .find(isSupported);

  const suggested = preferred || languageForCountry(country);

  // Vary matters: without it a CDN could serve one visitor's suggestion
  // to the next. Short cache, because the answer is per-request.
  res.setHeader("Vary", "Accept-Language");
  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    country,
    suggested,
    source: preferred ? "accept-language" : country ? "ip-country" : "default",
    languages: LANGUAGES,
  });
}
