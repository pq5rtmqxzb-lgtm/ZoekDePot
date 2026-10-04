"""Path-traced preview stills of the shell (Cycles), for review and for
comparing against v1 from the same spots.

    python v2/blender/render_preview.py [--samples 96] [--width 1280] [--views woonkamer,gang]

Reads v2/build/shell.blend, writes v2/docs/renders/<view>.png. Lighting is a
physical sky + sun for Den Haag (52.08 N) on a spring afternoon. Plan north
(model -Z) is taken as true north, as in the sales drawing. On a CPU this is
a draft; the final-quality bake/renders run on a GPU (see v2/README.md).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from common import BUILD_DIR, ROOT, P, script_args  # noqa: E402

OUT = ROOT / "v2" / "docs" / "renders"

# Sun: azimuth clockwise from north, elevation (≈ 15:30 in late April).
SUN_AZIMUTH, SUN_ELEVATION = 225.0, 36.0

# name: (eye, target) in MODEL coordinates (x east, y up, z south), eye at
# v1's standing eye height of 1.70 m unless it is an overview.
VIEWS = {
    "woonkamer": ((9.75, 1.70, 13.30), (6.6, 1.25, 2.0)),
    "keuken":    ((8.60, 1.70, 4.20), (5.4, 1.15, 14.5)),
    "slaapk1":   ((5.00, 1.70, 3.90), (0.6, 1.20, 0.6)),
    "gang":      ((0.70, 1.70, 8.75), (6.8, 1.35, 8.80)),   # no windows: off by default until the Phase 2 lamps
    "slaapk2":   ((3.90, 1.70, 11.90), (1.2, 1.10, 15.5)),
    "dollhouse": ((1.0, 24.0, 22.0), (4.9, 0.0, 7.4)),
}


def parse():
    a = script_args()
    opts = {"samples": 96, "width": 1280, "views": ",".join(v for v in VIEWS if v != "gang")}
    for i in range(0, len(a) - 1, 2):
        opts[a[i].lstrip("-")] = a[i + 1]
    return int(opts["samples"]), int(opts["width"]), opts["views"].split(",")


def setup_world(scene):
    w = bpy.data.worlds.new("sky")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_disc = False                      # the sun lamp below is the sun
    sky.sun_elevation = math.radians(SUN_ELEVATION)
    sky.sun_rotation = math.radians(SUN_AZIMUTH)   # verified: = compass azimuth (north = Blender +Y)
    sky.altitude = 30.0
    bg = nt.nodes["Background"]
    bg.inputs["Strength"].default_value = 0.35
    nt.links.new(sky.outputs[0], bg.inputs[0])

    a, e = math.radians(SUN_AZIMUTH), math.radians(SUN_ELEVATION)
    to_sun = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 4.0
    sun.angle = math.radians(0.53)
    sun.color = (1.0, 0.95, 0.88)
    ob = bpy.data.objects.new("sun", sun)
    ob.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(ob)


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
    bpy.ops.wm.open_mainfile(filepath=str(BUILD_DIR / "shell.blend"))
    scene = bpy.context.scene
    setup_world(scene)
    setup_render(scene, samples, width)
    OUT.mkdir(parents=True, exist_ok=True)
    for name in views:
        eye, target = VIEWS[name]
        overview = name == "dollhouse"
        # Dollhouse: lift the lid — no ceilings, no storey above.
        hide = [o for o in bpy.data.objects if overview and (
            o.name.startswith(("ceil.", "slab.upper")) or o.name in ("building.mass", "ground"))]
        for o in hide:
            o.hide_render = True
        scene.render.film_transparent = overview
        # Interiors are lit through windows; the overview sees direct sun.
        scene.view_settings.exposure = -0.5 if overview else 1.0
        cam = camera(scene, eye, target, overview)
        scene.render.filepath = str(OUT / f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {name}")
        for o in hide:
            o.hide_render = False
        bpy.data.objects.remove(cam)


if __name__ == "__main__":
    main()
