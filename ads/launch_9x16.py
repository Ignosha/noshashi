"""
NOSHASHI — vertical launch ad (9:16, 1080x1920, 18s).

Written against the live site rather than from a brief, so the claims and
the product are the same claims and the same product. Every line here
appears on noshashi.app: the two questions from the hero, the split the
thesis section describes, the verdict vocabulary, and the beta channel
the download section states. Nothing is dramatised upward — the free
tier is stated as free, the build is stated as beta, and no figure
appears that the pricing page does not carry.

Structure, for a feed that judges in two seconds but will hold for a
product film that respects it:

    0.0  the split          — the industry problem, in two cards
    4.6  the consequence    — why holding one half is not enough
    7.0  the mark           — who is speaking
    9.6  the two questions  — what it actually answers
   13.2  the verdict        — GO / HOLD / NO-GO, the product's own words
   15.4  the sign-off       — free, beta, where to get it

Visual language is ads/motion.py's, unchanged: pure black, spectral
off-white, hairline rules, entrances that decelerate and exits that
simply fade. One departure — the site's brand blue is used for the
wordmark rule and the URL, so the ad and the page it sends people to
are visibly the same product. Status colour still appears only on a
verdict.

    python3 ads/launch_9x16.py
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
DURATION = 18.0
CX = W / 2

# The site's --brand, so the ad and the landing page read as one product.
BRAND = (58, 130, 246)

OUT = Path(__file__).parent / "NOSHASHI_Launch_9x16.mp4"
FRAMES = Path("/private/tmp/noshashi_ads/launch")


def card(draw, y, lines, f, alpha, tracking=-1.0, color=INK, leading=1.20):
    """A centred type block that rises slightly as it fades in."""
    if alpha <= 0.004:
        return
    lift = (1 - ease_out_quart(alpha)) * 24
    step = f.size * leading
    for i, line in enumerate(lines):
        draw_tracked(draw, (CX, y + i * step + lift), line, f,
                     shade(color, alpha), tracking)


def hairline(draw, y, progress, alpha, width=520, color=DIM):
    """A rule that draws outward from the centre rather than appearing."""
    if alpha <= 0.004 or progress <= 0:
        return
    half = width * ease_out_expo(progress) / 2
    draw.line([(CX - half, y), (CX + half, y)], fill=shade(color, alpha), width=2)


def kicker(draw, y, s, alpha, color=MUTED, size=26):
    if alpha <= 0.004:
        return
    draw_tracked(draw, (CX, y), s, font(size, "Medium"), shade(color, alpha), 9)


def frame(t: float) -> Image.Image:
    img = Image.new("RGBA", (W, H), (*BLACK, 255))
    d = ImageDraw.Draw(img)

    # ── 1 · The split ──────────────────────────────────────────────────
    # The thesis section's opening, split across two cards because it is
    # two accusations and they land harder one at a time.
    a = fade(t, 0.30, 0.50, 1.25, 0.45)
    if a > 0.004:
        kicker(d, 690, "COMPLIANCE TOOLING", a)
        card(d, 770, ["never reads", "the order book."], font(94, "Bold"), a, -2.4)

    a = fade(t, 2.45, 0.50, 1.25, 0.45)
    if a > 0.004:
        kicker(d, 690, "MARKET TERMINALS", a)
        card(d, 770, ["never read", "the flags."], font(94, "Bold"), a, -2.4)

    # ── 2 · The consequence ────────────────────────────────────────────
    a = fade(t, 4.60, 0.55, 1.35, 0.50)
    if a > 0.004:
        card(d, 740, ["You carry", "both risks."], font(98, "Bold"), a, -2.6)
        hairline(d, 1010, clamp01((t - 4.95) / 0.7), a, 420)
        card(d, 1060, ["Most desks", "measure neither."], font(56, "Semibold"),
             a * clamp01((t - 5.15) / 0.6), -1.2, MUTED)

    # ── 3 · The mark ───────────────────────────────────────────────────
    a = fade(t, 7.00, 0.65, 1.30, 0.50)
    if a > 0.004:
        grow = ease_out_expo(clamp01((t - 7.0) / 1.05))
        draw_mark(img, CX, 800, mix(130, 238, grow), a, INK,
                  flame_scale=clamp01((t - 7.65) / 0.55))
        d = ImageDraw.Draw(img)
        draw_tracked(d, (CX, 1000), "NOSHASHI", font(80, "Heavy"),
                     shade(INK, a * ease_out_quart(clamp01((t - 7.55) / 0.65))), 11)
        hairline(d, 1108, clamp01((t - 7.9) / 0.6), a, 300, BRAND)
        kicker(d, 1142, "ANALYZE · DISCOVER · NAVIGATE",
               a * clamp01((t - 8.05) / 0.55), MUTED, 25)

    # ── 4 · The two questions ──────────────────────────────────────────
    # The hero's own pair, in the hero's own order, each labelled with the
    # half of the product that answers it.
    a = fade(t, 9.60, 0.55, 2.35, 0.50)
    if a > 0.004:
        kicker(d, 560, "ONE LEDGER READ · TWO ANSWERS", a, DIM, 24)

        q1 = a * ease_out_quart(clamp01((t - 9.85) / 0.55))
        kicker(d, 700, "COMPLIANCE", q1, BRAND, 25)
        card(d, 762, ["Am I allowed", "to move this?"], font(74, "Bold"), q1, -1.8)

        hairline(d, 1010, clamp01((t - 10.35) / 0.7), a, 480)

        q2 = a * ease_out_quart(clamp01((t - 10.55) / 0.55))
        kicker(d, 1070, "LIQUIDITY", q2, BRAND, 25)
        card(d, 1132, ["Could I actually", "get out of it?"], font(74, "Bold"), q2, -1.8)

    # ── 5 · The verdict ────────────────────────────────────────────────
    # The only place colour is spent, and it is spent on the three words
    # the product exists to say.
    a = fade(t, 13.20, 0.50, 1.15, 0.45)
    if a > 0.004:
        kicker(d, 700, "ONE ANSWER, WITH THE RULE THAT DECIDED IT", a, DIM, 24)

        words = [("GO", GO, 13.45), ("HOLD", HOLD, 13.62), ("NO-GO", NOGO, 13.79)]
        f = font(96, "Heavy")
        widths = [text_width(d, w, f, 2.0) for w, _, _ in words]
        gap = 54.0
        x = CX - (sum(widths) + gap * (len(words) - 1)) / 2
        for (word, colour, at), width in zip(words, widths):
            wa = a * ease_out_quart(clamp01((t - at) / 0.45))
            draw_tracked(d, (x, 810), word, f, shade(colour, wa), 2.0,
                         anchor_center=False)
            x += width + gap

        card(d, 1000, ["Read from validated ledger state.", "SHA-256 receipt attached."],
             font(44, "Medium"), a * clamp01((t - 14.05) / 0.6), -0.6, MUTED, 1.35)

    # ── 6 · Sign-off ───────────────────────────────────────────────────
    a = fade(t, 15.40, 0.55, 1.45, 0.45)
    if a > 0.004:
        draw_mark(img, CX, 720, 128, a, INK, flame_scale=1.0)
        d = ImageDraw.Draw(img)
        draw_tracked(d, (CX, 862), "NOSHASHI", font(74, "Heavy"), shade(INK, a), 10)

        terms = a * clamp01((t - 15.70) / 0.55)
        card(d, 986, ["Free tier. No account.", "Runs on your machine."],
             font(46, "Semibold"), terms, -0.8, INK, 1.30)

        hairline(d, 1150, clamp01((t - 15.95) / 0.6), a, 340, BRAND)
        draw_tracked(d, (CX, 1186), "noshashi.app", font(38, "Semibold"),
                     shade(BRAND, a * clamp01((t - 16.05) / 0.5)), 5)

        # Stated, not buried. The builds are pre-1.0 and unsigned, and an
        # ad that omits that is the first thing a careful buyer catches.
        kicker(d, 1270, "BETA CHANNEL · v0.3.1 · UNSIGNED BUILDS",
               a * clamp01((t - 16.35) / 0.55), DIM, 23)

    return img.convert("RGB")


def main():
    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    FRAMES.mkdir(parents=True)

    total = int(DURATION * FPS)
    for i in range(total):
        frame(i / FPS).save(FRAMES / f"f{i:05d}.png")
        if i % 60 == 0:
            print(f"  {i}/{total}", flush=True)

    encode(FRAMES, OUT, FPS, W, H)
    shutil.rmtree(FRAMES)
    print("WROTE", OUT)


if __name__ == "__main__":
    main()
