"""Light moods shared by render_preview.py and bake.py, so path-traced
previews and baked lightmaps use exactly the same light.

Sky + sun for Den Haag (52.08 N); plan north (model -Z, Blender +Y) is true
north. The Nishita sky's sun_rotation equals the compass azimuth (verified
against a marker due east). Lamps are the `light.*` objects made by
build_furniture.py, switched per room.
"""
import math

import bpy
from mathutils import Vector

# Sun: azimuth clockwise from north, elevation, strength, colour; sky
# strength; preview exposure; which rooms have their lamps on ("*" = all).
# Day ≈ 15:30 late April; evening ≈ 20:45 (sunset WNW); night: lamps only.
WINDOWLESS = {"gang", "badkamer", "badkklein", "toilet", "berging", "berging2", "kast_boiler", "kast_vv"}
MOODS = {
    "day":     dict(az=225.0, el=36.0, sun=4.0, color=(1.0, 0.95, 0.88), sky=1.0, exposure=1.3,
                    lamps=WINDOWLESS),
    "evening": dict(az=292.0, el=3.0, sun=1.2, color=(1.0, 0.62, 0.38), sky=0.08, exposure=1.4,
                    lamps="*"),
    "night":   dict(az=0.0, el=-10.0, sun=0.0, color=(1.0, 1.0, 1.0), sky=0.004, exposure=1.4,
                    lamps="*"),
}


def setup_world(scene):
    """Nishita sky (no sun disc: the sun lamp is the sun) + a sun lamp."""
    w = bpy.data.worlds.new("sky")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_disc = False
    sky.altitude = 30.0
    nt.links.new(sky.outputs[0], nt.nodes["Background"].inputs[0])
    sun = bpy.data.lights.new("sun", "SUN")
    sun.angle = math.radians(0.53)
    ob = bpy.data.objects.new("sun", sun)
    scene.collection.objects.link(ob)
    return sky, nt.nodes["Background"], ob


def set_mood(world, mood, lamps=None):
    """Point sun and sky at `mood`; switch lamps (default: the mood's own
    set). Returns the mood dict."""
    sky, bg, sun = world
    m = MOODS[mood]
    sky.sun_elevation = math.radians(max(m["el"], 0.0))
    sky.sun_rotation = math.radians(m["az"])
    bg.inputs["Strength"].default_value = m["sky"]
    a, e = math.radians(m["az"]), math.radians(m["el"])
    to_sun = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
    sun.data.energy, sun.data.color = m["sun"], m["color"]
    sun.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()
    sun.hide_render = m["sun"] <= 0
    set_lamps(m["lamps"] if lamps is None else lamps)
    return m


def set_lamps(on):
    """Lamps (and glowing bulbs) on in the rooms in `on` ("*" = all)."""
    for o in bpy.data.objects:
        if o.get("part") == "light":
            o.hide_render = not (on == "*" or o.get("room") in on)
    bulbs = bpy.data.materials.get("M_bulb")
    if bulbs:
        bsdf = next(n for n in bulbs.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Emission Strength"].default_value = 6.0 if on else 0.0
