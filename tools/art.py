#!/usr/bin/env python3
"""Makes Split's pictures: icons, avatars, badges and animations.

  src/images/icon_<name>.png     16x16 icons on the left of a screen, in the style of the bar's clock and weather
  src/images/avatar_<n>.png      14x14 round avatars, one per person colour (and "x" for someone no longer listed);
                                 the initials are drawn on top as text
  src/animations/added           an expense logged: an amber badge over the whole front display, a light sweep (once)
  src/animations/paid            a debt paid back: the same in green
  src/animations/undone          an entry taken out or the tab cleared: the same in slate
  src/animations/flow            money on its way: gold chevrons running right, 32x5, transparent (loops)
  src/animations/settled         the settled tab: the check coin, a sparkle twinkling round it, 16x16 (loops)

The .anim container is the firmware's "bicycle1", encoded as Rally's and Game Timer's tools/art.py do: a header, one
section ("default", every frame), then every frame whole, run-length coded in pixel-sized blocks when that is shorter.
Pixels are BGR888, or BGRA8888 for the transparent ones.

    python3 tools/art.py                   # write everything
    python3 tools/art.py --preview out     # also out-<name>.png, every frame enlarged
"""

import math
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANIM = ROOT / "src" / "animations"
IMAGES = ROOT / "src" / "images"

W, H = 72, 16
RGBA = tuple[int, int, int, int]
Frame = list[list[RGBA]]
CLEAR: RGBA = (0, 0, 0, 0)
BLACK: RGBA = (0, 0, 0, 255)

# Must match PERSON in src/view.ts.
PERSON = [
    "#FF7A5C", "#4FC3F7", "#FFD54F", "#81E07F", "#C38BFF", "#FF8FC8", "#4DD8C4", "#FFA94D",
    "#FF4D6D", "#6E8BFF", "#C8EB5A", "#E46BFF", "#D4A373", "#FFE7A8", "#A0E8FF", "#7FD9A0",
]
FORMER = "#8A8A8A"


def rgb(value: str, a: int = 255) -> RGBA:
    return (int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16), a)


def mix(a: RGBA, b: RGBA, f: float) -> RGBA:
    f = max(0.0, min(1.0, f))
    return tuple(round(x + (y - x) * f) for x, y in zip(a, b))  # type: ignore[return-value]


def blank(w: int, h: int, fill: RGBA = CLEAR) -> Frame:
    return [[fill] * w for _ in range(h)]


def put(f: Frame, x: int, y: int, c: RGBA) -> None:
    if 0 <= y < len(f) and 0 <= x < len(f[0]):
        f[y][x] = c


def grid(f: Frame, rows: list[str], pal: dict[str, str], x0: int = 0, y0: int = 0) -> Frame:
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in pal:
                put(f, x0 + x, y0 + y, rgb(pal[ch]))
    return f


# ---- containers
# ---- containers

HEADER = "<8sBBBBHHBBIIII"
SECTION = "<III"
FRAME = "<BHH"
MASK_FULLY_WHITE = 1
PIXELS_RAW, PIXELS_RLE = 0, 1
BGR888, BGRA8888 = 0, 2


def rle(data: bytes, block: int) -> bytes:
    """Runs of 3+ equal blocks as (count, block), everything else as (0x80 | count, blocks...); counts up to 127."""
    blocks = [data[i:i + block] for i in range(0, len(data), block)]
    out = bytearray()
    i = 0
    while i < len(blocks):
        run = 1
        while i + run < len(blocks) and run < 127 and blocks[i + run] == blocks[i]:
            run += 1
        if run >= 3:
            out.append(run)
            out += blocks[i]
            i += run
            continue
        start = i
        while i < len(blocks) and i - start < 127:
            ahead = 1
            while i + ahead < len(blocks) and ahead < 3 and blocks[i + ahead] == blocks[i]:
                ahead += 1
            if ahead >= 3:
                break
            i += 1
        out.append(0x80 | (i - start))
        for b in blocks[start:i]:
            out += b
    return bytes(out)


