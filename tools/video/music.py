"""Original music bed for the Gusinjska kocka showcase (32.4 s), synthesised with numpy.

D major pentatonic like the game's own sounds, 100 BPM, cuts on the beat.
Writes music.wav (48 kHz, stereo, 16-bit).
"""
import json
import numpy as np
from scipy.signal import fftconvolve, lfilter
import wave

SR = 48000
TL = json.load(open('/home/claude/gk-video/timeline.json'))
DUR = TL['end']
BEAT = 0.6
GROOVE = TL['s2']               # groove starts with the title
rng = np.random.default_rng(11)
N = int(DUR * SR) + SR
L = np.zeros(N); R = np.zeros(N)


def hz(m): return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= N: return
    s = sig[:N - i] * gain
    L[i:i + len(s)] += s * np.sqrt(0.5 * (1 - pan)); R[i:i + len(s)] += s * np.sqrt(0.5 * (1 + pan))


def env(n, a, d, s=0.0, r=0.0, sus=0.0):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    if d > 0:
        e = np.where(t >= a, s + (1 - s) * np.exp(-(t - a) / d), e)
    if r > 0 and sus > 0:
        e = e * np.clip((sus + r - t) / r, 0, 1)
    return e


def onepole(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    return lfilter([1 - a], [1, -a], x)


def bell(m, dur=2.2, amp=0.25):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m)
    out = np.zeros(n)
    for k, (ratio, g, dec) in enumerate([(1, 1.0, 1.2), (2.0, 0.45, 0.7), (3.01, 0.25, 0.4), (4.2, 0.12, 0.25), (5.43, 0.06, 0.15)]):
        out += g * np.sin(2 * np.pi * f * ratio * t + k) * np.exp(-t / dec)
    return out * amp * np.minimum(1, t / 0.003)


def pluck(m, dur=1.2, amp=0.22, bright=0.5):
    """Karplus-Strong string."""
    f = hz(m); n = int(dur * SR); p = int(SR / f)
    buf = rng.uniform(-1, 1, p); buf = onepole(buf, 2000 + 6000 * bright)
    out = np.zeros(n); idx = 0; prev = 0.0
    damp = 0.996
    for i in range(n):
        v = buf[idx]
        nv = damp * 0.5 * (v + prev); prev = v
        buf[idx] = nv; out[i] = v; idx = (idx + 1) % p
    return out * amp * env(n, 0.002, dur * 0.45)


def pad_chord(ms, dur, amp=0.05, fc=1400):
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for m in ms:
        for det in (-0.08, 0.0, 0.07):
            f = hz(m + det)
            ph = rng.uniform(0, 1)
            saw = 2 * ((f * t + ph) % 1.0) - 1
            out += saw
    out = onepole(onepole(out, fc), fc * 1.3)
    e = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.9)
    return out * e * amp / len(ms)


def kick(amp=0.5):
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.12) * amp


def hat(amp=0.05, dur=0.06):
    n = int(dur * SR); x = rng.normal(0, 1, n)
    x = x - onepole(x, 7000)
    return x * np.exp(-np.arange(n) / SR / (dur / 4)) * amp


def whoosh(end_t, length=0.9, amp=0.09):
    n = int(length * SR); x = rng.normal(0, 1, n)
    out = np.zeros(n); seg = 512
    for i in range(0, n, seg):
        frac = i / n
        fc = 300 + 5200 * frac ** 2
        y = onepole(x[i:i + seg], fc) - onepole(x[i:i + seg], fc * 0.35)
        out[i:i + seg] = y
    e = (np.arange(n) / n) ** 2.2
    place(out * e * amp, end_t - length, pan=-0.2)
    place(out[::-1][:int(0.25 * SR)] * np.linspace(1, 0, int(0.25 * SR)) * amp * 0.6, end_t, pan=0.2)


# chords (MIDI) over D major pentatonic
D, Bm, G, A = [50, 57, 62, 64, 66], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [45, 52, 57, 59, 64]
PROG = [D, Bm, G, A]
BAR = 4 * BEAT
PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83]

# --- logo (0-3 s): shimmer swell, one pluck per pixel square, a bell as the words land
place(pad_chord([62, 66, 69, 74, 78], TL['s2'] + 0.6, amp=0.035, fc=2200), 0.0)
for i, tp in enumerate(TL['pixels']):
    place(bell(PENTA[i % len(PENTA)] + 12, dur=1.2, amp=0.07), tp, pan=-0.6 + 1.2 * i / 9)
