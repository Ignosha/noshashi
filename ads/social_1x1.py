"""
NOSHASHI — square scroll film for X (1080x1080, 15s).

A screen recording in everything but method: a desktop browser window
with the live page scrolling inside it. The page is a single 2x DOM
capture of noshashi.app rather than a video capture, which is what keeps
the type sharp — a real screen recording of a 1180px page squeezed into
a 1000px window and then H.264-compressed for a timeline is mush, and
mush is the usual reason these read as amateur.

The scroll is not linear. It eases to a section, dwells long enough to
read it, then moves on — which is how a person scrolls and why a
constant-velocity pan always looks like a robot. Dwell positions are
chosen to land on the sections that carry a number.

1:1 because X crops 16:9 in the timeline and a square fills the column.

    python3 ads/social_1x1.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from motion import (  # noqa: E402
    INK, MUTED, DIM, clamp01, draw_tracked, ease_in_out_cubic, ease_out_quart,
    fade, font, mix, shade,
)

W = H = 1080
FPS = 30
DURATION = 15.0

GROUND = (11, 15, 20)
RULE = (42, 49, 60)
BRAND = (58, 130, 246)

PAGE = Path("/private/tmp/noshashi_shots/page_scroll.png")
OUT = Path(__file__).parent / "social" / "NOSHASHI_X_1x1.mp4"
FRAMES = Path("/private/tmp/noshashi_ads/x1x1")

# Window geometry inside the square.
WIN_X, WIN_Y = 40, 150
WIN_W, WIN_H = 1000, 800
CHROME = 52
VIEW_H = WIN_H - CHROME

_page: Image.Image | None = None
_chrome: Image.Image | None = None


def page() -> Image.Image:
    """The capture, scaled once to the window's width."""
    global _page
    if _page is None:
        if not PAGE.exists():
            raise SystemExit(f"missing {PAGE} — run the capture pass (ads/capture_shots.md)")
        src = Image.open(PAGE).convert("RGB")
        scale = WIN_W / src.width
        _page = src.resize((WIN_W, round(src.height * scale)), Image.LANCZOS)
    return _page


