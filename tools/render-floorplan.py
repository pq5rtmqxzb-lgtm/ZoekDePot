#!/usr/bin/env python3
"""Phase 2 renderer: reads apartment.json and emits floorplan.svg.

The SVG is drawn in apartment world coordinates (meters, +X east, +Y south)
and exported at 1:50 scale so it lines up with the source PDF when both are
displayed at the same zoom. Every dimension and polygon comes from the JSON;
this script introduces no new measurements.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FLOORPLAN_DIR = ROOT / "floorplan"
DATA = json.loads((FLOORPLAN_DIR / "apartment.json").read_text())

# 1:50 scale → 1 m reality = 20 mm paper. At 96 DPI: 1 mm = 96/25.4 px = 3.7795 px.
PX_PER_MM_PAPER = 96.0 / 25.4
PX_PER_M = PX_PER_MM_PAPER * 20.0  # 75.59 px / m at 1:50, 96 DPI

# Drawable extent in world coordinates (meters). Apartment occupies roughly
# x ∈ [-2.5, 11], y ∈ [-1.5, 17.5] including balconies + zigzag.
WORLD_MIN_X = -3.0
WORLD_MAX_X = 11.5
WORLD_MIN_Y = -2.0
WORLD_MAX_Y = 18.0

WIDTH_PX = (WORLD_MAX_X - WORLD_MIN_X) * PX_PER_M
HEIGHT_PX = (WORLD_MAX_Y - WORLD_MIN_Y) * PX_PER_M


def to_px(pt):
    """World (m) → SVG pixel."""
    x, y = pt
    return ((x - WORLD_MIN_X) * PX_PER_M, (y - WORLD_MIN_Y) * PX_PER_M)


def polyline(points, **attrs):
    pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in (to_px(p) for p in points))
    a = " ".join(f'{k}="{v}"' for k, v in attrs.items())
    return f'<polyline points="{pts}" {a}/>'


def polygon(points, **attrs):
    pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in (to_px(p) for p in points))
    a = " ".join(f'{k}="{v}"' for k, v in attrs.items())
    return f'<polygon points="{pts}" {a}/>'


def line(p1, p2, **attrs):
    (x1, y1), (x2, y2) = to_px(p1), to_px(p2)
    a = " ".join(f'{k}="{v}"' for k, v in attrs.items())
    return f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" {a}/>'


def text(p, body, *, size=10, anchor="middle", color="#222", **attrs):
    x, y = to_px(p)
    a = " ".join(f'{k}="{v}"' for k, v in attrs.items())
    return (
        f'<text x="{x:.2f}" y="{y:.2f}" font-family="Helvetica, Arial, sans-serif" '
        f'font-size="{size}" text-anchor="{anchor}" fill="{color}" {a}>{body}</text>'
    )


def grid():
    out = []
    # 1m grid
    x = int(WORLD_MIN_X) - 1
    while x <= WORLD_MAX_X + 1:
        out.append(
            line(
                (x, WORLD_MIN_Y), (x, WORLD_MAX_Y),
                stroke="#eef", **{"stroke-width": "0.5"},
            )
        )
        x += 1
    y = int(WORLD_MIN_Y) - 1
    while y <= WORLD_MAX_Y + 1:
        out.append(
            line(
                (WORLD_MIN_X, y), (WORLD_MAX_X, y),
                stroke="#eef", **{"stroke-width": "0.5"},
            )
        )
        y += 1
    # 5m emphasis
    for m in range(-5, 25, 5):
        if WORLD_MIN_X <= m <= WORLD_MAX_X:
            out.append(
                line(
                    (m, WORLD_MIN_Y), (m, WORLD_MAX_Y),
                    stroke="#ccd", **{"stroke-width": "0.8"},
                )
            )
        if WORLD_MIN_Y <= m <= WORLD_MAX_Y:
            out.append(
                line(
                    (WORLD_MIN_X, m), (WORLD_MAX_X, m),
                    stroke="#ccd", **{"stroke-width": "0.8"},
                )
            )
    return "\n".join(out)


def envelope():
    """Apartment outer boundary (interior faces), traced from the PDF's vector
    wall lines. Clockwise from the north-facade east end: east facade (x=10.52
    inner), woonkamer south (z=13.81), the kitchen-bay/balkon partition, the
    deep south facade (z=15.41/15.68), the SW diagonal, the west facade
    (x=0.19), chamfer-2 up to the voordeur, then the NW zigzag + long chamfer
    back to the north facade."""
    zig = DATA["nw_zigzag"]["points_clockwise_from_top_facade"]
    pts = [[10.52, 0.01], [10.52, 13.81],            # east facade (inner)
           [6.72, 13.81], [6.72, 15.68],             # kitchen-bay partition
           [4.67, 15.68], [4.67, 15.41],             # kitchen slider + jog
           [3.45, 15.41], [3.45, 15.68],             # slaapk2 east pier
           [1.68, 15.68], [1.68, 15.41],             # slaapk2 slider (recessed)
           [1.15, 15.41], [0.19, 14.85],             # west pier + SW diagonal
           [0.19, 9.54], [0.19, 7.96], [0.24, 6.74], # west facade (inner x=0.19)
           [1.69, 4.23],                             # chamfer-2 up to the entry
           [1.92, 3.95], [1.92, 4.87],               # voordeur wall (door z 3.95..4.87)
           [1.92, 3.95]]                             # back to the chamfer end
    pts.extend(reversed(zig))                        # NW zigzag back to (0.71, 0.21)
    pts.extend([[1.58, 0.21], [1.58, 0.01]])         # facade jog at the tip window
    return pts


def rooms():
    """Room polygons (interior faces), traced from the PDF's vector lines and
    confirmed by the PDF's own room labels + dimension callouts."""
    R = []

    # slaapkamer 1 — main rect (1.92..5.59 x 0.21..4.21, dims 3675/4000) plus
    # the entry alcove (to z=4.87; the room's door is in the z=4.87 plane) and
    # the NW tip behind the zigzag facade.
    zig = DATA["nw_zigzag"]["points_clockwise_from_top_facade"]
    s1 = [(5.59, 0.21), (5.59, 4.21), (3.76, 4.21), (3.76, 4.87),
          (1.92, 4.87)]
    s1.extend(reversed(zig))    # (1.92,3.95) ... (0.71,0.21)
    R.append({"name": "slaapkamer 1", "label": "23,45 m²", "fill": "#fff4e6",
              "polygon": s1, "centroid": (3.4, 2.2)})

    # woonkamer — L-shape incl. the open kitchen bay (keukenopstelling).
    w = [(5.68, 0.21),          # NW: slaapk1 east wall at the facade
         (10.52, 0.01),         # NE corner (facade inner face steps at x=5.18)
         (10.52, 13.81),        # SE corner — east facade interior
         (6.72, 13.81),         # woonkamer south to the kitchen-bay partition
         (6.72, 15.68),         # partition down to the deep facade
         (4.40, 15.68),         # kitchen slider west to the slaapk2 wall
         (4.40, 9.63),          # up the slaapk2/keuken wall
         (7.04, 9.63),          # east along the gang wall
         (7.04, 4.21),          # up the woonkamer west wall
         (5.68, 4.21),          # west back to slaapk1 east wall
         ]
    R.append({"name": "woonkamer", "label": "67,11 m²", "fill": "#e8f4ff",
              "polygon": w, "centroid": (8.6, 5.5)})

    # Gang — entered from the voordeur via the corridor between the shaft +
    # bergingen (west) and the badkamer (east), opening into the south part
    # and the east arm to the woonkamer door.
    g = [(2.56, 4.96),    # below the slaapk1 door
         (3.76, 4.96), (3.76, 8.17),   # corridor along the badkamer/berging
         (6.94, 8.17), (6.94, 9.54),   # east arm to the woonkamer door
         (0.19, 9.54), (0.19, 7.96),   # south part to the west facade
         (2.56, 7.96),                 # north past the closets (drawn inside gang)
        ]
    R.append({"name": "gang", "label": "13,77 m²", "fill": "#fcf6e3",
              "polygon": g, "centroid": (2.0, 8.8)})

    # Technische berging — west room with WTW/boiler/wasmachine; the boiler
    # closet + WM/CD niche (z 7.14..7.92) are drawn as part of this block.
    b2 = [(0.84, 5.71), (2.46, 5.71), (2.46, 7.92), (0.19, 7.92),
          (0.19, 6.78), (0.24, 6.74)]
    R.append({"name": "berging", "label": "(techniek)", "fill": "#f0eee6",
              "polygon": b2, "centroid": (1.55, 6.45)})

    # Installatieschacht — X-hatched trapezoid between chamfer-2 and the gang.
    sh = [(1.92, 4.87), (2.56, 4.87), (2.56, 5.71), (0.84, 5.71), (1.69, 4.23),
          (1.92, 3.95)]
    R.append({"name": "schacht", "label": "", "fill": "#e2e2e2",
              "polygon": sh, "centroid": (1.95, 5.25)})

    # Badkamer (groot) — x 3.86..6.94, z 4.30..7.04 (dims 3065 x 2730).
    b1 = [(3.86, 4.30), (6.94, 4.30), (6.94, 7.04), (3.86, 7.04)]
    R.append({"name": "badkamer", "label": "8,06 m²", "fill": "#eaf6ec",
              "polygon": b1, "centroid": (5.40, 5.60)})

    # Toilet — x 4.84..6.63 (1785 mm), z 7.14..8.07 (930 mm), door on the south.
    t = [(4.84, 7.14), (6.63, 7.14), (6.63, 8.07), (4.84, 8.07)]
    R.append({"name": "toilet", "label": "1,67 m²", "fill": "#eef0f4",
              "polygon": t, "centroid": (5.74, 7.60)})

    # Berging — storage between badkamer and gang, x 3.86..4.75 (880 mm).
    bg = [(3.86, 7.14), (4.75, 7.14), (4.75, 8.07), (3.86, 8.07)]
    R.append({"name": "berging", "label": "", "fill": "#f0eee6",
              "polygon": bg, "centroid": (4.30, 7.60)})

    # slaapkamer 2 — entry nook (east strip, open to the room) + main room
    # down to the z=15.41 facade with the SW diagonal.
    s2 = [(2.64, 9.63), (4.31, 9.63), (4.31, 15.41), (1.15, 15.41),
          (0.19, 14.85), (0.19, 11.51), (2.64, 11.51)]
    R.append({"name": "slaapkamer 2", "label": "18,90 m²", "fill": "#fff4e6",
              "polygon": s2, "centroid": (2.2, 13.3)})

    # badkamer (klein) — WEST strip x 0.19..2.54 (2330), z 9.64..11.41 (1765),
    # shower + basins, entered from the gang.
    bk = [(0.19, 9.63), (2.54, 9.63), (2.54, 11.41), (0.19, 11.41)]
    R.append({"name": "badkamer (klein)", "label": "3,81 m²", "fill": "#eaf6ec",
              "polygon": bk, "centroid": (1.35, 10.55)})

    # balkon (noord) — railing z=-1.08 spans x 1.74..10.74, curved west end.
    bt = [(0.02, -0.19), (10.74, -0.19), (10.74, -1.08), (1.74, -1.08),
          (1.30, -1.03), (0.85, -0.88), (0.39, -0.59)]
    R.append({"name": "balkon", "label": "7,60 m²", "fill": "#dde6dc",
              "polygon": bt, "centroid": (5.3, -0.6)})

    # balkon (zuid) — railing z=17.55 spans x 3.10..10.74, big curved SW corner.
    bb = [(0.60, 15.97), (1.12, 15.80), (6.72, 15.80), (6.72, 13.99),
          (10.74, 13.99), (10.74, 17.55), (3.10, 17.55), (2.62, 17.51),
          (1.93, 17.29), (1.32, 16.90), (0.83, 16.37)]
    R.append({"name": "balkon", "label": "24,03 m²", "fill": "#dde6dc",
              "polygon": bb, "centroid": (8.0, 16.2)})

    return R


