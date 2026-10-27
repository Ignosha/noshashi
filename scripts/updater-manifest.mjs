#!/usr/bin/env node
/**
 * Writes the in-app updater's latest.json for one release, from the
 * release's own assets, once every build has finished.
 *
 * tauri-action can write latest.json itself, but each matrix job reads the
 * file, adds its platform and uploads it again. When two jobs finish in the
 * same second the later upload drops the other's entry: v1.0.24 shipped a
 * latest.json with Windows only, so macOS and Linux copies could not find
 * an update. Built here from every .sig on the release, the file is
 * complete or the job fails.
 *
 *   node scripts/updater-manifest.mjs <release.json> <sig-dir> <out.json>
 *
 * release.json is `gh release view <tag> --json tagName,body,publishedAt,assets`;
 * sig-dir holds the release's .sig files (`gh release download <tag> -p '*.sig'`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Updater bundle name → the platform keys Tauri's updater looks up. */
const PLATFORMS = [
  [/_aarch64\.app\.tar\.gz$/, ["darwin-aarch64", "darwin-aarch64-app"]],
  [/_x64\.app\.tar\.gz$/, ["darwin-x86_64", "darwin-x86_64-app"]],
  // The plain windows key points at the MSI, as tauri-action's own file does.
  [/_x64_en-US\.msi$/, ["windows-x86_64", "windows-x86_64-msi"]],
  [/_x64-setup\.exe$/, ["windows-x86_64-nsis"]],
  [/_amd64\.AppImage$/, ["linux-x86_64", "linux-x86_64-appimage"]],
  [/_amd64\.deb$/, ["linux-x86_64-deb"]],
  [/\.x86_64\.rpm$/, ["linux-x86_64-rpm"]],
];

/** Every platform a complete release serves. A missing one fails the job. */
export const REQUIRED = PLATFORMS.flatMap(([, keys]) => keys);

/**
 * @param {{ tagName: string, body?: string, publishedAt?: string, assets: Array<{ name: string, url?: string }> }} release
 * @param {Record<string, string>} signatures  asset name (without .sig) → signature file contents
 * @param {string} downloadBase  e.g. https://github.com/<owner>/<repo>/releases/download
 */
export function buildManifest(release, signatures, downloadBase) {
  const platforms = {};
  for (const asset of release.assets) {
    const match = PLATFORMS.find(([pattern]) => pattern.test(asset.name));
    if (!match) continue;
    const signature = signatures[asset.name];
    if (signature === undefined) continue;
    for (const key of match[1]) {
      platforms[key] = {
        signature: signature.trim(),
        url: `${downloadBase}/${release.tagName}/${asset.name}`,
      };
    }
  }
  const missing = REQUIRED.filter((key) => !platforms[key]);
  if (missing.length) throw new Error(`latest.json would be missing ${missing.join(", ")}`);
  return {
    version: release.tagName.replace(/^v/, ""),
    notes: release.body ?? "",
    pub_date: release.publishedAt ?? new Date().toISOString(),
    platforms,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [releaseFile, sigDir, outFile] = process.argv.slice(2);
  if (!releaseFile || !sigDir || !outFile) {
    console.error("usage: updater-manifest.mjs <release.json> <sig-dir> <out.json>");
    process.exit(2);
  }
  const release = JSON.parse(readFileSync(releaseFile, "utf8"));
  const signatures = {};
  for (const asset of release.assets) {
    if (!asset.name.endsWith(".sig")) continue;
    signatures[asset.name.slice(0, -4)] = readFileSync(path.join(sigDir, asset.name), "utf8");
  }
  const repo = process.env.GITHUB_REPOSITORY ?? "Ignosha/noshashi";
  const manifest = buildManifest(release, signatures, `https://github.com/${repo}/releases/download`);
  writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`latest.json for ${manifest.version}: ${Object.keys(manifest.platforms).join(", ")}`);
}