def encode(frames: list[Frame], fps: int, alpha: bool) -> bytes:
    w, h = len(frames[0][0]), len(frames[0])
    block = 4 if alpha else 3
    encoded = []
    for frame in frames:
        if alpha:
            raw = bytes(v for row in frame for (r, g, b, a) in row for v in (b, g, r, a))
        else:
            raw = bytes(v for row in frame for (r, g, b, _a) in row for v in (b, g, r))
        packed = rle(raw, block)
        encoded.append((PIXELS_RLE, packed) if len(packed) < len(raw) else (PIXELS_RAW, raw))
    name = b"default\0"
    sections_len = struct.calcsize(SECTION) + len(name)
    frames_len = sum(struct.calcsize(FRAME) + len(d) for _, d in encoded)
    max_len = max(len(d) for _, d in encoded)
    header = struct.pack(HEADER, b"bicycle1", 0, w, h, BGRA8888 if alpha else BGR888, 0, max_len, fps, 0,
                         sections_len, frames_len, 1, len(encoded))
    out = bytearray(header)
    out += struct.pack(SECTION, 0, len(frames) - 1, len(header) + sections_len) + name
    for enc, data in encoded:
        out += struct.pack(FRAME, enc | (MASK_FULLY_WHITE << 4), 0, len(data)) + data
    return bytes(out)


def png_bytes(frames: list[Frame], scale: int = 1, gap: int = 0) -> bytes:
    """RGBA PNG; several frames one under another, enlarged, for previews."""
    width = len(frames[0][0]) * scale
    rows = []
    for frame in frames:
        for row in frame:
            line = bytes(v for px in row for _ in range(scale) for v in px)
            rows += [line] * scale
        rows += [bytes((60, 0, 60, 255)) * width] * gap
    raw = b"".join(b"\0" + row for row in rows)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, len(rows), 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def on_black(frames: list[Frame]) -> list[Frame]:
    """For previews: transparent pixels shown over black."""
    return [[[mix((0, 0, 0, 255), (r, g, b, 255), a / 255) for (r, g, b, a) in row] for row in f] for f in frames]



# ---- round things: avatars and coins, shaded from the top left

def disc(f: Frame, cx: float, cy: float, r: float, base: RGBA, rim: RGBA | None = None) -> None:
    for y in range(len(f)):
        for x in range(len(f[0])):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(dx, dy)
            if d > r:
                continue
            # Light from the top left: up to 30% lighter there, 30% darker at the bottom right.
            k = (-(dx + dy) / (2 * r))
            c = mix(base, (255, 255, 255, 255), k * 0.6) if k > 0 else mix(base, BLACK, -k * 0.6)
            if rim and d > r - 1:
                c = rim
            f[y][x] = c


def avatar(colour: str) -> Frame:
    f = blank(14, 14)
    base = rgb(colour)
    disc(f, 7, 7, 7, base, mix(base, BLACK, 0.45))
    return f


def check_coin(f: Frame, x0: int = 0, y0: int = 0) -> None:
    g = blank(16, 16)
    disc(g, 8, 8, 7.6, rgb("#2FBF5F"), rgb("#0E5A28"))
    grid(g, [
        "............",
        "..........w.",
        ".........ww.",
        "........ww..",
        ".w.....ww...",
        ".ww...ww....",
        "..ww.ww.....",
        "...www......",
        "....w.......",
    ], {"w": "#FFFFFF"}, 2, 3)
    for y in range(16):
        for x in range(16):
            if g[y][x][3]:
                put(f, x0 + x, y0 + y, g[y][x])


# ---- icons, 16x16

def icon_receipt() -> Frame:
    return grid(blank(16, 16), [
        "................",
        "..pppppppppppp..",
        "..pppppppppppd..",
        "..pllllllllppd..",
        "..pppppppppppd..",
        "..plllllpppppd..",
        "..pppppppppppd..",
        "..pllllllllppd..",
        "..pppppppppppd..",
        "..pppppaaaaapd..",
        "..pppppaaaaapd..",
        "..pppppppppppd..",
        "..pppppppppppd..",
        "..pp.ppp.ppp.p..",
        "..p...p...p.....",
        "................",
    ], {"p": "#F2EEE4", "d": "#B9B2A3", "l": "#7A7466", "a": "#FFB020"})


