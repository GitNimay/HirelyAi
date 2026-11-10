"""Synthesises the launch film's soundtrack: an original 60 s, 120 BPM track plus sound effects cued from the
animation (sfx.json, written by render.mjs). Nothing sampled, so there is nothing to license.

    python3 music.py <sfx.json> <out.wav>
"""

import json
import sys
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR, DUR, BEAT = 44100, 60.0, 0.5
N = int(SR * DUR)
rng = np.random.default_rng(11)


def bus():
    return np.zeros((N, 2))


def add(buf, sig, t, gain=1.0, pan=0.0):
    """Mix a mono signal in at time t (seconds); pan is -1 (left) .. 1 (right)."""
    i = int(t * SR)
    if i >= N or i < 0:
        return
    sig = sig[: N - i]
    buf[i : i + len(sig), 0] += sig * gain * np.sqrt((1 - pan) / 2)
    buf[i : i + len(sig), 1] += sig * gain * np.sqrt((1 + pan) / 2)


def tt(d):
    return np.arange(int(d * SR)) / SR


def filt(x, kind, hz, order=2):
    return sosfilt(butter(order, hz, kind, fs=SR, output="sos"), x, axis=0)


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


# ---------- instruments ----------
def pluck(f, d=0.5, bright=1.0):
    t = tt(d)
    out = sum(np.sin(2 * np.pi * f * n * t) / n * np.exp(-t * (5 + n * 4 / bright)) for n in range(1, 9) if f * n < 9000)
    return out * np.minimum(1, t / 0.003)


def bell(f, d=1.6):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t * 6)) * np.exp(-t * 3) * np.minimum(1, t / 0.004)


def pad(freqs, d):
    t = tt(d)
    out = np.zeros_like(t)
    for f in freqs:
        for det in (-7, 0, 7):
            ff = f * 2 ** (det / 1200)
            ph = rng.random() * 6.28
            out += sum(np.sin(2 * np.pi * ff * n * t + ph * n) / n**1.7 for n in range(1, 6))
    env = np.minimum(1, t / 0.35) * np.minimum(1, (d - t) / 0.5)
    return out * env / (3 * len(freqs))


def bass(f, d=0.22):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) + 0.15 * np.sin(6 * np.pi * f * t)
    return np.tanh(1.4 * s) * np.minimum(1, t / 0.005) * np.minimum(1, (d - t) / 0.03)


def kick():
    t = tt(0.35)
    ph = 2 * np.pi * (46 * t + 115 * 0.028 * (1 - np.exp(-t / 0.028)))
    return np.sin(ph) * np.exp(-t / 0.16) + 0.25 * rng.standard_normal(len(t)) * np.exp(-t / 0.004)


def hat(d=0.05):
    t = tt(d * 4)
    return filt(rng.standard_normal(len(t)), "highpass", 7500) * np.exp(-t / d)


def clap():
    t = tt(0.3)
    env = sum(np.exp(-np.maximum(0, t - o) / 0.012) * (t >= o) for o in (0, 0.011, 0.023)) * 0.5 + np.exp(-t / 0.07) * (t > 0.03)
    return filt(rng.standard_normal(len(t)), "bandpass", [900, 3800]) * env


# ---------- sound effects ----------
def fx_tick():
    t = tt(0.05)
    return np.sin(2 * np.pi * 2100 * t) * np.exp(-t / 0.008) + 0.3 * filt(rng.standard_normal(len(t)), "highpass", 5000) * np.exp(-t / 0.003)


def fx_pop():
    t = tt(0.12)
    f = 380 + 700 * (1 - np.exp(-t / 0.03))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035)


def fx_click():
    t = tt(0.09)
    return (np.sin(2 * np.pi * 1300 * t) * np.exp(-t / 0.006) + 0.6 * np.sin(2 * np.pi * 800 * t) * np.exp(-np.maximum(0, t - 0.05) / 0.01) * (t > 0.05))


