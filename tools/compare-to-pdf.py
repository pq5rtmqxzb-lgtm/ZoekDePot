#!/usr/bin/env python3
"""Numeric ground-truth comparison: extract the PDF's own vector wall lines and
dimension labels, then report where APARTMENT_GEOM (the model, drawn blue in
pdf-overlay.png) disagrees with them.

This is the measuring instrument for the convergence loop. It does NOT eyeball
the raster overlay; it reads the PDF's vector geometry directly via the same
world->pixel affine used by tools/pdf-overlay.py, so model meters and PDF meters
are in one frame.

Usage:  python3 tools/compare-to-pdf.py
"""
import importlib.util
import json
import pathlib
import re
from collections import defaultdict

import fitz  # pymupdf

ROOT = pathlib.Path(__file__).resolve().parent.parent
PDF = ROOT / "floorplan" / "YP_bouwnummer_25.pdf"
MODEL_JSON = ROOT / "data" / "model.json"

# Same affine as tools/pdf-overlay.py. floorplan-pdf.png is the page at 2x, so
# 1 PDF point = 2 png px. world<->png:  col = 306 + 113.4*x ; row = 347 + 113.4*z
BX, AX = 113.4, 306.0
BZ, AZ = 113.4, 347.0


def pt_to_world(xp, yp):
    return ((xp * 2 - AX) / BX, (yp * 2 - AZ) / BZ)


def load_model():
    geom = json.loads(MODEL_JSON.read_text())["geom"]
    return [(g["kind"], g["x1"], g["z1"], g["x2"], g["z2"]) for g in geom]


def pdf_segments(min_len=0.22):
    """Return PDF line segments (world meters) inside the apartment region:
    axis-aligned as ('V', x, zlo, zhi, len) / ('H', z, xlo, xhi, len), plus
    diagonals as (x1, z1, x2, z2, len). min_len only filters out symbol/hatch
    clutter; short wall stubs (piers, jogs) are kept."""
    doc = fitz.open(PDF)
    p = doc[0]
    V, H, D = [], [], []
    for d in p.get_drawings():
        for it in d["items"]:
            if it[0] != "l":
                continue
            X1, Z1 = pt_to_world(it[1].x, it[1].y)
            X2, Z2 = pt_to_world(it[2].x, it[2].y)
            L = ((X1 - X2) ** 2 + (Z1 - Z2) ** 2) ** 0.5
            if L < min_len:
                continue
            if abs(X1 - X2) < 0.06:   # vertical
                V.append(("V", round((X1 + X2) / 2, 3), round(min(Z1, Z2), 2), round(max(Z1, Z2), 2), round(L, 2)))
            elif abs(Z1 - Z2) < 0.06:  # horizontal
                H.append(("H", round((Z1 + Z2) / 2, 3), round(min(X1, X2), 2), round(max(X1, X2), 2), round(L, 2)))
            else:
                D.append((X1, Z1, X2, Z2, L))
    reg = lambda a, b: (-3 < a < 12) and (-3 < b < 19)
    V = [s for s in V if reg(s[1], s[2]) and reg(s[1], s[3])]
    H = [s for s in H if reg(s[2], s[1]) and reg(s[3], s[1])]
    D = [s for s in D if reg(s[0], s[1]) and reg(s[2], s[3])]
    return V, H, D


def nearest_diag(seg, D):
    """Best PDF diagonal for a model diagonal: similar angle, midpoint close to
    the PDF line (perpendicular), and midpoint projecting inside its span."""
    import math
    x1, z1, x2, z2 = seg
    mx, mz = (x1 + x2) / 2, (z1 + z2) / 2
    a_model = math.atan2(z2 - z1, x2 - x1) % math.pi
    best = None
    for X1, Z1, X2, Z2, L in D:
        a = math.atan2(Z2 - Z1, X2 - X1) % math.pi
        da = min(abs(a - a_model), math.pi - abs(a - a_model))
        if da > 0.20:
            continue
        dx, dz = X2 - X1, Z2 - Z1
        t = ((mx - X1) * dx + (mz - Z1) * dz) / (L * L)
        px, py = X1 + t * dx, Z1 + t * dz
        dist = ((mx - px) ** 2 + (mz - py) ** 2) ** 0.5
        score = dist + (0 if -0.15 <= t <= 1.15 else 5)
        if best is None or score < best[0]:
            best = (score, dist, (X1, Z1, X2, Z2))
    return best


