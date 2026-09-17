/*
 * The mission log: what changed in this project, and what is happening
 * to it right now.
 *
 * Two inputs, deliberately different in kind:
 *
 *   1. site/data/updates.json — written by hand, in the repository, and
 *      reviewed like code. This is where a maintenance window or an
 *      incident goes. It is the only part of the site allowed to say
 *      "we are working on it".
 *
 *   2. The GitHub Releases API — the tags that actually shipped. These
 *      are not typed into a CMS; they exist because CI produced an
 *      artifact. A release cannot appear in the log without a build
 *      behind it, which is the property that makes the log evidence
 *      rather than marketing.
 *
 * If GitHub is unreachable the log still renders from the repository
 * file alone, flagged as partial. It never fabricates an entry.
 */

import { decodeEntities, stripTags, clamp, fetchWithTimeout } from "./html.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const REPO = "Ignosha/noshashi";
const KINDS = new Set(["release", "maintenance", "incident", "milestone", "note"]);

/**
 * Load the hand-written notices.
 *
 * Read from disk when there is a checkout (the build), fetched over
 * HTTP when there is not (a serverless invocation, where the static
 * asset is the copy that is definitely deployed). Either way a failure
 * is empty, never an exception: the log degrades to releases only.
 */
export async function loadUpdates({ root, origin } = {}) {
  const candidates = [];
  if (root) candidates.push(path.join(root, "site", "data", "updates.json"));
  candidates.push(path.join(process.cwd(), "site", "data", "updates.json"));

  for (const file of candidates) {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* try the next candidate */
    }
  }

  if (origin) {
    try {
      const response = await fetchWithTimeout(`${origin}/data/updates.json`, { timeout: 4000 });
      if (response.ok) {
        const parsed = await response.json();
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* fall through to empty */
    }
  }
  return [];
}

/** Normalise one hand-written notice; drop anything malformed. */
function normaliseUpdate(entry) {
  if (!entry || typeof entry !== "object") return null;
  const at = Date.parse(entry.date);
  if (!Number.isFinite(at)) return null;
  const title = stripTags(String(entry.title || "")).trim();
  if (!title) return null;
  return {
    kind: KINDS.has(entry.kind) ? entry.kind : "note",
    title: clamp(title, 120),
    body: clamp(stripTags(String(entry.body || "")), 320),
    url: typeof entry.link === "string" ? entry.link : "",
    at: new Date(at).toISOString(),
    source: "repo",
  };
}

/**
 * Release notes are Markdown. Take the first real paragraph and flatten
 * it — the log is a summary, and the full notes are one link away.
 */
function summariseNotes(body) {
  const text = stripTags(decodeEntities(String(body || "")))
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  const paragraph = text.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p.length > 30);
  return clamp(paragraph || text, 320);
}

/** Shipped releases, newest first. Returns [] rather than throwing. */
export async function getReleases({ limit = 10, timeout = 6000 } = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "noshashi.app release reader",
  };
  // Optional: raises the unauthenticated 60/hour rate limit. Never required.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${REPO}/releases?per_page=${limit}`,
      { timeout, headers }
    );
    if (!response.ok) return { releases: [], ok: false };
    const payload = await response.json();
    if (!Array.isArray(payload)) return { releases: [], ok: false };

    const releases = payload
      .filter((r) => r && !r.draft)
      .map((r) => ({
        tag: String(r.tag_name || ""),
        name: String(r.name || r.tag_name || ""),
        prerelease: Boolean(r.prerelease),
        at: r.published_at || r.created_at || null,
        url: String(r.html_url || ""),
        notes: summariseNotes(r.body),
        assets: (Array.isArray(r.assets) ? r.assets : []).map((a) => ({
          name: String(a.name || ""),
          size: Number(a.size) || 0,
          url: String(a.browser_download_url || ""),
          // The API reports "sha256:<hex>"; the download page wants the hex.
          sha256: /^sha256:([0-9a-f]{64})$/i.test(String(a.digest || ""))
            ? String(a.digest).slice(7)
            : "",
        })),
      }))
      .filter((r) => r.tag && r.at);

    return { releases, ok: true };
  } catch {
    return { releases: [], ok: false };
  }
}

/**
 * The merged log.
 *
 * `partial` is true when a source we expected to reach did not answer.
 * The page prints that rather than quietly showing a shorter list,
 * because "nothing shipped recently" and "GitHub timed out" look
 * identical otherwise and mean opposite things.
 */
export async function getProjectFeed({ limit = 12, root, origin } = {}) {
  const [updates, releaseResult] = await Promise.all([
    loadUpdates({ root, origin }),
    getReleases({ limit: 8 }),
  ]);

  const entries = updates.map(normaliseUpdate).filter(Boolean);

  for (const release of releaseResult.releases) {
    entries.push({
      kind: "release",
      title: release.name || release.tag,
      body: release.notes || `Release ${release.tag} published from CI.`,
      url: release.url,
      at: new Date(release.at).toISOString(),
      source: "github",
      tag: release.tag,
    });
  }

  entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return {
    entries: entries.slice(0, limit),
    latestRelease: releaseResult.releases[0] || null,
    partial: !releaseResult.ok,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * The status board.
 *
 * Every row is a real, checkable claim about a system we actually run.
 * An open maintenance or incident notice in updates.json is what moves
 * a row off GO — status here is derived from the log, never typed in
 * twice, so the board and the log can never disagree.
 */
export function deriveStatus(entries) {
  const now = Date.now();
  const recent = entries.filter((e) => now - Date.parse(e.at) < 1000 * 60 * 60 * 72);
  const incident = recent.find((e) => e.kind === "incident");
  const maintenance = recent.find((e) => e.kind === "maintenance");

  const overall = incident ? "nogo" : maintenance ? "hold" : "go";
  const overallWord = incident ? "DEGRADED" : maintenance ? "MAINTENANCE" : "OPERATIONAL";

  return {
    overall,
    overallWord,
    notice: incident || maintenance || null,
    rows: [
      {
        what: "noshashi.app",
        detail: "Static pages and the server-rendered feeds.",
        state: overall,
        word: overallWord,
      },
      {
        what: "Release pipeline",
        detail: "GitHub Actions builds every download on this site.",
        state: incident ? "hold" : "go",
        word: incident ? "CHECK LOG" : "OPERATIONAL",
      },
      {
        what: "XRPL telemetry",
        detail: "Public mainnet nodes read directly by your browser.",
        state: "go",
        word: "READ LIVE",
      },
      {
        what: "Desktop application",
        detail: "Runs on your machine. A site outage does not affect it.",
        state: "go",
        word: "UNAFFECTED",
      },
    ],
  };
}
