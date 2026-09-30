import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { PAGE_FILES, pagePassages, type Passage } from "./src/lib/noshx/pages";

const ID = "virtual:noshx-pages";

/** site/ files matching PAGE_FILES; "**" matches any depth of folders. */
function pageFiles(root: string): string[] {
  const site = path.join(root, "site");
  const patterns = PAGE_FILES.map((p) => new RegExp(`^${p.replace(/\./g, "\\.").replace("**/", "(?:.+/)?")}$`));
  const all = fs.readdirSync(site, { recursive: true, encoding: "utf8" }).map((f) => f.split(path.sep).join("/"));
  return all.filter((f) => patterns.some((p) => p.test(f))).sort().map((f) => path.join(site, f));
}

/**
 * The build moves each page's inline scripts to /assets/inline/<hash>.js
 * (scripts/inline-scripts.mjs) so the site's CSP can forbid inline script.
 * Some pages keep data there (the Learn page's word list and quiz), so
 * put each one back in place before reading the page.
 */
function withInlineScripts(site: string, html: string): string {
  return html.replace(/<script([^>]*?)\ssrc="\/assets\/inline\/([0-9a-f]{20}\.js)"><\/script>/g, (whole, attrs: string, name: string) => {
    const file = path.join(site, "assets", "inline", name);
    return fs.existsSync(file) ? `<script${attrs}>${fs.readFileSync(file, "utf8")}</script>` : whole;
  });
}

/**
 * NOSHX's knowledge of the published pages, compiled when the app is
 * built. `import("virtual:noshx-pages")` gives the passages' text only:
 * no HTML to fetch or parse at run time, in one chunk that loads when
 * NOSHX is first used.
 */
export function noshxPages(): Plugin {
  let root = process.cwd();
  return {
    name: "noshx-pages",
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      return id === ID ? `\0${ID}` : null;
    },
    load(id) {
      if (id !== `\0${ID}`) return null;
      const passages: Passage[] = [];
      for (const file of pageFiles(root)) {
        this.addWatchFile(file);
        passages.push(...pagePassages(file.split(path.sep).join("/"), withInlineScripts(path.join(root, "site"), fs.readFileSync(file, "utf8"))));
      }
      return `export default ${JSON.stringify(passages)};`;
    },
  };
}
