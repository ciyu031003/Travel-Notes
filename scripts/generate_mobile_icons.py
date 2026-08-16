#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate Android launcher icons for 甜途 from a source PNG."""
import os
from PIL import Image

SRC = r"D:/Desktop/ico.png"
RES_DIR = r"F:/CodeFiles/Travel-Notes/android/app/src/main/res"

# 1. Load and center-crop to square.
im = Image.open(SRC).convert("RGBA")
w, h = im.size
side = min(w, h)
left = (w - side) // 2
top = (h - side) // 2
square = im.crop((left, top, left + side, top + side))

# 2. Legacy square icons (launcher will apply its own mask).
legacy_sizes = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

for density, size in legacy_sizes.items():
    out = square.resize((size, size), Image.LANCZOS)
    d = os.path.join(RES_DIR, f"mipmap-{density}")
    os.makedirs(d, exist_ok=True)
    out.save(os.path.join(d, "ic_launcher.png"), "PNG")
    out.save(os.path.join(d, "ic_launcher_round.png"), "PNG")

# 3. Adaptive foreground icons (full 108dp canvas, content in 66dp safe zone).
adaptive_canvas = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

for density, canvas in adaptive_canvas.items():
    safe = int(round(canvas * 66 / 108))
    fg = square.resize((safe, safe), Image.LANCZOS)
    canvas_img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    offset = (canvas - safe) // 2
    canvas_img.paste(fg, (offset, offset))
    d = os.path.join(RES_DIR, f"mipmap-{density}")
    os.makedirs(d, exist_ok=True)
    canvas_img.save(os.path.join(d, "ic_launcher_foreground.png"), "PNG")

print("Icons generated OK")