def fx_whoosh(d=0.9):
    t = tt(d)
    n = rng.standard_normal(len(t))
    x = t / d
    lo, mid, hi = filt(n, "bandpass", [250, 900]), filt(n, "bandpass", [900, 3000]), filt(n, "bandpass", [3000, 9000])
    sweep = lo * np.clip(1 - 2 * x, 0, 1) + mid * (1 - np.abs(2 * x - 1)) + hi * np.clip(2 * x - 1, 0, 1)
    return sweep * np.sin(np.pi * x) ** 2


def fx_riser(d=2.0):
    t = tt(d)
    x = t / d
    n = filt(rng.standard_normal(len(t)), "highpass", 2500) * x**2.5
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (x * 2.6)) / SR) * x**2 * 0.35
    return (n * 0.5 + tone) * np.minimum(1, (d - t) / 0.02)


def fx_impact():
    t = tt(1.6)
    sub = np.sin(2 * np.pi * (38 * t + 60 * 0.09 * (1 - np.exp(-t / 0.09)))) * np.exp(-t / 0.45)
    crash = filt(rng.standard_normal(len(t)), "bandpass", [300, 6000]) * np.exp(-t / 0.25) * 0.35
    return sub + crash


# ---------- arrangement ----------
# One chord per bar (2 s): Fmaj7, Am7, Cmaj7, G6. (bass note, pad/arp voicing)
CHORDS = [(41, [57, 60, 64, 67]), (45, [55, 60, 64, 67]), (48, [55, 59, 64, 67]), (43, [55, 59, 62, 64])]
BARS = 30


def section(bar):
    if bar < 4:
        return "intro"
    if bar < 18:
        return "groove"
    if bar < 20:
        return "break"
    if bar < 27:
        return "groove"
    return "outro"


dry, wet, ducked = bus(), bus(), bus()  # wet = sent to reverb; ducked = side-chained to the kick
kicks = []
for bar in range(BARS):
    t0, sec = bar * 2.0, section(bar)
    root, notes = CHORDS[bar % 4] if bar < 27 else CHORDS[[0, 2, 2][bar - 27]]
    # Pad
    p = pad([hz(n) for n in notes] + [hz(root + 12)], 2.4)
    add(ducked, p, t0, 0.5 if sec != "intro" else 0.38, -0.2)
    add(ducked, np.roll(p, 37), t0, 0.5 if sec != "intro" else 0.38, 0.2)
    if sec == "outro" and bar > 27:
        continue
    for step in range(16):  # 16th notes
        t = t0 + step * BEAT / 4
        beat, on_beat = step // 4, step % 4 == 0
        # Drums
        if sec == "groove" and on_beat:
            add(dry, kick(), t, 0.95)
            kicks.append(t)
        if sec == "groove" and bar >= 6 and on_beat and beat in (1, 3):
            add(dry, clap(), t, 0.32)
            add(wet, clap(), t, 0.1)
        if sec in ("groove", "break") and step % 4 == 2:
            add(dry, hat(0.045), t, 0.2, 0.25)
        if sec == "groove" and bar >= 10 and step % 2 == 1:
            add(dry, hat(0.02), t, 0.085, -0.3)
        # Bass: off-beat eighths, leaving the kick its space
        if sec == "groove" and step % 4 in (2, 3) or (sec == "groove" and step == 0):
            add(ducked, bass(hz(root - 12) * (2 if step % 8 == 7 else 1), 0.2 if step else 0.3), t, 0.55)
        # Arp: eighths in the intro and break, sixteenths in the groove
        seq = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 1, 3, 2]
        if sec == "groove" or step % 2 == 0:
            n = notes[seq[step]] + (12 if sec != "intro" or step % 4 == 0 else 0)
            g = (0.2 if step % 4 == 0 else 0.13) * (0.7 if sec == "intro" else 1) * (0.6 if sec == "outro" else 1)
            pl = pluck(hz(n), 0.45, 1.3 if sec == "groove" else 0.8)
            add(dry, pl, t, g, 0.45 if step % 2 else -0.45)
            add(wet, pl, t + 0.375, g * 0.45, -0.45 if step % 2 else 0.45)  # dotted-eighth echo
            add(wet, pl, t + 0.75, g * 0.2, 0.45 if step % 2 else -0.45)
    # Lead: a small bell figure, two bars long, from the first drop
    if 4 <= bar < 27 and sec != "break":
        fig = [(0, 76), (0.75, 79), (1.5, 81)] if bar % 2 == 0 else [(0, 79), (0.75, 76), (1.25, 74), (1.5, 72)]
        for off, n in fig:
            add(wet, bell(hz(n)), t0 + off, 0.16, 0.1)
            add(dry, bell(hz(n)), t0 + off, 0.1, -0.1)
    # Fill into the final drop
    if bar == 26:
        for i in range(8):
            add(dry, clap(), t0 + 1.0 + i * 0.125, 0.12 + i * 0.035)

