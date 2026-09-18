"""
NOSHASHI — product commercial (9:16, 1080x1920, 22s).

Built from real captures of the live site rather than mock-ups: every
panel on screen is a 2x DOM capture of noshashi.app, so what the ad
shows and what a viewer finds when they arrive are the same thing.
Shots live in /private/tmp/noshashi_shots (see the capture pass in
ads/capture_shots.md).

The register is a product film, not a feed ad: one idea per beat, held
long enough to read, camera moves that decelerate and never arrive
sharply, and cuts on the beat rather than on the frame. Type is SF Pro,
the ad palette is ads/motion.py's, and the site's brand blue carries the
wordmark rule and the URL so the film and the page read as one product.

Every claim is on the site. The beta channel is stated rather than
buried, because an ad that hides it is the first thing a careful buyer
catches.

    python3 ads/commercial_9x16.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from motion import (  # noqa: E402
    BLACK, INK, MUTED, DIM, GO, HOLD, NOGO,
    clamp01, draw_mark, draw_tracked, ease_out_expo, ease_out_quart,
    ease_in_out_cubic, fade, font, mix, shade, text_width,
)

W, H = 1080, 1920
FPS = 30
DURATION = 22.0
CX = W / 2

BRAND = (58, 130, 246)
SHOTS = Path("/private/tmp/noshashi_shots")
OUT = Path(__file__).parent / "NOSHASHI_Commercial_9x16.mp4"
FRAMES = Path("/private/tmp/noshashi_ads/commercial")


# ── Shot cards ─────────────────────────────────────────────────────────
# Each capture is turned once into a "card": rounded corners, a hairline
# edge and a soft drop shadow, baked at full size. Per frame the card is
# only scaled and pasted, because blurring a 1400px shadow 660 times is
# the difference between a render that takes a minute and one that takes
# twenty.
_cards: dict[str, Image.Image] = {}


def card(name: str, width: int = 1500, radius: int = 28) -> Image.Image:
    if name in _cards:
        return _cards[name]

    src = Image.open(SHOTS / f"{name}.png").convert("RGBA")
    scale = width / src.width
    src = src.resize((width, max(1, round(src.height * scale))), Image.LANCZOS)

    mask = Image.new("L", src.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, src.width - 1, src.height - 1],
                                           radius=radius, fill=255)
    src.putalpha(mask)

    # A hairline edge stops the panel dissolving into the black ground.
    edge = ImageDraw.Draw(src)
    edge.rounded_rectangle([0, 0, src.width - 1, src.height - 1], radius=radius,
                           outline=(255, 255, 255, 46), width=2)

    pad = 90
    out = Image.new("RGBA", (src.width + pad * 2, src.height + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [pad, pad + 16, pad + src.width, pad + src.height + 16],
        radius=radius, fill=(0, 0, 0, 190))
    shadow = shadow.filter(ImageFilter.GaussianBlur(38))
    out.alpha_composite(shadow)
    out.alpha_composite(src, (pad, pad))

    _cards[name] = out
    return out


def place(base: Image.Image, name: str, cx: float, cy: float,
          width: float, alpha: float, crop: tuple[float, float, float, float] | None = None):
    """
    Draw a shot card centred on (cx, cy) at a given on-screen width.

    `crop` is (left, top, w, h) in card pixels and is the difference
    between a film and a slideshow. A desktop panel scaled whole into a
    1080-wide vertical frame is 40% of the height and unreadable on a
    phone; cropping to the part that carries the idea and pushing in on
    that is what makes the shot legible at arm's length.
    """
    if alpha <= 0.004:
        return
    c = card(name)
    if crop is not None:
        left, top, cw, ch = (int(v) for v in crop)
        c = c.crop((max(0, left), max(0, top),
                    min(c.width, left + cw), min(c.height, top + ch)))

    scale = width / c.width
    size = (max(1, round(c.width * scale)), max(1, round(c.height * scale)))
    frame_img = c.resize(size, Image.LANCZOS)

    if alpha < 0.999:
        a = frame_img.getchannel("A").point(lambda v: int(v * clamp01(alpha)))
        frame_img.putalpha(a)

    base.alpha_composite(frame_img, (round(cx - size[0] / 2), round(cy - size[1] / 2)))


def kb(t: float, start: float, length: float, a: float, b: float) -> float:
    """Ken Burns: one eased move across a shot's life, never linear."""
    return mix(a, b, ease_in_out_cubic(clamp01((t - start) / length)))


