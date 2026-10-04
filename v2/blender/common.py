"""Shared helpers for the v2 Blender pipeline.

Coordinate frames
-----------------
data/model.json (and v1) use the sales-drawing frame: +X east, +Z south,
+Y up, origin at the NW corner of the north facade, metres.

Blender is Z-up. The glTF exporter maps Blender (x, y, z) -> glTF (x, z, -y),
so placing a model point (X, Y, Z) at Blender (X, -Z, Y) makes it land at
exactly (X, Y, Z) in the exported .glb — the same frame the v1 app and the
Python tools use. All builders below take MODEL coordinates and convert with
`P()` at the last moment.
"""
import json
import math
import pathlib
import sys

import bpy  # first: with the pip `bpy` module, bmesh only exists after it
import bmesh  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODEL_JSON = ROOT / "data" / "model.json"
BUILD_DIR = ROOT / "v2" / "build"

# Heights (Technische Omschrijving; same values as js/constants.js)
WALL_HEIGHT = 2.80     # vrije hoogte woonvertrekken
CEIL_LOW = 2.55        # badkamers + verkeersruimten
DOOR_H = 2.315         # binnendeur (opdek/stomp 2315 mm)
WALL_THICK = 0.20
JAMB = 0.045           # nestelkozijn profile
SLIDE_TOP = 2.50       # glass top of the hef-schuifpui
SLIDE_HEAD = 0.08
BALCONY_CEIL = 2.85    # underside of the balcony above
MASS_Y0, MASS_Y1 = -0.30, 3.15   # wall mass runs slab-to-slab

SOLID_KINDS = {"wall", "door", "sidelight", "sliding", "window"}
OUTSIDE = {"balkon_n", "balkon_z", "corridor"}
WET = {"badkamer", "badkklein", "toilet"}

# Shared corridor outside the voordeur — not part of the sales drawing, so
# v1 keeps it in js/apartment.js (buildCorridor). Same numbers here.
CORRIDOR_WALLS = [
    {"kind": "wall", "x1": -1.96, "z1": 6.30, "x2": -1.96, "z2": 12.40, "t": 0.20, "corridor": True},
    {"kind": "wall", "x1": -2.06, "z1": 6.30, "x2": 0.38, "z2": 6.30, "t": 0.20, "corridor": True},
    {"kind": "wall", "x1": -2.06, "z1": 12.40, "x2": 0.07, "z2": 12.40, "t": 0.24, "corridor": True},
]


def script_args():
    """Arguments after `--` (blender -b -P script.py -- args) or plain argv."""
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]


def P(x, y, z):
    """Model (x east, y up, z south) -> Blender (x, -z, y)."""
    return (x, -z, y)


def load_model():
    m = json.loads(MODEL_JSON.read_text())
    if m.get("version") != 1:
        raise SystemExit(f"model.json version {m.get('version')} — expected 1")
    for i, g in enumerate(m["geom"]):
        g["index"] = i
    for r in m["rooms"]:
        r.setdefault("polys", [])
        r.setdefault("ceil", WALL_HEIGHT)
    return m


# ---------------------------------------------------------------- 2D helpers

from geom2d import room_at, seg_frame, seg_point  # noqa: E402  (re-exported)


def side_rooms(rooms, g, probe=0.22):
    """Rooms on the +normal and -normal side of a segment (v1 sideInfo)."""
    _, _, _, L = seg_frame(g)
    t = g.get("t", WALL_THICK) / 2 + probe
    return (room_at(rooms, *seg_point(g, L / 2, t)),
            room_at(rooms, *seg_point(g, L / 2, -t)))


def outdoor_sign(rooms, g):
    """+1/-1: the normal side that is outdoors (balcony/void); 0 if unclear."""
    rp, rm = side_rooms(rooms, g)
    ip = rp is not None and rp["id"] not in OUTSIDE
    im = rm is not None and rm["id"] not in OUTSIDE
    if ip and not im:
        return -1
    if im and not ip:
        return 1
    return 0


# ---------------------------------------------------------------- materials

def srgb(hexval):
    """sRGB hex -> linear RGBA for Principled BSDF inputs."""
    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin((hexval >> 16) & 255), lin((hexval >> 8) & 255), lin(hexval & 255), 1.0)


