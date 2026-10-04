"""Phase 2c: bake lightmaps for the web viewer.

    python v2/blender/bake.py                      # draft: 2K, CPU (cloud)
    blender -b -P v2/blender/bake.py -- --quality final   # 4K, GPU (laptop)
    ... [--moods day,evening,night] [--groups shell,furniture] [--size 1024] [--samples 32]

Reads v2/build/scene.blend and writes, to v2/build/:
- lightmaps/<mood>_<group>.png  — irradiance (light only, no surface colour),
  sRGB-encoded 8-bit, scaled by manifest.json's `scale`;
- lightmaps/manifest.json       — groups, their objects, map files, scales;
- baked.blend                   — the scene with lightmap UVs (and modifiers applied);
- scene.glb                     — everything, with TEXCOORD_0 = surface UVs and
                                  TEXCOORD_1 = lightmap UVs.

The viewer draws a surface as  albedo x lightmap x scale  (three.js: the
texture as `lightMap` in sRGB, `lightMapIntensity = scale`). The light is
baked without the surface colour, so walls can be repainted and keep their
light and shadow. Moods and lamps come from lighting.py (same as the
path-traced previews). Groups share one atlas each: `shell` (walls, floors,
ceilings, frames, railings) and `furniture`.
"""
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from common import BUILD_DIR, script_args  # noqa: E402
from lighting import MOODS, set_mood, setup_world  # noqa: E402

OUT = BUILD_DIR / "lightmaps"
QUALITY = {
    "draft": dict(size=2048, samples=32, device="CPU", margin=8),
    "final": dict(size=4096, samples=1024, device="GPU", margin=16),
}
LM = "Lightmap"
SHELL_COLLECTIONS = ("walls", "floors", "ceilings", "frames", "railings")
SKIP_MATERIALS = {"M_glass", "M_frosted", "M_sheer", "M_bulb"}


def parse():
    a = script_args()
    opts = {"quality": "draft", "moods": ",".join(MOODS), "groups": "shell,furniture"}
    for i in range(0, len(a) - 1, 2):
        opts[a[i].lstrip("-")] = a[i + 1]
    q = dict(QUALITY[opts["quality"]])
    for k in ("size", "samples", "margin"):
        if k in opts:
            q[k] = int(opts[k])
    return opts["quality"], q, opts["moods"].split(","), opts["groups"].split(",")


def bakeable(o):
    if o.type != "MESH" or not o.data.polygons:
        return False
    if o.name.startswith(("slab.", "building.", "ground", "glass.")) or o.get("bake") is False:
        return False
    mats = {s.material.name for s in o.material_slots if s.material}
    return bool(mats - SKIP_MATERIALS)


def groups_of(scene_objects):
    shell, furn = [], []
    for o in scene_objects:
        if not bakeable(o):
            continue
        colls = {c.name for c in o.users_collection}
        if colls & set(SHELL_COLLECTIONS):
            shell.append(o)
        elif "furniture" in colls:
            furn.append(o)
    return {"shell": shell, "furniture": furn}


def apply_modifiers(objs):
    """Bake on the final geometry: bevels become real faces."""
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if not o.modifiers:
            continue
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        old = o.data
        o.modifiers.clear()
        o.data = me
        me.name = old.name
        if old.users == 0:
            bpy.data.meshes.remove(old)