def icon_history() -> Frame:
    f = grid(blank(16, 16), [
        "................",
        ".....dddddddddd.",
        ".....dqqqqqqqqd.",
        "..pppppppppppqd.",
        "..pppppppppppqd.",
        "..pllllllllppqd.",
        "..pppppppppppqd.",
        "..plllllllpppqd.",
        "..pppppppppppqd.",
        "..pllllllllppqd.",
        "..pppppppppppd..",
        "..plllllppppp...",
        "..ppppppppppp...",
        "..ppppppppppp...",
        "................",
        "................",
    ], {"p": "#F2EEE4", "q": "#A8A294", "d": "#6A6458", "l": "#7A7466"})
    return f


def icon_payment() -> Frame:
    f = blank(16, 16)
    gold, edge = rgb("#FFC83A"), rgb("#9A6A08")
    # A stack of three coins seen from the side, and one face on.
    for i, y in enumerate((12, 9, 6)):
        for x in range(1, 11):
            put(f, x, y, gold if 1 < x < 10 else edge)
            put(f, x, y + 1, edge)
        put(f, 3 + i, y, rgb("#FFF0A0"))
    g = blank(16, 16)
    disc(g, 11, 6, 4.6, gold, edge)
    put(g, 11, 4, rgb("#9A6A08"))
    put(g, 11, 5, rgb("#9A6A08"))
    put(g, 11, 6, rgb("#9A6A08"))
    put(g, 11, 7, rgb("#9A6A08"))
    for y in range(16):
        for x in range(16):
            if g[y][x][3]:
                f[y][x] = g[y][x]
    # A green arrow: handed over.
    grid(f, ["...g.", "ggggg", "...g."], {"g": "#4CD964"}, 11, 12)
    put(f, 14, 12, rgb("#4CD964"))
    put(f, 14, 14, rgb("#4CD964"))
    return f


def icon_undo() -> Frame:
    # An arrow going back: a thick arc over the top, its head pointing down on the left.
    return grid(blank(16, 16), [
        "................",
        "................",
        "......aaaaa.....",
        "....aaaaaaaaa...",
        "...aaa.....aaa..",
        "..aaa.......aa..",
        "..aa........aaa.",
        "aaaaaa.......aa.",
        ".aaaa........aa.",
        "..aa........aaa.",
        "...........aaa..",
        ".........aaaa...",
        "......aaaaaa....",
        "......aaaa......",
        "................",
        "................",
    ], {"a": "#FFB020"})


def icon_trash() -> Frame:
    return grid(blank(16, 16), [
        "................",
        "......rrrr......",
        "..rrrrrrrrrrrr..",
        "..dddddddddddd..",
        "................",
        "...rrrrrrrrrr...",
        "...rdrrdrrdrd...",
        "...rdrrdrrdrd...",
        "...rdrrdrrdrd...",
        "...rdrrdrrdrd...",
        "...rdrrdrrdrd...",
        "...rdrrdrrdrd...",
        "...rdrrdrrdrd...",
        "...rrrrrrrrrd...",
        "....dddddddd....",
        "................",
    ], {"r": "#FF5A4A", "d": "#9A2A20"})


def icon_settle() -> Frame:
    f = blank(16, 16)
    check_coin(f)
    return f


# ---- badges: the full front display, rounded, glossy, as the bar's own status themes (Rally's)

def badge(top: str, bottom: str, edge: str, high: str, level: float = 1.0) -> Frame:
    t, b, e, hi = rgb(top), rgb(bottom), rgb(edge), rgb(high)
    f = blank(W, H, BLACK)
    for y in range(H):
        for x in range(W):
            cx, cy = min(x, W - 1 - x), min(y, H - 1 - y)
            if cx + cy < 2:
                continue
            if cx == 0 or cy == 0 or (cx == 1 and cy == 1):
                f[y][x] = mix(BLACK, e, level)
            elif y == 1:
                f[y][x] = mix(BLACK, hi, level * 0.8)
            else:
                f[y][x] = mix(BLACK, mix(t, b, (y - 2) / (H - 4)), level)
    return f


