import { defineConfig, mergeConfig } from "vite";
import path from "node:path";
import { copyFileSync } from "node:fs";
import desktop from "./vite.config.mts";

/**
 * The same Academy, built for the website at /academy/app/.
 *
 *   npm run site:academy       builds site/academy/app/
 *   npm run check:academy-web  fails if the committed build is stale
 *
 * The site deploys without installing packages, so the build is committed
 * like the site's other generated files (see vite.noshx-web.config.mts).
 */
export default mergeConfig(desktop, defineConfig({
  base: "/academy/app/",
  define: { __APP_VERSION__: JSON.stringify("web") },
  logLevel: "warn",
  // The service worker that lets the course work offline after a first visit (academy/src/offline.ts).
  plugins: [{ name: "academy-sw", closeBundle: () => copyFileSync(path.resolve(__dirname, "sw.js"), path.resolve(__dirname, "../site/academy/app/sw.js")) }],
  build: {
    outDir: path.resolve(__dirname, "../site/academy/app"),
    emptyOutDir: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1200,
  },
}));
