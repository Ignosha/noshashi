#!/usr/bin/env node
/*
 * Local preview for the public site.
 *
 * Serves site/ the way Vercel does — static files, directory index,
 * /api/* dispatched to the handlers in api/, and the headers and
 * redirects from vercel.json actually applied. The headers matter: a
 * Content-Security-Policy that is only exercised in production is a
 * CSP nobody has tested, and this is the cheapest place to find out
 * that a script it blocks was load-bearing.
 *
 *   node scripts/build-site.mjs && node scripts/dev-site.mjs
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const PORT = Number(process.env.PORT) || 4321;

const config = JSON.parse(await readFile(path.join(ROOT, "vercel.json"), "utf8"));

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png",
  ".pdf": "application/pdf", ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".toml": "text/plain; charset=utf-8",
};

/**
 * vercel.json `source` patterns, as far as this preview needs them.
 *
 * The constructs are swapped for sentinels *before* escaping, not
 * unescaped afterwards. Doing it the other way means writing a regex
 * that matches an escaped regex, which is where the first version of
 * this went wrong: `/(.*)` escaped to `/\(\.*\)` and the un-escaping
 * pattern missed a backslash, so the catch-all header rule silently
 * matched nothing and every page was served with no CSP at all.
 */
const ANY = "\u0000";
const REST = "\u0001";

function matches(source, pathname) {
  let pattern = source.split("(.*)").join(ANY).split("/:path*").join(REST);
  pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  pattern = pattern.split(ANY).join(".*").split(REST).join("(?:/.*)?");
  return new RegExp(`^${pattern}$`).test(pathname);
}

function applyHeaders(res, pathname) {
  for (const rule of config.headers || []) {
    if (matches(rule.source, pathname)) {
      for (const { key, value } of rule.headers) res.setHeader(key, value);
    }
  }
  /*
   * Caching is the one production header this preview does not honour.
   * The point of running it is to exercise the CSP and the redirects
   * against a real browser; a cached stylesheet just means an edit does
   * not show up and the next twenty minutes go into debugging CSS that
   * was already correct. Ask how that was discovered.
   */
  res.setHeader("Cache-Control", "no-store");
}

function findRedirect(pathname) {
  return (config.redirects || []).find((r) => matches(r.source, pathname));
}

/** Minimal stand-in for the Vercel request/response helpers. */
function decorate(req, res, url) {
  req.query = Object.fromEntries(url.searchParams.entries());
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = (body) => {
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(body);
    return res;
  };
  res.redirect = (code, location) => {
    res.statusCode = typeof code === "number" ? code : 302;
    res.setHeader("Location", typeof code === "number" ? location : code);
    res.end();
    return res;
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/json")) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  return raw;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  applyHeaders(res, pathname);

  const redirect = findRedirect(pathname);
  if (redirect) {
    res.statusCode = redirect.permanent ? 308 : 307;
    res.setHeader("Location", redirect.destination);
    return res.end();
  }

  if (pathname.startsWith("/api/")) {
    const name = pathname.slice(5).replace(/\/+$/, "");
    // `_lib` is not routable on Vercel either — underscore-prefixed
    // files are excluded from the function build.
    if (!name || name.startsWith("_") || name.includes("..")) {
      res.statusCode = 404;
      return res.json({ error: "Not found" });
    }
    try {
      const file = path.join(ROOT, "api", `${name}.js`);
      await stat(file);
      const mod = await import(pathToFileURL(file).href);
      decorate(req, res, url);
      req.body = await readBody(req);
      await mod.default(req, res);
    } catch (error) {
      if (error?.code === "ENOENT") {
        res.statusCode = 404;
        return res.json({ error: `No handler at /api/${name}` });
      }
      console.error(`[dev] /api/${name} threw:`, error);
      res.statusCode = 500;
      res.json({ error: String(error?.message || error) });
    }
    return;
  }

  let file = path.join(SITE, pathname);
  if (!file.startsWith(SITE)) { res.statusCode = 403; return res.end("Forbidden"); }

  try {
    const info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) file = path.join(file, "index.html");
    const body = await readFile(file);
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end("<h1>404</h1><p>Not found in site/.</p>");
  }
});

server.listen(PORT, () => console.log(`[dev] site preview on http://localhost:${PORT}`));