# ── Type ───────────────────────────────────────────────────────────────
def lines(d, y, rows, f, alpha, tracking=-1.6, color=INK, leading=1.18):
    if alpha <= 0.004:
        return
    lift = (1 - ease_out_quart(alpha)) * 22
    step = f.size * leading
    for i, row in enumerate(rows):
        draw_tracked(d, (CX, y + i * step + lift), row, f, shade(color, alpha), tracking)


def kicker(d, y, s, alpha, color=MUTED, size=25, tracking=9):
    if alpha <= 0.004:
        return
    draw_tracked(d, (CX, y), s, font(size, "Medium"), shade(color, alpha), tracking)


def rule(d, y, progress, alpha, width=420, color=DIM):
    if alpha <= 0.004 or progress <= 0:
        return
    half = width * ease_out_expo(progress) / 2
    d.line([(CX - half, y), (CX + half, y)], fill=shade(color, alpha), width=2)


# ── The film ───────────────────────────────────────────────────────────
def frame(t: float) -> Image.Image:
    img = Image.new("RGBA", (W, H), (*BLACK, 255))
    d = ImageDraw.Draw(img)

    # 1 · Cold open — type only. Two cards, no product yet.
    a = fade(t, 0.30, 0.55, 1.05, 0.45)
    if a > 0.004:
        lines(d, 830, ["Two questions."], font(104, "Bold"), a, -3.0)
    a = fade(t, 1.95, 0.50, 1.05, 0.50)
    if a > 0.004:
        lines(d, 830, ["One ledger read."], font(104, "Bold"), a, -3.0)

    # 2 · The live market panel — the first thing they see is real data.
    a = fade(t, 3.90, 0.75, 2.35, 0.60)
    if a > 0.004:
        # Cropped to the quote and the chart — the two things that say
        # "this is live" — and pushed in across the shot's life.
        place(img, "xrp_panel", CX, kb(t, 3.90, 3.7, 980, 930),
              kb(t, 3.90, 3.7, 985, 1055), a, crop=(60, 150, 1560, 760))
        d = ImageDraw.Draw(img)
        kicker(d, 520, "LIVE XRP MARKET AND NETWORK", a * clamp01((t - 4.25) / 0.6), DIM, 24)
        lines(d, 1380, ["Price, seven days,", "and the validated ledger."],
              font(52, "Semibold"), a * clamp01((t - 4.55) / 0.65), -0.9, MUTED, 1.30)

    # 3 · The verdict — the product's own three words, then the board.
    a = fade(t, 7.60, 0.55, 1.05, 0.45)
    if a > 0.004:
        words = [("GO", GO, 7.80), ("HOLD", HOLD, 7.95), ("NO-GO", NOGO, 8.10)]
        f = font(92, "Heavy")
        widths = [text_width(d, w, f, 2.0) for w, _, _ in words]
        gap = 50.0
        x = CX - (sum(widths) + gap * (len(words) - 1)) / 2
        for (word, colour, at), width in zip(words, widths):
            wa = a * ease_out_quart(clamp01((t - at) / 0.42))
            draw_tracked(d, (x, 900), word, f, shade(colour, wa), 2.0, anchor_center=False)
            x += width + gap
        kicker(d, 1060, "WITH THE RULE THAT DECIDED IT", a * clamp01((t - 8.35) / 0.55), DIM, 24)

    a = fade(t, 9.35, 0.65, 1.85, 0.55)
    if a > 0.004:
        place(img, "board", CX, kb(t, 9.35, 3.0, 980, 955), kb(t, 9.35, 3.0, 1040, 1140), a)
        d = ImageDraw.Draw(img)
        kicker(d, 640, "EVERY SYSTEM, STATED", a * clamp01((t - 9.7) / 0.6), DIM, 24)

    # 4 · What you get — the download rail, beta stated on its own card.
    a = fade(t, 12.30, 0.65, 2.05, 0.55)
    if a > 0.004:
        # One platform card, not three. Three at 1080 wide is a row of
        # illegible rectangles; one is a product shot with a BETA badge
        # you can actually read.
        place(img, "downloads", CX, kb(t, 12.30, 3.3, 990, 940),
              kb(t, 12.30, 3.3, 880, 975), a, crop=(40, 40, 700, 700))
        d = ImageDraw.Draw(img)
        kicker(d, 560, "MACOS · WINDOWS · LINUX", a * clamp01((t - 12.65) / 0.6), DIM, 24)
        lines(d, 1330, ["Every build verified.", "Every hash published."],
              font(52, "Semibold"), a * clamp01((t - 12.95) / 0.65), -0.9, MUTED, 1.30)

    # 5 · On a phone — the site itself, in the device it will be opened on.
    a = fade(t, 15.35, 0.65, 1.75, 0.55)
    if a > 0.004:
        place(img, "m_hero", CX, kb(t, 15.35, 3.0, 940, 915), kb(t, 15.35, 3.0, 980, 1070), a)
        d = ImageDraw.Draw(img)
        kicker(d, 560, "AND IN YOUR POCKET", a * clamp01((t - 15.7) / 0.6), DIM, 24)
        lines(d, 1330, ["Free tier.", "No account, anywhere."],
              font(56, "Semibold"), a * clamp01((t - 15.95) / 0.65), -1.0, INK, 1.28)

    # 6 · Sign-off.
    a = fade(t, 18.35, 0.70, 2.10, 0.60)
    if a > 0.004:
        grow = ease_out_expo(clamp01((t - 18.35) / 1.0))
        draw_mark(img, CX, 760, mix(140, 218, grow), a, INK,
                  flame_scale=clamp01((t - 18.9) / 0.55))
        d = ImageDraw.Draw(img)
        draw_tracked(d, (CX, 952), "NOSHASHI", font(78, "Heavy"),
                     shade(INK, a * ease_out_quart(clamp01((t - 18.8) / 0.6))), 11)
        rule(d, 1062, clamp01((t - 19.1) / 0.6), a, 320, BRAND)
        draw_tracked(d, (CX, 1098), "noshashi.app", font(38, "Semibold"),
                     shade(BRAND, a * clamp01((t - 19.25) / 0.5)), 5)
        kicker(d, 1196, "BETA CHANNEL · v0.3.1 · UNSIGNED BUILDS",
               a * clamp01((t - 19.55) / 0.55), DIM, 23)

    return img.convert("RGB")