# Final chord rings out
add(wet, pad([hz(n) for n in (53, 60, 64, 67, 72, 76)], 5.5), 54.0, 0.9)
for i, n in enumerate((72, 76, 79, 84)):
    add(wet, bell(hz(n), 3.0), 54.0 + i * 0.25, 0.22, (-1) ** i * 0.4)

# Side-chain: duck pad and bass under each kick
duck = np.ones(N)
for k in kicks:
    i = int(k * SR)
    seg = np.arange(min(N - i, int(0.4 * SR))) / SR
    duck[i : i + len(seg)] = np.minimum(duck[i : i + len(seg)], 1 - 0.6 * np.exp(-seg / 0.11))
ducked *= duck[:, None]

# Sound effects, cued from the animation
cues = json.load(open(sys.argv[1]))
last_tick = -1.0
for kind, t in sorted(cues, key=lambda c: c[1]):
    pan = float(rng.uniform(-0.4, 0.4))
    if kind == "tick":
        if t - last_tick < 0.05:
            continue
        last_tick = t
        add(dry, fx_tick(), t, 0.11, pan)
        add(wet, fx_tick(), t, 0.04, pan)
    elif kind == "pop":
        add(dry, fx_pop(), t, 0.2, pan)
        add(wet, fx_pop(), t, 0.08, pan)
    elif kind == "click":
        add(dry, fx_click(), t, 0.3)
    elif kind == "whoosh":
        w = fx_whoosh()
        add(dry, w, t, 0.22, -0.5)
        add(dry, np.roll(w, 2200), t, 0.22, 0.5)
        add(wet, w, t, 0.1)
    elif kind == "riser":
        add(dry, fx_riser(), t, 0.3)
        add(wet, fx_riser(), t, 0.12)
    elif kind == "impact":
        add(dry, fx_impact(), t, 0.8)
        add(wet, fx_impact(), t, 0.5)

# Reverb: convolve the send with a decaying stereo noise tail
ir_t = tt(2.2)
ir = rng.standard_normal((len(ir_t), 2)) * np.exp(-ir_t / 0.5)[:, None]
ir = filt(ir, "lowpass", 6000)
ir = filt(ir, "highpass", 250)
ir /= np.sqrt((ir**2).sum(axis=0))
verb = np.stack([fftconvolve(wet[:, c], ir[:, c])[:N] for c in (0, 1)], axis=1)

mix = dry + ducked + wet * 0.6 + verb * 0.55
mix = filt(mix, "highpass", 28)
t = np.arange(N) / SR
# The drum-less intro and breakdown sit far below the groove; lift them so the film doesn't open on near-silence
lift = 1 + 1.5 * np.clip((7.9 - t) / 0.4, 0, 1) + 1.0 * np.clip((t - 35.95) / 0.1, 0, 1) * np.clip((39.95 - t) / 0.1, 0, 1)
mix *= lift[:, None]
mix *=(np.minimum(1, t / 0.03) * np.clip((DUR - 0.15 - t) / 2.2, 0, 1) ** 1.5)[:, None]
mix = np.tanh(mix * 1.15 / np.percentile(np.abs(mix), 99.9))  # gentle limiting
mix *= 0.89 / np.abs(mix).max()

with wave.open(sys.argv[2], "wb") as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes((mix * 32767).astype("<i2").tobytes())
print("wrote", sys.argv[2])
