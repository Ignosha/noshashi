# NOSHASHI · 15-second ad

A vertical (1080×1920, 30 fps) motion-graphics ad, built from code:

| Time | Scene | What moves |
|---|---|---|
| 0–3 s | Type | "Every payment asks a question." slams in, word by word |
| 3–6 s | Form | the questions orbit a turning icosahedron that becomes a torus |
| 6–9.5 s | Space | a tunnel of ledger rings; the verdict flips GO → HOLD → NO-GO → GO |
| 9.5–12.5 s | Time | a real mainnet payment is read and stamped GO |
| 12.5–15 s | Logo | the mark blooms; NOSHASHI, free to start |

Swirl wipes join the scenes on the downbeat. The payment is real:
XRPL mainnet ledger 107,193,471, the one the app's tests are built on.

- `ad.html`: the animation. `seek(t)` draws the frame at t seconds, so you
  can open it in a browser and scrub it from the console.
- `music.py`: the soundtrack, synthesised with numpy at 120 BPM so every
  scene change lands on a beat. It is original, so it is free to use anywhere.
- `render.mjs`: screenshots every frame and muxes it with the music.

```
node scripts/ad/render.mjs noshashi-ad.mp4
```

It needs Playwright's Chromium (`CHROMIUM=/path/to/chromium` if Playwright's
own is missing), python3 with numpy, and ffmpeg (`FFMPEG=path`, or the
one imageio-ffmpeg ships). Everything runs locally and is free.

To change the timing, edit the scene windows at the top of `seek()` in
`ad.html` and the matching times in `music.py`.
