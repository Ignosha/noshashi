// The Continuity download (scripts/package-continuity.mjs): reproducible,
// built from the operator copy in tools/continuity, and complete.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { buildContinuityPackage } from "../scripts/package-continuity.mjs";

/** Entries of a ZIP built by the packager: name -> inflated bytes. */
function unzip(buf) {
  const out = {};
  let at = 0;
  while (buf.readUInt32LE(at) === 0x04034b50) {
    const size = buf.readUInt32LE(at + 18), nameLen = buf.readUInt16LE(at + 26), extra = buf.readUInt16LE(at + 28);
    const name = buf.toString("utf8", at + 30, at + 30 + nameLen);
    const start = at + 30 + nameLen + extra;
    out[name] = zlib.inflateRawSync(buf.subarray(start, start + size));
    at = start + size;
  }
  return out;
}

describe("Continuity download", () => {
  it("is byte-for-byte reproducible", async () => {
    const a = await buildContinuityPackage(), b = await buildContinuityPackage();
    expect(a.sha256).toBe(b.sha256);
    expect(Buffer.compare(a.bytes, b.bytes)).toBe(0);
  });

  it("ships the operator copy unchanged, with everything needed to run it", async () => {
    const files = unzip((await buildContinuityPackage()).bytes);
    for (const f of ["continuity.html", "continuity.js", "credit_source.py"]) {
      expect(files["noshashi-continuity/" + f].equals(readFileSync(new URL("../tools/continuity/" + f, import.meta.url)))).toBe(true);
    }
    for (const f of ["README.txt", "start.sh", "start.bat", "example-view.sql", "LICENSE"]) {
      expect(files["noshashi-continuity/" + f], f).toBeDefined();
    }
    expect(files["noshashi-continuity/example-view.sql"].toString()).toMatch(/continuity_credits[\s\S]*tx_hash[\s\S]*amount[\s\S]*issuer[\s\S]*currency/);
    // start.sh resolves the database path before it changes directory.
    const sh = files["noshashi-continuity/start.sh"].toString();
    expect(sh.indexOf('DB="$(cd')).toBeLessThan(sh.indexOf('cd "$(dirname "$0")"'));
  });

  it("marks start.sh executable", async () => {
    const buf = (await buildContinuityPackage()).bytes;
    const cd = buf.lastIndexOf(Buffer.from("noshashi-continuity/start.sh")) - 46;
    expect(buf.readUInt32LE(cd)).toBe(0x02014b50);
    expect((buf.readUInt32LE(cd + 38) >>> 16) & 0o777).toBe(0o755);
  });
});
