import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { countInRange, pwnedCount, sha1Upper, PWNED_RANGE_URL } from "@/lib/auth/pwned";

const root = resolve(import.meta.dirname, "../../../..");

describe("leaked-password check (HaveIBeenPwned range API, k-anonymity)", () => {
  it("hashes as the service expects: upper-case SHA-1", async () => {
    // The published SHA-1 of "password".
    expect(await sha1Upper("password")).toBe("5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8");
  });

  it("sends only the five-character prefix, never the password or its full hash", async () => {
    const seen: string[] = [];
    await pwnedCount("correct horse battery staple", (async (url: string | URL | Request) => {
      seen.push(String(url));
      return new Response("", { status: 200 });
    }) as typeof fetch);
    const full = await sha1Upper("correct horse battery staple");
    expect(seen).toEqual([`${PWNED_RANGE_URL}${full.slice(0, 5)}`]);
    expect(seen[0]).not.toContain(full.slice(5));
  });

  it("reads the count for the matching suffix and ignores padding lines", () => {
    const body = "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0";
    expect(countInRange(body, "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(9659365);
    expect(countInRange(body, "0000000000000000000000000000000000A")).toBe(0);
  });

  it("an unreachable service is reported as not checked — never as safe", async () => {
    const r = await pwnedCount("anything", (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch);
    expect(r.checked).toBe(false);
    const r2 = await pwnedCount("anything", (async () => new Response("", { status: 503 })) as typeof fetch);
    expect(r2.checked).toBe(false);
  });

  it("both desktop builds allow the service in their Content Security Policy", () => {
    for (const path of ["src-tauri/tauri.conf.json", "src-tauri/tauri.demo.conf.json"]) {
      const csp: string = JSON.parse(readFileSync(resolve(root, path), "utf8")).app.security.csp;
      const connect = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src"));
      expect(connect).toContain(new URL(PWNED_RANGE_URL).origin);
    }
  });
});
