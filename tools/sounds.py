#!/usr/bin/env python3
"""Writes the app's sounds into src/sounds/<name>.snd.

.snd is what the firmware's own asset build makes from a WAV: headerless signed
16-bit little-endian mono PCM at 44.1 kHz. Names must match SOUNDS in
src/main.ts. Every sound is synthesized here from sine waves; none is a
recording.

ADD    an expense was logged: a short cash-register "ka-ching", two bright bell
       strikes a fourth apart.
PAY    a debt was paid back: a rising major arpeggio that resolves.
UNDO   an entry was taken out or the tab cleared: two soft falling notes.

    python3 tools/sounds.py [volume 0-100, default 70]
"""
import math
import os
import struct
import sys

RATE = 44100
FADE_S = 0.002
TAU = 2.0 * math.pi


def tone(w):
    return (math.sin(w) + 0.10 * math.sin(3 * w)) / 1.10


def bell(w):
    # Inharmonic partials, as a struck bar or bell has.
    return (math.sin(w) + 0.45 * math.sin(2.76 * w) + 0.22 * math.sin(5.40 * w)) / 1.67


def note(freq, duration, timbre, decay=None):
    """One note: `decay` is the time constant of an exponential fade, None for a flat one with short ramps."""
    count = max(1, round(duration * RATE))
    fade_n = max(1, min(count // 2, round(FADE_S * RATE)))
    for i in range(count):
        t = i / RATE
        env = min(1.0, i / fade_n, (count - 1 - i) / fade_n)
        if decay:
            env *= math.exp(-t / decay)
        yield timbre(TAU * freq * t) * env


def rest(duration):
    return [0.0] * round(duration * RATE)


SOUNDS = {
    "add": lambda: [
        *note(1975.5, 0.05, bell, decay=0.03),
        *note(2637.0, 0.38, bell, decay=0.11),
    ],
    "pay": lambda: [
        *note(659.3, 0.07, tone),
        *rest(0.012),
        *note(830.6, 0.07, tone),
        *rest(0.012),
        *note(987.8, 0.07, tone),
        *rest(0.012),
        *note(1318.5, 0.30, bell, decay=0.12),
    ],
    "undo": lambda: [
        *note(880.0, 0.08, tone),
        *rest(0.02),
        *note(659.3, 0.16, tone, decay=0.08),
    ],
}


def main():
    volume = int(sys.argv[1]) if len(sys.argv) > 1 else 70
    gain = max(0.0, min(1.0, volume / 100.0))
    folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "sounds")
    os.makedirs(folder, exist_ok=True)
    for name, make in SOUNDS.items():
        data = [int(max(-1.0, min(1.0, v * gain)) * 32767) for v in make()]
        out = os.path.join(folder, name + ".snd")
        with open(out, "wb") as fh:
            fh.write(struct.pack("<%dh" % len(data), *data))
        print("%-5s %5.2f s  %6d bytes" % (name, len(data) / RATE, len(data) * 2))


if __name__ == "__main__":
    main()
