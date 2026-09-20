/*
 * TEMPORARY. Delete before this PR leaves draft.
 *
 * This sandbox cannot reach any indexer — the egress allowlist covers
 * GitHub, npm and the MCP servers and nothing else — so the only way
 * to learn what these APIs actually return is to ask them from
 * somewhere that can. A Vercel function can. This endpoint fetches a
 * handful of candidate URLs server-side and reports status, shape and
 * a truncated body for each.
 *
 * Writing an integration against a response shape nobody has looked at
 * is how the last three defects in this feature happened. This is the
 * cheaper version of finding out.
 */
import { fetchWithTimeout } from "./_lib/html.js";

const RLUSD_HEX = "524C555344000000000000000000000000000000";
const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";

const CANDIDATES = [
  ["xrplmeta token", `https://s1.xrplmeta.org/token/${RLUSD_HEX}:${RLUSD_ISSUER}`],
  ["xrplmeta token full", `https://s1.xrplmeta.org/token/${RLUSD_HEX}:${RLUSD_ISSUER}?full=true`],
  ["xrpscan token", `https://api.xrpscan.com/api/v1/token/${RLUSD_HEX}.${RLUSD_ISSUER}`],
  ["xrpscan obligations", `https://api.xrpscan.com/api/v1/account/${RLUSD_ISSUER}/obligations`],
  ["xrpscan trustlines", `https://api.xrpscan.com/api/v1/account/${RLUSD_ISSUER}/trustlines`],
  ["xrpldata tokens", "https://api.xrpldata.com/api/v1/tokens?limit=1"],
  ["xrpldata issuer", `https://api.xrpldata.com/api/v1/issuer/${RLUSD_ISSUER}`],
];

function summarise(value, depth = 0) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return depth > 2
      ? `array(${value.length})`
      : { _array: value.length, _first: value.length ? summarise(value[0], depth + 1) : null };
  }
  if (typeof value === "object") {
    if (depth > 2) return `object(${Object.keys(value).length} keys)`;
    return Object.fromEntries(
      Object.entries(value).slice(0, 40).map(([k, v]) => [k, summarise(v, depth + 1)])
    );
  }
  return typeof value;
}

export default async function handler(req, res) {
  const results = [];
  for (const [name, url] of CANDIDATES) {
    try {
      const response = await fetchWithTimeout(url, {
        timeout: 8000,
        headers: { Accept: "application/json", "User-Agent": "noshashi.app indexer probe" },
      });
      const text = await response.text();
      let shape = null;
      try {
        shape = summarise(JSON.parse(text));
      } catch {
        shape = "not json";
      }
      results.push({
        name,
        url,
        status: response.status,
        bytes: text.length,
        shape,
        sample: text.slice(0, 600),
      });
    } catch (error) {
      results.push({ name, url, error: error?.message ?? String(error) });
    }
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ probed_at: new Date().toISOString(), results });
}