# ── Encode ─────────────────────────────────────────────────────────────
def encode(frames_dir: Path, out: Path):
    """
    Encode, and verify. motion.py's encoder passes `check=True` and
    suppresses ffmpeg's output, which means a run that produces a 48-byte
    container — an MP4 header with no samples in it — exits 0 and prints
    "WROTE". That happened, and the empty file looked like a success for
    long enough to be worth never repeating. Here stderr is kept and the
    output is size-checked before the frames are deleted.
    """
    import imageio_ffmpeg

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out.parent.mkdir(parents=True, exist_ok=True)
    count = len(list(frames_dir.glob("f*.png")))
    if count == 0:
        raise RuntimeError(f"no frames in {frames_dir}")

    cmd = [
        ffmpeg, "-y", "-loglevel", "warning",
        "-framerate", str(FPS),
        "-start_number", "0",
        "-i", str(frames_dir / "f%05d.png"),
        "-frames:v", str(count),
        "-c:v", "libx264", "-profile:v", "high", "-level", "4.2",
        "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium",
        "-movflags", "+faststart",
        str(out),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({r.returncode}):\n{r.stderr[-2000:]}")

    size = out.stat().st_size if out.exists() else 0
    if size < 50_000:
        raise RuntimeError(
            f"ffmpeg exited 0 but wrote {size} bytes from {count} frames — "
            f"an empty container.\nstderr:\n{r.stderr[-2000:]}")
    return size


def main():
    missing = [n for n in ("xrp_panel", "board", "downloads", "m_hero")
               if not (SHOTS / f"{n}.png").exists()]
    if missing:
        raise SystemExit(f"missing captures: {missing} — run the capture pass first")

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
    print(f"WROTE {OUT} ({size // 1024} KB, {total} frames, {DURATION}s)")


if __name__ == "__main__":
    main()
