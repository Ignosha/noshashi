/**
 * The garden field: an ASCII pond with the XRP mark in it.
 *
 * Every frame paints a small greyscale "water" image — slow liquid folds,
 * the XRP mark drawn into the water, rings spreading from each flower on
 * its breath (or from the mark when there are no flowers) and from the
 * pointer — and asciify-engine (MIT, github.com/ayangabryl/asciify-engine)
 * turns it into glyphs in the brand green. Rings refract the mark as they
 * pass through it, so the logo ripples like a reflection. The liquid folds
 * are adapted from the engine's own fluid source (paintLiquidSource); a
 * calm pool is left clear under every flower so no artwork is overprinted.
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

/** A flower in the pond: centre (host-relative 0..1) and radius in host heights. */
export type Flower = { x: number; y: number; r: number };
/** The XRP mark: centre (host-relative 0..1) and half-size in host heights. */
export type Mark = { x: number; y: number; size: number };

export type GardenFieldOptions = {
  /** Flowers, first = the main one. Each sends rings and keeps a clear pool. */
  flowers?: () => Flower[];
  /** The XRP mark drawn into the water. When there are no flowers, rings start here. */
  mark?: () => Mark | null;
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

/**
 * The XRP mark as two strokes, in units of its half-size: an upper curve
 * falling from both top corners to a rounded bottom just above centre,
 * and the same curve mirrored below — the familiar X of two cupped arcs.
 * Sampled once into polylines; distance to them is what draws the mark.
 */
const XRP_STROKE = 0.13;
const XRP_CURVE: Array<[number, number]> = Array.from({ length: 25 }, (_, i) => {
  const t = -1 + (2 * i) / 24;
  return [t, -0.2 - 0.8 * Math.pow(Math.abs(t), 1.35)];
});

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** 0..1 ink of the XRP mark at a point in mark units (soft-edged stroke). */
export function xrpInk(lx: number, ly: number): number {
  if (Math.abs(lx) > 1.2 || Math.abs(ly) > 1.2) return 0;
  // The lower stroke is the upper one mirrored, so fold the point instead.
  const fy = -Math.abs(ly);
  let d = Infinity;
  for (let i = 1; i < XRP_CURVE.length; i++) {
    const [ax, ay] = XRP_CURVE[i - 1];
    const [bx, by] = XRP_CURVE[i];
    d = Math.min(d, segmentDistance(lx, fy, ax, ay, bx, by));
  }
  const edge = (d - XRP_STROKE) / 0.05;
  return edge <= 0 ? 1 : edge >= 1 ? 0 : 1 - edge * edge * (3 - 2 * edge);
}

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
 * whole visual, and it must stay bounded and leave every pool clear.
 */
export function waterAt(
  u: number,
  v: number,
  time: number,
  aspect: number,
  rings: readonly Ring[],
  pools: readonly Flower[],
  mark: Mark | null = null
): number {
  // Liquid folds, after asciify-engine's paintLiquidSource.
  const px = (u - 0.5) * aspect;
  const py = v - 0.5;
  const qx = px + 0.22 * Math.sin(py * 5.2 + time * 0.17) + 0.15 * Math.sin(px * 2.4 - py * 3.1 - time * 0.1);
  const qy = py + 0.19 * Math.sin(px * 3.5 + time * 0.13);
  const radius = Math.hypot(qx * 0.8 + 0.18, qy * 1.1);
  const folds = 0.5 + 0.5 * Math.sin(radius * 14 - qx * 2.8 + Math.sin(qy * 5) * 1.4 - time * 0.24);
  const cloud = 0.5 + 0.5 * Math.sin(qx * 3.6 - qy * 2.9 + time * 0.09);
  let light = folds * folds * (0.26 + cloud * 0.18) - 0.06;

  // Rings: a crest and a weaker echo behind it. Each also pushes the
  // water outward a little, which is what bends the mark as it passes.
  let bendX = 0;
  let bendY = 0;
  for (const ring of rings) {
    const age = time - ring.born;
    if (age < 0 || age > RING_LIFE) continue;
    const ox = (u - ring.x) * aspect;
    const oy = v - ring.y;
    const d = Math.hypot(ox, oy);
    const front = age * RING_SPEED;
    const fade = Math.exp(-age * 0.42) * ring.strength;
    const crest = Math.exp(-((d - front) ** 2) / 0.0011);
    const echo = Math.exp(-((d - front + 0.045) ** 2) / 0.0007) * 0.45;
    light += (crest + echo) * fade;
    if (d > 1e-6) {
      const push = crest * fade * 0.03;
      bendX += (ox / d) * push;
      bendY += (oy / d) * push;
    }
  }

  // The XRP mark, drawn into the water and refracted by the rings.
  if (mark && mark.size > 0) {
    const lx = ((u - mark.x) * aspect - bendX) / mark.size;
    const ly = (v - mark.y - bendY) / mark.size;
    const ink = xrpInk(lx, ly);
    // Denser than any still water, so the mark reads as a mark.
    if (ink > 0) light = Math.max(light, ink * (0.66 + 0.2 * folds));
  }

  // Calm pools: glyphs thin out towards each flower and vanish under it.
  for (const pool of pools) {
    const d = Math.hypot((u - pool.x) * aspect, v - pool.y);
    const t = Math.max(0, Math.min(1, (d - pool.r * 0.34) / (pool.r * 0.56)));
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
    const flowers = options.flowers?.() ?? [];
    const mark = options.mark?.() ?? null;
    if (time - lastPulse >= pulse) {
      // The main flower rings at full strength, the small ones softer and
      // staggered through the period so the pond never pulses in unison.
      flowers.forEach((f, i) => {
        rings.push({ x: f.x, y: f.y, born: time + i * 0.9, strength: i === 0 ? 0.95 : 0.45 });
      });
      if (!flowers.length && mark) rings.push({ x: mark.x, y: mark.y, born: time, strength: 0.95 });
      lastPulse = time;
    }
    for (let i = rings.length - 1; i >= 0; i--) if (time - rings[i].born > RING_LIFE) rings.splice(i, 1);
    if (rings.length > 40) rings.splice(0, rings.length - 40);

    const { width: sw, height: sh, data } = image;
    const aspect = width / height;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const value = Math.round(waterAt(x / sw, y / sh, time, aspect, rings, flowers, mark) * 255);
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
    const first = options.flowers?.()[0] ?? options.mark?.() ?? null;
    if (first) rings.push({ x: first.x, y: first.y, born: 0, strength: 0.95 });
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