def sweep(f: Frame, centre: float, strength: float = 0.45) -> Frame:
    g = [row[:] for row in f]
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            d = abs((x - centre) + (y - H / 2) * 0.6)
            k = max(0.0, 1 - d / 4) * strength
            if k > 0 and g[y][x] != BLACK:
                g[y][x] = mix(g[y][x], (255, 255, 255, 255), k)
    return g


BADGES = {
    "added": ("#E08A10", "#6A3204", "#2A1200", "#FFD080"),
    "paid": ("#1FA85A", "#0A4A24", "#04230F", "#8CF0B4"),
    "undone": ("#4A5468", "#1A1E28", "#0A0C12", "#9AA6C0"),
}


def badge_frames(colours) -> list[Frame]:
    frames = [badge(*colours, level=(i + 1) / 3) for i in range(3)]
    base = badge(*colours)
    frames += [sweep(base, -8 + i * 7) for i in range(14)]
    frames.append(base)
    return frames


# ---- flow: chevrons running right, brightest in the middle, fading at both ends

def flow_frames() -> list[Frame]:
    w, h, period = 32, 5, 8
    frames = []
    for i in range(period):
        f = blank(w, h)
        for x in range(w):
            fade = min(1.0, x / 6, (w - 1 - x) / 6)
            for y in range(h):
                arm = abs(y - 2)
                if (x - i - (2 - arm)) % period in (0, 1):
                    put(f, x, y, rgb("#FFC83A", round(255 * max(0.0, fade))))
        frames.append(f)
    return frames


# ---- settled: the check coin and a sparkle going round it

SPARKS = [(14, 1), (1, 12), (14, 13), (2, 2)]


def settled_frames() -> list[Frame]:
    frames = []
    n = 16
    for i in range(n):
        f = blank(16, 16)
        check_coin(f)
        # One sparkle at a time, growing and shrinking over four frames.
        sx, sy = SPARKS[(i // 4) % len(SPARKS)]
        size = (0, 1, 2, 1)[i % 4]
        white = rgb("#FFFFFF")
        if size:
            put(f, sx, sy, white)
            for d in range(1, size + 1):
                for px, py in ((sx + d, sy), (sx - d, sy), (sx, sy + d), (sx, sy - d)):
                    put(f, px, py, rgb("#FFF6C0", 255 if d == 1 else 150))
        frames.append(f)
    return frames


def main() -> None:
    preview = None
    if "--preview" in sys.argv:
        preview = Path(sys.argv[sys.argv.index("--preview") + 1])
    ANIM.mkdir(parents=True, exist_ok=True)
    IMAGES.mkdir(parents=True, exist_ok=True)

    images = {
        "icon_receipt": icon_receipt(), "icon_history": icon_history(), "icon_payment": icon_payment(),
        "icon_undo": icon_undo(), "icon_trash": icon_trash(), "icon_settle": icon_settle(),
    }
    for i, colour in enumerate(PERSON):
        images[f"avatar_{i}"] = avatar(colour)
    images["avatar_x"] = avatar(FORMER)
    for name, f in images.items():
        (IMAGES / f"{name}.png").write_bytes(png_bytes([f]))
        if preview:
            Path(f"{preview}-{name}.png").write_bytes(png_bytes(on_black([f]), 10))

    animations = [(name, badge_frames(c), 16, False) for name, c in BADGES.items()]
    animations += [("flow", flow_frames(), 12, True), ("settled", settled_frames(), 8, True)]
    for name, frames, fps, alpha in animations:
        data = encode(frames, fps, alpha)
        (ANIM / f"{name}.anim").write_bytes(data)
        print(f"{name}.anim  {len(frames)} frames  {len(data)} bytes")
        if preview:
            Path(f"{preview}-{name}.png").write_bytes(png_bytes(on_black(frames) if alpha else frames, 8, 2))


if __name__ == "__main__":
    main()
