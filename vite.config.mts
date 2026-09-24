import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

// Set by `tauri ios dev` to the Mac's network address, so a phone on the
// same network can load the dev server and its hot reload.
const devHost = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
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
    host: devHost || false,
    hmr: devHost ? { protocol: "ws", host: devHost, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2021",
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