def chrome() -> Image.Image:
    """
    The browser window: rounded corners, a title bar, a URL field and a
    drop shadow. Built once — it never changes, and blurring a shadow
    450 times is the whole render budget.
    """
    global _chrome
    if _chrome is not None:
        return _chrome

    pad = 70
    img = Image.new("RGBA", (WIN_W + pad * 2, WIN_H + pad * 2), (0, 0, 0, 0))

    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [pad, pad + 14, pad + WIN_W, pad + WIN_H + 14], radius=16, fill=(0, 0, 0, 205))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(30)))

    win = Image.new("RGBA", (WIN_W, WIN_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(win)
    d.rounded_rectangle([0, 0, WIN_W - 1, WIN_H - 1], radius=14, fill=(17, 22, 29, 255))
    d.rounded_rectangle([0, 0, WIN_W - 1, WIN_H - 1], radius=14, outline=(*RULE, 255), width=2)
    d.line([(1, CHROME), (WIN_W - 2, CHROME)], fill=(*RULE, 255), width=2)

    # Traffic lights, neutral rather than coloured: the window is a
    # frame for the product, and three saturated dots in the corner are
    # the brightest thing on screen otherwise.
    for i, x in enumerate((26, 50, 74)):
        d.ellipse([x - 6, CHROME / 2 - 6, x + 6, CHROME / 2 + 6], fill=(58, 66, 78, 255))

    # URL field.
    d.rounded_rectangle([120, CHROME / 2 - 13, WIN_W - 120, CHROME / 2 + 13],
                        radius=13, fill=(11, 15, 20, 255), outline=(*RULE, 255), width=1)
    draw_tracked(d, (WIN_W / 2, CHROME / 2 - 8), "noshashi.app", font(16, "Medium"),
                 (163, 168, 179, 255), 1.5)

    img.alpha_composite(win, (pad, pad))
    _chrome = img
    return _chrome


def scroll_at(t: float) -> float:
    """
    Eased scroll with dwells, in page pixels.

    Stops are fractions of the *page's own height*, measured off the live
    DOM rather than guessed — an earlier version used fractions of the
    scrollable span and every caption described a section the viewer was
    not looking at. The conversion to a scroll offset happens here, so
    the numbers below stay readable as "where on the page is this".

    Each stop pairs a position with the time it should be reached and how
    long to rest there. Between stops the move eases at both ends; a
    constant velocity pan is the thing that makes these look automated.
    """
    p = page()
    span = max(1, p.height - VIEW_H)

    def offset(frac: float) -> float:
        return min(span, max(0.0, frac * p.height))

    stops = [
        (0.0000, 0.0, 1.9),   # hero: the name and the mission
        (0.1033, 3.4, 1.4),   # 01 the thesis
        (0.2313, 6.1, 1.5),   # 04 free tools, no account
        (0.4622, 8.9, 1.6),   # 08 XRP live: price, chart, ledger
        (0.6167, 11.7, 1.5),  # 10 download, BETA on every card
        (0.6939, 14.2, 0.8),  # 11 mission log
    ]

    if t <= stops[0][1] + stops[0][2]:
        return offset(stops[0][0])

    for i in range(len(stops) - 1):
        frac0, at0, hold0 = stops[i]
        frac1, at1, _ = stops[i + 1]
        start = at0 + hold0
        if t < start:
            return offset(frac0)
        if t <= at1:
            k = ease_in_out_cubic((t - start) / max(0.001, at1 - start))
            return mix(offset(frac0), offset(frac1), k)
    return offset(stops[-1][0])


def frame(t: float) -> Image.Image:
    img = Image.new("RGBA", (W, H), (*GROUND, 255))
    d = ImageDraw.Draw(img)

    # Caption above the window, changing with the section beneath it.
    captions = [
        (0.35, 2.6, "COMPLIANCE AND MARKET INTELLIGENCE, FROM ONE LEDGER READ"),
        (6.1, 2.3, "FREE TOOLS · NO ACCOUNT · RUNS ON YOUR MACHINE"),
        (8.9, 2.4, "LIVE XRP PRICE, HISTORY AND THE VALIDATED LEDGER"),
        (11.7, 2.6, "EVERY BUILD PUBLISHES ITS SHA-256 · BETA CHANNEL"),
    ]
    for start, length, text in captions:
        a = fade(t, start, 0.45, length, 0.45)
        if a > 0.004:
            draw_tracked(d, (W / 2, 74), text, font(19, "Medium"), shade(MUTED, a), 6)

    # The window, arriving once and then holding still.
    enter = ease_out_quart(clamp01(t / 0.9))
    lift = (1 - enter) * 26
    c = chrome()
    img.alpha_composite(c, (WIN_X - 70, int(WIN_Y - 70 + lift)))

    # The page, clipped to the viewport under the title bar.
    p = page()
    top = int(scroll_at(t))
    view = p.crop((0, top, WIN_W, min(p.height, top + VIEW_H)))
    if view.height < VIEW_H:
        pad = Image.new("RGB", (WIN_W, VIEW_H), GROUND)
        pad.paste(view, (0, 0))
        view = pad
    if enter < 0.999:
        view = view.convert("RGBA")
        view.putalpha(view.getchannel("A").point(lambda v: int(v * enter)))
    img.alpha_composite(view.convert("RGBA"), (WIN_X, int(WIN_Y + CHROME + lift)))

    # Footer lockup.
    a = fade(t, 0.6, 0.6, DURATION, 0.4)
    draw_tracked(d, (W / 2, 1006), "NOSHASHI", font(26, "Heavy"), shade(INK, a), 9)
    draw_tracked(d, (W / 2, 1044), "noshashi.app", font(16, "Medium"), shade(BRAND, a * 0.95), 3)

    return img.convert("RGB")


def encode(frames_dir: Path, out: Path):
    import imageio_ffmpeg

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out.parent.mkdir(parents=True, exist_ok=True)
    count = len(list(frames_dir.glob("f*.png")))
    if count == 0:
        raise RuntimeError(f"no frames in {frames_dir}")
    cmd = [
        ffmpeg, "-y", "-loglevel", "warning",
        "-framerate", str(FPS), "-start_number", "0",
        "-i", str(frames_dir / "f%05d.png"), "-frames:v", str(count),
        "-c:v", "libx264", "-profile:v", "high", "-level", "4.0",
        "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "medium",
        "-movflags", "+faststart", str(out),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{r.stderr[-1500:]}")
    size = out.stat().st_size if out.exists() else 0
    if size < 50_000:
        raise RuntimeError(f"ffmpeg wrote {size} bytes from {count} frames:\n{r.stderr[-1500:]}")
    return size


def main():
    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    FRAMES.mkdir(parents=True)
    total = int(DURATION * FPS)
    for i in range(total):
        frame(i / FPS).save(FRAMES / f"f{i:05d}.png")
        if i % 60 == 0:
            print(f"  {i}/{total}", flush=True)
    size = encode(FRAMES, OUT)
    shutil.rmtree(FRAMES)
    print(f"WROTE {OUT} ({size // 1024} KB, {total} frames)")


if __name__ == "__main__":
    main()
