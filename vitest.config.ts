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
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
