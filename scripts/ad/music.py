"""Soundtrack for the NOSHASHI 15-second ad (scripts/ad/ad.html).

Synthesised here with numpy, so it is original and free to use: no
samples, no library, no service. 120 BPM, so every 0.5 s is a beat and
the scene changes (3.0, 6.0, 9.5, 12.5 s) land on downbeats.

    python3 scripts/ad/music.py out.wav
"""
import sys
import wave

import numpy as np

SR = 44100
DUR = 15.0
BEAT = 0.5
N = int(SR * DUR)
t_all = np.arange(N) / SR
mix = np.zeros((N, 2))
rng = np.random.default_rng(7)


def add(sig, at, pan=0.0, gain=1.0):
    i = int(at * SR)
    j = min(N, i + len(sig))
    if j <= i:
        return
    left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    mix[i:j, 0] += sig[: j - i] * gain * left
    mix[i:j, 1] += sig[: j - i] * gain * right


def env(n, a=0.005, d=0.2):
    x = np.arange(n) / SR
    return np.minimum(1, x / a) * np.exp(-x / d)


def kick():
    n = int(0.45 * SR)
    x = np.arange(n) / SR
    f = 45 + 110 * np.exp(-x * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.16)


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    s = rng.standard_normal(n)
    s = np.diff(np.concatenate([[0], s]))  # brighter
    return s * env(n, 0.001, 0.06 if open_ else 0.015) * 0.35


def clap():
    n = int(0.25 * SR)
    s = rng.standard_normal(n) * env(n, 0.002, 0.08)
    for k in (0.012, 0.024):
        s[int(k * SR):] += rng.standard_normal(n - int(k * SR)) * env(n - int(k * SR), 0.001, 0.05)
    return s * 0.35


def note(freq, length, wave_="saw", a=0.01, d=0.4, detune=0.004):
    n = int(length * SR)
    x = np.arange(n) / SR
    out = np.zeros(n)
    for dt in (-detune, 0, detune):
        ph = (x * freq * (1 + dt)) % 1
        out += (2 * ph - 1) if wave_ == "saw" else np.sin(2 * np.pi * freq * (1 + dt) * x)
    # a gentle one-pole low-pass keeps the saws warm
    y = np.zeros(n)
    k = 0.18
    for i in range(1, n):
        y[i] = y[i - 1] + k * (out[i] - y[i - 1])
    return y / 3 * env(n, a, d)


def riser(length):
    n = int(length * SR)
    x = np.arange(n) / SR
    noise = rng.standard_normal(n)
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 1800 * (x / length) ** 2) / SR)
    return (noise * 0.25 + sweep * 0.3) * (x / length) ** 2


def impact():
    n = int(1.4 * SR)
    x = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-x * 8)) / SR) * np.exp(-x * 2.2)
    return boom + rng.standard_normal(n) * np.exp(-x * 14) * 0.3


midi = lambda m: 440 * 2 ** ((m - 69) / 12)
# A minor → F → C → G, then home to A minor on the logo.
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
BASS = [45, 41, 36, 43]

beats = int(DUR / BEAT)
for b in range(beats):
    at = b * BEAT
    drop = 2 <= at < 12.5  # the full groove runs between the opener and the logo
    if at < 12.5 and (b % 1 == 0) and (at >= 0.5):
        add(kick(), at, gain=0.9 if drop else 0.6)
    if drop and b % 2 == 1:
        add(clap(), at, pan=0.05)
    if drop:
        add(hat(), at + BEAT / 2, pan=0.3)
        add(hat(b % 4 == 3), at + BEAT * 0.75, pan=-0.3, gain=0.7)
    bar = (b // 4) % 4
    if at < 12.5 and b % 2 == 0:
        add(note(midi(BASS[bar]), 0.45, "saw", 0.005, 0.25), at, gain=0.55)
    if at < 12.5 and b % 4 == 0:
        for m in CHORDS[bar]:
            add(note(midi(m + 12), 1.9, "saw", 0.05, 1.2, 0.007), at, pan=(m % 3 - 1) * 0.4, gain=0.16)
    # an arpeggio plucks the chord tones in the SPACE and TIME scenes
    if 6.0 <= at < 12.5:
        tones = CHORDS[bar]
        for k in range(2):
            add(note(midi(tones[(b * 2 + k) % 3] + 24), 0.2, "sine", 0.002, 0.09), at + k * BEAT / 2, pan=0.5 - k, gain=0.22)

# Transitions: a riser into each swirl and an impact on the downbeat.
for at in (3.0, 6.0, 9.5, 12.5):
    add(riser(1.0), at - 1.0, gain=0.35)
    add(impact(), at, gain=0.7)

# The logo: a held A-minor-add9 bloom that rings out to the end.
for m in (57, 64, 69, 71, 72, 76):
    add(note(midi(m), 2.6, "sine", 0.3, 2.2, 0.003), 12.5, pan=((m * 7) % 5 - 2) * 0.2, gain=0.14)

# Master: soft-clip, a short fade out, normalise.
mix = np.tanh(mix * 1.1)
fade = np.ones(N)
fade[-int(0.6 * SR):] = np.linspace(1, 0, int(0.6 * SR))
mix *= fade[:, None]
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89

with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
