"""
NOSHASHI — landscape ad (16:9, 1920x1080, 30s).

A product film rather than a feed hook: it opens on empty space, states
the problem, shows the mechanism working, and lands on the mark. Wider
canvas means fewer, larger elements and longer holds.
"""
from __future__ import annotations

import math
import random
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from motion import (  # noqa: E402
    BLACK, INK, MUTED, DIM, GO, HOLD, NOGO,
    clamp01, draw_mark, draw_tracked, ease_in_out_cubic, ease_out_expo,
    ease_out_quart, encode, fade, font, mix, shade, text_width,
)

W, H = 1920, 1080
FPS = 30
DURATION = 30.0
CX, CY = W / 2, H / 2

OUT = Path(__file__).parent / "NOSHASHI_YouTube_16x9.mp4"
FRAMES = Path("/private/tmp/noshashi_ads/youtube")

# A fixed seed keeps the starfield identical across renders.
random.seed(7)
STARS = [
    (random.uniform(0, W), random.uniform(0, H),
     random.uniform(0.9, 2.1), random.uniform(0.25, 1.0), random.uniform(0, 6.28))
    for _ in range(190)
]


def starfield(draw, t, alpha):
    if alpha <= 0.004:
        return
    for x, y, size, depth, phase in STARS:
        yy = (y + t * 9 * depth) % H
        twinkle = 0.55 + 0.45 * math.sin(t * 1.7 + phase)
        a = alpha * depth * twinkle * 0.55
        if a <= 0.01:
            continue
        draw.rectangle([x, yy, x + size, yy + size], fill=shade(INK, a))


def card(draw, y, lines, f, alpha, tracking=-1.5, color=INK, leading=1.22):
    if alpha <= 0.004:
        return
    lift = (1 - ease_out_quart(alpha)) * 30
    step = f.size * leading
    for i, line in enumerate(lines):
        draw_tracked(draw, (CX, y + i * step + lift), line, f,
                     shade(color, alpha), tracking)


def hairline(draw, y, progress, alpha, width=900, color=DIM):
    if alpha <= 0.004 or progress <= 0:
        return
    half = width * ease_out_expo(progress) / 2
    draw.line([(CX - half, y), (CX + half, y)], fill=shade(color, alpha), width=2)


