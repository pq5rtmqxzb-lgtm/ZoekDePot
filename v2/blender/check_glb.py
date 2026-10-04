"""Verify the exported shell against data/model.json (and so, transitively,
against the PDF — tools/compare-to-pdf.py keeps model.json within 0.12 m).

    python v2/blender/check_glb.py [path/to/shell.glb]

Imports the .glb fresh (so the glTF axis conversion is part of the test) and
checks, in the model frame:
  1. every wall face: points along both faces of each solid wall segment, at
     1.2 m height, lie on the exported wall surface (within 1 cm);
  2. every opening is really open at 1.0 m and has its lintel at the right
     height (door 2.36 m, schuifpui 2.58 m);
  3. every room has a floor and a ceiling, and the model sits where v1 does.
It also writes v2/docs/plan-section.png: a cut through the exported walls at
1.2 m drawn over the sales drawing (red = glb section).
Exits non-zero when a check fails.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

from common import (  # noqa: E402
    BUILD_DIR, CORRIDOR_WALLS, DOOR_H, JAMB, ROOT, SLIDE_HEAD, SLIDE_TOP, SOLID_KINDS, WALL_THICK,
    P, load_model, reset_scene, script_args, seg_frame, seg_local, seg_point,
)

TOL = 0.01
PDF_PNG = ROOT / "floorplan" / "floorplan-pdf.png"
OUT_PNG = ROOT / "v2" / "docs" / "plan-section.png"
# world (m) -> floorplan-pdf.png pixel; calibration from tools/pdf-overlay.py
BX, AX, BZ, AZ = 113.4, 306.0, 113.4, 347.0


def bvh_of(objs):
    bm = bmesh.new()
    for ob in objs:
        me = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        tmp = bmesh.new()
        tmp.from_mesh(me)
        tmp.transform(ob.matrix_world)
        me2 = bpy.data.meshes.new("_t")
        tmp.to_mesh(me2)
        tmp.free()
        bm.from_mesh(me2)
        bpy.data.meshes.remove(me2)
    bm.faces.ensure_lookup_table()
    return BVHTree.FromBMesh(bm), bm


def inside_other(segs, g, px, pz):
    for h in segs:
        if h is g:
            continue
        a, o = seg_local(h, px, pz)
        _, _, _, L = seg_frame(h)
        if -0.01 < a < L + 0.01 and abs(o) < h.get("t", WALL_THICK) / 2 + 0.005:
            return True
    return False


def main():
    args = script_args()
    glb = args[0] if args else str(BUILD_DIR / "shell.glb")
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=glb)
    model = load_model()
    objs = {o.name: o for o in bpy.data.objects if o.type == "MESH"}
    walls = [o for n, o in objs.items() if n.startswith(("wall.", "facade."))]
    tree, wbm = bvh_of(walls)
    fails = []

    # 1. wall faces
    solid = [g for g in model["geom"] if g["kind"] in SOLID_KINDS] + CORRIDOR_WALLS
    worst, n = 0.0, 0
    for g in solid:
        if g["kind"] != "wall":
            continue
        _, _, _, L = seg_frame(g)
        t = g.get("t", WALL_THICK)
        steps = max(1, int((L - 0.2) / 0.25))
        for i in range(steps + 1):
            a = 0.1 + (L - 0.2) * i / steps if L > 0.2 else L / 2
            for s in (1, -1):
                px, pz = seg_point(g, a, s * t / 2)
                q = seg_point(g, a, s * (t / 2 + 0.02))
                if inside_other(solid, g, *q):
                    continue                       # face buried in a junction
                hit = tree.find_nearest(Vector(P(px, 1.2, pz)))
                d = hit[3] if hit[0] is not None else 99
                n += 1
                worst = max(worst, d)
                if d > TOL:
                    fails.append(f"wall #{g.get('index')} face {'+' if s > 0 else '-'} at a={a:.2f}: off by {d:.3f} m")
    print(f"[1] wall faces: {n} points, worst {worst * 1000:.1f} mm")

    # 2. openings
    for g in model["geom"]:
        k = g["kind"]
        if k not in ("door", "sidelight", "sliding"):
            continue
        _, _, _, L = seg_frame(g)
        cx, cz = seg_point(g, L / 2, 0.0)
        _, u, _, _ = seg_frame(g)
        need = L / 2 + (JAMB if k == "door" else 0.0) - 0.005
        for sgn in (1, -1):                        # along the opening, both ways
            loc, *_ = tree.ray_cast(Vector(P(cx, 1.0, cz)), Vector(P(sgn * u[0], 0.0, sgn * u[1])))
            clear = (loc - Vector(P(cx, 1.0, cz))).length if loc is not None else 99
            if clear < need:
                fails.append(f"{k} #{g['index']} not open: wall {clear:.3f} m from centre, need {need:.3f}")
        top = (DOOR_H + JAMB) if k in ("door", "sidelight") else (SLIDE_TOP + SLIDE_HEAD)
        loc, *_ = tree.ray_cast(Vector(P(cx, 1.0, cz)), Vector((0, 0, 1)))
        if loc is None or abs(loc.z - top) > TOL:
            fails.append(f"{k} #{g['index']} lintel at {None if loc is None else round(loc.z, 3)}, expected {top:.3f}")
    print(f"[2] openings checked: {sum(1 for g in model['geom'] if g['kind'] in ('door', 'sidelight', 'sliding'))}")

    # 3. rooms + placement
    for r in model["rooms"]:
        for pre in ("floor.", "ceil."):
            if pre + r["id"] not in objs:
                fails.append(f"missing {pre}{r['id']}")
    xs = [v.co.x for v in wbm.verts]
    zs = [-v.co.y for v in wbm.verts]
    bbox = (min(xs), max(xs), min(zs), max(zs))
    print(f"[3] wall bbox (model frame) x {bbox[0]:.2f}..{bbox[1]:.2f}  z {bbox[2]:.2f}..{bbox[3]:.2f}")
    if not (-2.3 < bbox[0] < -1.9 and 10.6 < bbox[1] < 11.1 and -0.5 < bbox[2] < 0.0 and 15.6 < bbox[3] < 16.1):
        fails.append(f"wall bounding box {bbox} is not where v1 puts the apartment")

    write_section(wbm)
    wbm.free()

    if fails:
        print(f"FAIL ({len(fails)})")
        for f in fails[:40]:
            print("  -", f)
        sys.exit(1)
    print("OK — glb matches model.json")


def write_section(bm):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("[section] Pillow not installed — skipping plan-section.png")
        return
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 1.2), plane_no=(0, 0, 1))
    cut = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    img = Image.open(PDF_PNG).convert("RGB")
    img = Image.blend(img, Image.new("RGB", img.size, "white"), 0.35)
    d = ImageDraw.Draw(img)
    for e in cut:
        (a, b) = e.verts
        p = [(AX + BX * v.co.x, AZ + BZ * -v.co.y) for v in (a, b)]
        d.line(p, fill=(220, 0, 0), width=3)
    img = img.crop((40, 150, 1600, 2420))   # x -2.4..11.4 m, z -1.7..18.3 m
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT_PNG, optimize=True)
    print(f"[section] {len(cut)} cut edges -> {OUT_PNG.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
