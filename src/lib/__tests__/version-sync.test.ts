import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * One version, everywhere it is written.
 *
 * package.json is the source: the app reads it at build time
 * (vite.config.mts → __APP_VERSION__ → BRAND.version) and so does the
 * website. The release tooling needs its own copy in five more places —
 * the lockfile (twice), the Tauri config, Cargo.toml and Cargo.lock — and
 * the changelog must open with it. A release that bumps four of the six
 * ships an installer whose About box, updater manifest and release notes
 * disagree; this test is what stops that.
 */

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

const source: string = JSON.parse(read("package.json")).version;

describe("version sync", () => {
  it("package.json holds a plain semver version", () => {
    expect(source).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("package-lock.json carries it at the root and for the root package", () => {
    const lock = JSON.parse(read("package-lock.json"));
    expect(lock.version).toBe(source);
    expect(lock.packages[""].version).toBe(source);
  });

  it("the Tauri config carries it (installer names, updater manifest)", () => {
    expect(JSON.parse(read("src-tauri/tauri.conf.json")).version).toBe(source);
  });

  it("Cargo.toml and Cargo.lock carry it for the noshashi crate", () => {
    expect(read("src-tauri/Cargo.toml")).toMatch(new RegExp(`^version = "${source.replace(/\./g, "\\.")}"$`, "m"));
    const lock = read("src-tauri/Cargo.lock");
    const entry = lock.match(/\[\[package\]\]\nname = "noshashi"\nversion = "([^"]+)"/);
    expect(entry?.[1]).toBe(source);
  });

  it("the changelog opens with it", () => {
    const first = read("CHANGELOG.md").match(/^## (\d+\.\d+\.\d+)\s*$/m);
    expect(first?.[1]).toBe(source);
  });
});
