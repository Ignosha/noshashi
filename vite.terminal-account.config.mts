import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: {
    target: "es2021",
    outDir: "site/assets/terminal-account",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "src/terminal-account/main.tsx"),
      output: {
        entryFileNames: "account.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
