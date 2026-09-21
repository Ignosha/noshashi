"""
NOSHASHI — X / Twitter profile assets.

    python3 ads/social_assets.py

Produces:
    ads/social/noshashi_x_banner.png   1500x500
    ads/social/noshashi_x_avatar.png   400x400

Both follow DESIGN.md: navy ground, one blue accent, telemetry cyan on a
single orbiting body, static geometry, no status colour anywhere. The
starfield here is a still — this is a JPEG-compressed banner on someone
else's CDN, and the hero's motion exception does not travel.

Layout is built around X's own cropping rather than against it:

  - The avatar overlaps the banner's lower-left. On desktop it covers
    roughly x 60-210, y 330-500, so nothing readable goes there.
  - The banner is cropped vertically on narrow viewports, so the
    wordmark and the line under it sit inside the middle band.
  - The avatar is masked to a circle by the client, so the mark is
    centred with generous margin and nothing important reaches a corner.
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from motion import BLACK, INK, MUTED, DIM, draw_tracked, font, shade, text_width  # noqa: E402

GROUND = (11, 15, 20)
BRAND = (58, 130, 246)
TELE = (0, 224, 198)
RULE = (42, 49, 60)
FAINT = (116, 124, 139)

OUT = Path(__file__).parent / "social"


def starfield(img: Image.Image, count: int, seed: int, alpha_range=(18, 64)):
    """A still field. Seeded, so the asset is byte-identical on a rebuild."""
    rng = random.Random(seed)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(count):
        x = rng.uniform(0, img.width)
        y = rng.uniform(0, img.height)
        r = rng.uniform(0.6, 1.7)
        a = rng.randint(*alpha_range)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))
    img.alpha_composite(layer)


def rings(img: Image.Image, cx: float, cy: float, radii, colours, widths, dash=None):
    """Concentric orbits, drawn at 4x and down-sampled for clean edges."""
    S = 4
    big = Image.new("RGBA", (img.width * S, img.height * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    for radius, colour, width in zip(radii, colours, widths):
        box = [(cx - radius) * S, (cy - radius) * S, (cx + radius) * S, (cy + radius) * S]
        if dash and radius == dash:
            # A dashed orbit, drawn as arc segments rather than a stroke
            # pattern PIL does not have.
            step = 6
            for a0 in range(0, 360, step * 2):
                d.arc(box, a0, a0 + step, fill=colour, width=width * S)
        else:
            d.ellipse(box, outline=colour, width=width * S)
    img.alpha_composite(big.resize(img.size, Image.LANCZOS))


def orbit_body(img: Image.Image, cx: float, cy: float, radius: float, degrees: float):
    """One body on the path, with the site's soft halo."""
    S = 4
    big = Image.new("RGBA", (img.width * S, img.height * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    x = cx + radius * math.cos(math.radians(degrees))
    y = cy + radius * math.sin(math.radians(degrees))
    d.ellipse([(x - 13) * S, (y - 13) * S, (x + 13) * S, (y + 13) * S], fill=(*TELE, 34))
    d.ellipse([(x - 6) * S, (y - 6) * S, (x + 6) * S, (y + 6) * S], fill=(*TELE, 255))
    img.alpha_composite(big.resize(img.size, Image.LANCZOS))


# The lockup, captured from the live page rather than redrawn.
#
# An earlier version of this file rebuilt the rocket from polygons at the
# SVG's own coordinates. It was close but not right — the porthole landed
# in the wrong place and the mark read as a face — and DESIGN.md is
# explicit that the shipped mark comes from the SVG pack and must not be
# redrawn or approximated. Compositing the real render is both more
# faithful and less code.
LOCKUP = Path("/private/tmp/noshashi_shots/email_mark.png")


def lockup(img: Image.Image, cx: float, cy: float, size: float):
    """Paste the captured lockup, centred, scaled to `size` across."""
    if not LOCKUP.exists():
        raise SystemExit(
            f"missing {LOCKUP} — re-run the lockup capture (see ads/capture_shots.md)")
    src = Image.open(LOCKUP).convert("RGB")
    src = src.resize((int(size), int(size)), Image.LANCZOS)
    img.paste(src, (int(cx - size / 2), int(cy - size / 2)))


def build_banner() -> Image.Image:
    W, H = 1500, 500
    img = Image.new("RGBA", (W, H), (*GROUND, 255))
    starfield(img, 150, seed=7)

    # Orbital system bleeding off the right edge, away from the text and
    # away from the avatar.
    lockup(img, 1235, 250, 430)

    d = ImageDraw.Draw(img)
    # Left block, clear of the avatar's lower-left overlap.
    draw_tracked(d, (250, 168), "NOSHASHI", font(74, "Heavy"), (*INK, 255), 15, anchor_center=False)
    draw_tracked(d, (252, 258), "ANALYZE · DISCOVER · NAVIGATE", font(20, "Medium"),
                 (*TELE, 235), 9, anchor_center=False)
    d.line([(252, 300), (252 + 470, 300)], fill=(*RULE, 255), width=2)
    draw_tracked(d, (252, 322), "Compliance and market intelligence", font(27, "Semibold"),
                 (*MUTED, 255), 0, anchor_center=False)
    draw_tracked(d, (252, 360), "for the XRP Ledger.", font(27, "Semibold"),
                 (*MUTED, 255), 0, anchor_center=False)
    draw_tracked(d, (252, 424), "noshashi.app", font(21, "Medium"), (*BRAND, 255), 4, anchor_center=False)
    return img.convert("RGB")


def build_avatar() -> Image.Image:
    S = 400
    img = Image.new("RGBA", (S, S), (*GROUND, 255))
    starfield(img, 46, seed=19, alpha_range=(14, 46))
    # Full bleed: the captured lockup already carries its own margin, and
    # its outer ring sits inside the circle the client crops to.
    lockup(img, S / 2, S / 2, S)
    return img.convert("RGB")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    banner = build_banner()
    banner.save(OUT / "noshashi_x_banner.png", optimize=True)
    avatar = build_avatar()
    avatar.save(OUT / "noshashi_x_avatar.png", optimize=True)
    print(f"WROTE {OUT}/noshashi_x_banner.png {banner.size}")
    print(f"WROTE {OUT}/noshashi_x_avatar.png {avatar.size}")


if __name__ == "__main__":
    main()
