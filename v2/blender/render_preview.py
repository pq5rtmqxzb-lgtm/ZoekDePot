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

OUT = ROOT / "v2" / "docs" / "renders"

# Sun per mood: azimuth clockwise from north, elevation, strength, colour;
# sky strength. Day ≈ 15:30 in late April; evening ≈ 20:45 (sunset WNW).
MOODS = {
    "day":     dict(az=225.0, el=36.0, sun=4.0, color=(1.0, 0.95, 0.88), sky=1.0, exposure=1.3),
    "evening": dict(az=292.0, el=3.0, sun=1.2, color=(1.0, 0.62, 0.38), sky=0.08, exposure=1.4),
}

# name: eye, target in MODEL coordinates (x east, y up, z south; eye at v1's
# standing eye height of 1.70 m unless an overview), lamps = rooms whose
# lamps are on ("*" = all), mood.
VIEWS = {
    "woonkamer": dict(eye=(9.25, 1.70, 13.45), target=(6.9, 1.25, 2.0)),
    "eettafel":  dict(eye=(10.25, 1.70, 9.90), target=(7.4, 0.85, 5.0)),
    "keuken":    dict(eye=(8.60, 1.70, 4.20), target=(5.4, 1.15, 14.5)),
    "eiland":    dict(eye=(9.60, 1.70, 12.80), target=(5.2, 1.00, 10.9)),
    "slaapk1":   dict(eye=(2.30, 1.70, 3.85), target=(5.4, 0.80, 1.2)),
    "slaapk2":   dict(eye=(3.20, 1.70, 11.75), target=(1.0, 0.90, 14.6)),
    "badkamer":  dict(eye=(4.20, 1.70, 6.35), target=(6.6, 0.90, 4.5), lamps={"badkamer"}),
    "gang":      dict(eye=(0.70, 1.70, 8.75), target=(6.8, 1.35, 8.80), lamps={"gang"}),
    "avond":     dict(eye=(9.25, 1.70, 13.45), target=(6.9, 1.25, 2.0), lamps="*", mood="evening"),
    "dollhouse": dict(eye=(1.0, 24.0, 22.0), target=(4.9, 0.0, 7.4), overview=True),
}


def parse():
    a = script_args()
    opts = {"samples": 128, "width": 1280, "views": ",".join(VIEWS)}
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
    sky.sun_disc = False                      # the sun lamp is the sun
    sky.altitude = 30.0
    nt.links.new(sky.outputs[0], nt.nodes["Background"].inputs[0])
    sun = bpy.data.lights.new("sun", "SUN")
    sun.angle = math.radians(0.53)
    ob = bpy.data.objects.new("sun", sun)
    scene.collection.objects.link(ob)
    return sky, nt.nodes["Background"], ob


def set_mood(world, mood):
    sky, bg, sun = world
    m = MOODS[mood]
    sky.sun_elevation = math.radians(m["el"])
    sky.sun_rotation = math.radians(m["az"])   # verified: = compass azimuth (north = Blender +Y)
    bg.inputs["Strength"].default_value = m["sky"]
    a, e = math.radians(m["az"]), math.radians(m["el"])
    to_sun = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
    sun.data.energy, sun.data.color = m["sun"], m["color"]
    sun.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()
    return m


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
    lamps = [o for o in bpy.data.objects if o.get("part") == "light"]
    bulbs = bpy.data.materials.get("M_bulb")
    OUT.mkdir(parents=True, exist_ok=True)
    for name in views:
        v = VIEWS[name]
        eye, target, overview = v["eye"], v["target"], v.get("overview", False)
        m = set_mood(world, v.get("mood", "day"))
        on = v.get("lamps", set())
        for o in lamps:
            o.hide_render = not (on == "*" or o.get("room") in on)
        if bulbs:   # glowing bulbs only when some lamp is on
            bulbs.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 6.0 if on else 0.0
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
