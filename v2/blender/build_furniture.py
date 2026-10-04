"""Phase 2a: furnish the shell from v2/data/furniture.json.

    python v2/blender/build_furniture.py        # after build_shell.py

Reads v2/build/shell.blend, adds furniture, kitchen, sanitary ware, curtains
and lamps (with real light sources), and writes v2/build/scene.blend plus
v2/build/furniture.glb (furniture + lights only, so the viewer can swap the
furnishing without reloading the shell).
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from common import BUILD_DIR, ROOT, P, ensure_collections, load_model, make_materials  # noqa: E402
from furniture import build_items  # noqa: E402

FURNITURE_JSON = ROOT / "v2" / "data" / "furniture.json"


def finish(obj):
    """Hard parts: 4 mm bevel so edges catch the light. Soft parts
    (upholstery, bedding): rounded 3 cm bevel + smooth shading. Foliage,
    bulbs and curtains: smooth only."""
    n = obj.name
    if n.endswith((".blob", ".curtain")):
        obj.data.shade_smooth()
        return
    m = obj.modifiers.new("bevel", "BEVEL")
    m.limit_method = "ANGLE"
    m.use_clamp_overlap = True
    if n.endswith(".soft"):
        m.width, m.segments, m.profile = 0.03, 4, 0.5
        m.angle_limit = math.radians(30)
        obj.data.shade_smooth()
    else:
        m.width, m.segments = 0.004, 2
        m.angle_limit = math.radians(35)
        m.harden_normals = True
        obj.data.shade_smooth()


def make_light(spec, coll):
    kind = spec["kind"]
    ld = bpy.data.lights.new(f"light.{spec['id']}", kind)
    ld.energy = spec["watts"]
    ld.color = spec["color"]
    ld.shadow_soft_size = spec["radius"]
    if kind == "SPOT":
        ld.spot_size = math.radians(spec["spot"] or 90)
        ld.spot_blend = 0.6
    ob = bpy.data.objects.new(f"light.{spec['id']}", ld)
    ob.location = P(*spec["pos"])              # spots point down (-Z) by default
    ob["room"] = spec["room"]
    ob["part"] = "light"
    coll.objects.link(ob)
    return ob


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BUILD_DIR / "shell.blend"))
    model = load_model()
    mats = make_materials()
    colls = ensure_collections(["furniture", "lights"])
    data = json.loads(FURNITURE_JSON.read_text())
    if data.get("version") != 1:
        raise SystemExit("furniture.json: expected version 1")
    ms, lights = build_items(mats, data["items"], model["rooms"])
    objs = ms.build(colls)
    for o in objs:
        finish(o)
    lamp_objs = [make_light(s, colls["lights"]) for s in lights]

    bpy.ops.wm.save_as_mainfile(filepath=str(BUILD_DIR / "scene.blend"))
    for o in bpy.context.scene.objects:
        o.select_set(o in objs or o in lamp_objs)
    glb = BUILD_DIR / "furniture.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                              export_extras=True, export_apply=True, export_lights=True)
    faces = sum(len(o.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.polygons) for o in objs)
    print(f"furniture: {len(data['items'])} items -> {len(objs)} objects, {len(lamp_objs)} lights, "
          f"{faces} faces after bevels")
    print(f"wrote v2/build/scene.blend and v2/build/furniture.glb ({glb.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
