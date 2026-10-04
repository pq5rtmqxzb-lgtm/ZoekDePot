"""Top view of the furniture layout on the PDF floor plan, every piece
outlined and labelled with its id from v2/data/furniture.json, so a layout
change can be pointed at ("move `sofa` 50 cm north").

    python v2/blender/furniture_plan.py      # -> v2/docs/furniture-plan.png

Needs Pillow only (no Blender).
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from check_furniture import as_footprint

ROOT = Path(__file__).resolve().parents[2]
PX, X0, Z0 = 113.4, 306, 347            # floorplan-pdf.png: col = X0 + PX x, row = Z0 + PX z
CROP = (40, 150, 1600, 2420)
# the kitchen is one item ("kitchen_d"); draw its two blocks (as export_collision.py)
KITCHEN = [("kitchen: kastenwand", 5.6935, 9.95, 2.587, 0.62), ("kitchen: eiland", 5.91, 12.545, 1.02, 2.594)]


def px(x, z):
    return X0 + PX * x - CROP[0], Z0 + PX * z - CROP[1]


def main():
    img = Image.open(ROOT / "floorplan" / "floorplan-pdf.png").convert("RGB").crop(CROP)
    img = Image.blend(img, Image.new("RGB", img.size, "white"), 0.45)
    draw = ImageDraw.Draw(img, "RGBA")
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 15)
    except OSError:
        font = ImageFont.load_default()
    items = json.loads((ROOT / "v2" / "data" / "furniture.json").read_text())["items"]
    boxes = [(name, x, z, w, d, 0.0, 0.0, True) for name, x, z, w, d in KITCHEN]
    for it in items:
        it2, fp = as_footprint(it)
        if fp is None:
            continue
        w, d, oz0 = fp(it2)
        boxes.append((it["id"], it2["x"], it2["z"], w, d, oz0, it2.get("rot", 0), it.get("own", False)))
    labels = []
    for name, x, z, w, d, oz0, rot, own in boxes:
        ry = math.radians(rot)
        c, s = math.cos(ry), math.sin(ry)
        pts = []
        for ox, oz in ((-w / 2, oz0 - d / 2), (w / 2, oz0 - d / 2), (w / 2, oz0 + d / 2), (-w / 2, oz0 + d / 2)):
            pts.append(px(x + c * ox + s * oz, z - s * ox + c * oz))
        colour = (190, 60, 40) if own else (40, 90, 170)
        draw.polygon(pts, fill=colour + (45,), outline=colour + (255,))
        # front edge (local +z) thicker: which way the piece faces
        draw.line([pts[2], pts[3]], fill=colour + (255,), width=4)
        labels.append((name, px(x + s * oz0, z + c * oz0), colour))
    for name, (cx, cy), colour in labels:
        l, t, r, b = draw.textbbox((0, 0), name, font=font)
        tx, ty = cx - (r - l) / 2, cy - (b - t) / 2
        draw.rectangle([tx - 3, ty - 2, tx + r - l + 3, ty + b - t + 4], fill=(255, 255, 255, 215))
        draw.text((tx, ty), name, fill=colour, font=font)
    # 1 m grid ticks along the edges, model metres (x east, z south)
    for m in range(0, 12):
        gx, _ = px(m, 0)
        draw.text((gx - 4, 4), str(m), fill=(80, 80, 80), font=font)
    for m in range(0, 18):
        _, gy = px(0, m)
        draw.text((4, gy - 8), str(m), fill=(80, 80, 80), font=font)
    out = ROOT / "v2" / "docs" / "furniture-plan.png"
    img.save(out, optimize=True)
    print(f"wrote {out.relative_to(ROOT)} ({len(boxes)} pieces)")


if __name__ == "__main__":
    main()