def frame(t: float) -> Image.Image:
    img = Image.new("RGBA", (W, H), (*BLACK, 255))
    d = ImageDraw.Draw(img)

    # Ambient starfield across the whole film, dipping under the verdicts.
    field = 0.0
    if t < 1.2:
        field = ease_out_quart(t / 1.2)
    elif t < 27.6:
        field = 1.0
    else:
        field = 1 - ease_in_out_cubic((t - 27.6) / 2.4)
    starfield(d, t, field * 0.9)

    # ── 1 · Opening rule ───────────────────────────────────────────────
    a = fade(t, 0.8, 0.6, 1.1, 0.6)
    hairline(d, CY, clamp01((t - 0.8) / 1.2), a, 1200)

    # ── 2 · The problem ────────────────────────────────────────────────
    a = fade(t, 2.6, 0.6, 1.8, 0.6)
    card(d, 470, ["Compliance is a report", "written after the fact."],
         font(84, "Bold"), a, -2.2)

    # ── 3 · The shift ──────────────────────────────────────────────────
    a = fade(t, 6.0, 0.6, 2.0, 0.6)
    card(d, 470, ["We made it infrastructure", "that runs before the signature."],
         font(78, "Bold"), a, -2.0)

    # ── 4 · Live telemetry ─────────────────────────────────────────────
    a = fade(t, 9.6, 0.55, 2.6, 0.5)
    if a > 0.004:
        draw_tracked(d, (CX, 330), "LIVE  ·  XRPL MAINNET", font(26, "Semibold"),
                     shade(MUTED, a), 10)
        hairline(d, 392, clamp01((t - 9.8) / 0.7), a, 1180)

        grow = ease_out_quart(clamp01((t - 10.1) / 1.5))
        stats = [
            ("VALIDATED LEDGER", f"{106_421_178 + int(grow * 137):,}"),
            ("GATE LATENCY", f"{int(mix(0, 3, grow))} ms"),
            ("RULES EVALUATED", f"{int(mix(0, 7, grow))}"),
        ]
        span = 1180
        for i, (label, value) in enumerate(stats):
            x = CX - span / 2 + span * (i + 0.5) / 3
            ia = a * ease_out_quart(clamp01((t - 10.1 - i * 0.22) / 0.6))
            draw_tracked(d, (x, 452), label, font(24, "Medium"), shade(DIM, ia), 7)
            draw_tracked(d, (x, 500), value, font(72, "Bold"), shade(INK, ia), -1)
        hairline(d, 632, clamp01((t - 10.6) / 0.8), a, 1180)

    # ── 5 · The three verdicts ─────────────────────────────────────────
    a = fade(t, 13.4, 0.4, 3.4, 0.5)
    if a > 0.004:
        verdicts = [("GO", GO, 13.5), ("HOLD", HOLD, 14.6), ("NO-GO", NOGO, 15.7)]
        for i, (label, color, at) in enumerate(verdicts):
            x = CX - 560 + i * 560
            stamp = ease_out_expo(clamp01((t - at) / 0.45))
            if stamp <= 0.01:
                continue
            size = int(mix(112, 84, stamp))
            draw_tracked(d, (x, 462), label, font(size, "Heavy"),
                         shade(color, a * stamp), mix(28, 8, stamp))
        ra = a * clamp01((t - 16.4) / 0.6)
        draw_tracked(d, (CX, 620), "EVERY VERDICT NAMES THE RULE THAT DECIDED IT",
                     font(28, "Medium"), shade(MUTED, ra), 8)

    # ── 6 · The receipt ────────────────────────────────────────────────
    a = fade(t, 17.6, 0.5, 2.8, 0.5)
    if a > 0.004:
        draw_tracked(d, (CX, 372), "CRYPTOGRAPHIC RECEIPT", font(26, "Semibold"),
                     shade(MUTED, a), 10)
        digest = "9F2A4C71E0B8D35A6C1F84E2B7D09A3C5E8F1B62D4A70C9E3B85F27A16D0C4E8"
        shown = int(len(digest) * clamp01((t - 18.0) / 1.9))
        f_mono = font(38, "Medium", mono=True)
        draw_tracked(d, (CX, 452), digest[:shown], f_mono, shade(INK, a), 3)
        if shown < len(digest) and (t * 3) % 1 < 0.55:
            wd = text_width(d, digest[:shown], f_mono, 3)
            d.rectangle([CX + wd / 2 + 4, 452, CX + wd / 2 + 22, 452 + 44],
                        fill=shade(INK, a))
        ra = a * clamp01((t - 19.6) / 0.7)
        card(d, 546, ["Provable that the check ran.",
                      "Private about what was checked."],
             font(40, "Medium"), ra, -0.5, MUTED, 1.35)

    # ── 7 · Pillars ────────────────────────────────────────────────────
    a = fade(t, 21.4, 0.5, 2.4, 0.5)
    if a > 0.004:
        pillars = [
            ("MAINNET ONLY", "No testnet path exists.", 21.5),
            ("ZERO EGRESS", "The AI runs on your machine.", 21.75),
            ("NO CUSTODY", "It cannot hold or move funds.", 22.0),
        ]
        span = 1320
        for i, (title, sub, at) in enumerate(pillars):
            x = CX - span / 2 + span * (i + 0.5) / 3
            ia = a * ease_out_quart(clamp01((t - at) / 0.6))
            d.rectangle([x - 9, 402, x + 9, 420], fill=shade(GO, ia))
            draw_tracked(d, (x, 452), title, font(38, "Bold"), shade(INK, ia), 2)
            draw_tracked(d, (x, 512), sub, font(28, "Regular"), shade(MUTED, ia), 0)

    # ── 8 · Free ───────────────────────────────────────────────────────
    a = fade(t, 24.4, 0.5, 1.5, 0.5)
    card(d, 462, ["Free for individuals. Forever."], font(72, "Bold"), a, -1.8)

    # ── 9 · Sign-off ───────────────────────────────────────────────────
    a = fade(t, 26.9, 0.6, 1.8, 0.4)
    if a > 0.004:
        draw_mark(img, CX, 420, 150, a, INK, flame_scale=1.0)
        d = ImageDraw.Draw(img)
        draw_tracked(d, (CX, 556), "NOSHASHI", font(84, "Heavy"), shade(INK, a), 12)
        draw_tracked(d, (CX, 668), "AUTONOMOUS COMPLIANCE LAYER",
                     font(26, "Medium"), shade(MUTED, a * clamp01((t - 27.3) / 0.6)), 9)
        hairline(d, 736, clamp01((t - 27.5) / 0.7), a, 420)
        draw_tracked(d, (CX, 772), "noshashi.app", font(34, "Medium"),
                     shade(MUTED, a * clamp01((t - 27.7) / 0.6)), 4)

    return img.convert("RGB")


def main():
    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    FRAMES.mkdir(parents=True)

    total = int(DURATION * FPS)
    for i in range(total):
        frame(i / FPS).save(FRAMES / f"f{i:05d}.png")
        if i % 120 == 0:
            print(f"  {i}/{total}", flush=True)

    encode(FRAMES, OUT, FPS, W, H)
    shutil.rmtree(FRAMES)
    print("WROTE", OUT)


if __name__ == "__main__":
    main()
