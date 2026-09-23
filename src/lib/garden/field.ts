/**
 * The garden field: an ASCII pond behind the flower.
 *
 * Every frame paints a small greyscale "water" image — slow liquid folds
 * with rings spreading from the flower on each breath and from the
 * pointer — and asciify-engine (MIT, github.com/ayangabryl/asciify-engine)
 * turns it into glyphs in the brand green. The liquid folds are adapted
 * from the engine's own fluid source (paintLiquidSource), with the pond's
 * ripples added and a calm pool left clear around the flower so the
 * artwork is never overprinted.
 *
 * Framework-agnostic: the website bundles this into
 * site/assets/garden-field.js (scripts/build-garden-field.mjs), and the
 * console mounts it from React (components/nova/GardenField.tsx).
 *
 * Costs are bounded on purpose: ~30fps, a source image of at most 180
 * columns, paused while off-screen or in a hidden tab, and a single still
 * frame under prefers-reduced-motion.
 */
import {
  DEFAULT_OPTIONS,
  imageToAsciiFrame,
  renderFrameToCanvas,
  type AsciiOptions,
} from "asciify-engine/core";

export type GardenFieldOptions = {
  /** Where the flower sits, host-relative 0..1. Null for no origin. */
  origin?: () => { x: number; y: number } | null;
  /** Any CSS colour; converted to hex for the engine. Re-read on theme change. */
  color: () => string;
  /** Glyph cell size in CSS pixels. */
  fontSize?: number;
  /** Seconds between rings from the flower — match its breathing animation. */
  pulse?: number;
  /** Ripples from the pointer. */
  interactive?: boolean;
};

export type GardenField = { destroy(): void; refresh(): void };

/** Light → dense. Dots are still water, tildes are moving water. */
export const GARDEN_CHARSET = " .·:-~=+*";

const MAX_SOURCE_COLUMNS = 180;
const FRAME_MS = 1000 / 30;
const RING_SPEED = 0.16; // host heights per second
const RING_LIFE = 7; // seconds

type Ring = { x: number; y: number; born: number; strength: number };

/** Resolve any CSS colour string to #rrggbb, which is what the engine accepts. */
export function toHex(css: string): string {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return "#9be15d";
  probe.fillStyle = "#9be15d";
  probe.fillStyle = css.trim() || "#9be15d";
  const out = String(probe.fillStyle);
  if (out.startsWith("#")) return out;
  const m = out.match(/\d+(\.\d+)?/g);
  if (!m) return "#9be15d";
  return "#" + m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("");
}

/**
 * The water's brightness at (u, v), 0..1. Exported for tests: it is the
 * whole visual, and it must stay bounded and leave the pool clear.
 */
export function waterAt(
  u: number,
  v: number,
  time: number,
  aspect: number,
  rings: readonly Ring[],
  origin: { x: number; y: number } | null
): number {
  // Liquid folds, after asciify-engine's paintLiquidSource.
  const px = (u - 0.5) * aspect;
  const py = v - 0.5;
  const qx = px + 0.22 * Math.sin(py * 5.2 + time * 0.17) + 0.15 * Math.sin(px * 2.4 - py * 3.1 - time * 0.1);
  const qy = py + 0.19 * Math.sin(px * 3.5 + time * 0.13);
  const radius = Math.hypot(qx * 0.8 + 0.18, qy * 1.1);
  const folds = 0.5 + 0.5 * Math.sin(radius * 14 - qx * 2.8 + Math.sin(qy * 5) * 1.4 - time * 0.24);
  const cloud = 0.5 + 0.5 * Math.sin(qx * 3.6 - qy * 2.9 + time * 0.09);
  let light = folds * folds * (0.3 + cloud * 0.22) - 0.06;

  // Rings: a crest and a weaker trough-side echo behind it.
  for (const ring of rings) {
    const age = time - ring.born;
    if (age < 0 || age > RING_LIFE) continue;
    const d = Math.hypot((u - ring.x) * aspect, v - ring.y);
    const front = age * RING_SPEED;
    const fade = Math.exp(-age * 0.42) * ring.strength;
    const crest = Math.exp(-((d - front) ** 2) / 0.0011);
    const echo = Math.exp(-((d - front + 0.045) ** 2) / 0.0007) * 0.45;
    light += (crest + echo) * fade;
  }

  // A calm pool: glyphs thin out towards the flower and vanish under it.
  if (origin) {
    const d = Math.hypot((u - origin.x) * aspect, v - origin.y);
    const t = Math.max(0, Math.min(1, (d - 0.1) / 0.16));
    light *= t * t * (3 - 2 * t);
  }
  return Math.max(0, Math.min(1, light));
}

