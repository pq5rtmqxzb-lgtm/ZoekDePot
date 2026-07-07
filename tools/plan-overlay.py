#!/usr/bin/env python3
"""Phase 3 fidelity check: overlay the 3D model's plan on apartment.json.

Reads the wall centrelines from data/model.json (the geometry the 3D
walkthrough is actually built from) and draws them on top of the room
polygons from apartment.json, at the same 1:50 world scale used by
render-floorplan.py. Two outputs:

  * floorplan/overlay.png  — a top-down picture for the side-by-side viewer.
  * stdout report          — every model wall/door endpoint that sits more than
                             TOL metres off the nearest JSON room/envelope edge.

If the picture shows blue walls sitting exactly on the grey room edges and the
report lists no off-plan endpoints, the 3D model matches the plan.
"""
import importlib.util
import json
import math
import pathlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon

ROOT = pathlib.Path(__file__).resolve().parent.parent
FLOORPLAN_DIR = ROOT / "floorplan"
MODEL_JSON = ROOT / "data" / "model.json"
OUT_PNG = FLOORPLAN_DIR / "overlay.png"

TOL = 0.05  # metres; a wall endpoint further than this from any plan edge is flagged

# Reuse the room/envelope geometry from the JSON renderer (its filename has a
# hyphen, so load it by path rather than a normal import).
_spec = importlib.util.spec_from_file_location(
    "render_floorplan", ROOT / "tools" / "render-floorplan.py"
)
render_floorplan = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(render_floorplan)
DATA = render_floorplan.DATA

KIND_STYLE = {
    "wall":    {"color": "#1f5fd0", "lw": 3.0, "label": "wall"},
    "door":    {"color": "#e8820c", "lw": 3.0, "label": "door opening"},
    "sliding": {"color": "#1c9c4b", "lw": 3.0, "label": "sliding door"},
    "window":  {"color": "#00b8c4", "lw": 3.0, "label": "window"},
    "railing": {"color": "#8b3fc0", "lw": 2.0, "label": "balcony railing"},
}


def parse_apartment_geom():
    """Load the wall-centreline segments from data/model.json."""
    segs = json.loads(MODEL_JSON.read_text())["geom"]
    if not segs:
        raise SystemExit("data/model.json contains no geometry")
    return segs


def plan_edges():
    """Every edge (as a (p1, p2) segment) of the JSON room polygons +
    envelope. These are the lines the model walls are expected to lie on."""
    edges = []
    for r in render_floorplan.rooms():
        poly = r["polygon"]
        for i in range(len(poly)):
            edges.append((tuple(poly[i]), tuple(poly[(i + 1) % len(poly)])))
    env = render_floorplan.envelope()
    for i in range(len(env)):
        edges.append((tuple(env[i]), tuple(env[(i + 1) % len(env)])))
    return edges


def point_seg_dist(p, a, b):
    px, py = p
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def nearest_edge_dist(p, edges):
    return min(point_seg_dist(p, a, b) for a, b in edges)


def build_report(segs, edges):
    """For wall/door/sliding segments, flag endpoints off every plan edge."""
    flagged = []
    checked = 0
    for s in segs:
        if s["kind"] == "railing":
            continue  # railings are outdoor balcony edges, not interior plan walls
        for (x, z) in ((s["x1"], s["z1"]), (s["x2"], s["z2"])):
            checked += 1
            d = nearest_edge_dist((x, z), edges)
            if d > TOL:
                flagged.append((s["kind"], x, z, d))
    return checked, flagged


def draw(segs):
    fig, ax = plt.subplots(figsize=(7.5, 10.2), dpi=110)

    # JSON room polygons (grey fills + labels)
    for r in render_floorplan.rooms():
        xs = [p[0] for p in r["polygon"]]
        zs = [p[1] for p in r["polygon"]]
        ax.add_patch(MplPolygon(list(zip(xs, zs)), closed=True,
                                facecolor="#e9e9ee", edgecolor="#9a9aa6",
                                linewidth=0.8, zorder=1))
        cx, cz = r["centroid"]
        ax.text(cx, cz, r["name"], ha="center", va="center",
                fontsize=6.5, color="#555", zorder=2)

    # JSON envelope outline
    env = render_floorplan.envelope()
    env = env + [env[0]]
    ax.plot([p[0] for p in env], [p[1] for p in env],
            color="#000", linewidth=1.4, zorder=3)

    # Model geometry from APARTMENT_GEOM
    seen = set()
    for s in segs:
        st = KIND_STYLE[s["kind"]]
        lbl = st["label"] if s["kind"] not in seen else None
        seen.add(s["kind"])
        ax.plot([s["x1"], s["x2"]], [s["z1"], s["z2"]],
                color=st["color"], linewidth=st["lw"], solid_capstyle="round",
                label=lbl, zorder=4)

    # Raw PDF mm callouts (faint), for cross-checking against the PDF pane
    for d in DATA["raw_dimensions_pdf"]:
        px, py = d["pdf_xy"]
        wx = (px - 146.0) / 56.7
        wy = (py - 174.6) / 56.7
        ax.text(wx, wy, str(d["mm"]), fontsize=4.5, color="#06c",
                alpha=0.45, ha="center", va="center", zorder=5)

    ax.set_aspect("equal")
    ax.invert_yaxis()  # +Y is south (down in the plan)
    ax.set_xlim(-3.0, 11.5)
    ax.set_ylim(18.0, -2.0)
    ax.set_xlabel("x (m, east →)")
    ax.set_ylabel("y (m, south ↓)")
    ax.set_title("3D model (APARTMENT_GEOM) overlaid on apartment.json", fontsize=9)
    ax.grid(True, color="#eef", linewidth=0.5)
    ax.legend(loc="lower right", fontsize=6, framealpha=0.9)
    fig.tight_layout()
    fig.savefig(OUT_PNG)
    plt.close(fig)


if __name__ == "__main__":
    segs = parse_apartment_geom()
    edges = plan_edges()
    draw(segs)
    checked, flagged = build_report(segs, edges)
    print(f"Wrote {OUT_PNG}")
    print(f"Parsed {len(segs)} APARTMENT_GEOM segments.")
    print(f"Checked {checked} wall/door/sliding endpoints against "
          f"{len(edges)} plan edges (tolerance {TOL} m).")
    if not flagged:
        print("OK: every model endpoint lies on a plan edge within tolerance.")
    else:
        print(f"OFF-PLAN endpoints ({len(flagged)}):")
        for kind, x, z, d in sorted(flagged, key=lambda f: -f[3]):
            print(f"  {kind:8s} ({x:7.3f}, {z:7.3f})  {d*1000:6.0f} mm off nearest edge")
