/**
 * Website entry for the garden field. Bundled by
 * scripts/build-garden-field.mjs into site/assets/garden-field.js, a
 * self-hosted file, because the site's CSP allows scripts from 'self' only.
 *
 * Two layers. A page-wide pond sits fixed behind every page's content,
 * faint and slow, so the whole site shares the garden without any of it
 * competing with text. And every [data-garden-field] host (the home hero)
 * gets its own, denser pond.
 *
 * In a hero host, every [data-garden-origin] inside it is a flower in
 * the pond (the first is the main one): each
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

/**
 * The page-wide pond: fixed, behind everything (z-index -1 paints above
 * the root background and below all content), faint, 20fps, with the
 * pointer's ripples and an occasional ambient ring. It pauses while a hero
 * pond fills most of the screen, which covers it anyway, so the two never
 * both run.
 */
function mountPage() {
  if (document.documentElement.dataset.gardenPage === "off") return;
  const layer = document.createElement("div");
  layer.className = "garden-page";
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    zIndex: "-1",
    pointerEvents: "none",
    overflow: "hidden",
  });
  document.body.appendChild(layer);

  let heroShare = 0;
  const hero = document.querySelector<HTMLElement>("[data-garden-field]");
  if (hero) {
    new IntersectionObserver(
      ([entry]) => {
        heroShare = entry?.intersectionRatio ?? 0;
      },
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] }
    ).observe(hero);
  }

  mountGardenField(layer, {
    color: () => getComputedStyle(document.documentElement).getPropertyValue("--brand"),
    fontSize: 13,
    intensity: 0.9,
    fps: 20,
    ambient: 9,
    paused: () => heroShare >= 0.6,
  });
}

function start() {
  mountPage();
  document.querySelectorAll<HTMLElement>("[data-garden-field]").forEach(mount);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
