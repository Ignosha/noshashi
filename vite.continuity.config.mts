import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("./package.json");
export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: false,
  base: "/assets/continuity/",
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: {
    target: "es2021",
    outDir: "site/assets/continuity",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "src/continuity/main.tsx"),
      output: {
        entryFileNames: "continuity.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
