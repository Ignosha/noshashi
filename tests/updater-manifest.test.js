import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildManifest, REQUIRED } from "../scripts/updater-manifest.mjs";

// The latest.json tauri-action published for v1.0.23, when no upload was lost.
const published = JSON.parse(readFileSync(new URL("./fixtures/updater-latest-1.0.23.json", import.meta.url), "utf8"));
const base = "https://github.com/Ignosha/noshashi/releases/download";

// The release as `gh release view` would list it: each bundle and its .sig.
const bundles = new Map(Object.values(published.platforms).map((p) => [p.url.split("/").pop(), p.signature]));
const release = {
  tagName: "v1.0.23",
  body: published.notes,
  publishedAt: published.pub_date,
  assets: [...bundles.keys()].flatMap((name) => [{ name }, { name: `${name}.sig` }]).concat([{ name: "NOSHASHI_1.0.23_aarch64.dmg" }]),
};
const signatures = Object.fromEntries(bundles);

describe("updater manifest", () => {
  it("rebuilds the published v1.0.23 latest.json from the release's assets", () => {
    expect(buildManifest(release, signatures, base)).toEqual(published);
  });

  it("covers every platform the published file served", () => {
    expect([...REQUIRED].sort()).toEqual(Object.keys(published.platforms).sort());
  });

  it("refuses to write a file missing a platform", () => {
    const windowsOnly = { ...release, assets: release.assets.filter((a) => /msi|exe/.test(a.name)) };
    expect(() => buildManifest(windowsOnly, signatures, base)).toThrow(/darwin-aarch64/);
  });

  it("refuses a bundle whose signature is missing", () => {
    const { ["NOSHASHI_x64.app.tar.gz"]: _, ...unsigned } = signatures;
    expect(() => buildManifest(release, unsigned, base)).toThrow(/darwin-x86_64/);
  });
});