# Phase 1 placeholder palette. Names are stable: Phase 2 swaps each one for a
# textured PBR material without touching the geometry scripts.
MATERIALS = {
    "plaster":      dict(color=0xEDEAE4, rough=0.92),
    "ceiling":      dict(color=0xF4F3F0, rough=0.95),
    "limewash":     dict(color=0xB9B4AC, rough=0.95),
    "floor_hout":   dict(color=0xB8916A, rough=0.55),
    "floor_tegel":  dict(color=0x9C9A95, rough=0.45),
    "floor_steen":  dict(color=0x8D8A84, rough=0.85),
    "floor_tapijt": dict(color=0x8E8F92, rough=1.00),
    "dorpel":       dict(color=0x3A3A3C, rough=0.35),
    "cladding":     dict(color=0x6B5A4B, rough=0.80),
    "lamel":        dict(color=0x7A6655, rough=0.80),
    "frame_white":  dict(color=0xF1F0EA, rough=0.40),
    "frame_wood":   dict(color=0x7A3E26, rough=0.50),
    "handrail":     dict(color=0x6E4630, rough=0.50),
    "alu":          dict(color=0xB8BBBE, rough=0.35, metal=1.0),
    "steel":        dict(color=0x2E3033, rough=0.45, metal=1.0),
    "concrete":     dict(color=0xA9A7A1, rough=0.90),
    "glass":        dict(color=0xDCE8E6, rough=0.02, alpha=0.12),
    "frosted":      dict(color=0xEEF2F2, rough=0.60, alpha=0.70),
    "facade_mass":  dict(color=0x5E5045, rough=0.85),
    "ground":       dict(color=0x5D6B42, rough=1.00),
    "wall_tile":    dict(color=0xDCD8D1, rough=0.25),
    "plinth":       dict(color=0xF1F0EC, rough=0.35),
    # furniture
    "oak":          dict(color=0xC79E70, rough=0.50),
    "oak_dark":     dict(color=0x6E4C34, rough=0.50),
    "lacquer":      dict(color=0xF0EFEA, rough=0.30),
    "linen":        dict(color=0xB9B2A6, rough=1.00),
    "linen_oat":    dict(color=0xD9D0C1, rough=1.00),
    "boucle":       dict(color=0xEAE5DB, rough=1.00),
    "outdoor":      dict(color=0x8D877C, rough=0.95),
    "headboard":    dict(color=0x8A8F86, rough=1.00),
    "bedding":      dict(color=0xF4F2ED, rough=0.95),
    "duvet":        dict(color=0xE6E0D5, rough=0.95),
    "rug_oat":      dict(color=0xD3CAB9, rough=1.00),
    "rug_stone":    dict(color=0xA9A398, rough=1.00),
    "rug_taupe":    dict(color=0x8A7F72, rough=1.00),
    "black":        dict(color=0x1F2022, rough=0.45, metal=0.7),
    "chrome":       dict(color=0xD2D4D6, rough=0.12, metal=1.0),
    "stone_light":  dict(color=0xD8D0C3, rough=0.35),
    "stone_dark":   dict(color=0x2C2C2E, rough=0.30),
    "ceramic":      dict(color=0xF6F6F4, rough=0.08),
    "mirror":       dict(color=0xE9EDEF, rough=0.02, metal=1.0),
    "screen":       dict(color=0x0B0C0E, rough=0.12),
    "appliance":    dict(color=0xE8E8E6, rough=0.30),
    "leaf":         dict(color=0x3E5A34, rough=0.55),
    "leaf_light":   dict(color=0x5B7841, rough=0.55),
    "soil":         dict(color=0x2E241C, rough=1.00),
    "terracotta":   dict(color=0xB06E4C, rough=0.85),
    "pot_concrete": dict(color=0xA7A39C, rough=0.90),
    "lampshade":    dict(color=0xEDE6D8, rough=0.90),
    "bulb":         dict(color=0xFFE9C4, rough=0.50, emit=6.0),
    "book_red":     dict(color=0xA9432F, rough=0.70),
    "book_blue":    dict(color=0x2F4A6B, rough=0.70),
    "book_ochre":   dict(color=0xC9A24A, rough=0.70),
    "book_green":   dict(color=0x3F5E4A, rough=0.70),
    "book_cream":   dict(color=0xE6DCC8, rough=0.70),
    "book_plum":    dict(color=0x6B3B5A, rough=0.70),
    "book_black":   dict(color=0x232323, rough=0.70),
    "sheer":        dict(color=0xF3F0E9, rough=1.00, alpha=0.55),
    # kitchen: SieMatic SLX (owners' choice), Caesarstone 4230 Shitake
    "kitchen_front": dict(color=0xBDB7AE, rough=0.55),
    "kitchen_grip":  dict(color=0x6B5A49, rough=0.38, metal=1.0),
    "worktop":       dict(color=0xA89B8A, rough=0.55),
}
FLOOR_MAT = {"hout": "floor_hout", "tegel": "floor_tegel", "steen": "floor_steen", "tapijt": "floor_tapijt"}


