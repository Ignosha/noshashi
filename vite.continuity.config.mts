import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  publicDir: "public",
  build: { target: "es2021", outDir: "dist-continuity", emptyOutDir: true, rollupOptions: { input: path.resolve(process.cwd(), "continuity/index.html") } },
  server: { port: 1430, strictPort: true },
  root: ".",
  // Dedicated entry: no changes to the existing NOSHASHI app or website.
  appType: "mpa",
});
