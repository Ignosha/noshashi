/**
 * Website entry for the garden field. Bundled by
 * scripts/build-garden-field.mjs into site/assets/garden-field.js, a
 * self-hosted file, because the site's CSP allows scripts from 'self' only.
 *
 * Mounts on every [data-garden-field] host. The ripple origin is the
 * centre of the host's [data-garden-origin] element (the hero flower),
 * and the ink is the page's --brand, so the light/dark toggle recolours
 * the pond on the next frame.
 */
import { mountGardenField } from "./field";

function mount(host: HTMLElement) {
  const flower = host.querySelector<HTMLElement>("[data-garden-origin]");
  mountGardenField(host, {
    color: () => getComputedStyle(document.documentElement).getPropertyValue("--brand"),
    origin: () => {
      if (!flower) return null;
      const box = host.getBoundingClientRect();
      const f = flower.getBoundingClientRect();
      if (!f.width || !box.width) return null;
      return {
        x: (f.left + f.width / 2 - box.left) / box.width,
        y: (f.top + f.height / 2 - box.top) / box.height,
      };
    },
    fontSize: Number(host.dataset.gardenFont) || 11,
    pulse: 6,
  });
}

function start() {
  document.querySelectorAll<HTMLElement>("[data-garden-field]").forEach(mount);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
