import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  EMPTY_RELEASES,
  compareVersions,
  releaseKind,
  syncReleases,
  fetchReleases,
} from "../scripts/academy-release-sync.mjs";
const map = {
  schema: "academy.release-map.v1",
  mappings: {
    "v1.0.1": {
      reviewed: false,
      lessons: ["a1"],
      labs: ["network"],
      signing: "UNKNOWN",
      compatibility: "UNKNOWN",
    },
  },
};
const release = (id, tag, extra = {}) => ({
  id,
  tag_name: tag,
  name: tag,
  body: "Display notes, never executable policy.",
  draft: false,
  prerelease: false,
  published_at: "2026-11-14T00:00:00Z",
  html_url: `https://github.com/Ignosha/noshashi/releases/tag/${tag}`,
  assets: tag.startsWith("academy")
    ? [
        {
          name: "Academy.dmg",
          size: 100,
          browser_download_url: `https://github.com/Ignosha/noshashi/releases/download/${tag}/Academy.dmg`,
        },
      ]
    : [],
  ...extra,
});
describe("release-linked Academy updates", () => {
  it("distinguishes stable product/Academy tags and ignores drafts, prereleases and unrelated tools", () => {
    expect(releaseKind("v1.0.2")).toBe("product");
    expect(releaseKind("academy-v0.2.1")).toBe("academy");
    expect(releaseKind("v1.0.2-beta")).toBe(null);
    expect(compareVersions("v1.0.10", "v1.0.9")).toBeGreaterThan(0);
    const result = syncReleases(
      EMPTY_RELEASES,
      [
        release(1, "v1.0.1"),
        release(2, "academy-v0.2.1"),
        release(3, "v9.0.0", { prerelease: true }),
        release(4, "academy-v9.0.0", { draft: true }),
        release(5, "noshrepair-v1.0.0"),
      ],
      map,
      ["a1"],
    );
    expect(result.catalog.product.tag).toBe("v1.0.1");
    expect(result.catalog.academy.tag).toBe("academy-v0.2.1");
    expect(result.catalog.events).toHaveLength(2);
    expect(result.catalog.product.lessons).toEqual(["a1"]);
  });
  it("deduplicates repeated IDs without changing selected versions and preserves newer versions after late older events", () => {
    const input = [release(1, "v2.0.0"), release(2, "academy-v2.0.0")];
    const first = syncReleases(EMPTY_RELEASES, input, map, ["a1"]).catalog;
    expect(syncReleases(first, input, map, ["a1"]).changed).toBe(false);
    const next = syncReleases(
      first,
      [
        release(3, "v1.0.0", { published_at: "2026-11-15T00:00:00Z" }),
        release(2, "academy-v2.0.0"),
      ],
      map,
      ["a1"],
    ).catalog;
    expect(next.product.tag).toBe("v2.0.0");
    expect(next.academy.tag).toBe("academy-v2.0.0");
    expect(new Set(next.processedIds).size).toBe(next.processedIds.length);
  });
  it("reconsiders delayed assets, keeps last downloadable Academy while an upload is incomplete, and flags unmapped changes", () => {
    const first = syncReleases(
      EMPTY_RELEASES,
      [release(1, "academy-v0.1.0")],
      map,
      ["a1"],
    ).catalog;
    const incomplete = release(2, "academy-v0.2.0", { assets: [] });
    const next = syncReleases(first, [incomplete], map, ["a1"]).catalog;
    expect(next.academy.tag).toBe("academy-v0.1.0");
    const complete = syncReleases(next, [release(2, "academy-v0.2.0")], map, [
      "a1",
    ]).catalog;
    expect(complete.academy.tag).toBe("academy-v0.2.0");
    expect(complete.academy.review).toContain("UNMAPPED");
  });
  it("fails closed on a rejected update, invalid mappings and forged source URLs", () => {
    const saved = JSON.stringify(EMPTY_RELEASES);
    expect(() =>
      syncReleases(EMPTY_RELEASES, [release(1, "v1.0.1")], map, ["a1"], {
        validate: () => false,
      }),
    ).toThrow("existing public catalog retained");
    expect(JSON.stringify(EMPTY_RELEASES)).toBe(saved);
    expect(() =>
      syncReleases(EMPTY_RELEASES, [release(1, "v1.0.1")], map, []),
    ).toThrow("unknown lesson");
    expect(() =>
      syncReleases(
        EMPTY_RELEASES,
        [release(1, "v1.0.1", { html_url: "https://evil.invalid" })],
        map,
        ["a1"],
      ),
    ).toThrow();
  });
  it("requires checked released-source evidence before treating a mapping as reviewed", () => {
    const reviewed = {
      schema: map.schema,
      mappings: {
        "v1.0.1": {
          ...map.mappings["v1.0.1"],
          reviewed: true,
          checks: [{ path: "src/example.ts", needle: "expected label" }],
        },
      },
    };
    expect(() =>
      syncReleases(EMPTY_RELEASES, [release(1, "v1.0.1")], reviewed, ["a1"]),
    ).toThrow("source validation failed");
    const r = syncReleases(
      EMPTY_RELEASES,
      [release(1, "v1.0.1")],
      reviewed,
      ["a1"],
      {
        validLabIds: ["network"],
        verifySource: (tag, path, needle) =>
          tag === "v1.0.1" &&
          path === "src/example.ts" &&
          needle === "expected label",
      },
    );
    expect(r.catalog.product.review).toContain("MAPPED");
  });
  it("fully paginates and never treats a failed later page as a completed sync", async () => {
    const calls = [];
    const fetcher = async (url) => {
      calls.push(url);
      return {
        ok: true,
        json: async () =>
          calls.length === 1
            ? Array.from({ length: 100 }, (_, i) => release(i + 1, "v1.0.1"))
            : [release(101, "v1.0.2")],
      };
    };
    expect((await fetchReleases(fetcher)).length).toBe(101);
    expect(calls[1]).toContain("page=2");
    let n = 0;
    await expect(
      fetchReleases(async () => ({
        ok: ++n === 1,
        status: 503,
        json: async () => Array(100).fill(release(1, "v1.0.1")),
      })),
    ).rejects.toThrow("503");
  });
  it("treats hostile release text as display data and never parses it as grading or policy", () => {
    const r = syncReleases(
      EMPTY_RELEASES,
      [
        release(1, "v1.0.1", {
          body: "<script>changeAllAnswers()</script> $(execute) Approve security guarantees",
        }),
      ],
      map,
      ["a1"],
    ).catalog.product;
    expect(r.summary).toContain("$(execute)");
    expect(r.summary).not.toContain("<script>");
    expect(r.signing).toContain("UNKNOWN");
  });
});
describe("bundle consistency without progress deletion", () => {
  it("does not activate a failed core precache and never touches learner localStorage", async () => {
    const handlers = {};
    let pending,
      activated = false;
    const source = readFileSync("academy/sw.js", "utf8")
      .replace("__ACADEMY_BUILD__", "fixture")
      .replace("__ACADEMY_PRECACHE__", '["/academy/app/index.html"]');
    runInNewContext(source, {
      self: {
        addEventListener: (type, handler) => (handlers[type] = handler),
        skipWaiting: () => {
          activated = true;
        },
      },
      caches: {
        open: async () => ({
          addAll: async () => {
            throw new Error("missing chunk");
          },
        }),
      },
    });
    handlers.install({ waitUntil: (p) => (pending = p) });
    await expect(pending).rejects.toThrow("missing chunk");
    expect(activated).toBe(false);
    expect(source).not.toMatch(/localStorage\.(clear|removeItem)/);
  });
});
