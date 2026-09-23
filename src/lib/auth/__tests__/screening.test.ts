import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { breachedMessage, isUnscreenedRefusal, readScreenResponse } from "@/lib/auth/screening";

const root = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("server-side password screening — the app's side", () => {
  it("clean only when the server says ok in a 2xx", async () => {
    expect(await readScreenResponse(json(200, { ok: true }))).toEqual({ ok: true });
  });

  it("a breached password carries its count", async () => {
    expect(await readScreenResponse(json(422, { ok: false, code: "PASSWORD_BREACHED", count: 9659365 }))).toEqual({
      ok: false,
      code: "PASSWORD_BREACHED",
      count: 9659365,
    });
    expect(breachedMessage(1)).toContain("1 time in known data breaches");
  });

  for (const [name, response] of [
    ["network down", null],
    ["server unavailable", json(503, { ok: false, code: "SCREENING_UNAVAILABLE" })],
    ["non-JSON body", new Response("<html>", { status: 502 })],
    ["ok on an error status", json(500, { ok: true })],
    ["2xx without ok", json(200, {})],
  ] as const) {
    it(`${name} → unavailable, never clean`, async () => {
      expect(await readScreenResponse(response)).toEqual({ ok: false, code: "SCREENING_UNAVAILABLE" });
    });
  }

  it("recognises the hook's refusal by the code the migration returns", () => {
    const sql = read("supabase/migrations/20260924000000_password_screening.sql");
    const message = sql.match(/'message', '([^']+)'/)?.[1] ?? "";
    expect(message.startsWith("PASSWORD_NOT_SCREENED")).toBe(true);
    expect(isUnscreenedRefusal(message)).toBe(true);
    expect(isUnscreenedRefusal("Invalid login credentials")).toBe(false);
  });
});

describe("server-side password screening — the function and the hook", () => {
  const fn = read("supabase/functions/noshashi-password/index.ts");
  const sql = read("supabase/migrations/20260924000000_password_screening.sql");

  it("sends only the five-character SHA-1 prefix to the breach database, with padding", () => {
    expect(fn).toContain("`${RANGE}${hash.slice(0, 5)}`");
    expect(fn).toContain('"Add-Padding": "true"');
    expect(fn).not.toMatch(/console\.\w+\([^)]*\bpassword\)/);
  });

  it("never records a password the breach database could not check, or a breached one", () => {
    const fetchAt = fn.indexOf("await fetch(");
    const unreachable = fn.indexOf("SCREENING_UNAVAILABLE", fetchAt);
    const breached = fn.indexOf("PASSWORD_BREACHED", fetchAt);
    const attest = fn.indexOf('rpc("attest_password"');
    expect(fetchAt).toBeGreaterThan(0);
    expect(unreachable).toBeGreaterThan(fetchAt);
    expect(unreachable).toBeLessThan(attest);
    expect(breached).toBeLessThan(attest);
  });

  it("the hook only judges password sign-ins, so recovery always works", () => {
    expect(sql).toMatch(/authentication_method', ''\) <> 'password' then\s+return jsonb_build_object\('claims'/);
  });

  it("only the auth service runs the hook and only the server attests", () => {
    expect(sql).toContain("grant execute on function noshashi.password_screen_hook(jsonb) to supabase_auth_admin");
    expect(sql).toContain("revoke execute on function noshashi.password_screen_hook(jsonb) from public, anon, authenticated");
    expect(sql).toContain("revoke execute on function noshashi.attest_password(text, text) from public, anon, authenticated");
  });
});
