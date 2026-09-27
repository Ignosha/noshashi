import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/*
 * The macOS app runs on the system WebKit, and NOSHASHI supports macOS
 * back to 10.15. WebKit before Safari 16.4 cannot parse a regular
 * expression with a lookbehind ((?<= or (?<!): the whole module that
 * contains one fails to load. In 1.0.10 one in NOSHX Core's sentence
 * splitter made the NOSHX screen fail to render on those Macs. Named
 * groups ((?<name>) parse fine and are allowed.
 */
const SRC = path.resolve(__dirname, "../..");

function appFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "__live__" ? [] : appFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("app code for the macOS WebKit", () => {
  it("uses no regular-expression lookbehind", () => {
    const offenders = appFiles(SRC).flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => /\(\?<[=!]/.test(line))
        .map(({ i }) => `${path.relative(SRC, file)}:${i + 1}`)
    );
    expect(offenders).toEqual([]);
  });
});