TEXTURES = BUILD_DIR / "textures"


def texture_index():
    """Material textures made by textures.py (empty when not generated:
    everything then falls back to the flat colours above, as in CI)."""
    p = TEXTURES / "index.json"
    return json.loads(p.read_text()) if p.exists() else {}


def make_materials():
    """(Re)build every M_<name> material. Idempotent: the node tree is
    rebuilt from scratch, so scripts that open an earlier .blend pick up
    new textures and colours."""
    mats = {}
    tex = texture_index()
    for name, spec in MATERIALS.items():
        m = bpy.data.materials.get("M_" + name) or bpy.data.materials.new("M_" + name)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        bsdf.inputs["Base Color"].default_value = srgb(spec["color"])
        bsdf.inputs["Roughness"].default_value = spec["rough"]
        bsdf.inputs["Metallic"].default_value = spec.get("metal", 0.0)
        if name in tex:
            add_textures(nt, bsdf, name, tex[name])
        if "emit" in spec:
            bsdf.inputs["Emission Color"].default_value = srgb(spec["color"])
            bsdf.inputs["Emission Strength"].default_value = spec["emit"]
        if "alpha" in spec:
            # Alpha (not transmission): Cycles lets sun/shadow rays through a
            # transparent BSDF, and glTF exports it as alphaMode BLEND.
            bsdf.inputs["Alpha"].default_value = spec["alpha"]
            bsdf.inputs["Specular IOR Level"].default_value = 0.8
            m.surface_render_method = "BLENDED"
            m.use_backface_culling = False
        mats[name] = m
    return mats


def add_textures(nt, bsdf, name, info):
    """Colour / roughness / normal maps on the world-scale UVs (1 unit =
    1 m): the Mapping node scales them to their real size and turns them by
    `rot` (scale is applied before rotation, hence the swap at 90°)."""
    sx, sy = info["size"]
    rot = info.get("rot", 0) % 180
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / sy, 1 / sx, 1) if rot == 90 else (1 / sx, 1 / sy, 1)
    mp.inputs["Rotation"].default_value = (0, 0, math.radians(rot))
    nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])

    def image(kind, color_space):
        p = TEXTURES / f"{name}_{kind}.jpg"
        if not p.exists():
            return None
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(p), check_existing=True)
        node.image.colorspace_settings.name = color_space
        nt.links.new(mp.outputs["Vector"], node.inputs["Vector"])
        return node

    c = image("color", "sRGB")
    if c:
        nt.links.new(c.outputs["Color"], bsdf.inputs["Base Color"])
    r = image("rough", "Non-Color")
    if r:
        nt.links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
    n = image("normal", "Non-Color")
    if n:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])


# ---------------------------------------------------------------- mesh builder