export function mountGardenField(host: HTMLElement, options: GardenFieldOptions): GardenField {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "garden-field";
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
  host.prepend(canvas);
  const ctx = canvas.getContext("2d");
  const source = document.createElement("canvas");
  const sctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx || !sctx) return { destroy: () => canvas.remove(), refresh: () => {} };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pulse = options.pulse ?? 6;
  const ascii: AsciiOptions = {
    ...DEFAULT_OPTIONS,
    fontSize: options.fontSize ?? 11,
    charset: GARDEN_CHARSET,
    colorMode: "accent",
    accentColor: toHex(options.color()),
    contrast: 0.15,
  };

  let width = 0;
  let height = 0;
  let image: ImageData | null = null;
  const rings: Ring[] = [];
  const start = performance.now();
  let lastPulse = -Infinity;
  let lastPointer = 0;
  let visible = true;
  let raf = 0;
  let lastFrame = 0;

  const now = () => (performance.now() - start) / 1000;

  const resize = () => {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = Math.min(MAX_SOURCE_COLUMNS, Math.max(24, Math.round(width / 6)));
    source.width = cols;
    source.height = Math.max(12, Math.round((cols * height) / width));
    image = sctx.createImageData(source.width, source.height);
  };

  const draw = (time: number) => {
    if (!image || width < 2) return;
    const origin = options.origin?.() ?? null;
    if (origin && time - lastPulse >= pulse) {
      rings.push({ ...origin, born: time, strength: 0.95 });
      lastPulse = time;
    }
    while (rings.length && time - rings[0].born > RING_LIFE) rings.shift();

    const { width: sw, height: sh, data } = image;
    const aspect = width / height;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const value = Math.round(waterAt(x / sw, y / sh, time, aspect, rings, origin) * 255);
        const i = (y * sw + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = value;
        // Still water is transparent, not black. The engine paints its
        // own #faf9f7/#0a0a0a ground behind any frame it finds fully
        // opaque, which showed as a grey box on the light theme; the
        // top-left corner is always clear so that check never passes.
        data[i + 3] = value < 10 || (x < 4 && y < 5) ? 0 : 255;
      }
    }
    sctx.putImageData(image, 0, 0);
    const { frame } = imageToAsciiFrame(source, ascii, width, height);
    renderFrameToCanvas(ctx, frame, ascii, width, height, time);
  };

  const loop = (ts: number) => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden || ts - lastFrame < FRAME_MS) return;
    lastFrame = ts;
    draw(now());
  };

  const onPointer = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const t = now();
    if (t - lastPointer < 0.14) return;
    lastPointer = t;
    rings.push({ x, y, born: t, strength: 0.5 });
    if (rings.length > 24) rings.shift();
  };

  const refresh = () => {
    ascii.accentColor = toHex(options.color());
    if (reduced) draw(pulse * 0.6);
  };

  // Theme toggles flip an attribute or class on <html>; follow either.
  const themeWatch = new MutationObserver(refresh);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", refresh);

  const sizeWatch = new ResizeObserver(() => {
    resize();
    if (reduced) draw(pulse * 0.6);
  });
  sizeWatch.observe(host);
  resize();

  const viewWatch = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  viewWatch.observe(host);

  if (reduced) {
    // One still frame with a ring mid-flight, so the pond still reads.
    const origin = options.origin?.() ?? null;
    if (origin) rings.push({ ...origin, born: 0, strength: 0.95 });
    lastPulse = Infinity;
    draw(pulse * 0.6);
  } else {
    if (options.interactive !== false) window.addEventListener("pointermove", onPointer, { passive: true });
    raf = requestAnimationFrame(loop);
  }

  return {
    refresh,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      themeWatch.disconnect();
      scheme.removeEventListener("change", refresh);
      sizeWatch.disconnect();
      viewWatch.disconnect();
      canvas.remove();
    },
  };
}
