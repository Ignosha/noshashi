import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  publicDir: "public",
  build: {
    target: "es2021",
    outDir: "dist-continuity",
    emptyOutDir: true,
    rollupOptions: {
      input: ["continuity/index.html", "continuity/demo/index.html"].map(entry => path.resolve(process.cwd(), entry)),
    },
  },
  server: { port: 1430, strictPort: true },
  root: ".",
  // Dedicated entry: no changes to the existing NOSHASHI app or website.
  appType: "mpa",
});
