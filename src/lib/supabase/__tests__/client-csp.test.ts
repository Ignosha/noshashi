import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Supabase origin is written down in three places, and they must agree.
 *
 * src/lib/supabase/client.ts holds the URL the client actually calls. Both
 * Tauri configs allowlist that origin in their Content Security Policy, once
 * over https for REST and auth and once over wss for realtime. Nothing links
 * the three, so changing the backend means remembering all of them.
 *
 * Getting it wrong fails in the worst possible way. The CSP is compiled into
 * the installer, while `npm run dev` serves over a policy the dev server
 * relaxes — so a mismatch passes every local check and then blocks every
 * request in the shipped application, with the console blaming a security
 * policy rather than the config that is actually wrong. By then the build is
 * signed and published.
 *
 * This test is the link. It is a file-reading test rather than a unit test
 * because the values it compares live in two different file formats and only
 * ever meet at build time.
 */

const root = resolve(import.meta.dirname, "../../../..");

const clientSource = readFileSync(resolve(root, "src/lib/supabase/client.ts"), "utf8");

const TAURI_CONFIGS = ["src-tauri/tauri.conf.json", "src-tauri/tauri.demo.conf.json"];

/** The origin the client falls back to when no env var is supplied. */
function clientOrigin(): string {
  const match = clientSource.match(/VITE_SUPABASE_URL\s*\?\?\s*"([^"]+)"/);
  if (!match) {
    throw new Error(
      "Could not find the VITE_SUPABASE_URL fallback in client.ts. If the " +
        "fallback was deliberately removed, delete this test with it."
    );
  }
  return new URL(match[1]).origin;
}

function cspOf(configPath: string): string {
  const config = JSON.parse(readFileSync(resolve(root, configPath), "utf8"));
  const csp = config?.app?.security?.csp;
  if (typeof csp !== "string") {
    throw new Error(`${configPath} has no app.security.csp`);
  }
  return csp;
}

describe("Supabase origin and the Tauri CSP", () => {
  it("has a fallback origin that parses", () => {
    expect(() => clientOrigin()).not.toThrow();
    expect(clientOrigin()).toMatch(/^https:\/\//);
  });

  for (const configPath of TAURI_CONFIGS) {
    it(`${configPath} allows the origin over https and wss`, () => {
      const origin = clientOrigin();
      const csp = cspOf(configPath);

      const connectSrc = csp
        .split(";")
        .map((directive) => directive.trim())
        .find((directive) => directive.startsWith("connect-src"));

      expect(connectSrc, `${configPath} has no connect-src directive`).toBeDefined();

      // REST, auth and edge functions.
      expect(connectSrc).toContain(origin);

      // Realtime opens a WebSocket to the same host, which connect-src governs
      // separately — allowing only the https origin silently breaks it.
      expect(connectSrc).toContain(origin.replace(/^https:/, "wss:"));
    });
  }

  it("keeps both editions on the same backend", () => {
    // The demo reads the same mainnet and the same database as the full
    // product. Divergent origins here would mean it quietly stopped doing so.
    const [full, demo] = TAURI_CONFIGS.map(cspOf);
    const connectSrcOf = (csp: string) =>
      csp
        .split(";")
        .map((d) => d.trim())
        .find((d) => d.startsWith("connect-src"));

    expect(connectSrcOf(demo)).toBe(connectSrcOf(full));
  });
});
