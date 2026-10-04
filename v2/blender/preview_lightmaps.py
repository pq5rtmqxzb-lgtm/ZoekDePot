"""Check the baked lightmaps the way the web viewer will draw them.

    python v2/blender/preview_lightmaps.py [--views woonkamer,avond] [--width 960]

Opens v2/build/baked.blend, replaces every baked surface's shader by
emission = albedo x lightmap x scale (the PNGs from bake.py, read as sRGB,
exactly the viewer's formula), switches every real light off and renders
the same cameras as render_preview.py. Writes v2/docs/renders/lm_<view>.png
and lmcompare_<view>.png (path-traced | lightmap-only), so the two can be
compared side by side.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from common import BUILD_DIR, ROOT, script_args  # noqa: E402
from lighting import set_mood, setup_world  # noqa: E402
from render_preview import VIEWS, camera, setup_render  # noqa: E402

LMDIR = BUILD_DIR / "lightmaps"
OUT = ROOT / "v2" / "docs" / "renders"


def parse():
    a = script_args()
    opts = {"views": "woonkamer,eettafel,avond", "width": 960, "samples": 16}
    for i in range(0, len(a) - 1, 2):
        opts[a[i].lstrip("-")] = a[i + 1]
    return opts["views"].split(","), int(opts["width"]), int(opts["samples"])


def albedo_socket(mat):
    """(node output, None) feeding Base Color, or (None, colour)."""
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return None, (0.8, 0.8, 0.8, 1)
    inp = bsdf.inputs["Base Color"]
    if inp.is_linked:
        return inp.links[0].from_socket, None
    return None, tuple(inp.default_value)


def lightmapped(mat, image, scale):
    """Copy of `mat` that shows albedo x lightmap x scale as emission."""
    m = mat.copy()
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    sock, col = albedo_socket(m)
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "Lightmap"
    lm = nt.nodes.new("ShaderNodeTexImage")
    lm.image = image
    nt.links.new(uv.outputs["UV"], lm.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    if sock is not None:
        nt.links.new(sock, mix.inputs["A"])
    else:
        mix.inputs["A"].default_value = col
    nt.links.new(lm.outputs["Color"], mix.inputs["B"])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = scale
    nt.links.new(mix.outputs["Result"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def main():
    views, width, samples = parse()
    manifest = json.loads((LMDIR / "manifest.json").read_text())
    bpy.ops.wm.open_mainfile(filepath=str(BUILD_DIR / "baked.blend"))
    scene = bpy.context.scene
    world = setup_world(scene)
    setup_render(scene, samples, width)
    scene.cycles.use_denoising = False
    originals = {o.name: [s.material for s in o.material_slots] for o in scene.objects if o.type == "MESH"}
    OUT.mkdir(parents=True, exist_ok=True)
    for name in views:
        v = VIEWS[name]
        mood = v.get("mood", "day")
        if mood not in manifest["maps"]:
            print(f"skip {name}: no '{mood}' lightmaps baked")
            continue
        m = set_mood(world, mood, lamps=set())
        scene.objects["sun"].hide_render = True              # all light comes from the lightmaps
        for g, info in manifest["groups"].items():
            entry = manifest["maps"][mood][g]
            img = bpy.data.images.load(str(LMDIR / entry["file"]), check_existing=True)
            img.colorspace_settings.name = "sRGB"
            cache = {}
            for oname in info["objects"]:
                o = scene.objects.get(oname)
                if o is None:
                    continue
                for slot, orig in zip(o.material_slots, originals[oname]):
                    if orig is None:
                        continue
                    if orig.name not in cache:
                        cache[orig.name] = lightmapped(orig, img, entry["scale"])
                    slot.material = cache[orig.name]
        scene.view_settings.exposure = m["exposure"]
        cam = camera(scene, v["eye"], v["target"], v.get("overview", False))
        path = OUT / f"lm_{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam)
        ref = OUT / f"{name}.png"
        if ref.exists():
            from PIL import Image
            a, b = Image.open(ref).convert("RGB"), Image.open(path).convert("RGB")
            b = b.resize(a.size)
            both = Image.new("RGB", (a.width * 2 + 8, a.height), "white")
            both.paste(a, (0, 0))
            both.paste(b, (a.width + 8, 0))
            both.save(OUT / f"lmcompare_{name}.png", optimize=True)
        print(f"rendered lm_{name} ({mood})", flush=True)


if __name__ == "__main__":
    main()