def dim_labels():
    doc = fitz.open(PDF)
    p = doc[0]
    out = []
    for w in p.get_text("words"):
        x0, y0, x1, y1, txt = w[0], w[1], w[2], w[3], w[4]
        if re.fullmatch(r"\d{3,4}", txt):
            X, Z = pt_to_world((x0 + x1) / 2, (y0 + y1) / 2)
            if -3 < X < 12 and -2 < Z < 18:
                out.append((int(txt), round(X, 2), round(Z, 2)))
    return out


def nearest(model_pos, candidates):
    """candidates: list of (line_coord, lo, hi, len). Return best by perpendicular
    distance among those whose span overlaps the model wall's midpoint."""
    best = None
    for coord, lo, hi, ln in candidates:
        dist = abs(coord - model_pos[0])
        # prefer candidates whose extent brackets the model wall midspan
        mid = model_pos[1]
        overlap = (lo - 0.3) <= mid <= (hi + 0.3)
        score = dist + (0 if overlap else 5)
        if best is None or score < best[0]:
            best = (score, dist, coord, lo, hi, ln, overlap)
    return best


def main():
    model = load_model()
    V, H, D = pdf_segments()
    # group PDF candidates by orientation
    Vc = [(s[1], s[2], s[3], s[4]) for s in V]
    Hc = [(s[1], s[2], s[3], s[4]) for s in H]

    print("=== MODEL WALL vs NEAREST PDF VECTOR LINE ===")
    print("(offset = perpendicular distance, m; flagged > 0.15 m)\n")
    rows = []
    for k, x1, z1, x2, z2 in model:
        if k in ("railing", "door"):
            continue
        vert = abs(x1 - x2) < 0.06
        horiz = abs(z1 - z2) < 0.06
        if vert:
            pos = (x1, (z1 + z2) / 2)
            b = nearest(pos, Vc)
            kind = "V"
        elif horiz:
            pos = (z1, (x1 + x2) / 2)
            b = nearest(pos, Hc)
            kind = "H"
        else:
            b = nearest_diag((x1, z1, x2, z2), D)
            if b is None:
                rows.append((9.99, "D", f"diagonal ({x1},{z1})->({x2},{z2}): NO PDF DIAGONAL"))
            else:
                _, dist, (X1, Z1, X2, Z2) = b
                rows.append((dist, "D",
                             "model %s diag (%.2f,%.2f)->(%.2f,%.2f) -> PDF (%.2f,%.2f)->(%.2f,%.2f)  off=%.2f" % (
                                 k, x1, z1, x2, z2, X1, Z1, X2, Z2, dist)))
            continue
        if b is None:
            rows.append((9.99, kind, f"{k} {kind} @ {pos[0]} span {pos[1]:.1f}: NO PDF LINE"))
            continue
        _, dist, coord, lo, hi, ln, ov = b
        a = "model %s %s=%.2f (span %.1f..%.1f) -> PDF %s=%.2f  off=%.2f%s" % (
            k, "x" if kind == "V" else "z", pos[0],
            min(z1, z2) if kind == "V" else min(x1, x2),
            max(z1, z2) if kind == "V" else max(x1, x2),
            "x" if kind == "V" else "z", coord, dist,
            "" if ov else "  [no span overlap]")
        rows.append((dist, kind, a))
    rows.sort(reverse=True)
    for dist, kind, a in rows:
        flag = ">>" if dist > 0.15 and dist < 9 else ("??" if dist >= 9 else "  ")
        print(f"{flag} {a}")

    print("\n=== PDF DIMENSION LABELS (authoritative mm) ===")
    for v, X, Z in sorted(dim_labels(), key=lambda d: (d[2], d[1])):
        print(f"  {v:>5} mm  at x={X:>6} z={Z:>6}")


if __name__ == "__main__":
    main()
