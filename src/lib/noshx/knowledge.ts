import { KNOWLEDGE } from "@/lib/support/knowledge";
import { PLANS } from "@/lib/billing/catalog";
import reference from "@/lib/docs/reference.json";

/**
 * What NOSHX knows about NOSHASHI itself.
 *
 * The published pages are the source: the Learn course, every docs page,
 * pricing, enterprise, trust, the guide, legal and the rest, read from
 * site/ at build time and split into sections here, so there is no second
 * copy to fall out of date. The app's own help answers, plan catalogue and
 * screen reference are added beside them.
 *
 * Retrieval is BM25 over those sections: no embedding model, no network,
 * a few milliseconds per query and nothing to download, which matters on
 * an 8 GB laptop already running a local model. The retrieved passages go
 * into the prompt with their page address, so the model answers from the
 * product's own words and can say where to read more.
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

export type Hit = Passage & { score: number };

const SITE = "https://www.noshashi.app";

// The pages a customer reads. Pages fed at build time by the network
// (home, news, progress, status) are left out: their committed copies
// are snapshots, not the product's description of itself.
const PAGES = import.meta.glob(
  [
    "../../../site/learn/index.html",
    "../../../site/docs/**/index.html",
    "../../../site/pricing/index.html",
    "../../../site/enterprise/index.html",
    "../../../site/strategic-infrastructure/index.html",
    "../../../site/trust/index.html",
    "../../../site/guide/index.html",
    "../../../site/legal/index.html",
    "../../../site/misread/index.html",
    "../../../site/developers/index.html",
    "../../../site/certificate/index.html",
    "../../../site/contact/index.html",
  ],
  { query: "?raw", import: "default" }
) as Record<string, () => Promise<string>>;

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

/** The app's own help answers, plans and screen reference. */
export function appPassages(): Passage[] {
  const out: Passage[] = KNOWLEDGE.map((entry) => ({
    title: `Help › ${entry.question}`,
    source: "NOSHX › Support",
    text: `${entry.question}\n${entry.answer}`,
  }));

  for (const plan of PLANS) {
    out.push({
      title: `Pricing › ${plan.name}`,
      source: `${SITE}/pricing/`,
      text: `${plan.name} plan, for ${plan.audience}. Price (cost): ${plan.priceLabel} ${plan.cadence}. Includes: ${plan.features.join("; ")}.`,
    });
  }

  const scenes = (reference as { scenes: Array<{ name: string; plan: string; summary: string }> }).scenes;
  for (let i = 0; i < scenes.length; i += 6) {
    out.push({
      title: "App screens",
      source: "NOSHASHI desktop app",
      text: scenes
        .slice(i, i + 6)
        .map((scene) => `${scene.name} (${scene.plan}): ${scene.summary}`)
        .join("\n"),
    });
  }
  return out;
}

// ————— BM25 —————

const STOP = new Set(
  "a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so that the their them then there these this to was we what when where which who why will with you your".split(" ")
);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? [])
    .filter((t) => !STOP.has(t) && t.length > 1)
    .map((t) => (t.length > 4 ? t.replace(/(ies|es|s|ing|ed)$/, (m) => (m === "ies" ? "y" : "")) : t));
}

type Index = {
  passages: Passage[];
  docs: Map<string, number>[];
  /** Each passage's tokens in order, space-joined, for phrase matches. */
  sequences: string[];
  lengths: number[];
  df: Map<string, number>;
  avg: number;
};

export function buildIndex(passages: Passage[]): Index {
  const docs = passages.map((p) => {
    const counts = new Map<string, number>();
    // The heading counts twice: it says what the section is about.
    for (const t of [...tokens(p.title), ...tokens(p.title), ...tokens(p.text)]) counts.set(t, (counts.get(t) ?? 0) + 1);
    return counts;
  });
  const sequences = passages.map((p) => ` ${[...tokens(p.title), ...tokens(p.text)].join(" ")} `);
  const lengths = docs.map((d) => [...d.values()].reduce((a, b) => a + b, 0));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  return { passages, docs, sequences, lengths, df, avg };
}

export function search(index: Index, query: string, limit = 5): Hit[] {
  const ordered = tokens(query);
  const terms = [...new Set(ordered)];
  // Adjacent query words found together ("institutional plan") say more
  // than the same words scattered through a passage.
  const pairs = ordered.slice(1).map((t, i) => ` ${ordered[i]} ${t} `);
  if (terms.length === 0) return [];
  const n = index.passages.length;
  const k1 = 1.4;
  const b = 0.72;
  const idf = (t: string) => {
    const df = index.df.get(t) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  };
  const scored: Hit[] = [];
  index.docs.forEach((doc, i) => {
    let score = 0;
    for (const t of terms) {
      const f = doc.get(t);
      if (!f) continue;
      score += (idf(t) * f * (k1 + 1)) / (f + k1 * (1 - b + (b * index.lengths[i]) / index.avg));
    }
    for (const pair of pairs) {
      if (index.sequences[i].includes(pair)) {
        const [x, y] = pair.trim().split(" ");
        score += 0.6 * (idf(x) + idf(y));
      }
    }
    if (score > 0) scored.push({ ...index.passages[i], score: score * (index.passages[i].weight ?? 1) });
  });
  scored.sort((a, z) => z.score - a.score);
  // One passage per section heading, so five hits are five different things.
  const seen = new Set<string>();
  return scored.filter((hit) => !seen.has(hit.title) && seen.add(hit.title)).slice(0, limit);
}

let loading: Promise<Index> | null = null;

/** Built once, on first use; later calls reuse it. */
export function knowledgeIndex(): Promise<Index> {
  loading ??= (async () => {
    const passages = appPassages();
    for (const [file, load] of Object.entries(PAGES)) {
      const html = await load();
      passages.push(...pageSections(file, html));
      if (file.endsWith("/site/learn/index.html")) passages.push(...learnScriptPassages(html));
    }
    return buildIndex(passages);
  })();
  return loading;
}

export async function searchKnowledge(query: string, limit = 5): Promise<Hit[]> {
  return search(await knowledgeIndex(), query, limit);
}

/** Retrieved passages as a prompt block, within a character budget. */
export function referenceBlock(hits: Hit[], budget: number): string {
  if (hits.length === 0) return "";
  const lines = ["NOSHASHI REFERENCE (retrieved from the product's own pages for this question; cite the source when you use it):"];
  let used = lines[0].length;
  for (const hit of hits) {
    const entry = `\n[${hit.title}] (${hit.source})\n${hit.text}`;
    if (used + entry.length > budget) break;
    lines.push(entry);
    used += entry.length;
  }
  return lines.length > 1 ? lines.join("\n") : "";
}
