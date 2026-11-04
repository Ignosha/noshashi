import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createRequire } from "node:module";
import { copyFileSync } from "node:fs";

const { version } = createRequire(import.meta.url)("./src-tauri/tauri.conf.json") as { version: string };
let academyOutput = path.resolve(__dirname, "dist");

// NOSHASHI Academy is its own app. It shares NOSHASHI's theme, its ledger
// readers and the course content (the `@` alias), and builds into its own
// bundle and its own Tauri app.
export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, "../public"),
  plugins: [react(), tailwindcss(), {
    // public/ is shared with the console, but the Academy must retain its
    // own favicon and launcher artwork in both native and browser builds.
    name: "academy-brand",
    configResolved(config) { academyOutput = path.resolve(config.root, config.build.outDir); },
    closeBundle() {
      copyFileSync(path.resolve(__dirname, "../public/brand/academy-icon.svg"), path.resolve(academyOutput, "app-icon.svg"));
      copyFileSync(path.resolve(__dirname, "pwa/icon-512.png"), path.resolve(academyOutput, "icon.png"));
    },
  }],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { alias: { "@": path.resolve(__dirname, "../src") } },
  clearScreen: false,
  server: { port: 1440, strictPort: true, fs: { allow: [path.resolve(__dirname, "..")] }, watch: { ignored: ["**/src-tauri/**"] } },
  build: { target: "es2021", outDir: "dist", emptyOutDir: true },
});
