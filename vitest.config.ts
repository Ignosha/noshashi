import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Tests cover the pure findings logic — the functions that turn a ledger
 * read into a sentence an operator acts on. They need no DOM and no
 * network: every case is a hand-built report, so a test failure means the
 * reasoning changed, never that mainnet did.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  // Mirrors the build-time substitution in vite.config.ts, so a test that
  // pulls in anything reading BRAND.version does not hit an undefined global.
  define: { __APP_VERSION__: JSON.stringify("0.0.0-test") },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
