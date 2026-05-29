#!/usr/bin/env python3
"""Ground-truth check: overlay the apartment.json plan (the source of
floorplan.svg) and the 3D model walls (APARTMENT_GEOM) directly on the original
PDF scan, so JSON -> SVG can be iterated until it equals the PDF.

A world->pixel affine is calibrated against four confident features in
floorplan/floorplan-pdf.png:
  east facade  x=10.72  -> col 1390
  slaapk1 wall x= 5.52  -> col  785
  top facade   z= 0.00  -> row   84
  bottom facade z=13.802 -> row 1729

Outputs floorplan/pdf-overlay.png. Grey fill = apartment.json rooms,
black line = json envelope, blue = model walls, orange = doors, green = sliding.
Where a black PDF wall has no coloured line on it (or vice-versa), the plan and
the ground truth disagree there.
"""
import importlib.util
import pathlib
import re

import matplotlib
matplotlib.use("Agg")
import matplotlib.image as mpimg
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon

ROOT = pathlib.Path(__file__).resolve().parent.parent
FLOORPLAN_DIR = ROOT / "floorplan"
PDF_PNG = FLOORPLAN_DIR / "floorplan-pdf.png"
INDEX = ROOT / "index.html"
OUT_PNG = FLOORPLAN_DIR / "pdf-overlay.png"

# world (meters) -> PDF pixel.
# floorplan-pdf.png is the FULL page rendered from YP_bouwnummer_25.pdf at 2x.
# Scale is authoritative: pt_per_meter=56.7 (from the PDF) x 2 = 113.4 px/m.
# Offsets balanced so interior walls (slaapk1 east) and the facades both land
# within ~0.1 m. The whole apartment incl. the NW alcove is visible.
BX, AX = 113.4, 306.0    # col = AX + BX * x
BZ, AZ = 113.4, 347.0    # row = AZ + BZ * z
def cx(x): return AX + BX * x
def cz(z): return AZ + BZ * z

_spec = importlib.util.spec_from_file_location(
    "render_floorplan", ROOT / "tools" / "render-floorplan.py")
render_floorplan = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(render_floorplan)

KIND_STYLE = {"wall": "#0a64ff", "door": "#ff8000", "sliding": "#13c24b", "railing": "#9b30d0"}


def parse_geom():
    body = re.search(r"const APARTMENT_GEOM\s*=\s*\[(.*?)\n\];", INDEX.read_text(), re.S).group(1)
    segs = []
    for mo in re.finditer(
        r"kind:\s*'(\w+)'.*?x1:\s*(-?[\d.]+).*?z1:\s*(-?[\d.]+).*?x2:\s*(-?[\d.]+).*?z2:\s*(-?[\d.]+)", body):
        k, x1, z1, x2, z2 = mo.groups()
        segs.append((k, float(x1), float(z1), float(x2), float(z2)))
    return segs


def draw(show_rooms=True, show_walls=True):
    img = mpimg.imread(PDF_PNG)
    fig, ax = plt.subplots(figsize=(12, 18), dpi=120)
    ax.imshow(img)

    if show_rooms:
        for r in render_floorplan.rooms():
            pts = [(cx(px), cz(pz)) for px, pz in r["polygon"]]
            ax.add_patch(MplPolygon(pts, closed=True, facecolor="none",
                                    edgecolor="#d00000", alpha=0.55, linewidth=1.3))
        env = render_floorplan.envelope()
        env = env + [env[0]]
        ax.plot([cx(p[0]) for p in env], [cz(p[1]) for p in env],
                color="#d00000", linewidth=1.6, alpha=0.7)

    if show_walls:
        for k, x1, z1, x2, z2 in parse_geom():
            ax.plot([cx(x1), cx(x2)], [cz(z1), cz(z2)], color=KIND_STYLE[k],
                    linewidth=3.2 if k != "railing" else 2.0, alpha=0.85,
                    solid_capstyle="round")

    ax.set_xlim(60, 1440)
    ax.set_ylim(2200, 0)
    ax.set_title("apartment.json rooms (red) + model walls (blue) over the PDF", fontsize=11)
    fig.tight_layout()
    fig.savefig(OUT_PNG)
    plt.close(fig)
    print(f"Wrote {OUT_PNG}")


if __name__ == "__main__":
    draw()
