"""Path-traced preview stills (Cycles), for review and for comparing
against v1 from the same spots.

    python v2/blender/render_preview.py [--samples 128] [--width 1280] [--views woonkamer,gang]

Reads v2/build/scene.blend (furnished; falls back to shell.blend) and writes
v2/docs/renders/<view>.png. Day views: physical sky + sun for Den Haag
(52.08 N) at 15:30 in late April; lamps only where a view says so (the
windowless gang, the bathroom). Evening views: low sun in the west-north-
west and every lamp on. Plan north (model -Z) is taken as true north, as in
the sales drawing. On a CPU this is a draft; final-quality renders and bakes
run on a GPU (see v2/README.md).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from common import BUILD_DIR, ROOT, P, script_args  # noqa: E402
from lighting import set_mood, setup_world  # noqa: E402

OUT = ROOT / "v2" / "docs" / "renders"

# name: eye, target in MODEL coordinates (x east, y up, z south; eye at v1's
# standing eye height of 1.70 m unless an overview), lamps = rooms whose
# lamps are on ("*" = all), mood.
VIEWS = {
    "woonkamer": dict(eye=(10.00, 1.70, 13.50), target=(6.9, 1.25, 2.0)),
    "eettafel":  dict(eye=(10.10, 1.70, 9.40), target=(7.2, 0.80, 13.4)),
    "keuken":    dict(eye=(8.60, 1.70, 4.20), target=(5.4, 1.15, 14.5)),
    "eiland":    dict(eye=(10.20, 1.70, 11.00), target=(5.2, 1.00, 10.9)),
    "slx":       dict(eye=(4.62, 1.55, 13.75), target=(5.75, 0.70, 11.2)),
    "slaapk1":   dict(eye=(2.30, 1.70, 3.85), target=(5.4, 0.80, 1.2)),
    "slaapk2":   dict(eye=(3.20, 1.70, 11.75), target=(1.0, 0.90, 14.6)),
    "badkamer":  dict(eye=(4.10, 1.65, 4.85), target=(6.7, 0.80, 6.85), lamps={"badkamer"}),
    "badkamer2": dict(eye=(6.60, 1.65, 4.70), target=(4.0, 0.90, 6.60), lamps={"badkamer"}),
    "gang":      dict(eye=(0.70, 1.70, 8.75), target=(6.8, 1.35, 8.80), lamps={"gang"}),
    "avond":     dict(eye=(10.00, 1.70, 13.50), target=(6.9, 1.25, 2.0), lamps="*", mood="evening"),
    "nacht":     dict(eye=(10.00, 1.70, 13.50), target=(6.9, 1.25, 2.0), lamps="*", mood="night"),
    "dollhouse": dict(eye=(1.0, 24.0, 22.0), target=(4.9, 0.0, 7.4), overview=True),
}


def parse():
    a = script_args()
    opts = {"samples": 128, "width": 1280, "views": ",".join(VIEWS)}
    for i in range(0, len(a) - 1, 2):
        opts[a[i].lstrip("-")] = a[i + 1]
    return int(opts["samples"]), int(opts["width"]), opts["views"].split(",")


def setup_render(scene, samples, width):
    scene.render.engine = "CYCLES"
    c = scene.cycles
    c.device = "CPU"
    c.samples = samples
    c.use_adaptive_sampling = True
    c.use_denoising = True
    c.max_bounces, c.diffuse_bounces, c.glossy_bounces = 8, 6, 3
    c.transparent_max_bounces = 16
    c.caustics_reflective = c.caustics_refractive = False
    c.blur_glossy = 1.0
    scene.render.resolution_x = width
    scene.render.resolution_y = round(width * 9 / 16)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.0


def camera(scene, eye, target, overview):
    cam = bpy.data.cameras.new("cam")
    cam.sensor_fit = "HORIZONTAL"
    cam.angle = math.radians(60 if overview else 78)   # v1 holds ~80° horizontal
    cam.clip_start = 0.05
    ob = bpy.data.objects.new("cam", cam)
    scene.collection.objects.link(ob)
    ob.location = Vector(P(*eye))
    ob.rotation_euler = (Vector(P(*target)) - ob.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = ob
    return ob


def main():
    samples, width, views = parse()
    blend = BUILD_DIR / "scene.blend"
    bpy.ops.wm.open_mainfile(filepath=str(blend if blend.exists() else BUILD_DIR / "shell.blend"))
    scene = bpy.context.scene
    world = setup_world(scene)
    setup_render(scene, samples, width)
    OUT.mkdir(parents=True, exist_ok=True)
    for name in views:
        v = VIEWS[name]
        eye, target, overview = v["eye"], v["target"], v.get("overview", False)
        m = set_mood(world, v.get("mood", "day"), lamps=v.get("lamps", set()))
        # Dollhouse: lift the lid — no ceilings, no storey above.
        hide = [o for o in bpy.data.objects if overview and (
            o.name.startswith(("ceil.", "slab.upper")) or o.name in ("building.mass", "ground"))]
        for o in hide:
            o.hide_render = True
        scene.render.film_transparent = overview
        # Interiors are lit through windows; the overview sees direct sun.
        scene.view_settings.exposure = -0.5 if overview else m["exposure"]
        cam = camera(scene, eye, target, overview)
        scene.render.filepath = str(OUT / f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {name}")
        for o in hide:
            o.hide_render = False
        bpy.data.objects.remove(cam)


if __name__ == "__main__":
    main()