place(bell(74, 3.0, 0.09), TL['words']); place(bell(81, 3.0, 0.05), TL['words'] + 0.02, pan=0.3)
place(kick(0.18), TL['words'])

# --- groove from the title to the outro
t = GROOVE; bar = 0
while t < TL['s7'] - 1e-6:
    ch = PROG[bar % 4]
    bar_end = min(t + BAR, TL['s7'])
    place(pad_chord([m + 12 for m in ch[1:]], bar_end - t + 0.9, amp=0.06 if t < TL['s3'] else 0.065), t)
    for b in range(4):
        tb = t + b * BEAT
        if tb >= TL['s7'] - 1e-6: break
        if tb >= TL['s3']:
            if b in (0, 2): place(kick(0.2), tb)
            place(np.sin(2 * np.pi * hz(ch[0] - 12) * np.arange(int(0.55 * SR)) / SR) * env(int(0.55 * SR), 0.01, 0.25) * 0.11, tb)
        # 8th-note arpeggio
        for half in (0, 1):
            te = tb + half * BEAT / 2
            if te >= TL['s7'] - 1e-6: break
            k = (b * 2 + half)
            note = ch[[1, 2, 3, 4, 3, 2, 4, 3][k]] + 12
            amp = (0.13 if te < TL['s3'] else 0.15) * (1.0 if half == 0 else 0.75)
            place(pluck(note, 1.0, amp, bright=0.45 + 0.1 * (k % 3)), te, pan=0.35 if half else -0.35)
        if tb >= TL['s4']:
            for q in range(4):
                place(hat(0.035 if q % 2 else 0.05), tb + q * BEAT / 4, pan=0.4)
    t += BAR; bar += 1

# --- transitions and moments
for cut in (TL['s3'], TL['s4'], TL['s5'], TL['s6'], TL['s7']):
    whoosh(cut)
place(bell(81, 2.0, 0.10), TL['visit']); place(bell(86, 2.0, 0.07), TL['visit'] + 0.09, pan=0.3); place(bell(90, 2.0, 0.05), TL['visit'] + 0.18, pan=-0.3)
for tl in TL['lang']:
    place(pluck(86, 0.4, 0.08, 0.8), tl, pan=0.2)
if TL.get('ar_go'):
    place(bell(74, 1.6, 0.08), TL['ar_go']); place(bell(78, 1.6, 0.06), TL['ar_go'] + 0.1)

# --- outro: one long chord and bells
place(pad_chord([50, 57, 62, 66, 69, 74], DUR - TL['s7'] + 0.5, amp=0.07, fc=1800), TL['s7'])
place(kick(0.22), TL['s7'])
for i, m in enumerate([62, 69, 74, 78, 81]):
    place(bell(m + 12, 3.2, 0.07), TL['s7'] + 0.12 * i, pan=-0.4 + 0.2 * i)

# --- reverb, gentle limiting, fades
ir_n = int(2.4 * SR); ti = np.arange(ir_n) / SR
irL = rng.normal(0, 1, ir_n) * np.exp(-ti / 0.55); irR = rng.normal(0, 1, ir_n) * np.exp(-ti / 0.55)
irL = onepole(irL, 5000); irR = onepole(irR, 5000)
wetL = fftconvolve(L, irL)[:N]; wetR = fftconvolve(R, irR)[:N]
wetL *= 0.22 / np.max(np.abs(wetL) + 1e-9) * np.max(np.abs(L)); wetR *= 0.22 / np.max(np.abs(wetR) + 1e-9) * np.max(np.abs(R))
outL, outR = L + wetL, R + wetR
n = int(DUR * SR)
outL, outR = outL[:n], outR[:n]
pk = max(np.max(np.abs(outL)), np.max(np.abs(outR)))
outL, outR = np.tanh(outL / pk * 1.3) / np.tanh(1.3), np.tanh(outR / pk * 1.3) / np.tanh(1.3)
fade = np.ones(n); fo = int(1.2 * SR); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
fi = int(0.02 * SR); fade[:fi] = np.linspace(0, 1, fi)
outL *= fade * 0.89; outR *= fade * 0.89
pcm = (np.stack([outL, outR], 1) * 32767).astype(np.int16)
with wave.open('/home/claude/gk-video/music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
rms = np.sqrt(np.mean(outL ** 2))
print(f'music.wav {DUR:.1f} s, peak {np.max(np.abs(outL)):.2f}, rms {20 * np.log10(rms):.1f} dBFS')
