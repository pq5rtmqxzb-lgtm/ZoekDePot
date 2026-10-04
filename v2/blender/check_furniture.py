"""Check v2/data/furniture.json against the walls of data/model.json.

    python v2/blender/check_furniture.py

Every piece with a footprint must stand clear of every wall, column, door
opening and sliding door, inside its own room, and clear of the other
pieces (rugs excepted; dining chairs count as part of their table).
Run it after editing furniture.json: a bigger sofa that no longer fits shows
up here with the wall it hits. Plain Python, no Blender needed.
"""
import json
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOLID = {"wall", "door", "sidelight", "sliding", "window"}

# type -> footprint (w, d, local z offset of its centre) from the item's size
FOOTPRINT = {
    "bed":          lambda it: (it.get("w", 1.4) + 0.12, it.get("d", 2.0) + 0.10, 0.0),
    "nightstand":   lambda it: (0.45, 0.40, 0.0),
    "wardrobe":     lambda it: (it.get("w", 1.6), it.get("d", 0.6), 0.0),
    "sofa":         lambda it: (it.get("w", 2.4), it.get("d", 0.95), 0.0),
    "armchair":     lambda it: (0.80, 0.80, 0.0),
    "coffee_table": lambda it: (it.get("w", 1.2), it.get("d", 0.6), 0.0),
    "dining_table": lambda it: (it.get("w", 1.0) + 2 * 0.40, it.get("d", 2.6), 0.0),   # incl. chairs
    "desk":         lambda it: (it.get("w", 1.2), it.get("d", 0.6), 0.0),
    "dresser":      lambda it: (it.get("w", 1.2), it.get("d", 0.45), 0.0),
    "bookshelf":    lambda it: (it.get("w", 1.8), it.get("d", 0.32), 0.0),
    "tv_unit":      lambda it: (it.get("w", 1.8), 0.42, 0.0),
    "side_table":   lambda it: (0.50, 0.50, 0.0),
    "bar_stool":    lambda it: (0.36, 0.36, 0.0),
    "floor_lamp":   lambda it: (0.30, 0.30, 0.0),
    "plant":        lambda it: (0.30, 0.30, 0.0),
    "bath":         lambda it: (it.get("w", 1.8), it.get("d", 0.72), 0.0),
    "chair":        lambda it: (0.44, 0.44, 0.0),
    "bistro_table": lambda it: (0.56, 0.56, 0.0),
    "planter":      lambda it: (it.get("w", 1.6), it.get("d", 0.28), 0.0),
    "wall_toilet":  lambda it: (0.40, 0.62, 0.01),
    "vanity":       lambda it: (it.get("w", 1.0), 0.48, 0.0),
    "radiator":     lambda it: (it.get("w", 0.5), 0.10, 0.0),
}
# built-ins given as an axis-aligned box x1..x2, z1..z2
AXIS_BOXES = {"voorzetwand", "tiled_bench", "niche_wall"}


def as_footprint(it):
    """(item with x, z, rot, footprint fn) for any piece with a footprint."""
    if it["type"] in AXIS_BOXES:
        w, d = it["x2"] - it["x1"], it["z2"] - it["z1"]
        box = dict(it, x=(it["x1"] + it["x2"]) / 2, z=(it["z1"] + it["z2"]) / 2, rot=0)
        return box, (lambda _it, w=w, d=d: (w, d, 0.0))
    return it, FOOTPRINT.get(it["type"])


def main():
    from geom2d import room_at, seg_local
    model = json.loads((ROOT / "data" / "model.json").read_text())
    rooms = model["rooms"]
    for r in rooms:
        r.setdefault("polys", [])
    walls = [g for g in model["geom"] if g["kind"] in SOLID or g["kind"] in ("railing", "screen")]
    items = json.loads((ROOT / "v2" / "data" / "furniture.json").read_text())["items"]
    ids = [it["id"] for it in items]
    problems = [f"duplicate id {i!r}" for i in set(ids) if ids.count(i) > 1]
    checked = 0
    for it in items:
        it, fp = as_footprint(it)
        if fp is None:
            continue
        checked += 1
        w, d, oz0 = fp(it)
        ry = math.radians(it.get("rot", 0))
        c, s = math.cos(ry), math.sin(ry)
        hits, outside = set(), 0
        n = 8
        for i in range(n + 1):
            for j in range(n + 1):
                ox = -w / 2 + 0.01 + (w - 0.02) * i / n
                oz = oz0 - d / 2 + 0.01 + (d - 0.02) * j / n
                px, pz = it["x"] + c * ox + s * oz, it["z"] - s * ox + c * oz
                for g in walls:
                    a, o = seg_local(g, px, pz)
                    L = math.hypot(g["x2"] - g["x1"], g["z2"] - g["z1"])
                    t = g.get("t", 0.20 if g["kind"] in SOLID else 0.05)
                    if 0 <= a <= L and abs(o) < t / 2:
                        hits.add(f"{g['kind']} #{model['geom'].index(g)}")
                # model.json room outlines stop a few cm short of the walls
                # (and leave thin strips between a room's rects): accept a
                # point whose room is within 6 cm
                near = [room_at(rooms, px + ex, pz + ez)
                        for ex, ez in ((0, 0), (0.06, 0), (-0.06, 0), (0, 0.06), (0, -0.06))]
                if not any(r is not None and r["id"] == it.get("room") for r in near):
                    outside += 1
        if hits:
            problems.append(f"{it['id']} ({it['type']}) overlaps {', '.join(sorted(hits))}")
        if outside > (n + 1) ** 2 * 0.05:
            problems.append(f"{it['id']} ({it['type']}): {outside} of {(n + 1) ** 2} footprint points "
                            f"are outside room {it.get('room')!r}")
    # furniture against furniture: sample each footprint inside every other one
    rects = []
    for it in items:
        it, fp = as_footprint(it)
        if fp:
            w, d, oz0 = fp(it)
            rects.append((it, w, d, oz0, math.radians(it.get("rot", 0))))

    def local(rect, px, pz):
        it, w, d, oz0, ry = rect
        dx, dz = px - it["x"], pz - it["z"]
        c, s = math.cos(ry), math.sin(ry)
        return c * dx - s * dz, s * dx + c * dz - oz0      # inverse of the item rotation

    for i, A in enumerate(rects):
        itA, wA, dA, ozA, ryA = A
        c, s = math.cos(ryA), math.sin(ryA)
        pts = [(itA["x"] + c * ox + s * oz, itA["z"] - s * ox + c * oz)
               for ox in (-wA / 2 + 0.02, 0, wA / 2 - 0.02) for oz in (ozA - dA / 2 + 0.02, ozA, ozA + dA / 2 - 0.02)]
        for B in rects[i + 1:]:
            itB, wB, dB = B[0], B[1], B[2]
            if any(abs(lx) < wB / 2 and abs(lz) < dB / 2 for lx, lz in (local(B, *p) for p in pts)) or \
               any(abs(lx) < wA / 2 and abs(lz) < dA / 2 for lx, lz in
                   (local(A, *q) for q in [(itB["x"], itB["z"])])):
                problems.append(f"{itA['id']} and {itB['id']} overlap")
    print(f"checked {checked} footprints of {len(items)} items")
    if problems:
        print(f"FAIL ({len(problems)})")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("OK — all furniture clear of walls and inside its room")


if __name__ == "__main__":
    main()
