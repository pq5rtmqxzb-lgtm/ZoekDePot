"""Pure-Python 2D plan helpers (no Blender), shared by the Blender scripts
via common.py and by plain-Python checks such as check_furniture.py.
Plan coordinates: x east, z south, metres (data/model.json frame)."""
import math


def seg_frame(g):
    """Origin, unit along-vector, right-hand normal (dz, -dx)/L, length."""
    dx, dz = g["x2"] - g["x1"], g["z2"] - g["z1"]
    L = math.hypot(dx, dz)
    u = (dx / L, dz / L)
    n = (dz / L, -dx / L)
    return (g["x1"], g["z1"]), u, n, L


def seg_point(g, a, o):
    """Plan point at distance a along the segment and o along its normal."""
    (x, z), u, n, _ = seg_frame(g)
    return (x + u[0] * a + n[0] * o, z + u[1] * a + n[1] * o)


def seg_local(g, px, pz):
    """(along, offset) of a plan point in the segment frame."""
    (x, z), u, n, _ = seg_frame(g)
    dx, dz = px - x, pz - z
    return dx * u[0] + dz * u[1], dx * n[0] + dz * n[1]


def point_in_poly(px, pz, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, zi = pts[i]
        xj, zj = pts[j]
        if (zi > pz) != (zj > pz) and px < (xj - xi) * (pz - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def room_at(rooms, px, pz):
    """First room containing the point. model.json lists enclosed rooms
    (toilet, bergingen, kasten) before their container, as v1 relies on."""
    for r in rooms:
        for rc in r["rects"]:
            if rc["x1"] <= px <= rc["x2"] and rc["z1"] <= pz <= rc["z2"]:
                return r
        for poly in r["polys"]:
            if point_in_poly(px, pz, poly):
                return r
    return None
