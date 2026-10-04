"""Phase 1: generate the apartment shell from data/model.json.

    python v2/blender/build_shell.py            # with `pip install bpy` (Python 3.11)
    blender -b -P v2/blender/build_shell.py      # with a Blender 4.5 LTS install

Writes v2/build/shell.blend and v2/build/shell.glb.

What gets built
- Walls: every solid segment's footprint becomes one closed mass (exact
  boolean union, slab to slab) with REAL openings cut for doors, side lights
  and sliding doors. The mass is then split into one object per (room, wall
  segment) — `wall.<room>.<geom index>` — so the viewer can repaint a room or
  a single accent wall, and `facade.<geom index>` for the outside skin.
- Floors (`floor.<room>`) and ceilings (`ceil.<room>`) per room at the
  heights from the Technische Omschrijving, thresholds in every opening.
- Nestelkozijnen, the entrance frame, side light, hef-schuifpuien, balcony
  railings, privacy screens, the storeys above/below and a ground plane.
Everything is in the v1/model.json frame once exported (see common.P).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

from geom2d import seg_local  # noqa: E402
from common import (  # noqa: E402
    BALCONY_CEIL, BUILD_DIR, CEIL_LOW, CORRIDOR_WALLS, DOOR_H, FLOOR_MAT, JAMB, MASS_Y0, MASS_Y1,
    OUTSIDE, SLIDE_HEAD, SLIDE_TOP, SOLID_KINDS, WALL_HEIGHT, WALL_THICK, WET, MeshSet,
    ensure_collections, load_model, make_materials, outdoor_sign, reset_scene, room_at,
    seg_frame, seg_point, side_rooms, world_uv,
)

COLLS = ["walls", "floors", "ceilings", "frames", "glazing", "railings", "exterior"]


# ------------------------------------------------------------ wall mass

def corner_extensions(segs):
    """Two walls that meet at an angle with their centrelines ending in the
    same point leave a missing square at the outer corner. Extend each end
    that meets another segment's end at an angle by half that one's
    thickness so the union closes the corner."""
    ext = {}
    for g in segs:
        _, u, _, L = seg_frame(g)
        e = [0.0, 0.0]
        for end, (px, pz) in enumerate([(g["x1"], g["z1"]), (g["x2"], g["z2"])]):
            for h in segs:
                if h is g:
                    continue
                _, uh, _, _ = seg_frame(h)
                if abs(u[0] * uh[0] + u[1] * uh[1]) > 0.94:
                    continue
                for qx, qz in [(h["x1"], h["z1"]), (h["x2"], h["z2"])]:
                    if math.hypot(px - qx, pz - qz) < 0.03:
                        e[end] = max(e[end], h.get("t", WALL_THICK) / 2)
        ext[id(g)] = e
    return ext


def opening_cut(g):
    """(a0, a1, y0, y1) of the rough opening an element needs in the mass."""
    _, _, _, L = seg_frame(g)
    k = g["kind"]
    if k == "door":       # nestelkozijn: jambs sit beside the clear width
        return -JAMB, L + JAMB, 0.0, DOOR_H + JAMB
    if k == "sidelight":
        return 0.0, L, 0.0, DOOR_H + JAMB
    if k == "sliding":
        return 0.0, L, 0.0, SLIDE_TOP + SLIDE_HEAD
    if k == "window":
        return 0.0, L, 0.85, WALL_HEIGHT - 0.30
    return None


def build_mass(solid, colls, mats):
    """Exact boolean: union of all wall boxes minus all openings."""
    ext = corner_extensions(solid)
    tmp = bpy.data.collections.new("_tmp")
    bpy.context.scene.collection.children.link(tmp)
    cutters = bpy.data.collections.new("_cutters")
    bpy.context.scene.collection.children.link(cutters)

    def box_object(name, coll, g, a0, a1, o0, o1, y0, y1):
        ms = MeshSet(mats)
        ms.seg_box(name, "x", "plaster", g, a0, a1, o0, o1, y0, y1)
        return ms.build({"x": coll})[0]

    parts = []
    for g in solid:
        _, _, _, L = seg_frame(g)
        t = g.get("t", WALL_THICK)
        e0, e1 = ext[id(g)]
        parts.append(box_object(f"_m{g['index']}", tmp, g, -e0, L + e1, -t / 2, t / 2, MASS_Y0, MASS_Y1))
        cut = opening_cut(g)
        if cut:
            a0, a1, y0, y1 = cut
            box_object(f"_c{g['index']}", cutters, g, a0, a1, -t / 2 - 0.05, t / 2 + 0.05, y0, y1)

    base = parts[0]
    others = bpy.data.collections.new("_others")
    bpy.context.scene.collection.children.link(others)
    for ob in parts[1:]:
        tmp.objects.unlink(ob)
        others.objects.link(ob)
    m = base.modifiers.new("union", "BOOLEAN")
    m.operation, m.solver, m.operand_type, m.collection = "UNION", "EXACT", "COLLECTION", others
    m = base.modifiers.new("openings", "BOOLEAN")
    m.operation, m.solver, m.operand_type, m.collection = "DIFFERENCE", "EXACT", "COLLECTION", cutters
    m.use_self = True

    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(base.evaluated_get(dg))
    for c in (tmp, others, cutters):
        for ob in list(c.objects):
            bpy.data.objects.remove(ob)
        bpy.data.collections.remove(c)
    return me


def classify_mass(me, solid, model, colls, mats):
    """Split the boolean result into named wall objects per room/segment."""
    rooms = model["rooms"]
    room_ceil = {r["id"]: r["ceil"] for r in rooms}
    openings = [g for g in solid if opening_cut(g)]

    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    # Cut every face at the floor and both ceiling heights, so the parts of
    # room-side faces hidden under the floor / above a ceiling can be dropped
    # (they would only waste lightmap space).
    for h in (0.0, CEIL_LOW, WALL_HEIGHT):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, h), plane_no=(0, 0, 1))
    bm.faces.ensure_lookup_table()

    def in_opening(px, pz):
        for g in openings:
            a, o = seg_local(g, px, pz)
            a0, a1, _, _ = opening_cut(g)
            _, _, _, L = seg_frame(g)
            if a0 - 0.02 <= a <= a1 + 0.02 and abs(o) <= g.get("t", WALL_THICK) / 2 + 0.06:
                return g
        return None

    def best_segment(px, pz, nx, nz):
        best, berr = None, 0.03
        for g in solid:
            _, _, n, L = seg_frame(g)
            d = nx * n[0] + nz * n[1]
            if abs(d) < 0.95:
                continue
            a, o = seg_local(g, px, pz)
            if not (-0.25 <= a <= L + 0.25):
                continue
            err = abs(o - math.copysign(g.get("t", WALL_THICK) / 2, d))
            if err < berr:
                best, berr = g, err
        return best

    groups = {}
    drop = []
    for f in bm.faces:
        f.normal_update()
        c = f.calc_center_median()
        px, py, pz = c.x, c.z, -c.y                    # model coords
        nx, ny, nz = f.normal.x, f.normal.z, -f.normal.y
        if abs(ny) > 0.9:                              # horizontal face
            if py < MASS_Y0 + 0.01 or py > MASS_Y1 - 0.01 or (abs(py) < 0.002 and ny > 0):
                drop.append(f)                         # slab caps + sill under thresholds
                continue
            groups.setdefault(("reveal", None), []).append(f.index)
            continue
        r = room_at(rooms, px + nx * 0.10, pz + nz * 0.10)
        if r is None or r["id"] in ("balkon_n", "balkon_z"):
            if r is None and in_opening(px + nx * 0.10, pz + nz * 0.10):
                cls = "reveal"
            else:
                cls = "facade"
        else:
            cls = r["id"]
        if cls not in ("facade",):
            top = room_ceil.get(cls, CEIL_LOW)
            if py < 0.0 or (cls != "reveal" and py > top):
                drop.append(f)
                continue
        g = best_segment(px, pz, nx, nz) if cls != "reveal" else None
        groups.setdefault((cls, g["index"] if g else None), []).append(f.index)

    ms_objs = []
    for (cls, gi), idx in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1] if kv[0][1] is not None else -1)):
        keep = set(idx)
        b2 = bm.copy()
        b2.faces.ensure_lookup_table()
        bmesh.ops.delete(b2, geom=[f for f in b2.faces if f.index not in keep], context="FACES")
        bmesh.ops.delete(b2, geom=[v for v in b2.verts if not v.link_faces], context="VERTS")
        world_uv(b2)
        tag = "x" if gi is None else str(gi)
        if cls == "facade":
            name, mat, props = f"facade.{tag}", "cladding", {"part": "facade"}
        elif cls == "reveal":
            name, mat, props = "wall.reveal", "plaster", {"part": "reveal"}
        elif cls == "corridor":
            name, mat, props = f"wall.corridor.{tag}", "limewash", {"part": "wall", "room": "corridor"}
        else:
            name, mat, props = f"wall.{cls}.{tag}", "plaster", {"part": "wall", "room": cls}
            # Technische Omschrijving: badkamers tiled to the ceiling; in
            # the toilet only the wall behind the pan (east) is tiled.
            b2.faces.ensure_lookup_table()
            nx = sum(f.normal.x for f in b2.faces) / max(1, len(b2.faces))
            if cls in ("badkamer", "badkklein") or (cls == "toilet" and nx < -0.9):
                mat, props["finish"] = "wall_tile", "tile"
        if gi is not None and gi < 900:
            props["geom"] = gi
        me2 = bpy.data.meshes.new(name)
        b2.to_mesh(me2)
        b2.free()
        me2.materials.append(mats[mat])
        ob = bpy.data.objects.new(name, me2)
        for k, v in props.items():
            ob[k] = v
        colls["walls"].objects.link(ob)
        ms_objs.append(ob)
    bm.free()
    return ms_objs


# ------------------------------------------------------------ rooms

TUCK = 0.05          # m that indoor floors/ceilings reach under the walls (< half the thinnest wall)
TUCK_BALCONY = 0.015  # balconies: open sides end at the railing's slab edge
THRESHOLD_Y = 0.002   # threshold strips sit a hair above the floors that tuck under them


def room_outlines(rooms, r, grow):
    """One outline per room: the union of its rects + polys (merged in a
    bmesh: weld, split T-junctions, dissolve the shared edges), offset
    outward by up to `grow`. model.json rooms stop 1-4 cm short of the wall
    faces; left as is, sun leaks through that slit and the viewer shows a
    dark line. Growing the merged outline tucks floors and ceilings under
    the walls without overlapping pieces of the same room. Each edge grows
    only as far as it can without entering another room (a few rooms touch
    without a wall segment between them)."""
    bm = bmesh.new()
    shapes = [[(rc["x1"], rc["z1"]), (rc["x2"], rc["z1"]), (rc["x2"], rc["z2"]), (rc["x1"], rc["z2"])]
              for rc in r["rects"]] + [list(map(tuple, p)) for p in r["polys"]]
    for pts in shapes:
        bm.faces.new([bm.verts.new((x, z, 0.0)) for x, z in pts])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    changed = True
    while changed:                                   # split edges at T-junctions
        changed = False
        for v in list(bm.verts):
            for e in list(bm.edges):
                a, b = e.verts
                if v in (a, b):
                    continue
                ab = b.co - a.co
                t = (v.co - a.co).dot(ab) / ab.length_squared
                if 1e-4 < t < 1 - 1e-4 and (a.co + ab * t - v.co).length < 1e-4:
                    _, nv = bmesh.utils.edge_split(e, a, t)
                    nv.co = v.co.copy()
                    changed = True
                    break
            if changed:
                bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
                break
    bmesh.ops.dissolve_faces(bm, faces=bm.faces[:], use_verts=False)
    outlines = []
    for f in bm.faces:
        pts = [(v.co.x, v.co.y) for v in f.verts]
        # drop collinear vertices
        clean = []
        for i, p in enumerate(pts):
            q, n = pts[i - 1], pts[(i + 1) % len(pts)]
            if abs((p[0] - q[0]) * (n[1] - p[1]) - (p[1] - q[1]) * (n[0] - p[0])) > 1e-7:
                clean.append(p)
        area = sum(clean[i - 1][0] * clean[i][1] - clean[i][0] * clean[i - 1][1] for i in range(len(clean)))
        sign = 1 if area > 0 else -1                 # outward normal of edge d is sign*(d.z, -d.x)
        cnt = len(clean)
        # edge i runs clean[i] -> clean[i+1]; pick its offset
        edges = []
        for i in range(cnt):
            a, b = Vector(clean[i]), Vector(clean[(i + 1) % cnt])
            d = (b - a).normalized()
            nrm = Vector((d.y, -d.x)) * sign
            off = grow
            while off > 0:
                hits = [room_at(rooms, *(a + (b - a) * f + nrm * off)) for f in (0.05, 0.25, 0.5, 0.75, 0.95)]
                if all(h is None or h is r for h in hits):
                    break
                off = round(off - 0.005, 4)
            edges.append((a + nrm * off, d))
        out = []
        for i in range(cnt):                         # vertex i = edge i-1 meets edge i
            (p1, d1), (p2, d2) = edges[i - 1], edges[i]
            den = d1.x * d2.y - d1.y * d2.x
            if abs(den) < 1e-6:                      # collinear: just shift
                v = p2
            else:
                t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den
                v = p1 + d1 * t
            out.append((v.x, v.y))
        outlines.append(out)
    bm.free()
    return outlines


def build_rooms(ms, model):
    for r in model["rooms"]:
        rid = r["id"]
        balcony = rid.startswith("balkon")
        outlines = room_outlines(model["rooms"], r, TUCK_BALCONY if balcony else TUCK)
        mat = FLOOR_MAT.get(r.get("kind"), "floor_hout")
        props = {"part": "floor", "room": rid, "finish": r.get("kind", "hout"), "closed": False}
        ceil_h = BALCONY_CEIL if balcony else r["ceil"]
        cmat = "lamel" if (balcony or rid == "corridor") else "ceiling"
        cprops = {"part": "ceiling", "room": rid, "closed": False}
        for pts in outlines:
            ms.poly(f"floor.{rid}", "floors", mat, pts, 0.0, up=True, props=props)
            ms.poly(f"ceil.{rid}", "ceilings", cmat, pts, ceil_h, up=False, props=cprops)

        # Structural slabs closing the voids above the ceilings and below
        # the floors (flush with the wall mass top/bottom), so no crack can
        # ever let light in. Never seen; skipped by the bake.
        if not balcony:
            slab = {"part": "slab", "closed": False, "bake": False}
            for pts in room_outlines([], r, 0.25):
                ms.poly("slab.upper", "ceilings", "concrete", pts, MASS_Y1, up=False, props=slab)
                ms.poly("slab.lower", "floors", "concrete", pts, MASS_Y0, up=True, props=slab)


def build_thresholds(ms, model):
    """Floor inside each opening: a kunststeen dorpel next to wet rooms,
    otherwise the floor of the room on the inside continues through."""
    rooms = model["rooms"]
    for g in model["geom"]:
        if g["kind"] not in ("door", "sidelight", "sliding"):
            continue
        _, _, _, L = seg_frame(g)
        t = g.get("t", WALL_THICK)
        rp, rm = side_rooms(rooms, g)
        sides = [r for r in (rp, rm) if r is not None]
        if g["kind"] == "door" and any(r["id"] in WET for r in sides):
            ms.seg_box(f"dorpel.{g['index']}", "frames", "dorpel", g, -JAMB, L + JAMB,
                       -t / 2 - 0.01, t / 2 + 0.01, 0.0, 0.02, props={"part": "dorpel"})
            continue
        inside = next((r for r in sides if r["id"] not in OUTSIDE), sides[0] if sides else None)
        if inside is None:
            continue
        a0, a1 = (-JAMB, L + JAMB) if g["kind"] == "door" else (0.0, L)
        base = [seg_point(g, a0, -t / 2), seg_point(g, a1, -t / 2), seg_point(g, a1, t / 2), seg_point(g, a0, t / 2)]
        rid = inside["id"]
        ms.poly(f"floor.{rid}", "floors", FLOOR_MAT.get(inside.get("kind"), "floor_hout"), base, THRESHOLD_Y, up=True,
                props={"part": "floor", "room": rid, "finish": inside.get("kind", "hout"), "closed": False})


# ------------------------------------------------------------ elements

def build_plinths(ms, walls):
    """7 cm white plinth along the foot of every painted room wall (not in
    the tiled wet rooms, not in the corridor). Wall faces end at the door
    reveals, so the plinths stop at every opening by themselves."""
    for ob in walls:
        room = ob.get("room")
        if ob.get("part") != "wall" or room in (None, "corridor") or ob.get("finish") == "tile" \
                or room in WET:
            continue
        me = ob.data
        for poly in me.polygons:
            n = poly.normal
            if abs(n.z) > 0.1:
                continue
            for ek in poly.edge_keys:
                a, b = me.vertices[ek[0]].co, me.vertices[ek[1]].co
                if abs(a.z) > 1e-4 or abs(b.z) > 1e-4 or (a - b).length < 0.02:
                    continue
                # model plan coords of the edge + offset along the face normal
                pa, pb = (a.x, -a.y), (b.x, -b.y)
                ox, oz = n.x * 0.012, -n.y * 0.012
                base = [pa, pb, (pb[0] + ox, pb[1] + oz), (pa[0] + ox, pa[1] + oz)]
                ms.prism(f"plinth.{room}", "walls", "plinth", base, 0.0, 0.07,
                         {"part": "plinth", "room": room})


def build_door_frame(ms, g):
    _, _, _, L = seg_frame(g)
    t = g.get("t", WALL_THICK)
    d = t + 0.03
    mat = "frame_wood" if g.get("entrance") else "frame_white"
    name = f"frame.{g['index']}"
    props = {"part": "frame", "geom": g["index"]}
    ms.seg_box(name, "frames", mat, g, -JAMB, 0.0, -d / 2, d / 2, 0.0, DOOR_H + JAMB, props)
    ms.seg_box(name, "frames", mat, g, L, L + JAMB, -d / 2, d / 2, 0.0, DOOR_H + JAMB, props)
    ms.seg_box(name, "frames", mat, g, 0.0, L, -d / 2, d / 2, DOOR_H, DOOR_H + JAMB, props)


def build_sidelight(ms, g):
    _, _, _, L = seg_frame(g)
    t = g.get("t", 0.10)
    d = t + 0.03
    name = f"frame.{g['index']}"
    props = {"part": "frame", "geom": g["index"]}
    ms.seg_box(name, "frames", "frame_white", g, 0.0, JAMB, -d / 2, d / 2, 0.0, DOOR_H + JAMB, props)
    ms.seg_box(name, "frames", "frame_white", g, L - JAMB, L, -d / 2, d / 2, 0.0, DOOR_H + JAMB, props)
    ms.seg_box(name, "frames", "frame_white", g, JAMB, L - JAMB, -d / 2, d / 2, DOOR_H, DOOR_H + JAMB, props)
    ms.seg_box(name, "frames", "frame_white", g, JAMB, L - JAMB, -d / 2, d / 2, 0.0, JAMB, props)
    ms.seg_plane("glass.interior", "glazing", "glass", g, JAMB, L - JAMB, 0.0, JAMB, DOOR_H,
                 {"part": "glass", "closed": False})


def build_sliding(ms, g, out):
    """Houten hef-schuifpui (Red Grandis): fixed pane on the outer track,
    sliding pane slid ~85 % open over it on the inner track (same layout as
    v1, so the walkable gap is where it was)."""
    _, _, _, L = seg_frame(g)
    inn = -(out or 1)                                # normal sign of the indoor side
    name = f"pui.{g['index']}"
    props = {"part": "sliding", "geom": g["index"]}
    jamb, head, sill, fd = 0.08, SLIDE_HEAD, 0.03, 0.12
    top = SLIDE_TOP
    ms.seg_box(name, "frames", "frame_wood", g, 0.0, jamb, -fd / 2, fd / 2, 0.0, top + head, props)
    ms.seg_box(name, "frames", "frame_wood", g, L - jamb, L, -fd / 2, fd / 2, 0.0, top + head, props)
    ms.seg_box(name, "frames", "frame_wood", g, jamb, L - jamb, -fd / 2, fd / 2, top, top + head, props)
    ms.seg_box(name, "frames", "frame_wood", g, 0.0, L, -fd / 2 - 0.02, fd / 2 + 0.02, 0.0, sill, props)
    ms.seg_box(name, "frames", "alu", g, jamb, L - jamb, inn * 0.03 - 0.015, inn * 0.03 + 0.015,
               sill, sill + 0.012, props)

    pw = (L - 2 * jamb) / 2
    stile, rail, brail, pt = 0.09, 0.09, 0.13, 0.07
    slide_end = -1 if g.get("slide") == "x1" else 1
    mid = L / 2

    def panel(ac, oc, handle):
        a0, a1 = ac - pw / 2, ac + pw / 2
        o0, o1 = oc - pt / 2, oc + pt / 2
        ms.seg_box(name, "frames", "frame_wood", g, a0, a0 + stile, o0, o1, sill, top, props)
        ms.seg_box(name, "frames", "frame_wood", g, a1 - stile, a1, o0, o1, sill, top, props)
        ms.seg_box(name, "frames", "frame_wood", g, a0 + stile, a1 - stile, o0, o1, top - rail, top, props)
        ms.seg_box(name, "frames", "frame_wood", g, a0 + stile, a1 - stile, o0, o1, sill, sill + brail, props)
        ms.seg_plane("glass.exterior", "glazing", "glass", g, a0 + stile, a1 - stile, oc,
                     sill + brail, top - rail, {"part": "glass", "closed": False})
        if handle:   # handgreep on the leading stile, indoor side
            ah = ac + slide_end * (pw / 2 - stile / 2)
            oh = oc + inn * (pt / 2 + 0.02)
            ms.seg_box(name, "frames", "alu", g, ah - 0.0175, ah + 0.0175, oh - 0.015, oh + 0.015,
                       sill + 0.88, sill + 1.22, props)

    fixed_a = mid - slide_end * pw / 2
    panel(fixed_a, -inn * 0.025, False)
    panel(fixed_a + slide_end * pw * 0.15, inn * 0.03, True)


def build_railing(ms, g):
    """Balkonhek: glass between aluminium clamps, hardwood handrail, steel
    balusters ~1.2 m apart, plus the slab edges below and above."""
    _, _, _, L = seg_frame(g)
    name = f"railing.{g['index']}"
    props = {"part": "railing", "geom": g["index"]}
    ms.seg_box(name, "railings", "alu", g, -0.01, L + 0.01, -0.03, 0.03, 0.075, 0.125, props)
    ms.seg_box(name, "railings", "alu", g, -0.01, L + 0.01, -0.03, 0.03, 1.00, 1.04, props)
    ms.seg_box(name, "railings", "handrail", g, -0.01, L + 0.01, -0.055, 0.055, 1.05, 1.10, props)
    ms.seg_box(name, "railings", "concrete", g, -0.01, L + 0.01, -0.06, 0.06, -0.30, 0.0, props)
    ms.seg_box(name, "railings", "concrete", g, -0.01, L + 0.01, -0.06, 0.06, BALCONY_CEIL, BALCONY_CEIL + 0.32, props)
    n = max(2, math.ceil(L / 1.2) + 1)
    for i in range(n):
        a = L * i / (n - 1)
        a = min(max(a, 0.02), L - 0.02)
        ms.seg_box(name, "railings", "steel", g, a - 0.02, a + 0.02, -0.07, -0.03, 0.0, 1.06, props)
    ms.seg_plane("glass.railing", "glazing", "glass", g, 0.0, L, 0.0, 0.125, 1.025, {"part": "glass", "closed": False})


def build_screen(ms, g):
    _, _, _, L = seg_frame(g)
    name = f"screen.{g['index']}"
    props = {"part": "screen", "geom": g["index"]}
    H = 1.85
    ms.seg_box(name, "railings", "alu", g, 0.0, 0.05, -0.025, 0.025, 0.0, H, props)
    ms.seg_box(name, "railings", "alu", g, L - 0.05, L, -0.025, 0.025, 0.0, H, props)
    ms.seg_box(name, "railings", "alu", g, 0.05, L - 0.05, -0.025, 0.025, H - 0.04, H, props)
    ms.seg_box(name, "railings", "alu", g, 0.05, L - 0.05, -0.025, 0.025, 0.08, 0.12, props)
    ms.seg_box(name, "railings", "concrete", g, -0.01, L + 0.01, -0.06, 0.06, -0.30, 0.0, props)
    ms.seg_box(name, "railings", "concrete", g, -0.01, L + 0.01, -0.06, 0.06, BALCONY_CEIL, BALCONY_CEIL + 0.32, props)
    ms.seg_plane("glass.screen", "glazing", "frosted", g, 0.05, L - 0.05, 0.0, 0.12, H - 0.04,
                 {"part": "glass", "closed": False})


def build_exterior(ms):
    """The storeys below and above + neighbours' balcony slabs (same massing
    as v1's buildBuildingMass) and the forest floor 6.2 m down."""
    for y0, y1 in ((-3.45, -0.32), (3.17, 6.3)):
        h, yc = y1 - y0, (y0 + y1) / 2
        for cx, cz, w, d in ((5.2, -0.05, 11.0, 0.3), (7.6, 13.95, 6.3, 0.3), (3.9, 15.75, 4.7, 0.3),
                             (-0.05, 7.9, 0.3, 14.2), (10.75, 7.0, 0.3, 16.0)):
            ms.aabb("building.mass", "exterior", "facade_mass", cx, yc, cz, w, h, d, {"part": "exterior"})
    for zc, d in ((-0.635, 0.89), (16.675, 1.75)):
        ms.aabb("building.neighbours", "exterior", "concrete", 14.8, -0.16, zc, 8.0, 0.28, d, {"part": "exterior"})
        ms.aabb("building.neighbours", "exterior", "concrete", 14.8, 2.99, zc, 8.0, 0.28, d, {"part": "exterior"})
    s = 40.0
    ms.poly("ground", "exterior", "ground",
            [(4.2 - s, 6.9 - s), (4.2 + s, 6.9 - s), (4.2 + s, 6.9 + s), (4.2 - s, 6.9 + s)],
            -6.2, up=True, props={"part": "exterior", "closed": False})


