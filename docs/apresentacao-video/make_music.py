#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Trilha sonora original (sintetizada) para o trailer — sem material de terceiros.
Gera build/music.wav, 89 s, estéreo 44.1 kHz: pad harmônico, pulso grave, whooshes e sino final."""
import numpy as np, wave

SR = 44100
DUR = 89.0
N = int(SR * DUR)
t = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)

def env_ad(x, a, d, curve=2.0):
    e = np.where(x < a, x / max(a, 1e-6), np.maximum(0.0, 1 - (x - a) / max(d, 1e-6)) ** curve)
    return np.clip(e, 0, 1)

def add(sig, at, gl=1.0, gr=None):
    i = int(at * SR)
    n = min(len(sig), N - i)
    if n <= 0:
        return
    L[i:i + n] += sig[:n] * gl
    R[i:i + n] += sig[:n] * (gl if gr is None else gr)

# ---------------------------------------------------------------- pad harmônico
CHORDS = [
    [110.00, 164.81, 261.63, 329.63, 392.00],   # Am7
    [87.31, 220.00, 261.63, 329.63, 349.23],    # Fmaj7
    [130.81, 196.00, 261.63, 329.63, 392.00],   # C
    [98.00, 146.83, 246.94, 293.66, 392.00],    # G
]
seg = 6.4
k = 0
while k * seg < DUR:
    ch = CHORDS[k % len(CHORDS)]
    dur = seg + 1.6
    n = int(dur * SR); x = np.arange(n) / SR
    a = np.clip(x / 2.6, 0, 1) * np.clip((dur - x) / 1.8, 0, 1) ** 1.2
    s = np.zeros(n)
    for f in ch:
        vib = 1 + 0.0018 * np.sin(2 * np.pi * 0.22 * x + f)
        s += np.sin(2 * np.pi * f * x * vib) * (0.9 if f < 150 else 0.55)
    s += 0.12 * np.sin(2 * np.pi * ch[0] / 2 * x)             # sub-oitava
    s *= a / 3.2
    add(s * 0.9, k * seg, 1.0, 0.94)
    add(s * 0.22, k * seg + 0.02, 0.7, 1.0)                    # alargamento leve
    k += 1

# ---------------------------------------------------------------- pulso grave
def kick(dur=0.55, f0=58, f1=34):
    n = int(dur * SR); x = np.arange(n) / SR
    f = f0 * np.exp(-x * 6) + f1
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-x * 7.5) * 0.55

t0 = 0.0
while t0 < 12.2:                                    # batida no gancho
    add(kick(), t0, 1.0, 0.92)
    t0 += 1.2
for tt in (12.4, 17.3, 21.5, 25.0, 27.6, 33.0, 37.5, 41.0, 48.0, 54.5, 58.5, 65.5, 71.0, 76.4, 78.6, 80.8):
    add(kick(0.4, 52, 30) * 0.5, tt, 1.0, 0.9)       # reforço nas viradas

# ---------------------------------------------------------------- whooshes
def whoosh(dur=0.6, lo=350, hi=4200):
    n = int(dur * SR); x = np.arange(n) / SR
    noise = np.random.default_rng(7).standard_normal(n)
    out = np.zeros(n); lp = 0.0; hp = 0.0
    for i in range(n):
        cut = lo + (hi - lo) * (i / n) ** 1.4
        a = np.exp(-2 * np.pi * cut / SR)
        lp = (1 - a) * noise[i] + a * lp
        out[i] = lp
    e = np.clip(x / 0.12, 0, 1) * np.clip((dur - x) / (dur * 0.72), 0, 1) ** 2
    return out * e * 0.16

for tt in (12.35, 17.25, 21.45, 24.95, 32.95, 40.95, 54.45, 65.45, 70.95, 83.95):
    w = whoosh()
    add(w, tt - 0.25, 0.8, 1.0)
    add(w, tt - 0.22, 1.0, 0.8)

# ---------------------------------------------------------------- sino final
def bell(dur=5.0, f=784.0):
    n = int(dur * SR); x = np.arange(n) / SR
    s = np.zeros(n)
    for m, (mult, amp, dec) in enumerate([(1, 1.0, 1.1), (2.0, 0.5, 1.6), (3.01, 0.28, 2.2), (4.16, 0.16, 2.9), (5.43, 0.09, 3.4)]):
        s += amp * np.sin(2 * np.pi * f * mult * x + m) * np.exp(-x * dec)
    return s * 0.14

add(bell(5.2, 784), 84.15, 1.0, 1.0)
add(bell(5.6, 1046.5), 84.35, 0.65, 0.65)
add(bell(4.0, 587.3), 83.95, 0.5, 0.5)

# ---------------------------------------------------------------- acabamento
fade = np.clip(t / 1.8, 0, 1) * np.clip((DUR - t) / 2.2, 0, 1)
L *= fade; R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L *= 0.82 / peak; R *= 0.82 / peak

st = np.stack([L, R], axis=1)
pcm = (np.clip(st, -1, 1) * 32767).astype("<i2")
with wave.open("/home/user/apresentacao-video/build/music.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("music.wav gerado:", pcm.shape[0] / SR, "s")

# trilha de referência para conferência (mesmo arquivo)
print("RMS L/R:", float(np.sqrt((L ** 2).mean())), float(np.sqrt((R ** 2).mean())))
