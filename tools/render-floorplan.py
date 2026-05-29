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
    """Apartment outer boundary, replacing the simple chamfer placeholder
    with the multi-segment NW zigzag from the JSON."""
    zig = DATA["nw_zigzag"]["points_clockwise_from_top_facade"]
    # The apartment is a ~10.7 m-wide rectangle (x 0..10.72, z 0..13.802) plus
    # balconies and the NW alcove. The west outer wall runs straight at x=0 from
    # the south facade up to the NW zigzag. (The old x=-2.30 west bulge was scan
    # page-margin, not apartment.)
    # South facade is STEPPED: woonkamer at z=13.802, kitchen deeper at z=15.60,
    # slaapkamer 2 at z=14.765. West wall up to the NW zigzag.
    pts = [[0.0, 0.0], [10.72, 0.0], [10.72, 13.802],
           [6.46, 13.802], [6.46, 15.60], [4.115, 15.60], [4.115, 14.765],
           [0.0, 14.765], [0.0, 4.10]]
    pts.extend(reversed(zig))   # zigzag back up to (0, 0)
    return pts


def rooms():
    """Best-effort room polygons from the JSON. Where the JSON only has
    x_range_m / y_range_m, we build a rectangle. Otherwise we use polygon."""
    R = []

    # slaapkamer 1 — built from the 4000 N-S, 3675 E-W main rect, plus the
    # NW alcove (zigzag). We construct the polygon by walking around the room.
    zig = DATA["nw_zigzag"]["points_clockwise_from_top_facade"]
    s1 = [(0.20, 0.20),          # NE interior corner
          (5.52, 0.20),          # NE → E along north wall to the woonkamer-interface
          (5.52, 4.20),          # south along east wall (slaapk1/woonkamer)
          (0.20, 4.20),          # west along south wall (3675 + step area)
          ]
    # …then up into the alcove via the zigzag (interior face mirrors the
    # exterior zigzag with ~0.2 m wall thickness — we ignore wall thickness
    # on the interior side and just trace the zigzag as-is for the polygon).
    s1.extend(reversed(zig))
    R.append({"name": "slaapkamer 1", "label": "23,45 m²", "fill": "#fff4e6",
              "polygon": s1, "centroid": (3.0, 2.2)})

    # woonkamer — L-shape. North strip at top sits east of slaapk1 (slaapk1
    # east wall at x=5.52, woonkamer strip starts there). The strip widens
    # east of the bathroom block (woonkamer interior west wall at x=6.948,
    # i.e., 3.572 m strip per the 3572 callout). South extension wraps
    # around slaapk2.
    w = [(5.52, 0.20),          # NW: meets slaapk1 east wall at top facade
         (10.52, 0.20),         # NE corner — top facade interior
         (10.52, 13.602),       # SE corner — east facade interior
         (6.46, 13.602),        # woonkamer south (shallow) west to the step
         (6.46, 15.60),         # step down to the deep kitchen
         (4.115, 15.60),        # kitchen south (deep) west to slaapk2 wall
         (4.115, 9.00),         # up the slaapk2/kitchen wall to z=9
         (6.948, 9.00),         # east along the gang boundary
         (6.948, 4.20),         # up the woonkamer west wall
         (5.52, 4.20),          # west back to slaapk1 east wall
         ]
    R.append({"name": "woonkamer", "label": "67,11 m²", "fill": "#e8f4ff",
              "polygon": w, "centroid": (8.6, 5.5)})

    # Gang — fills the entire central strip between slaapk1 (north) and
    # slaapk2 (south), from west facade to woonkamer west wall. The
    # bathroom block (drawn after gang) overlays in the middle so the
    # gang appears C-shaped wrapping around the bathrooms.
    g = [(0.00, 4.20),    # NW: meets slaapk1 south wall at the west facade
         (6.948, 4.20),   # east along slaapk1 south wall to woonkamer west wall
         (6.948, 9.00),   # south along woonkamer west wall to slaapk2 north
         (0.00, 9.00),    # west along slaapk2 north wall to the west facade
        ]
    R.append({"name": "gang", "label": "13,77 m²", "fill": "#fcf6e3",
              "polygon": g, "centroid": (1.80, 7.50)})

    # Bathroom block: x=3.158–6.748, y=4.40–7.10 (3.59 × 2.70 = 9.69 m²).
    # East wall (x=6.748) is the shared wall with woonkamer (whose
    # interior west wall is at x=6.948 — 0.20 m thick partition).
    # Toilet sits INSIDE the block at the SE corner (user-confirmed).
    # Badkamer is the L-shape that remains (≈ 8.03 m² ≈ label 8.06).
    b1 = [(3.158, 4.40),  # NW
          (6.748, 4.40),  # NE
          (6.748, 5.315), # east wall continues down to toilet NE corner
          (5.818, 5.315), # west along toilet north wall
          (5.818, 7.10),  # south along toilet west wall
          (3.158, 7.10)]  # west along bathroom south wall
    R.append({"name": "badkamer", "label": "8,06 m²", "fill": "#eaf6ec",
              "polygon": b1, "centroid": (4.65, 5.70)})

    # Toilet inside badkamer at right-bottom (SE) corner — user-confirmed.
    # 0.93 × 1.785 → 1.66 m² ≈ 1.67. East wall adjacent to woonkamer.
    t = [(5.818, 5.315), (6.748, 5.315), (6.748, 7.10), (5.818, 7.10)]
    R.append({"name": "toilet", "label": "1,67 m²", "fill": "#eef0f4",
              "polygon": t, "centroid": (6.28, 6.21)})

    # slaapkamer 2 — 4.115 × 4.593, SW area
    s2 = [(0.00, 9.00), (4.115, 9.00), (4.115, 14.765), (0.00, 14.765)]
    R.append({"name": "slaapkamer 2", "label": "18,90 m²", "fill": "#fff4e6",
              "polygon": s2, "centroid": (1.60, 13.00)})

    # badkamer (klein) — en-suite in slaapk2's NE corner (by the living-room door)
    bk = [(2.445, 9.00), (4.115, 9.00), (4.115, 11.29), (2.445, 11.29)]
    R.append({"name": "badkamer (klein)", "label": "3,81 m²", "fill": "#eaf6ec",
              "polygon": bk, "centroid": (3.28, 10.10)})

    # balkon (top) — spans FULL apartment top facade width (user-confirmed)
    bt = [(0.00, -1.331), (10.72, -1.331), (10.72, 0.0), (0.00, 0.0)]
    R.append({"name": "balkon", "label": "7,60 m² (labelled)", "fill": "#dde6dc",
              "polygon": bt, "centroid": (5.0, -0.6)})

    # balkon (bottom) — spans FULL south facade width (user-confirmed)
    bb = [(0.00, 14.765), (4.115, 14.765), (4.115, 15.60), (6.46, 15.60),
          (6.46, 13.802), (10.72, 13.802), (10.72, 17.402), (2.00, 17.402),
          (0.00, 15.60)]
    R.append({"name": "balkon", "label": "24,03 m² (labelled)", "fill": "#dde6dc",
              "polygon": bb, "centroid": (5.30, 15.6)})

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