# ------------------------------------------------------------ main

def main():
    reset_scene()
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    model = load_model()
    mats = make_materials()
    colls = ensure_collections(COLLS)
    rooms = model["rooms"]

    solid = [g for g in model["geom"] if g["kind"] in SOLID_KINDS]
    for i, g in enumerate(CORRIDOR_WALLS):
        g["index"] = 900 + i
    solid += CORRIDOR_WALLS

    me = build_mass(solid, colls, mats)
    walls = classify_mass(me, solid, model, colls, mats)

    ms = MeshSet(mats)
    build_plinths(ms, walls)
    build_rooms(ms, model)
    build_thresholds(ms, model)
    for g in model["geom"]:
        k = g["kind"]
        if k == "door":
            build_door_frame(ms, g)
        elif k == "sidelight":
            build_sidelight(ms, g)
        elif k == "sliding":
            build_sliding(ms, g, outdoor_sign(rooms, g))
        elif k == "railing":
            build_railing(ms, g)
        elif k == "screen":
            build_screen(ms, g)
    build_exterior(ms)
    others = ms.build(colls)

    blend = BUILD_DIR / "shell.blend"
    glb = BUILD_DIR / "shell.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_extras=True,
                              export_apply=True, export_yup=True)
    faces = sum(len(o.data.polygons) for o in walls + others)
    print(f"shell: {len(walls)} wall objects, {len(others)} other objects, {faces} faces")
    print(f"wrote {blend.relative_to(BUILD_DIR.parents[1])} and {glb.relative_to(BUILD_DIR.parents[1])} "
          f"({glb.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
