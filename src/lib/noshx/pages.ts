/**
 * NOSHASHI's published pages, turned into passages NOSHX can search.
 *
 * This runs when the app is built, not when it runs: vite.noshx.ts reads
 * the pages under site/, splits them here, and ships the passages' text
 * as one module. The app never downloads or parses page HTML, so the
 * first answer does not wait on it. It has no imports, so the build
 * config can load it directly.
 */

export type Passage = {
  /** Page title, then the section heading. */
  title: string;
  /** Where a customer can read it: a noshashi.app address or an app screen. */
  source: string;
  text: string;
  /** Ranking weight; below 1 for passages that restate a lesson (the quiz). */
  weight?: number;
};

export const SITE = "https://www.noshashi.app";

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", mdash: "—", ndash: "–",
  hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", times: "×", copy: "©", rarr: "→", larr: "←",
};

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
}

/** Visible text of an HTML fragment, with line breaks where blocks end. */
export function htmlText(html: string): string {
  return decode(
    html
      .replace(/<(br|\/p|\/li|\/tr|\/h[1-6]|\/div|\/dd|\/summary|\/figcaption)\b[^>]*>/gi, "\n")
      .replace(/<\/t[dh]>/gi, " | ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
}

function urlFor(file: string): string {
  const path = file.replace(/^.*\/site\//, "/").replace(/index\.html$/, "");
  return `${SITE}${path}`;
}

/** Break long sections at sentence ends so one passage stays readable in a prompt. */
function pieces(text: string, size = 1100): string[] {
  if (text.length <= size * 1.3) return [text];
  const out: string[] = [];
  let current = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (current && current.length + sentence.length > size) {
      out.push(current.trim());
      current = "";
    }
    current += `${sentence} `;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** A page split at its h2/h3 headings, without navigation, scripts or styles. */
export function pageSections(file: string, html: string): Passage[] {
  const pageTitle = decode((html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "NOSHASHI").trim());
  const body = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<(script|style|nav|header|footer|aside|svg|noscript|form)\b[\s\S]*?<\/\1>/gi, "");
  const url = urlFor(file);

  const out: Passage[] = [];
  const parts = body.split(/(?=<h[1-3]\b)/i);
  for (const part of parts) {
    const heading = part.match(/^<h[1-3]\b([^>]*)>([\s\S]*?)<\/h[1-3]>/i);
    const title = heading ? htmlText(heading[2]) : "";
    const id = heading?.[1].match(/\bid="([^"]+)"/)?.[1];
    const text = htmlText(heading ? part.slice(heading[0].length) : part);
    if (text.length < 40) continue;
    for (const piece of pieces(text)) {
      out.push({
        title: title ? `${pageTitle} › ${title}` : pageTitle,
        source: id ? `${url}#${id}` : url,
        text: piece,
      });
    }
  }
  return out;
}

/** The Learn page keeps its word list and quiz in a script; read them as data. */
export function learnScriptPassages(html: string): Passage[] {
  const out: Passage[] = [];
  const source = `${SITE}/learn/`;
  const block = (name: string) => {
    const start = html.indexOf(`var ${name} = [`);
    if (start < 0) return "";
    return html.slice(start, html.indexOf("];", start));
  };

  const words = [...block("V").matchAll(/\["((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)"\]/g)].map((m) => `${m[1]}: ${m[2]}`);
  for (let i = 0; i < words.length; i += 12) {
    const chunk = words.slice(i, i + 12);
    const first = chunk[0].split(":")[0];
    const last = chunk[chunk.length - 1].split(":")[0];
    out.push({ title: `Learn NOSHASHI › Word list (${first} to ${last})`, source: `${source}#vocab`, text: chunk.join("\n") });
  }

  for (const m of block("Q").matchAll(/\["((?:[^"\\]|\\.)*)", \[((?:"(?:[^"\\]|\\.)*",?\s*)+)\], (\d+), "((?:[^"\\]|\\.)*)"/g)) {
    const options = [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((o) => o[1]);
    out.push({
      title: `Learn NOSHASHI › Knowledge check › ${m[1]}`,
      source: `${source}#check`,
      text: `Q: ${m[1]}\nA: ${options[Number(m[3])] ?? ""}. ${m[4]}`,
      weight: 0.8,
    });
  }
  return out;
}

/**
 * The pages a customer reads, relative to site/. Pages fed at build time
 * by the network (home, news, progress, status) are left out: their
 * committed copies are snapshots, not the product's description of itself.
 */
export const PAGE_FILES = [
  "learn/index.html",
  "docs/**/index.html",
  "pricing/index.html",
  "enterprise/index.html",
  "strategic-infrastructure/index.html",
  "trust/index.html",
  "guide/index.html",
  "legal/index.html",
  "misread/index.html",
  "developers/index.html",
  "certificate/index.html",
  "contact/index.html",
];

/** Every passage one page contributes. `file` is its path, ending site/<page>/index.html. */
export function pagePassages(file: string, html: string): Passage[] {
  const sections = pageSections(file, html);
  // Release notes say what changed, not what the product is; they rank
  // below the pages that describe it.
  if (file.includes("/docs/release-notes/")) for (const section of sections) section.weight = 0.45;
  return file.endsWith("/site/learn/index.html") ? [...sections, ...learnScriptPassages(html)] : sections;
}
