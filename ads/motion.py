"""
Minimal motion-graphics framework for the NOSHASHI ads.

Frames are rendered deterministically from a timeline, so the same
timecode always produces the same pixels and the whole thing encodes
without a browser, a screen recorder, or a capture pass.

The visual language follows the product: pure black, spectral near-white,
generous negative space, hairline rules, and easing that decelerates
rather than bounces. Colour appears only where it carries meaning.
"""
from __future__ import annotations

import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ── Palette ────────────────────────────────────────────────────────────
BLACK = (0, 0, 0)
INK = (245, 245, 247)          # Apple's off-white; pure white is harsh on video
MUTED = (138, 138, 153)
DIM = (74, 74, 86)
GO = (46, 214, 132)
HOLD = (255, 176, 32)
NOGO = (255, 84, 72)

SF = "/System/Library/Fonts/SFNS.ttf"
SF_MONO = "/System/Library/Fonts/SFNSMono.ttf"

_font_cache: dict[tuple[str, int, str], ImageFont.FreeTypeFont] = {}


def font(size: int, weight: str = "Bold", mono: bool = False) -> ImageFont.FreeTypeFont:
    """SF Pro at a named weight. Falls back cleanly if an axis is absent."""
    path = SF_MONO if mono else SF
    key = (path, size, weight)
    if key in _font_cache:
        return _font_cache[key]
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    _font_cache[key] = f
    return f


# ── Easing ─────────────────────────────────────────────────────────────
def clamp01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def ease_out_quart(t: float) -> float:
    t = clamp01(t)
    return 1 - pow(1 - t, 4)


def ease_out_expo(t: float) -> float:
    t = clamp01(t)
    return 1.0 if t >= 1 else 1 - pow(2, -10 * t)


def ease_in_out_cubic(t: float) -> float:
    t = clamp01(t)
    return 4 * t * t * t if t < 0.5 else 1 - pow(-2 * t + 2, 3) / 2


def fade(t: float, start: float, attack: float, hold: float, release: float) -> float:
    """Opacity envelope: silence, rise, sustain, fall."""
    local = t - start
    if local < 0:
        return 0.0
    if local < attack:
        return ease_out_quart(local / attack)
    if local < attack + hold:
        return 1.0
    if local < attack + hold + release:
        return 1 - ease_in_out_cubic((local - attack - hold) / release)
    return 0.0


def mix(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def shade(color: tuple[int, int, int], alpha: float) -> tuple[int, int, int, int]:
    return (color[0], color[1], color[2], int(255 * clamp01(alpha)))


# ── Text with real tracking ────────────────────────────────────────────
def text_width(draw: ImageDraw.ImageDraw, s: str, f, tracking: float) -> float:
    total = 0.0
    for ch in s:
        total += draw.textlength(ch, font=f) + tracking
    return max(0.0, total - tracking)


def draw_tracked(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    s: str,
    f,
    fill,
    tracking: float = 0.0,
    anchor_center: bool = True,
):
    """
    PIL has no letter-spacing, so glyphs are placed one at a time.

    They are anchored to a shared BASELINE rather than to each glyph's own
    top edge: anchoring per-glyph tops would drop every descender and lift
    every comma and hyphen onto its own line, which is exactly the kind of
    defect that reads as amateur at 1080p.
    """
    x, y = xy
    if anchor_center:
        x -= text_width(draw, s, f, tracking) / 2
    ascent, _ = f.getmetrics()
    baseline = y + ascent
    for ch in s:
        draw.text((x, baseline), ch, font=f, fill=fill, anchor="ls")
        x += draw.textlength(ch, font=f) + tracking


# ── The mark, drawn from the product's own path geometry ───────────────
def _quad(p0, p1, p2, steps=24):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return pts


def draw_mark(base: Image.Image, cx: float, cy: float, size: float, alpha: float,
              color=INK, flame_scale: float = 1.0):
    """
    The NOSHASHI rocket at any size. Coordinates mirror the 64x64 SVG the
    application ships, so the ad and the product show the same mark.
    """
    if alpha <= 0.003:
        return
    s = size / 64.0
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def P(x, y):
        return (cx + (x - 32) * s, cy + (y - 32) * s)

    fill = shade(color, alpha)

    # Fuselage: nose taper down to the shoulders, then a straight barrel.
    right = _quad((32, 1.5), (41.5, 12.0), (45.1, 33.7))
    left = _quad((18.9, 33.7), (22.5, 12.0), (32, 1.5))
    body = [P(*p) for p in right] + [P(45.1, 45.6), P(18.9, 45.6)] + [P(*p) for p in left]
    d.polygon(body, fill=fill)

    # Swept fins.
    d.polygon([P(18.9, 30.4), P(18.9, 47.8), P(7.4, 47.8)], fill=fill)
    d.polygon([P(45.1, 30.4), P(45.1, 47.8), P(56.6, 47.8)], fill=fill)

    # Nozzle.
    d.polygon([P(22.9, 45.6), P(41.1, 45.6), P(38.4, 54.0), P(25.6, 54.0)], fill=fill)

    # Hexagonal porthole, punched out.
    d.polygon(
        [P(32, 14.9), P(37.1, 17.9), P(37.1, 23.9), P(32, 26.9), P(26.9, 23.9), P(26.9, 17.9)],
        fill=(0, 0, 0, 255),
    )

    # Exhaust.
    if flame_scale > 0.02:
        h = 9.0 * flame_scale
        tip, y0 = (32, 55.0), 55.0
        right = _quad(tip, (37.6, y0 + h * 0.55), (34.4, y0 + h), 14)
        left = _quad((29.6, y0 + h), (26.4, y0 + h * 0.55), tip, 14)
        flame = [P(*pt) for pt in right] + [P(32, y0 + h * 0.80)] + [P(*pt) for pt in left]
        d.polygon(flame, fill=shade(color, alpha * 0.94))

    base.alpha_composite(layer)


# ── Encode ─────────────────────────────────────────────────────────────
def encode(frames_dir: Path, out: Path, fps: int, width: int, height: int):
    import imageio_ffmpeg

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-framerate", str(fps),
        "-i", str(frames_dir / "f%05d.png"),
        "-c:v", "libx264",
        "-profile:v", "high", "-level", "4.2",
        "-pix_fmt", "yuv420p",
        "-crf", "17",
        "-preset", "slow",
        "-movflags", "+faststart",
        "-vf", f"scale={width}:{height}",
        str(out),
    ]
    subprocess.run(cmd, check=True)
    return out