def render():
    out = []
    out.append(f'<svg xmlns="http://www.w3.org/2000/svg" '
               f'viewBox="0 0 {WIDTH_PX:.1f} {HEIGHT_PX:.1f}" '
               f'width="{WIDTH_PX:.1f}" height="{HEIGHT_PX:.1f}">')
    out.append("<rect width='100%' height='100%' fill='#fafafa'/>")
    out.append(grid())

    # Rooms (filled polygons)
    for r in rooms():
        out.append(polygon(r["polygon"], fill=r["fill"], stroke="#888",
                           **{"stroke-width": "0.6"}))
        cx, cy = r["centroid"]
        out.append(text((cx, cy - 0.18), r["name"], size=12, color="#222"))
        out.append(text((cx, cy + 0.20), r["label"], size=11, color="#555"))

    # Apartment envelope (heavy stroke)
    env = envelope()
    env.append(env[0])  # close
    out.append(polyline(env, fill="none", stroke="#000",
                        **{"stroke-width": "2.0"}))

    # Origin marker
    ox, oy = to_px((0, 0))
    out.append(f'<circle cx="{ox:.1f}" cy="{oy:.1f}" r="3" fill="#c33"/>')
    out.append(text((0.15, -0.15), "origin (0, 0)", size=9, color="#c33",
                    anchor="start"))

    # Compass + scale
    out.append(text((WORLD_MAX_X - 1.5, WORLD_MIN_Y + 0.7), "N", size=18,
                    color="#666", anchor="middle"))
    out.append(line((WORLD_MAX_X - 1.5, WORLD_MIN_Y + 0.9),
                    (WORLD_MAX_X - 1.5, WORLD_MIN_Y + 1.9),
                    stroke="#666", **{"stroke-width": "1.5",
                                       "marker-end": "url(#arrow)"}))
    out.insert(2, '<defs><marker id="arrow" markerWidth="10" markerHeight="10" '
                  'refX="5" refY="5" orient="auto-start-reverse">'
                  '<path d="M0,0 L10,5 L0,10 Z" fill="#666"/></marker></defs>')

    # 1m scale bar
    bar_x, bar_y = WORLD_MIN_X + 0.5, WORLD_MAX_Y - 0.5
    out.append(line((bar_x, bar_y), (bar_x + 1, bar_y), stroke="#444",
                    **{"stroke-width": "2"}))
    out.append(text((bar_x + 0.5, bar_y - 0.15), "1 m", size=10, color="#444"))

    # Annotate every raw PDF dimension at its world position
    # PDF (pt) → world: world_x = (px - 146) / 56.7; world_y = (py - 174.6) / 56.7
    out.append('<g opacity="0.55">')
    for d in DATA["raw_dimensions_pdf"]:
        px, py = d["pdf_xy"]
        wx = (px - 146.0) / 56.7
        wy = (py - 174.6) / 56.7
        out.append(text((wx, wy), str(d["mm"]), size=8, color="#06c",
                        anchor="middle"))
    out.append("</g>")

    # Header
    out.append(text((WORLD_MIN_X + 0.5, WORLD_MIN_Y + 0.7),
                    "Type R3.sp — apartment.json, rendered at 1:50",
                    size=14, color="#333", anchor="start"))
    out.append(text((WORLD_MIN_X + 0.5, WORLD_MIN_Y + 1.1),
                    "Phase 2: side-by-side check vs the PDF. Blue numbers are raw mm callouts.",
                    size=10, color="#666", anchor="start"))

    out.append("</svg>")
    return "\n".join(out)


if __name__ == "__main__":
    svg = render()
    out_path = FLOORPLAN_DIR / "floorplan.svg"
    out_path.write_text(svg)
    print(f"Wrote {out_path} ({len(svg)} bytes)")
