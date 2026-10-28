import { defineConfig, mergeConfig } from "vite";
import path from "node:path";
import { copyFileSync, readdirSync } from "node:fs";
import desktop from "./vite.config.mts";

/**
 * The same Academy, built for the website at /academy/app/.
 *
 *   npm run site:academy       builds site/academy/app/
 *   npm run check:academy-web  fails if the committed build is stale
 *
 * The site deploys without installing packages, so the build is committed
 * like the site's other generated files (see vite.noshx-web.config.mts).
 */
export default mergeConfig(desktop, defineConfig({
  base: "/academy/app/",
  define: { __APP_VERSION__: JSON.stringify("web") },
  logLevel: "warn",
  plugins: [
    // The service worker that lets the course work offline after a first visit (academy/src/offline.ts).
    { name: "academy-sw", closeBundle: () => copyFileSync(path.resolve(__dirname, "sw.js"), path.resolve(__dirname, "../site/academy/app/sw.js")) },
    // Installable from Safari (Share › Add to Home Screen) and other browsers: a
    // manifest and home-screen icons (academy/pwa/), so it opens full screen
    // with its own icon, like an app. The desktop and iOS apps do not need them.
    {
      name: "academy-install",
      transformIndexHtml: () => [
        { tag: "link", attrs: { rel: "manifest", href: "/academy/app/manifest.webmanifest" }, injectTo: "head" },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "/academy/app/apple-touch-icon.png" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "Academy" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" }, injectTo: "head" },
      ],
      closeBundle: () => {
        for (const file of readdirSync(path.resolve(__dirname, "pwa"))) {
          copyFileSync(path.resolve(__dirname, "pwa", file), path.resolve(__dirname, "../site/academy/app", file));
        }
      },
    },
  ],
  build: {
    outDir: path.resolve(__dirname, "../site/academy/app"),
    emptyOutDir: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1200,
  },
}));
