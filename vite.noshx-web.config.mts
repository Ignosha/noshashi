import { defineConfig } from "vite";
import path from "node:path";
import { noshxPages } from "./vite.noshx";

/**
 * NOSHX Core for the website's support console.
 *
 *   npm run site:noshx       builds site/assets/noshx/
 *   npm run check:noshx-web  fails if the committed build is stale
 *
 * The site deploys without installing packages, so the build is committed
 * like the site's other generated files. The engine and the page index
 * are separate files: the index loads when the console is first opened.
 */
export default defineConfig({
  plugins: [noshxPages()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  define: { __APP_VERSION__: JSON.stringify("web") },
  logLevel: "warn",
  build: {
    outDir: "site/assets/noshx",
    emptyOutDir: true,
    target: "es2020",
    copyPublicDir: false,
    reportCompressedSize: false,
    minify: "esbuild",
    lib: {
      entry: path.resolve(__dirname, "src/site/noshx-web.ts"),
      formats: ["es"],
      fileName: () => "noshx.js",
    },
    rollupOptions: {
      output: { chunkFileNames: "pages-[hash].js" },
    },
  },
});
