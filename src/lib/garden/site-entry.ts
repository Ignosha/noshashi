/**
 * Website entry for the garden field. Bundled by
 * scripts/build-garden-field.mjs into site/assets/garden-field.js, a
 * self-hosted file, because the site's CSP allows scripts from 'self' only.
 *
 * Mounts on every [data-garden-field] host. Every [data-garden-origin]
 * inside it is a flower in the pond (the first is the main one): each
 * sends rings on its breath and keeps a clear pool. The XRP mark sits
 * behind the main flower, its arms reaching out past the petals. Ink is
 * the page's --brand, so the light/dark toggle recolours the pond on the
 * next frame.
 */
import { mountGardenField, type Flower } from "./field";

// The artwork's lit core sits at (49.7%, 46.4%) of the image.
const CORE_X = 0.497;
const CORE_Y = 0.464;

function mount(host: HTMLElement) {
  const blooms = Array.from(host.querySelectorAll<HTMLElement>("[data-garden-origin]"));
  const flowers = (): Flower[] => {
    const box = host.getBoundingClientRect();
    if (!box.width || !box.height) return [];
    return blooms.flatMap((el) => {
      const f = el.getBoundingClientRect();
      if (!f.width || getComputedStyle(el).display === "none") return [];
      return [{
        x: (f.left + f.width * CORE_X - box.left) / box.width,
        y: (f.top + f.height * CORE_Y - box.top) / box.height,
        r: f.height / 2 / box.height,
      }];
    });
  };
  mountGardenField(host, {
    color: () => getComputedStyle(document.documentElement).getPropertyValue("--brand"),
    flowers,
    mark: () => {
      const main = flowers()[0];
      return main ? { x: main.x, y: main.y, size: main.r * 1.9 } : null;
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
