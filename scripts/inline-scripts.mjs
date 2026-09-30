/**
 * Move every executable inline <script> out of the website's pages.
 *
 * The site's Content-Security-Policy is `script-src 'self'`: no inline
 * script runs, so an injected <script> or event handler cannot either.
 * Inline scripts are still the easy way to write a page, so the build
 * writes each one to /assets/inline/<sha256>.js and replaces it with a
 * <script src> in the same place. Execution order is unchanged: a
 * classic external script without async or defer blocks and runs where
 * the inline one did.
 *
 * JSON blocks (<script type="application/json"> and JSON-LD) are data,
 * never executed, and stay inline.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";

const SCRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
const DATA_TYPE = /\btype\s*=\s*["']?application\/(?:ld\+)?json["']?/i;
const HAS_SRC = /\bsrc\s*=/i;
export const INLINE_DIR = "assets/inline";

/** Rewrite one page. Returns the new HTML and the files it now needs. */
export function externalizeInlineScripts(html) {
  const files = new Map();
  const out = html.replace(SCRIPT, (whole, attrs = "", body) => {
    if (HAS_SRC.test(attrs) || DATA_TYPE.test(attrs) || !body.trim()) return whole;
    const name = `${createHash("sha256").update(body).digest("hex").slice(0, 20)}.js`;
    files.set(name, body);
    return `<script${attrs} src="/${INLINE_DIR}/${name}"></script>`;
  });
  return { html: out, files };
}

/** Executable inline scripts left in a page (for tests and the build's own check). */
export function inlineScriptCount(html) {
  let n = 0;
  for (const m of html.matchAll(SCRIPT)) {
    const attrs = m[1] ?? "";
    if (!HAS_SRC.test(attrs) && !DATA_TYPE.test(attrs) && m[2].trim()) n += 1;
  }
  return n;
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

/** Rewrite every page under `site`, write the scripts, drop ones no page uses. */
export async function externalizeSite(site) {
  const dir = path.join(site, INLINE_DIR);
  await mkdir(dir, { recursive: true });
  const pages = await htmlFiles(site);
  let moved = 0;
  for (const page of pages) {
    const before = await readFile(page, "utf8");
    const { html, files } = externalizeInlineScripts(before);
    for (const [name, body] of files) await writeFile(path.join(dir, name), body);
    if (html !== before) {
      await writeFile(page, html);
      moved += files.size;
    }
  }
  // Keep only the files some page still refers to.
  const used = new Set();
  for (const page of pages) {
    for (const m of (await readFile(page, "utf8")).matchAll(/\/assets\/inline\/([0-9a-f]{20}\.js)/g)) used.add(m[1]);
  }
  let removed = 0;
  for (const name of await readdir(dir)) {
    if (!used.has(name)) {
      await unlink(path.join(dir, name));
      removed += 1;
    }
  }
  return { pages: pages.length, moved, files: used.size, removed };
}
