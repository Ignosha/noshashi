import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const REPO = "https://github.com/Ignosha/noshashi";
export const EMPTY_RELEASES = {
  schema: "academy.releases.v1",
  product: null,
  academy: null,
  events: [],
  processedIds: [],
};
export function releaseKind(tag) {
  return /^academy-v\d+\.\d+\.\d+$/.test(tag)
    ? "academy"
    : /^v\d+\.\d+\.\d+$/.test(tag)
      ? "product"
      : null;
}
export function compareVersions(a, b) {
  const x = a
      .replace(/^academy-v|^v/, "")
      .split(".")
      .map(Number),
    y = b
      .replace(/^academy-v|^v/, "")
      .split(".")
      .map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
function fingerprint(x) {
  return createHash("sha256").update(JSON.stringify(x)).digest("hex");
}
export function syncReleases(
  previous,
  releases,
  manifest,
  validLessonIds,
  {
    checkedAt = new Date().toISOString(),
    validate = () => true,
    verifySource = () => false,
    validLabIds,
  } = {},
) {
  if (
    previous?.schema !== "academy.releases.v1" ||
    !Array.isArray(previous.events) ||
    !Array.isArray(previous.processedIds)
  )
    throw new Error("Invalid existing catalog; refusing replacement");
  if (
    !Array.isArray(releases) ||
    !manifest ||
    manifest.schema !== "academy.release-map.v1"
  )
    throw new Error("Invalid release input or mapping");
  const next = structuredClone(previous);
  const processed = new Set(next.processedIds);
  for (const release of [...releases].sort((a, b) =>
    String(a.published_at).localeCompare(String(b.published_at)),
  )) {
    const kind = releaseKind(release.tag_name);
    if (!kind || release.draft || release.prerelease) continue;
    const tag = release.tag_name,
      url = `${REPO}/releases/tag/${tag}`;
    if (
      !Number.isSafeInteger(release.id) ||
      release.id <= 0 ||
      release.html_url !== url ||
      !Number.isFinite(Date.parse(release.published_at)) ||
      !Array.isArray(release.assets)
    )
      throw new Error("Malformed stable release metadata");
    const map = manifest.mappings?.[tag];
    if (
      map &&
      (!Array.isArray(map.lessons) ||
        map.lessons.some((id) => !validLessonIds.includes(id)))
    )
      throw new Error("Release maps to an unknown lesson");
    if (
      map &&
      validLabIds &&
      (!Array.isArray(map.labs) ||
        map.labs.some((id) => !validLabIds.includes(id)))
    )
      throw new Error("Release maps to an unknown lab");
    if (
      map?.reviewed === true &&
      (!Array.isArray(map.checks) ||
        !map.checks.length ||
        map.checks.length > 20 ||
        !map.checks.every(
          (check) =>
            typeof check.path === "string" &&
            /^(src|academy|site)\/[a-zA-Z0-9_./-]+$/.test(check.path) &&
            !check.path.split("/").includes("..") &&
            typeof check.needle === "string" &&
            check.needle.length > 0 &&
            check.needle.length < 500 &&
            verifySource(tag, check.path, check.needle),
        ))
    )
      throw new Error(
        "Reviewed mapping source validation failed; existing course retained",
      );
    const assets = release.assets
      .filter(
        (a) =>
          typeof a.name === "string" &&
          /\.(dmg|msi|exe|deb|AppImage)$/.test(a.name) &&
          typeof a.browser_download_url === "string" &&
          a.browser_download_url.startsWith(
            `${REPO}/releases/download/${tag}/`,
          ) &&
          a.size > 0,
      )
      .map((a) => ({ name: a.name, url: a.browser_download_url }));
    const entry = {
      id: release.id,
      tag,
      at: release.published_at,
      url,
      kind,
      title: String(release.name || tag).slice(0, 140),
      summary: String(release.body || "")
        .replace(/<[^>]*>/g, "")
        .replace(/[\x00-\x1f]/g, " ")
        .slice(0, 320),
      assets,
      lessons: map?.lessons ?? [],
      labs: map?.labs ?? [],
      review:
        map?.reviewed === true
          ? "MAPPED — teaching changes still require version-controlled validation"
          : "UNMAPPED — editorial review required",
      signing:
        map?.reviewed === true
          ? (map.signing ?? "UNKNOWN")
          : "UNKNOWN — not established by release metadata",
      compatibility:
        map?.reviewed === true
          ? (map.compatibility ?? "UNKNOWN")
          : "UNKNOWN — not established by artifact presence",
    };
    const current = next[kind];
    // A delayed installer upload is reconsidered even for an already-seen release ID.
    const downloadable = kind !== "academy" || assets.length > 0;
    if (
      downloadable &&
      (!current ||
        compareVersions(tag, current.tag) > 0 ||
        (compareVersions(tag, current.tag) === 0 &&
          entry.id === current.id &&
          fingerprint(entry) !== fingerprint(current)))
    )
      next[kind] = entry;
    const existing = next.events.findIndex((e) => e.id === entry.id);
    if (existing < 0) next.events.push(entry);
    else if (fingerprint(next.events[existing]) !== fingerprint(entry))
      next.events[existing] = entry;
    processed.add(release.id);
  }
  next.events = next.events
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id - a.id)
    .slice(0, 100);
  next.processedIds = [...processed].sort((a, b) => a - b).slice(-500);
  if (fingerprint(next) === fingerprint(previous))
    return { changed: false, catalog: previous };
  next.checkedAt = checkedAt;
  if (!validate(next))
    throw new Error(
      "Candidate validation failed; existing public catalog retained",
    );
  return { changed: true, catalog: next };
}
export async function fetchReleases(fetcher = fetch) {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const res = await fetcher(
      `https://api.github.com/repos/Ignosha/noshashi/releases?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          ...(process.env.GH_TOKEN
            ? { Authorization: `Bearer ${process.env.GH_TOKEN}` }
            : {}),
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) throw new Error(`GitHub release read failed: ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("Invalid GitHub page");
    out.push(...rows);
    if (rows.length < 100) return out;
  }
  throw new Error("Release pagination incomplete; refusing partial sync");
}
async function main() {
  const path = "academy/release-catalog.json";
  const old = JSON.parse(await readFile(path, "utf8"));
  const manifest = JSON.parse(
    await readFile("academy/release-map.json", "utf8"),
  );
  const lessons = JSON.parse(
    await readFile("src/lib/academy/course.json", "utf8"),
  ).lessons.map((l) => l.id);
  const fixture = process.argv.indexOf("--fixture");
  const rows =
    fixture >= 0
      ? JSON.parse(await readFile(process.argv[fixture + 1], "utf8"))
      : await fetchReleases();
  const labSource = await readFile("src/lib/learn/labs.ts", "utf8");
  const validLabIds = [...labSource.matchAll(/^    id: "([^"]+)"/gm)]
    .map((m) => m[1])
    .concat("invoice-testnet");
  const verifySource = (tag, path, needle) => {
    try {
      return execFileSync("git", ["show", `${tag}:${path}`], {
        encoding: "utf8",
        timeout: 3000,
        maxBuffer: 2000000,
        stdio: ["ignore", "pipe", "ignore"],
      }).includes(needle);
    } catch {
      return false;
    }
  };
  const result = syncReleases(old, rows, manifest, lessons, {
    validLabIds,
    verifySource,
  });
  if (result.changed) {
    await writeFile(
      path + ".candidate",
      JSON.stringify(result.catalog, null, 2) + "\n",
    );
    await rename(path + ".candidate", path);
  }
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
  }
  console.log(
    result.changed
      ? "Validated release metadata candidate saved. Teaching content unchanged."
      : "No newer metadata or changed assets; no update needed.",
  );
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
