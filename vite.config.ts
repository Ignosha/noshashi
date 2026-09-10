import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createRequire } from "node:module";

// package.json is the one place the version is written. Everything the user
// can read it from — the About panel, the footer, the legal BUILD row —
// resolves to this at build time rather than repeating the number.
const { version } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    /*
     * The edition, selected by `--mode demo` rather than by a leading
     * `VITE_NOSHASHI_EDITION=demo` on the npm script. That shell syntax is
     * not a thing on Windows — `npm run build:demo` failed there with
     * "'VITE_NOSHASHI_EDITION' is not recognized" — and a `.env.demo` file
     * cannot be the answer either, because .gitignore excludes `.env.*` to
     * keep credentials out of the repository and carving an exception into
     * that rule to carry a build flag is a bad trade.
     *
     * Defining the full `import.meta.env.VITE_NOSHASHI_EDITION` expression
     * preserves the property src/lib/edition.ts depends on and documents:
     * the value is substituted as a literal at build time, so Rollup folds
     * the comparison and drops the dead branch. Reading it at runtime would
     * put both editions' code in both bundles.
     */
    "import.meta.env.VITE_NOSHASHI_EDITION": JSON.stringify(
      mode === "demo" ? "demo" : "full"
    ),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2021",
    // Split the vendor tree so a UI edit does not invalidate the whole
    // bundle for a returning user — and so the desktop build ships a
    // cacheable React/motion chunk.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          motion: ["framer-motion"],
          radix: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-switch",
            "@radix-ui/react-progress",
            "@radix-ui/react-separator",
            "@radix-ui/react-label",
          ],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
}));
