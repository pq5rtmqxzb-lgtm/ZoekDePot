"""Collision + room data for the web viewer (plain Python, no Blender).

    python v2/blender/export_collision.py      # -> v2/build/collision.json

Walls are 2D capsules (segment + radius) in the model.json frame, furniture
is 2D boxes (centre, size, rotation), rooms are the floor rects/polys (for
"which room am I in"). Same sources and footprints as check_furniture.py,
so the viewer collides with exactly what the checks verify.

Walls: every solid segment except door openings; a schuifpui collides only
on its fixed half (the open half is the way out, as in v1); side lights,
railings, privacy screens and the corridor walls collide; the shower glass
and the kitchen (tall cabinet wall + island) are added as boxes/segments.
"""
import json
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from check_furniture import as_footprint  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "v2" / "build" / "collision.json"
CORRIDOR_WALLS = [
    (-1.96, 6.30, -1.96, 12.40, 0.20), (-2.06, 6.30, 0.38, 6.30, 0.20), (-2.06, 12.40, 0.07, 12.40, 0.24),
]
NO_COLLIDE = {"rug", "curtains", "pendant", "downlight", "kitchen_d", "techniek", "walkin_shower"}


def main():
    model = json.loads((ROOT / "data" / "model.json").read_text())
    items = json.loads((ROOT / "v2" / "data" / "furniture.json").read_text())["items"]
    walls = []
    for g in model["geom"]:
        k, t = g["kind"], g.get("t", 0.20)
        if k == "door":
            continue
        x1, z1, x2, z2 = g["x1"], g["z1"], g["x2"], g["z2"]
        if k == "sliding":                       # only the fixed half collides
            f0, f1 = (0.0, 0.5) if g.get("slide") == "x1" else (0.5, 1.0)
            x1, z1, x2, z2 = x1 + (g["x2"] - g["x1"]) * f0, z1 + (g["z2"] - g["z1"]) * f0, \
                x1 + (g["x2"] - g["x1"]) * f1, z1 + (g["z2"] - g["z1"]) * f1
            t = 0.06
        elif k in ("railing", "screen"):
            t = 0.05
        walls.append({"x1": x1, "z1": z1, "x2": x2, "z2": z2, "r": t / 2, "kind": k})
    for x1, z1, x2, z2, t in CORRIDOR_WALLS:
        walls.append({"x1": x1, "z1": z1, "x2": x2, "z2": z2, "r": t / 2, "kind": "wall"})

    boxes = []
    for it in items:
        if it["type"] in NO_COLLIDE:
            if it["type"] == "walkin_shower":   # the glass screen is a wall
                sx, sz0, sz1 = it["screen"]
                walls.append({"x1": sx, "z1": sz0, "x2": sx, "z2": sz1, "r": 0.01, "kind": "glass"})
            if it["type"] == "kitchen_d":       # tall cabinet wall + island (see furniture.kitchen_d)
                boxes.append({"id": "kitchen_tall", "x": 5.6935, "z": 9.95, "w": 2.587, "d": 0.62, "rot": 0})
                boxes.append({"id": "kitchen_island", "x": 5.91, "z": 12.545, "w": 1.02, "d": 2.594, "rot": 0})
            continue
        box, fp = as_footprint(it)
        if fp is None:
            continue
        w, d, oz = fp(box)
        ry = math.radians(box.get("rot", 0))
        # centre of the footprint (its local z offset rotated into the plan)
        cx, cz = box["x"] + math.sin(ry) * oz, box["z"] + math.cos(ry) * oz
        boxes.append({"id": it["id"], "x": round(cx, 4), "z": round(cz, 4), "w": w, "d": d,
                      "rot": box.get("rot", 0)})
    rooms = [{"id": r["id"], "name": r["name"], "rects": r["rects"], "polys": r.get("polys", [])}
             for r in model["rooms"]]
    out = {"version": 1, "frame": "model.json: x east, z south, metres", "walls": walls, "boxes": boxes,
           "rooms": rooms, "spawn": {"x": 1.35, "z": 8.70, "yaw": -90}}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1))
    print(f"collision: {len(walls)} wall capsules, {len(boxes)} boxes, {len(rooms)} rooms -> "
          f"{OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
