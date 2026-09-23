import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The retired rocket's body path. It outlived one rebrand in a dozen
// hand-copied places (site header, favicon, sign-up popup, legal page),
// so its absence is asserted rather than assumed.
const ROCKET = "M78 119C82 86 98 53 129 29";

const root = resolve(import.meta.dirname, "../../..");

describe("brand mark", () => {
  it("no tracked file still draws the rocket", () => {
    const files = execSync("git ls-files -- '*.html' '*.js' '*.mjs' '*.ts' '*.tsx' '*.svg' '*.css'", {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => f && !f.endsWith("brand-mark.test.ts"));
    const offenders = files.filter((f) => {
      try {
        return readFileSync(resolve(root, f), "utf8").includes(ROCKET);
      } catch {
        return false;
      }
    });
    expect(offenders).toEqual([]);
  });
});
