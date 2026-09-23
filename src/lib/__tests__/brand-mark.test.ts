import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Body paths of the two retired rockets. They outlived a rebrand in a
// dozen hand-copied places (site header, favicon, sign-up popup, legal
// page, the Stripe return pages), so their absence is asserted rather
// than assumed.
const ROCKETS = ["M78 119C82 86 98 53 129 29", "M32 1.5c8.4 8.6 13.1 20.6"];

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
        const text = readFileSync(resolve(root, f), "utf8");
        return ROCKETS.some((rocket) => text.includes(rocket));
      } catch {
        return false;
      }
    });
    expect(offenders).toEqual([]);
  });
});
