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


# hef-schuifpui (build_shell.build_sliding): frame jamb width, and how far the
# opened sliding pane still reaches past the middle into the opening (share of a pane)
PUI_JAMB = 0.08
PUI_OVERLAP = 0.15


def pui_closed_span(g):
    """(a0, a1) along a schuifpui where its panes stand: the fixed pane plus
    the sliding pane slid open over it. The rest is the open, walkable part.
    slide "x1": the panes stack on the x2 half, so the opening is at x1."""
    _, _, _, L = seg_frame(g)
    pw = (L - 2 * PUI_JAMB) / 2
    if g.get("slide") == "x1":
        return L / 2 - PUI_OVERLAP * pw, L
    return 0.0, L / 2 + PUI_OVERLAP * pw


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
