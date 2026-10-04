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
ceilings, frames — the rooms), `furniture`, and `exterior` (facade,
railings, balconies, corridor; half resolution).
"""
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402

from common import BUILD_DIR, script_args  # noqa: E402
from lighting import MOODS, set_mood, setup_world  # noqa: E402

OUT = BUILD_DIR / "lightmaps"
QUALITY = {
    "draft": dict(size=2048, samples=64, device="CPU", margin=16),
    "final": dict(size=4096, samples=1024, device="GPU", margin=16),
}
LM = "Lightmap"
SHELL_COLLECTIONS = ("walls", "floors", "ceilings", "frames", "railings")
SKIP_MATERIALS = {"M_glass", "M_frosted", "M_sheer", "M_bulb"}


def parse():
    a = script_args()
    opts = {"quality": "draft", "moods": ",".join(MOODS), "groups": "shell,furniture,exterior"}
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


EXTERIOR_ROOMS = ("balkon_n", "balkon_z", "corridor")


def is_exterior(o):
    """Outside the flat: facade skin, railings, screens, balconies and the
    shared corridor. Baked into their own atlas at half resolution, so the
    rooms get the texels."""
    if o.name.startswith(("facade.", "railing.", "screen.")):
        return True
    return o.get("room") in EXTERIOR_ROOMS


def groups_of(scene_objects):
    shell, furn, ext = [], [], []
    for o in scene_objects:
        if not bakeable(o):
            continue
        colls = {c.name for c in o.users_collection}
        if colls & set(SHELL_COLLECTIONS):
            (ext if is_exterior(o) else shell).append(o)
        elif "furniture" in colls:
            (ext if is_exterior(o) else furn).append(o)
    return {"shell": shell, "furniture": furn, "exterior": ext}


GROUP_SCALE = {"shell": 1.0, "furniture": 1.0, "exterior": 0.5}


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


def hidden_faces(objs, gap=0.02):
    """Faces that touch something within `gap` along their normal (backs
    against a wall, carcasses behind fronts, bottoms on the floor): never
    seen, so they only get a speck of the atlas."""
    dg = bpy.context.evaluated_depsgraph_get()
    scene = bpy.context.scene
    out = {}
    for o in objs:
        mw = o.matrix_world
        rot = mw.to_3x3()
        hid = set()
        verts = o.data.vertices
        for poly in o.data.polygons:
            n = (rot @ poly.normal).normalized()
            c = mw @ poly.center
            # hidden only if the centre AND every corner (pulled 15 % in) are
            # covered: a rug in the middle of a floor must not hide the floor
            pts = [c] + [c.lerp(mw @ verts[v].co, 0.85) for v in poly.vertices]
            if all(scene.ray_cast(dg, p + n * 0.002, n, distance=gap)[0] for p in pts):
                hid.add(poly.index)
        out[o.name] = hid
    return out


def uv_top(objs):
    """Largest lightmap U or V over the group (objects in edit mode)."""
    top = 0.0
    for o in objs:
        bm = bmesh.from_edit_mesh(o.data)
        lay = bm.loops.layers.uv[LM]
        for f in bm.faces:
            for lp in f.loops:
                top = max(top, lp[lay].uv.x, lp[lay].uv.y)
    return top


def lightmap_uvs(objs, size):
    """Second UV map per object, unwrapped and packed into ONE atlas for the
    whole group at a uniform texel density; hidden faces shrink to specks
    first, so the packer hands their space to the visible ones."""
    hidden = hidden_faces(objs)
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
    # shrink hidden faces in the same edit session (leaving edit mode in
    # between made the packer skip the islands)
    n_hidden = 0
    for o in objs:
        bm = bmesh.from_edit_mesh(o.data)
        bm.faces.ensure_lookup_table()
        lay = bm.loops.layers.uv[LM]
        for i in hidden[o.name]:
            f = bm.faces[i]
            cx = sum(lp[lay].uv.x for lp in f.loops) / len(f.loops)
            cy = sum(lp[lay].uv.y for lp in f.loops) / len(f.loops)
            for lp in f.loops:
                u, v = lp[lay].uv
                lp[lay].uv = (cx + (u - cx) * 0.03, cy + (v - cy) * 0.03)
        n_hidden += len(hidden[o.name])
        bmesh.update_edit_mesh(o.data)
    # the packer fills the UDIM tile *nearest the islands*: after
    # average_islands_scale they can sit around (1, 1), so bring the whole
    # group back inside 0..1 first or it packs into the wrong tile
    lo, hi = [1e9, 1e9], [-1e9, -1e9]
    for o in objs:
        bm = bmesh.from_edit_mesh(o.data)
        lay = bm.loops.layers.uv[LM]
        for f in bm.faces:
            for lp in f.loops:
                u, v = lp[lay].uv
                lo = [min(lo[0], u), min(lo[1], v)]
                hi = [max(hi[0], u), max(hi[1], v)]
    k = 0.98 / max(hi[0] - lo[0], hi[1] - lo[1], 1e-9)
    for o in objs:
        bm = bmesh.from_edit_mesh(o.data)
        lay = bm.loops.layers.uv[LM]
        for f in bm.faces:
            for lp in f.loops:
                u, v = lp[lay].uv
                lp[lay].uv = (0.01 + (u - lo[0]) * k, 0.01 + (v - lo[1]) * k)
        bmesh.update_edit_mesh(o.data)
    bpy.ops.uv.select_all(action="SELECT")
    # with thousands of islands a margin that is too wide for the atlas makes
    # the packer give up scaling (islands end up beyond 0..1, overlapping
    # when the texture wraps): halve the margin until everything fits
    for px in (4.0, 2.0, 1.0, 0.5):
        bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", margin_method="FRACTION", margin=px / size,
                                rotate=True, shape_method="AABB")
        if uv_top(objs) <= 1.0:
            break
        print(f"  margin {px}px too wide for {size}px, repacking", flush=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    return n_hidden


def bake_group(objs, img, q):
    """Bake light (direct + indirect, no surface colour) into `img`.
    Cycles bakes selected objects one by one and re-syncs the whole scene
    for each (~2 s apiece), so the group is baked as ONE joined stand-in:
    copies of its objects joined into a single mesh (same lightmap UVs),
    with the originals hidden meanwhile so no surface is doubled."""
    scene = bpy.context.scene
    copies = []
    for o in objs:
        c = o.copy()
        c.data = o.data.copy()
        scene.collection.objects.link(c)
        copies.append(c)
        o.hide_render = True
    bpy.ops.object.select_all(action="DESELECT")
    for c in copies:
        c.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    stand_in = bpy.context.view_layer.objects.active
    stand_in.data.uv_layers.active = stand_in.data.uv_layers[LM]
    mats = {s.material for s in stand_in.material_slots if s.material}
    for m in mats:
        nt = m.node_tree
        node = nt.nodes.get("LM_bake") or nt.nodes.new("ShaderNodeTexImage")
        node.name = "LM_bake"
        node.image = img
        nt.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    stand_in.select_set(True)
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True,
                        margin=q["margin"], target="IMAGE_TEXTURES")
    for m in mats:
        m.node_tree.nodes.remove(m.node_tree.nodes["LM_bake"])
    me = stand_in.data
    bpy.data.objects.remove(stand_in)
    bpy.data.meshes.remove(me)
    for o in objs:
        o.hide_render = False


def pixels(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def fill_empty(img, steps=48):
    """Grow the baked islands into the empty atlas (each empty texel takes
    the mean of its baked neighbours, repeatedly). Without it the black
    background bleeds into island edges when denoising and in the viewer's
    mipmaps — dark seams along every edge."""
    a = pixels(img)
    rgb = a[..., :3].copy()
    known = rgb.max(axis=-1) > 0
    for _ in range(steps):
        if known.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            k = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(rgb, (dy, dx), (0, 1)) * k[..., None]
            cnt += k
        grow = ~known & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        known = known | grow
    a[..., :3] = rgb
    a[..., 3] = 1.0
    img.pixels.foreach_set(a.ravel())
    return known


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
    the brightest 0.5 % (sun patches, lamp shades) from crushing the rest."""
    rgb = np.maximum(a[..., :3], 0)
    lit = rgb.max(axis=-1)
    valid = lit[lit > 1e-5]
    scale = float(np.percentile(valid, 99.5)) if valid.size else 1.0
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
    scene.cycles.sample_clamp_indirect = 10.0     # no fireflies from bounces off bright lamp shades
    OUT.mkdir(parents=True, exist_ok=True)

    all_groups = groups_of(list(scene.objects))
    manifest = {"version": 1, "quality": quality, "uv": f"{LM} (glTF TEXCOORD_1)",
                "encoding": "srgb", "how": "colour = albedo x lightmap x scale (lightmap in sRGB)",
                "groups": {}, "maps": {}}
    for g in groups:
        objs = all_groups[g]
        apply_modifiers(objs)
        t = time.time()
        size = int(q["size"] * GROUP_SCALE.get(g, 1.0))
        n_hidden = lightmap_uvs(objs, size)
        manifest["groups"][g] = {"size": size, "objects": sorted(o.name for o in objs)}
        print(f"[{g}] {len(objs)} objects, {n_hidden} hidden faces shrunk, lightmap UVs packed in "
              f"{time.time() - t:.0f}s", flush=True)

    for mood in moods:
        set_mood(world, mood)
        manifest["maps"][mood] = {}
        for g in groups:
            objs = all_groups[g]
            size = manifest["groups"][g]["size"]
            img = bpy.data.images.new(f"LM_{mood}_{g}", size, size, float_buffer=True)
            t = time.time()
            bake_group(objs, img, q)
            fill_empty(img)
            clean = denoise(img, size)
            name = f"{mood}_{g}.png"
            scale = encode(clean, OUT / name)
            manifest["maps"][mood][g] = {"file": name, "scale": round(scale, 4)}
            bpy.data.images.remove(img)
            print(f"[{mood}/{g}] baked {size}px x {q['samples']} samples in {time.time() - t:.0f}s, "
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
