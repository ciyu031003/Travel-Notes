# -*- coding: utf-8 -*-
"""压缩项目自带媒体图，生成 demo 专用素材（不修改原图）。"""
from pathlib import Path
from PIL import Image

SRC = Path(r"F:\CodeFiles\Travel-Notes\public\uploads\media")
DST = Path(r"F:\CodeFiles\Travel-Notes\ui-redesign-demo\assets")
IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 19, 23]
MAX_EDGE = 1000

DST.mkdir(parents=True, exist_ok=True)

for i in IDS:
    src = SRC / f"{i}.jpg"
    im = Image.open(src).convert("RGB")
    w, h = im.size
    scale = min(1.0, MAX_EDGE / max(w, h))
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    out = DST / f"{i}.jpg"
    im.save(out, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"{i}.jpg -> {im.size[0]}x{im.size[1]} {out.stat().st_size // 1024}KB")

print("done")
