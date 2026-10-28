import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createRequire } from "node:module";
import { noshxPages } from "../vite.noshx";

/**
 * The lab workstation: NOSHASHI itself, built from its own source as the
 * training edition (src/lib/edition.ts), for NOSHASHI Academy to run in a
 * frame beside each lab's instructions.
 *
 *   --mode desktop   academy/dist/workstation/        (the Academy app)
 *   --mode web       site/academy/app/workstation/    (the website)
 *
 * `npm run academy:build` and `npm run site:academy` build it after the
 * Academy itself, so it is always the same NOSHASHI source as the release.
 */
const ROOT = path.resolve(__dirname, "..");
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

export default defineConfig(({ mode }) => {
  const web = mode === "web";
  return {
    root: ROOT,
    base: web ? "/academy/app/workstation/" : "/workstation/",
    publicDir: path.join(ROOT, "public"),
    plugins: [react(), tailwindcss(), noshxPages()],
    define: {
      __APP_VERSION__: JSON.stringify(version),
      "import.meta.env.VITE_NOSHASHI_EDITION": JSON.stringify("training"),
    },
    resolve: { alias: { "@": path.join(ROOT, "src") } },
    clearScreen: false,
    logLevel: "warn",
    build: {
      target: "es2021",
      outDir: web ? path.join(ROOT, "site/academy/app/workstation") : path.join(__dirname, "dist/workstation"),
      emptyOutDir: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1200,
    },
  };
});
