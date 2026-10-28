import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("./src-tauri/tauri.conf.json") as { version: string };

// NOSHASHI Academy is its own app. It shares NOSHASHI's theme, its ledger
// readers and the course content (the `@` alias), and builds into its own
// bundle and its own Tauri app.
export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, "../public"),
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { alias: { "@": path.resolve(__dirname, "../src") } },
  clearScreen: false,
  server: { port: 1440, strictPort: true, fs: { allow: [path.resolve(__dirname, "..")] }, watch: { ignored: ["**/src-tauri/**"] } },
  build: { target: "es2021", outDir: "dist", emptyOutDir: true },
});
