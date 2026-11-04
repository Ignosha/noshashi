import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: {
    target: "es2021",
    outDir: "site/assets/payment-portal",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "src/portal/main.tsx"),
      output: {
        entryFileNames: "portal.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