def lightmap_uvs(objs, size):
    """Second UV map per object, unwrapped and packed into ONE atlas for the
    whole group at a uniform texel density."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        uv = o.data.uv_layers.get(LM) or o.data.uv_layers.new(name=LM)
        o.data.uv_layers.active = uv
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(margin_method="FRACTION", margin=3.0 / size, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake_group(objs, img, q):
    """Bake light (direct + indirect, no surface colour) into `img`."""
    mats = {s.material for o in objs for s in o.material_slots if s.material}
    for m in mats:
        nt = m.node_tree
        node = nt.nodes.get("LM_bake") or nt.nodes.new("ShaderNodeTexImage")
        node.name = "LM_bake"
        node.image = img
        nt.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        o.data.uv_layers.active = o.data.uv_layers[LM]
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True,
                        margin=q["margin"], target="IMAGE_TEXTURES")
    for m in mats:
        nt = m.node_tree
        nt.nodes.remove(nt.nodes["LM_bake"])


def pixels(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def denoise(img, size):
    """OpenImageDenoise through the compositor (a throwaway scene renders
    nothing but the composite)."""
    tmp = OUT / "_noisy.exr"
    img.filepath_raw, img.file_format = str(tmp), "OPEN_EXR"
    img.save()
    sc = bpy.data.scenes.get("_denoise") or bpy.data.scenes.new("_denoise")
    sc.use_nodes = True
    nt = sc.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    src = nt.nodes.new("CompositorNodeImage")
    src.image = img
    dn = nt.nodes.new("CompositorNodeDenoise")
    out = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(src.outputs["Image"], dn.inputs["Image"])
    nt.links.new(dn.outputs["Image"], out.inputs["Image"])
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "32"
    sc.view_settings.view_transform = "Standard"
    sc.render.filepath = str(OUT / "_clean.exr")
    bpy.ops.render.render(scene=sc.name, write_still=True)
    clean = bpy.data.images.load(sc.render.filepath, check_existing=False)
    a = pixels(clean)
    bpy.data.images.remove(clean)
    os.remove(tmp)
    os.remove(sc.render.filepath)
    return a


def encode(a, path):
    """Linear irradiance -> scale + sRGB-encoded 8-bit PNG. The scale keeps
    the brightest 0.3 % (sun patches) from crushing the rest."""
    rgb = np.maximum(a[..., :3], 0)
    lit = rgb.max(axis=-1)
    valid = lit[lit > 1e-5]
    scale = float(np.percentile(valid, 99.7)) if valid.size else 1.0
    x = np.clip(rgb / max(scale, 1e-6), 0, 1)
    srgb = np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)
    from PIL import Image
    Image.fromarray((srgb[::-1] * 255 + 0.5).astype(np.uint8), "RGB").save(path, optimize=True)
    return scale


def main():
    quality, q, moods, groups = parse()
    t0 = time.time()
    bpy.ops.wm.open_mainfile(filepath=str(BUILD_DIR / "scene.blend"))
    scene = bpy.context.scene
    world = setup_world(scene)
    scene.render.engine = "CYCLES"
    scene.cycles.device = q["device"]
    if q["device"] == "GPU":
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for backend in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
            try:
                prefs.compute_device_type = backend
                prefs.get_devices()
                if any(d.type != "CPU" for d in prefs.devices):
                    break
            except TypeError:
                continue
        for d in prefs.devices:
            d.use = True
    scene.cycles.samples = q["samples"]
    scene.cycles.max_bounces, scene.cycles.diffuse_bounces = 8, 6
    scene.cycles.caustics_reflective = scene.cycles.caustics_refractive = False
    OUT.mkdir(parents=True, exist_ok=True)

    all_groups = groups_of(list(scene.objects))
    manifest = {"version": 1, "quality": quality, "uv": f"{LM} (glTF TEXCOORD_1)",
                "encoding": "srgb", "how": "colour = albedo x lightmap x scale (lightmap in sRGB)",
                "groups": {}, "maps": {}}
    for g in groups:
        objs = all_groups[g]
        apply_modifiers(objs)
        t = time.time()
        lightmap_uvs(objs, q["size"])
        manifest["groups"][g] = {"size": q["size"], "objects": sorted(o.name for o in objs)}
        print(f"[{g}] {len(objs)} objects, lightmap UVs packed in {time.time() - t:.0f}s", flush=True)

    for mood in moods:
        set_mood(world, mood)
        manifest["maps"][mood] = {}
        for g in groups:
            objs = all_groups[g]
            img = bpy.data.images.new(f"LM_{mood}_{g}", q["size"], q["size"], float_buffer=True)
            t = time.time()
            bake_group(objs, img, q)
            clean = denoise(img, q["size"])
            name = f"{mood}_{g}.png"
            scale = encode(clean, OUT / name)
            manifest["maps"][mood][g] = {"file": name, "scale": round(scale, 4)}
            bpy.data.images.remove(img)
            print(f"[{mood}/{g}] baked {q['size']}px x {q['samples']} samples in {time.time() - t:.0f}s, "
                  f"scale {scale:.3f}", flush=True)

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    # restore surface UVs as active, keep the scene light-free of the bake setup
    for o in scene.objects:
        if o.type == "MESH" and o.data.uv_layers.get("UVMap"):
            o.data.uv_layers.active = o.data.uv_layers["UVMap"]
    if "_denoise" in bpy.data.scenes:
        bpy.data.scenes.remove(bpy.data.scenes["_denoise"])
    bpy.ops.wm.save_as_mainfile(filepath=str(BUILD_DIR / "baked.blend"))
    glb = BUILD_DIR / "scene.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_extras=True, export_apply=True,
                              export_lights=True, export_image_format="JPEG", export_jpeg_quality=85)
    print(f"wrote {len(moods) * len(groups)} lightmaps + manifest, baked.blend, scene.glb "
          f"({glb.stat().st_size / 1e6:.0f} MB) in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