class MeshSet:
    """Accumulates geometry per named object in bmeshes, then turns them into
    Blender objects in one go. Every primitive takes MODEL coordinates."""

    def __init__(self, mats):
        self.mats = mats
        self.items = {}   # name -> dict(bm, mat_names, coll, props)

    def _get(self, name, coll, props=None):
        it = self.items.get(name)
        if it is None:
            it = self.items[name] = dict(bm=bmesh.new(), mats=[], coll=coll, props=dict(props or {}))
        return it

    def _mat_index(self, it, mat):
        if mat not in it["mats"]:
            it["mats"].append(mat)
        return it["mats"].index(mat)

    def prism(self, name, coll, mat, base, y0, y1, props=None, top=None):
        """Vertical prism over a plan polygon `base` [(x, z), ...]. With
        `top` (same vertex count) the top ring differs: a tapered solid."""
        it = self._get(name, coll, props)
        bm, mi = it["bm"], self._mat_index(it, mat)
        bot = [bm.verts.new(P(x, y0, z)) for x, z in base]
        top = [bm.verts.new(P(x, y1, z)) for x, z in (top or base)]
        faces = [bm.faces.new(bot[::-1]), bm.faces.new(top)]
        n = len(base)
        for i in range(n):
            j = (i + 1) % n
            faces.append(bm.faces.new((bot[i], bot[j], top[j], top[i])))
        for f in faces:
            f.material_index = mi
        return faces

    def hollow_top(self, name, faces, inset, depth, mat=None):
        """Sink the top face of a solid made by prism(): inset its rim by
        `inset` and push the middle down by `depth` (bath, basin, bowl)."""
        it = self.items[name]
        bm = it["bm"]
        top = faces[1]
        bm.normal_update()
        if top.normal.z < 0:
            top.normal_flip()
        res = bmesh.ops.inset_region(bm, faces=[top], thickness=inset, depth=0.0, use_even_offset=True)
        bmesh.ops.translate(bm, verts=list(top.verts), vec=(0, 0, -depth))
        if mat is not None:   # basin floor and walls (the inset ring, now slanted down)
            mi = self._mat_index(it, mat)
            top.material_index = mi
            for f in res["faces"]:
                f.material_index = mi
        return res

    def blob(self, name, coll, mat, cx, cy, cz, rx, ry, rz, subdiv=2, props=None):
        """Ellipsoid (icosphere) centred on model (cx, cy, cz)."""
        it = self._get(name, coll, props)
        bm, mi = it["bm"], self._mat_index(it, mat)
        res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
        vs = res["verts"]
        for v in vs:
            x, y, z = v.co                              # Blender local: z up
            v.co = P(cx + x * rx, cy + z * ry, cz + y * rz)
        faces = {f for v in vs for f in v.link_faces}
        for f in faces:
            f.material_index = mi
            f.smooth = True
        return list(faces)

    def seg_box(self, name, coll, mat, g, a0, a1, o0, o1, y0, y1, props=None):
        """Box in a segment's frame: along a0..a1, normal offset o0..o1."""
        base = [seg_point(g, a0, o0), seg_point(g, a1, o0), seg_point(g, a1, o1), seg_point(g, a0, o1)]
        return self.prism(name, coll, mat, base, y0, y1, props)

    def aabb(self, name, coll, mat, cx, cy, cz, w, h, d, props=None):
        """Axis-aligned box centred on model (cx, cy, cz), size w x h x d."""
        base = [(cx - w / 2, cz - d / 2), (cx + w / 2, cz - d / 2), (cx + w / 2, cz + d / 2), (cx - w / 2, cz + d / 2)]
        return self.prism(name, coll, mat, base, cy - h / 2, cy + h / 2, props)

    def seg_plane(self, name, coll, mat, g, a0, a1, o, y0, y1, props=None):
        """Vertical quad (glass) in a segment's frame at normal offset o."""
        it = self._get(name, coll, props)
        bm, mi = it["bm"], self._mat_index(it, mat)
        (xa, za), (xb, zb) = seg_point(g, a0, o), seg_point(g, a1, o)
        vs = [bm.verts.new(P(xa, y0, za)), bm.verts.new(P(xb, y0, zb)),
              bm.verts.new(P(xb, y1, zb)), bm.verts.new(P(xa, y1, za))]
        f = bm.faces.new(vs)
        f.material_index = mi
        return [f]

    def poly(self, name, coll, mat, pts, y, up=True, props=None):
        """Horizontal polygon at height y facing up (floor) or down (ceiling)."""
        it = self._get(name, coll, props)
        bm, mi = it["bm"], self._mat_index(it, mat)
        vs = [bm.verts.new(P(x, y, z)) for x, z in pts]
        f = bm.faces.new(vs)
        f.normal_update()
        if (f.normal.z > 0) != up:
            f.normal_flip()
        f.material_index = mi
        return [f]

    def build(self, collections, recalc_normals=True, weld=True):
        """weld=False keeps touching primitives separate: furniture parts
        are closed solids each, and welding the corners of two boxes that
        touch makes non-manifold edges that flip normals."""
        objs = []
        for name, it in self.items.items():
            bm = it["bm"]
            if weld:
                bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
            if recalc_normals and it["props"].get("closed", True):
                bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            world_uv(bm)
            me = bpy.data.meshes.new(name)
            bm.to_mesh(me)
            bm.free()
            for m in it["mats"]:
                me.materials.append(self.mats[m])
            ob = bpy.data.objects.new(name, me)
            for k, v in it["props"].items():
                if k != "closed":
                    ob[k] = v
            collections[it["coll"]].objects.link(ob)
            objs.append(ob)
        self.items.clear()
        return objs


def world_uv(bm, layer="UVMap"):
    """Box projection at 1 UV unit = 1 m, so tiling textures (planks, tiles,
    plaster) keep a constant real-world size on every face."""
    uv = bm.loops.layers.uv.get(layer) or bm.loops.layers.uv.new(layer)
    for f in bm.faces:
        f.normal_update()
        nx, ny, nz = (abs(c) for c in f.normal)
        for loop in f.loops:
            x, y, z = loop.vert.co
            if nz >= nx and nz >= ny:
                loop[uv].uv = (x, y)
            elif nx >= ny:
                loop[uv].uv = (y, z)
            else:
                loop[uv].uv = (x, z)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def ensure_collections(names):
    scene = bpy.context.scene
    out = {}
    for n in names:
        c = bpy.data.collections.get(n) or bpy.data.collections.new(n)
        if c.name not in scene.collection.children:
            scene.collection.children.link(c)
        out[n] = c
    return out
