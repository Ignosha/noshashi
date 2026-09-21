"""
NOSHASHI — vertical ad (9:16, 1080x1920, 20s).

Hook-first structure for a feed that judges in under two seconds, but
paced and typeset like a product film rather than a meme: one idea per
card, held long enough to read, entrances that decelerate, exits that
simply fade.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from motion import (  # noqa: E402
    BLACK, INK, MUTED, DIM, GO, NOGO, HOLD,
    clamp01, draw_mark, draw_tracked, ease_out_expo, ease_out_quart,
    encode, fade, font, mix, shade, text_width,
)

W, H = 1080, 1920
FPS = 30
DURATION = 20.0
CX = W / 2

OUT = Path(__file__).parent / "NOSHASHI_TikTok_9x16.mp4"
FRAMES = Path("/private/tmp/noshashi_ads/tiktok")


def card(draw, y, lines, f, alpha, tracking=-1.0, color=INK, leading=1.22):
    """A centred type block that rises slightly as it fades in."""
    if alpha <= 0.004:
        return
    lift = (1 - ease_out_quart(alpha)) * 26
    step = f.size * leading
    for i, line in enumerate(lines):
        draw_tracked(draw, (CX, y + i * step + lift), line, f,
                     shade(color, alpha), tracking)


def hairline(draw, y, progress, alpha, width=520, color=DIM):
    if alpha <= 0.004 or progress <= 0:
        return
    half = width * ease_out_expo(progress) / 2
    draw.line([(CX - half, y), (CX + half, y)], fill=shade(color, alpha), width=2)


def frame(t: float) -> Image.Image:
    img = Image.new("RGBA", (W, H), (*BLACK, 255))
    d = ImageDraw.Draw(img)

    # ── 1 · The hook ───────────────────────────────────────────────────
    a = fade(t, 0.35, 0.55, 1.35, 0.5)
    card(d, 800, ["Your transaction", "is going to fail."], font(96, "Bold"), a, -2.5)

    # ── 2 · The cost ───────────────────────────────────────────────────
    a = fade(t, 2.75, 0.5, 1.4, 0.5)
    card(d, 820, ["You'll find out", "after you pay", "the fee."], font(92, "Bold"), a, -2.2)

    # ── 3 · The mark ───────────────────────────────────────────────────
    a = fade(t, 5.2, 0.7, 1.5, 0.55)
    if a > 0.004:
        grow = ease_out_expo(clamp01((t - 5.2) / 1.1))
        draw_mark(img, CX, 830, mix(120, 240, grow), a, INK,
                  flame_scale=clamp01((t - 5.9) / 0.6))
        d = ImageDraw.Draw(img)
        draw_tracked(d, (CX, 1030), "NOSHASHI", font(78, "Heavy"),
                     shade(INK, a * ease_out_quart(clamp01((t - 5.8) / 0.7))), 10)
        draw_tracked(d, (CX, 1132), "AUTONOMOUS COMPLIANCE LAYER",
                     font(26, "Medium"), shade(MUTED, a * clamp01((t - 6.2) / 0.6)), 7)

    # ── 4 · The gate running ───────────────────────────────────────────
    a = fade(t, 7.7, 0.5, 2.4, 0.45)
    if a > 0.004:
        draw_tracked(d, (CX, 640), "COMPLIANCE GATE", font(26, "Semibold"),
                     shade(MUTED, a), 9)
        hairline(d, 700, clamp01((t - 7.9) / 0.7), a, 640)

        rows = [
            ("SUBJECT", "rvYAfW…s59B", 8.05),
            ("DOMAIN", "US_REGULATED_DEX", 8.35),
            ("AMOUNT", "250,000 XRP", 8.65),
        ]
        y = 790
        for label, value, at in rows:
            ra = a * ease_out_quart(clamp01((t - at) / 0.45))
            draw_tracked(d, (CX - 250, y), label, font(24, "Medium"),
                         shade(DIM, ra), 6, anchor_center=False)
            vw = text_width(d, value, font(30, "Medium", mono=True), 1)
            draw_tracked(d, (CX + 250 - vw, y - 3), value,
                         font(30, "Medium", mono=True), shade(INK, ra), 1,
                         anchor_center=False)
            y += 76

        if t > 9.3:
            pulse = 0.55 + 0.45 * abs(((t * 1.6) % 2) - 1)
            draw_tracked(d, (CX, 1046), "EVALUATING RULE SET",
                         font(26, "Semibold"), shade(INK, a * pulse), 9)

    # ── 5 · The verdict ────────────────────────────────────────────────
    a = fade(t, 10.9, 0.35, 2.0, 0.5)
    if a > 0.004:
        stamp = ease_out_expo(clamp01((t - 10.9) / 0.5))
        size = int(mix(190, 138, stamp))
        track = mix(46, 12, stamp)
        draw_tracked(d, (CX, 800), "NO-GO", font(size, "Heavy"),
                     shade(NOGO, a * stamp), track)
        ra = a * clamp01((t - 11.6) / 0.5)
        draw_tracked(d, (CX, 1000), "CREDENTIAL_KYC_LEVEL_1",
                     font(30, "Medium", mono=True), shade(INK, ra), 1)
        draw_tracked(d, (CX, 1056), "BLOCKING RULE FAILED",
                     font(24, "Medium"), shade(MUTED, ra), 7)

    # ── 6 · The promise ────────────────────────────────────────────────
    a = fade(t, 13.5, 0.55, 1.5, 0.5)
    card(d, 830, ["Know before", "you sign."], font(104, "Bold"), a, -2.6)

    # ── 7 · Three reasons ──────────────────────────────────────────────
    a = fade(t, 16.0, 0.4, 1.4, 0.45)
    if a > 0.004:
        items = [("Free forever", 16.05), ("Runs on your Mac", 16.3),
                 ("Mainnet only", 16.55)]
        y = 800
        for label, at in items:
            ia = a * ease_out_quart(clamp01((t - at) / 0.5))
            d.rectangle([CX - 232, y + 22, CX - 212, y + 42], fill=shade(GO, ia))
            draw_tracked(d, (CX - 180, y), label, font(52, "Semibold"),
                         shade(INK, ia), -0.5, anchor_center=False)
            y += 116

    # ── 8 · Sign-off ───────────────────────────────────────────────────
    a = fade(t, 18.1, 0.55, 1.0, 0.35)
    if a > 0.004:
        draw_mark(img, CX, 820, 132, a, INK, flame_scale=1.0)
        d = ImageDraw.Draw(img)
        draw_tracked(d, (CX, 960), "NOSHASHI", font(72, "Heavy"), shade(INK, a), 9)
        hairline(d, 1064, clamp01((t - 18.4) / 0.6), a, 340)
        draw_tracked(d, (CX, 1100), "noshashi.app", font(32, "Medium"),
                     shade(MUTED, a), 4)

    return img.convert("RGB")


def main():
    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    FRAMES.mkdir(parents=True)

    total = int(DURATION * FPS)
    for i in range(total):
        frame(i / FPS).save(FRAMES / f"f{i:05d}.png")
        if i % 90 == 0:
            print(f"  {i}/{total}", flush=True)

    encode(FRAMES, OUT, FPS, W, H)
    shutil.rmtree(FRAMES)
    print("WROTE", OUT)


if __name__ == "__main__":
    main()
