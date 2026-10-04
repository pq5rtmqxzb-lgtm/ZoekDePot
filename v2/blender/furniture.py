"""Parametric furniture, kitchen, sanitary ware and lamps for v2.

Every piece is built from v2/data/furniture.json by a small builder per
`type`. Geometry goes into two objects per item: `furn.<id>` (hard parts,
a 4 mm bevel so edges catch light) and `furn.<id>.soft` (upholstery,
bedding, rugs' cousins: rounded with a 3 cm bevel and smooth shading).
Lamps add real light sources (`light.<id>`) next to their fixtures.

Item frame: same as v1's furniture.js — (x, z) is the item centre, `rot`
degrees about the vertical, local -z is the back (against the wall).
"""
import math
import random

from common import MeshSet, WALL_HEIGHT

COLL = "furniture"
BOOKS = ["book_red", "book_blue", "book_ochre", "book_green", "book_cream", "book_plum", "book_black"]
RUG = {"oat": "rug_oat", "stone": "rug_stone", "taupe": "rug_taupe"}
FABRIC = {"linen": "linen", "boucle": "boucle", "oat": "linen_oat", "outdoor": "outdoor"}


class F:
    """Builder for one item: local (ox, oy, oz) -> model coordinates."""

    def __init__(self, ms, item, lights, x=None, z=None, rot=None, suffix=""):
        self.ms, self.item, self.lights = ms, item, lights
        self.id = item["id"] + suffix
        self.x = item.get("x", 0.0) if x is None else x
        self.z = item.get("z", 0.0) if z is None else z
        self.ry = math.radians(item.get("rot", 0.0) if rot is None else rot)
        self.props = {"part": "furniture", "furn": item["id"], "type": item["type"],
                      "room": item.get("room", "")}

    def w(self, ox, oz):
        c, s = math.cos(self.ry), math.sin(self.ry)
        return (self.x + c * ox + s * oz, self.z - s * ox + c * oz)

    def name(self, soft):
        return f"furn.{self.id}.soft" if soft else f"furn.{self.id}"

    def box(self, w, h, d, mat, ox, oy, oz, soft=False):
        """Box of size w x h x d centred on local (ox, oy, oz) (oy = centre height)."""
        base = [self.w(ox - w / 2, oz - d / 2), self.w(ox + w / 2, oz - d / 2),
                self.w(ox + w / 2, oz + d / 2), self.w(ox - w / 2, oz + d / 2)]
        return self.ms.prism(self.name(soft), COLL, mat, base, oy - h / 2, oy + h / 2, self.props)

    def ring(self, rx, rz, ox, oz, n):
        return [self.w(ox + rx * math.cos(2 * math.pi * i / n), oz + rz * math.sin(2 * math.pi * i / n))
                for i in range(n)]

    def cyl(self, r, y0, y1, mat, ox=0.0, oz=0.0, r_top=None, rz=None, rz_top=None, n=24, soft=False):
        """(Elliptic) cylinder or frustum standing from y0 to y1."""
        rz = r if rz is None else rz
        r_top = r if r_top is None else r_top
        rz_top = r_top * rz / r if rz_top is None else rz_top
        return self.ms.prism(self.name(soft), COLL, mat, self.ring(r, rz, ox, oz, n), y0, y1, self.props,
                             top=self.ring(r_top, rz_top, ox, oz, n))

    def open_ends(self, faces, top=True, bottom=True):
        """Remove the caps of a cyl() (lamp shades: light gets out)."""
        import bmesh
        bm = self.ms.items[self.name(False)]["bm"]
        kill = ([faces[1]] if top else []) + ([faces[0]] if bottom else [])
        bmesh.ops.delete(bm, geom=kill, context="FACES_ONLY")

    def blob(self, mat, ox, oy, oz, rx, ry, rz, subdiv=1):
        """Smooth ellipsoid (foliage, bulbs) in its own unbevelled object."""
        x, z = self.w(ox, oz)
        return self.ms.blob(f"furn.{self.id}.blob", COLL, mat, x, oy, z, rx, ry, rz, subdiv, self.props)

    def light(self, ox, oy, oz, watts, kind="POINT", radius=0.03, spot_deg=None, color=(1.0, 0.86, 0.68),
              direction=(0, -1, 0), room=None):
        x, z = self.w(ox, oz)
        self.lights.append(dict(id=self.id, kind=kind, pos=(x, oy, z), watts=watts, radius=radius,
                                spot=spot_deg, color=color, dir=direction,
                                room=room or self.item.get("room", "")))


# ------------------------------------------------------------------ pieces

HEADBOARD = 0.10


def bed(f, it):
    """w x d = mattress size. (x, z) is the centre of the whole bed incl.
    the 10 cm upholstered headboard, so the back sits flush on the wall."""
    w, d = it.get("w", 1.4), it.get("d", 2.0)
    m = HEADBOARD / 2                                                         # mattress centre offset
    f.box(w + 0.04, 0.16, d, "oak", 0, 0.18, m)                              # frame 0.10..0.26
    for sx in (-1, 1):
        for sz in (-1, 1):
            f.box(0.06, 0.10, 0.06, "oak", sx * (w / 2 - 0.06), 0.05, m + sz * (d / 2 - 0.06))
    f.box(w - 0.02, 0.22, d - 0.02, "bedding", 0, 0.37, m, soft=True)        # mattress to 0.48
    f.box(w + 0.04, 0.08, d * 0.66, "duvet", 0, 0.50, m + d * 0.17, soft=True)
    f.box(w + 0.07, 0.03, 0.42, "linen_oat", 0, 0.545, m + d / 2 - 0.30, soft=True)   # plaid
    f.box(w + 0.12, 0.95, HEADBOARD, "headboard", 0, 0.62, m - d / 2 - HEADBOARD / 2, soft=True)
    for px in ((-w * 0.24, w * 0.24) if w > 1.2 else (0,)):
        f.box(w * 0.42, 0.14, 0.46, "bedding", px, 0.56, m - d / 2 + 0.30, soft=True)


def nightstand(f, it, lamp=True):
    f.box(0.45, 0.30, 0.40, "oak", 0, 0.38, 0)
    f.box(0.40, 0.005, 0.005, "oak_dark", 0, 0.38, 0.2)                       # drawer line
    for sx in (-1, 1):
        for sz in (-1, 1):
            f.box(0.025, 0.23, 0.025, "black", sx * 0.19, 0.115, sz * 0.17)
    if lamp:
        f.cyl(0.06, 0.53, 0.55, "black")
        f.cyl(0.008, 0.55, 0.78, "black")
        shade = f.cyl(0.12, 0.70, 0.86, "lampshade", r_top=0.10)
        f.open_ends(shade)
        f.light(0, 0.76, 0, 8, radius=0.04)


def wardrobe(f, it):
    w, d, h = it.get("w", 1.6), it.get("d", 0.6), it.get("h", 2.3)
    f.box(w, h - 0.06, d, "lacquer", 0, 0.06 + (h - 0.06) / 2, 0)
    f.box(w - 0.06, 0.06, d - 0.06, "oak_dark", 0, 0.03, -0.03)              # recessed plinth
    n = max(2, round(w / 0.5))
    for i in range(1, n):
        f.box(0.004, h - 0.10, 0.004, "oak_dark", -w / 2 + i * w / n, 0.06 + (h - 0.06) / 2, d / 2)
    for i in range(n):
        gx = -w / 2 + i * w / n + (0.035 if i % 2 else w / n - 0.035)
        f.box(0.012, 0.36, 0.02, "black", gx, 1.10, d / 2 + 0.012)


def sofa(f, it):
    w, d = it.get("w", 2.4), it.get("d", 0.95)
    fab = FABRIC.get(it.get("fabric", "linen"), "linen")
    for sx in (-1, 1):
        for sz in (-1, 1):
            f.box(0.04, 0.10, 0.04, "black", sx * (w / 2 - 0.08), 0.05, sz * (d / 2 - 0.08))
    f.box(w, 0.22, d, fab, 0, 0.21, 0, soft=True)                            # base 0.10..0.32
    for sx in (-1, 1):
        f.box(0.18, 0.52, d, fab, sx * (w / 2 - 0.09), 0.36, 0, soft=True)   # arms to 0.62
    f.box(w - 0.02, 0.50, 0.22, fab, 0, 0.55, -d / 2 + 0.11, soft=True)      # back to 0.80
    inner = w - 0.36
    n = 3 if inner > 1.6 else 2
    cw = inner / n
    for i in range(n):
        cx = -inner / 2 + cw * (i + 0.5)
        f.box(cw - 0.02, 0.17, d - 0.24, fab, cx, 0.40, 0.11, soft=True)     # seat to 0.49
        f.box(cw - 0.03, 0.42, 0.17, fab, cx, 0.69, -d / 2 + 0.31, soft=True)
    f.box(0.45, 0.42, 0.13, "linen_oat", -inner / 2 + 0.28, 0.70, -d / 2 + 0.44, soft=True)
    f.box(0.45, 0.42, 0.13, "headboard", inner / 2 - 0.28, 0.70, -d / 2 + 0.44, soft=True)


def armchair(f, it):
    fab = FABRIC.get(it.get("fabric", "linen"), "linen")
    for sx in (-1, 1):
        for sz in (-1, 1):
            f.box(0.035, 0.12, 0.035, "oak", sx * 0.33, 0.06, sz * 0.33)
    f.box(0.80, 0.26, 0.80, fab, 0, 0.25, 0, soft=True)                      # 0.12..0.38
    f.box(0.80, 0.46, 0.20, fab, 0, 0.61, -0.30, soft=True)
    for sx in (-1, 1):
        f.box(0.14, 0.24, 0.66, fab, sx * 0.33, 0.50, 0.07, soft=True)
    f.box(0.52, 0.12, 0.58, fab, 0, 0.44, 0.08, soft=True)


def coffee_table(f, it):
    w, d = it.get("w", 1.2), it.get("d", 0.6)
    f.box(w, 0.035, d, "oak", 0, 0.4025, 0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            f.box(0.035, 0.385, 0.035, "black", sx * (w / 2 - 0.06), 0.1925, sz * (d / 2 - 0.06))
    b = f.cyl(0.14, 0.42, 0.48, "ceramic", ox=-w * 0.2, r_top=0.15)
    f.ms.hollow_top(f.name(False), b, 0.012, 0.045)
    f.box(0.24, 0.03, 0.32, "book_cream", w * 0.22, 0.435, 0.02)
    f.box(0.22, 0.025, 0.30, "book_green", w * 0.22, 0.4625, 0.01)


def side_table(f, it):
    f.cyl(0.25, 0.50, 0.53, "oak", n=32)
    f.cyl(0.03, 0.02, 0.50, "black", n=12)
    f.cyl(0.18, 0.0, 0.02, "black", n=32)


def chair(f, it, seat_pad=True):
    frame = "black" if it.get("finish") == "black" else "oak"
    for sx in (-1, 1):
        for sz in (-1, 1):
            f.box(0.03, 0.44, 0.03, frame, sx * 0.19, 0.22, sz * 0.19)
    f.box(0.44, 0.03, 0.44, frame, 0, 0.455, 0)
    for sx in (-1, 1):
        f.box(0.03, 0.42, 0.03, frame, sx * 0.19, 0.68, -0.205)
    f.box(0.42, 0.14, 0.025, frame, 0, 0.80, -0.205)
    if seat_pad and frame == "oak":
        f.box(0.40, 0.04, 0.40, "linen_oat", 0, 0.49, 0.01, soft=True)


def dining_table(f, it):
    w, d = it.get("w", 1.0), it.get("d", 2.6)
    f.box(w, 0.04, d, "oak", 0, 0.74, 0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            f.box(0.07, 0.72, 0.07, "oak", sx * (w / 2 - 0.10), 0.36, sz * (d / 2 - 0.12))
    for sx in (-1, 1):
        f.box(0.03, 0.08, d - 0.30, "oak", sx * (w / 2 - 0.10), 0.68, 0)
    v = f.cyl(0.06, 0.76, 1.02, "ceramic", r_top=0.045)
    f.ms.hollow_top(f.name(False), v, 0.008, 0.20)
    b = f.cyl(0.16, 0.76, 0.82, "oak_dark", oz=-d * 0.25, r_top=0.18)
    f.ms.hollow_top(f.name(False), b, 0.012, 0.05)
    n = it.get("chairs", 8) // 2
    for side, rot in ((-1, 90), (1, -90)):
        for i in range(n):
            oz = -d / 2 + d * (i + 0.5) / n
            cx, cz = f.w(side * (w / 2 + 0.16), oz)
            chair(F(f.ms, it, f.lights, cx, cz, math.degrees(f.ry) + rot, suffix=f".chair{side}{i}"), {})


def bar_stool(f, it):
    f.cyl(0.18, 0.0, 0.015, "black", n=32)
    f.cyl(0.02, 0.015, 0.64, "black", n=12)
    ring = f.cyl(0.16, 0.24, 0.255, "black", n=32)
    f.ms.hollow_top(f.name(False), ring, 0.012, 0.0)
    f.cyl(0.17, 0.64, 0.68, "oak", n=32)


def rug(f, it):
    f.box(it.get("w", 2.0), 0.012, it.get("d", 2.4), RUG.get(it.get("color", "oat"), "rug_oat"), 0, 0.006, 0)


def tv_unit(f, it):
    w = it.get("w", 1.8)
    f.box(w, 0.40, 0.42, "oak", 0, 0.32, 0)                                  # 0.12..0.52
    for i in range(1, 3):
        f.box(0.004, 0.36, 0.004, "oak_dark", -w / 2 + i * w / 3, 0.32, 0.21)
    for sx in (-1, 1):
        for sz in (-1, 1):
            f.box(0.03, 0.12, 0.03, "black", sx * (w / 2 - 0.08), 0.06, sz * 0.15)
    f.box(1.45, 0.84, 0.025, "screen", 0, 1.30, -0.19)
    f.box(1.47, 0.86, 0.015, "black", 0, 1.30, -0.205)
    f.box(0.90, 0.06, 0.10, "black", 0, 0.55, -0.08)                         # soundbar
    p = f.cyl(0.08, 0.52, 0.66, "terracotta", ox=w / 2 - 0.25, r_top=0.09)
    f.ms.hollow_top(f.name(False), p, 0.01, 0.03, mat="soil")
    for k in range(6):
        a = k * 2.4
        f.blob("leaf" if k % 2 else "leaf_light", w / 2 - 0.25 + 0.07 * math.cos(a), 0.74 + 0.03 * k,
               0.07 * math.sin(a), 0.10, 0.06, 0.08)


def dresser(f, it):
    w, d, h = it.get("w", 1.2), it.get("d", 0.45), it.get("h", 0.78)
    f.box(w, h - 0.12, d, "oak", 0, 0.12 + (h - 0.12) / 2, 0)
    for i in range(1, 3):
        f.box(0.004, h - 0.18, 0.004, "oak_dark", -w / 2 + i * w / 3, 0.12 + (h - 0.12) / 2, d / 2)
    for sx in (-1, 1):
        for sz in (-1, 1):
            f.box(0.03, 0.12, 0.03, "black", sx * (w / 2 - 0.06), 0.06, sz * (d / 2 - 0.06))
    v = f.cyl(0.10, h, h + 0.30, "ceramic", ox=-w * 0.25, r_top=0.07)
    f.ms.hollow_top(f.name(False), v, 0.01, 0.25)
    f.cyl(0.07, h, h + 0.03, "black", ox=w * 0.28)                           # table lamp
    f.cyl(0.01, h + 0.03, h + 0.38, "black", ox=w * 0.28)
    s = f.cyl(0.15, h + 0.30, h + 0.50, "lampshade", ox=w * 0.28, r_top=0.12)
    f.open_ends(s)
    f.light(w * 0.28, h + 0.40, 0, 10, radius=0.05)


def bookshelf(f, it):
    w, h, d = it.get("w", 1.8), it.get("h", 2.1), it.get("d", 0.32)
    f.box(w, 0.02, d, "oak", 0, 0.01, 0)
    f.box(w, h, 0.015, "oak", 0, h / 2, -d / 2 + 0.0075)
    for sx in (-1, 1):
        f.box(0.025, h, d, "oak", sx * (w / 2 - 0.0125), h / 2, 0)
    shelves = 5
    sh = h / shelves
    for i in range(1, shelves + 1):
        f.box(w - 0.05, 0.025, d, "oak", 0, i * sh - 0.0125, 0)
    rnd = random.Random(7)
    for i in range(shelves):
        bx = -w / 2 + 0.05
        while bx < w / 2 - 0.12:
            if rnd.random() < 0.10:
                bx += 0.20
                continue
            bw, bh = 0.025 + rnd.random() * 0.04, 0.18 + rnd.random() * 0.13
            f.box(bw, bh, 0.20 + rnd.random() * 0.04, rnd.choice(BOOKS), bx + bw / 2,
                  i * sh + 0.0125 + bh / 2, 0.01)
            bx += bw + 0.003


def plant(f, it):
    h = it.get("h", 1.6)
    rnd = random.Random(int(f.x * 31 + f.z * 17))
    pr = 0.15 + h * 0.04
    mat = "terracotta" if rnd.random() < 0.5 else "pot_concrete"
    p = f.cyl(pr * 0.80, 0.0, pr * 1.5, mat, r_top=pr, n=28)
    f.ms.hollow_top(f.name(False), p, 0.015, 0.04, mat="soil")
    f.cyl(0.015, pr * 1.4, h * 0.75, "oak_dark", n=8)
    for k in range(int(14 + h * 10)):
        a = rnd.random() * 2 * math.pi
        rr = rnd.random() * h * 0.22
        y = pr * 1.5 + h * 0.25 + rnd.random() * (h * 0.72 - pr * 1.5)
        s = h * (0.06 + rnd.random() * 0.06)
        f.blob("leaf" if rnd.random() < 0.6 else "leaf_light", rr * math.cos(a), y, rr * math.sin(a),
               s, s * 0.45, s * 0.8)


def floor_lamp(f, it):
    f.cyl(0.15, 0.0, 0.02, "black", n=32)
    f.cyl(0.011, 0.02, 1.50, "black", n=10)
    s = f.cyl(0.20, 1.36, 1.64, "lampshade", r_top=0.17, n=32)
    f.open_ends(s)
    f.light(0, 1.50, 0, 25, radius=0.06)


def pendant(f, it, ceil=WALL_HEIGHT):
    y = it.get("y", 1.9)
    f.cyl(0.004, y + 0.17, ceil, "black", n=6)
    f.cyl(0.05, ceil - 0.02, ceil, "black", n=16)                            # canopy
    dome = f.cyl(0.17, y, y + 0.17, "black", r_top=0.05, n=32)
    f.open_ends(dome, top=False, bottom=True)
    f.blob("bulb", 0, y + 0.03, 0, 0.035, 0.045, 0.035, subdiv=2)
    f.light(0, y - 0.02, 0, 30, kind="SPOT", spot_deg=110, radius=0.03)


def downlight(f, it, ceil=WALL_HEIGHT):
    f.cyl(0.045, ceil - 0.006, ceil - 0.001, "bulb", n=20)
    f.cyl(0.055, ceil - 0.004, ceil - 0.0005, "plinth", n=20)
    f.light(0, ceil - 0.03, 0, 12, kind="SPOT", spot_deg=100, radius=0.03)


def desk(f, it):
    w, d = it.get("w", 1.2), it.get("d", 0.6)
    f.box(w, 0.03, d, "oak", 0, 0.735, 0)
    for sx in (-1, 1):
        f.box(0.03, 0.72, d - 0.08, "black", sx * (w / 2 - 0.05), 0.36, 0)
    f.box(0.33, 0.012, 0.24, "black", 0.15, 0.756, 0.05)                     # laptop
    f.box(0.33, 0.22, 0.008, "black", 0.15, 0.86, -0.07)
    cx, cz = f.w(0, d / 2 + 0.30)
    chair(F(f.ms, it, f.lights, cx, cz, math.degrees(f.ry) + 180, suffix=".chair"), {})


def coat_rack(f, it):
    w = it.get("w", 1.0)
    f.box(w, 0.04, 0.03, "oak", 0, 1.68, 0.015)
    for i in range(5):
        f.box(0.015, 0.03, 0.06, "black", -w / 2 + 0.1 + i * (w - 0.2) / 4, 1.62, 0.045)
    f.box(0.36, 0.82, 0.10, "book_blue", -0.20, 1.25, 0.08, soft=True)        # coats
    f.box(0.32, 0.74, 0.09, "oak_dark", 0.18, 1.28, 0.08, soft=True)
    f.box(w, 0.04, 0.34, "oak", 0, 0.44, 0.20)
    for sx in (-1, 1):
        f.box(0.03, 0.42, 0.30, "black", sx * (w / 2 - 0.05), 0.21, 0.20)
    f.box(0.26, 0.10, 0.28, "book_black", -0.20, 0.05, 0.20, soft=True)      # shoes


def curtains(f, it):
    """Rail + two gathered panels pulled to the sides (pui along x)."""
    x1, x2, zl, inside = it["x1"], it["x2"], it["z"], it.get("inside", 1)
    fab = it.get("fabric", "linen")
    mat = "sheer" if fab == "sheer" else ("linen_oat" if fab == "linen" else fab)
    zc = zl + inside * 0.24
    g = F(f.ms, it, f.lights, 0.0, 0.0, 0.0)
    g.box(x2 - x1 + 0.40, 0.025, 0.025, "alu", (x1 + x2) / 2, 2.64, zc)
    for xa, s in ((x1, 1), (x2, -1)):
        width, amp, period, t = 0.62, 0.045, 0.13, 0.008
        n = int(width / 0.02)
        front = [(xa - s * 0.15 + s * width * i / n,
                  zc + amp * math.sin(2 * math.pi * (width * i / n) / period)) for i in range(n + 1)]
        back = [(px, pz + t) for px, pz in reversed(front)]
        g.ms.prism(f"furn.{it['id']}.curtain", COLL, mat, front + back, 0.015, 2.62, g.props)


def bistro_table(f, it):
    f.cyl(0.28, 0.70, 0.72, "black", n=32)
    f.cyl(0.02, 0.02, 0.70, "black", n=10)
    f.cyl(0.20, 0.0, 0.02, "black", n=32)


def planter(f, it):
    w, d = it.get("w", 1.6), it.get("d", 0.28)
    f.box(w, 0.36, d, "pot_concrete", 0, 0.18, 0)
    f.box(w - 0.04, 0.01, d - 0.04, "soil", 0, 0.361, 0)
    rnd = random.Random(3)
    for k in range(18):
        f.blob("leaf" if k % 3 else "leaf_light", -w / 2 + 0.1 + (w - 0.2) * k / 17, 0.45 + rnd.random() * 0.15,
               (rnd.random() - 0.5) * 0.1, 0.12, 0.10, 0.10)


# ------------------------------------------------ kitchen (keukenopstelling D)

def kitchen_d(f, it):
    """Wall run along the gang wall (x 4.44..6.94, z 9.64..10.26) + stone
    island x 5.42..6.40, z 11.24..13.85 with sink north, hob south (as v1)."""
    z0, dep = 9.64, 0.62
    xa, xb, xt = 4.44, 6.34, 6.94
    cx = (xa + xb) / 2
    f.box(xb - xa, 0.10, dep - 0.06, "oak_dark", cx, 0.05, z0 + (dep - 0.06) / 2)
    f.box(xb - xa, 0.76, dep, "lacquer", cx, 0.48, z0 + dep / 2)
    x = xa + 0.6
    while x < xb - 0.1:
        f.box(0.004, 0.72, 0.004, "oak_dark", x, 0.48, z0 + dep)
        f.box(0.004, 0.72, 0.004, "oak_dark", x, 1.825, z0 + 0.36)
        x += 0.6
    f.box(xb - xa + 0.02, 0.03, dep + 0.03, "stone_dark", cx, 0.875, z0 + dep / 2 + 0.005)
    f.box(xb - xa, 0.56, 0.015, "stone_light", cx, 1.17, z0 + 0.0075)
    f.box(xb - xa, 0.75, 0.36, "lacquer", cx, 1.825, z0 + 0.18)
    f.box(xb - xa - 0.1, 0.02, 0.30, "bulb", cx, 1.445, z0 + 0.16)            # led strip under the uppers
    f.box(xt - xb, 2.20, dep, "lacquer", (xb + xt) / 2, 1.10, z0 + dep / 2)
    f.box(0.56, 0.58, 0.02, "screen", (xb + xt) / 2, 1.30, z0 + dep + 0.005)
    f.box(0.52, 0.025, 0.03, "chrome", (xb + xt) / 2, 1.05, z0 + dep + 0.02)
    f.box(0.004, 2.1, 0.004, "oak_dark", (xb + xt) / 2, 1.10, z0 + dep)
    f.cyl(0.09, 0.89, 1.11, "appliance", ox=4.78, oz=z0 + 0.30, r_top=0.08)           # kettle
    f.box(0.30, 0.02, 0.22, "oak", 5.55, 0.90, z0 + 0.36)
    # island: stone monolith with an undermount sink and an induction hob
    ix, iz, iw, idp, ih = 5.91, 12.545, 0.98, 2.61, 0.92
    f.box(iw, ih - 0.04, idp, "stone_light", ix, (ih - 0.04) / 2, iz)
    f.box(iw + 0.01, 0.04, idp + 0.01, "stone_light", ix, ih - 0.02, iz)
    sink = f.box(0.46, 0.02, 0.40, "stone_light", 5.64, ih + 0.001, 11.78)
    f.ms.hollow_top(f.name(False), sink, 0.015, 0.20, mat="stone_dark")
    f.cyl(0.018, ih, ih + 0.34, "black", ox=5.90, oz=11.78, n=12)
    f.box(0.24, 0.02, 0.02, "black", 5.78, ih + 0.33, 11.78)
    f.box(0.52, 0.006, 0.86, "screen", 5.72, ih + 0.003, 13.12)
    f.box(0.06, 0.006, 0.86, "alu", 6.02, ih + 0.003, 13.12)                 # downdraft


# ------------------------------------------------------------- sanitary ware

def bath(f, it):
    w, d = it.get("w", 1.8), it.get("d", 0.72)
    b = f.cyl(w / 2 - 0.04, 0.0, 0.58, "ceramic", rz=d / 2 - 0.03, r_top=w / 2, rz_top=d / 2, n=48)
    f.ms.hollow_top(f.name(False), b, 0.05, 0.42)
    f.cyl(0.015, 0.0, 0.95, "chrome", oz=-d / 2 - 0.12, n=12)                # floor-standing tap
    f.box(0.02, 0.02, 0.20, "chrome", 0, 0.94, -d / 2 - 0.03)


def walkin_shower(f, it):
    g = F(f.ms, it, f.lights, 0.0, 0.0, 0.0)
    dx, dz = it["drain"]
    g.box(0.15, 0.006, 0.15, "black", dx, 0.003, dz)
    sx, sz0, sz1 = it["screen"]
    if sz1 > sz0:
        g.box(0.008, 2.0, sz1 - sz0, "glass", sx, 1.0, (sz0 + sz1) / 2)
        g.box(0.02, 0.02, sz1 - sz0, "black", sx, 2.0, (sz0 + sz1) / 2)
        g.box(0.02, 2.0, 0.02, "black", sx, 1.0, sz0 + 0.01)
    hx, hz = it["head"]
    nx, nz = it["arm"]
    g.box(0.38 if nx else 0.016, 0.016, 0.38 if nz else 0.016, "black", hx + nx * 0.19, 2.15, hz + nz * 0.19)
    g.cyl(0.13, 2.10, 2.12, "black", ox=hx + nx * 0.38, oz=hz + nz * 0.38, n=32)
    g.box(0.06 if nx else 0.30, 0.06, 0.06 if nz else 0.30, "black", hx + nx * 0.03, 1.10, hz + nz * 0.03)


def voorzetwand(f, it):
    g = F(f.ms, it, f.lights, 0.0, 0.0, 0.0)
    x1, z1, x2, z2, h = it["x1"], it["z1"], it["x2"], it["z2"], it.get("h", 1.2)
    g.box(x2 - x1, h, z2 - z1, "wall_tile", (x1 + x2) / 2, h / 2, (z1 + z2) / 2)
    g.box(x2 - x1 + 0.01, 0.02, z2 - z1 + 0.01, "stone_light", (x1 + x2) / 2, h + 0.01, (z1 + z2) / 2)


def wall_toilet(f, it):
    f.box(0.36, 0.30, 0.20, "ceramic", 0, 0.32, -0.20)
    b = f.cyl(0.18, 0.24, 0.40, "ceramic", oz=0.05, rz=0.25, r_top=0.19, rz_top=0.27, n=40)
    f.ms.hollow_top(f.name(False), b, 0.03, 0.12)
    s = f.cyl(0.19, 0.40, 0.42, "ceramic", oz=0.05, rz=0.27, n=40)
    f.ms.hollow_top(f.name(False), s, 0.07, 0.0)
    f.box(0.24, 0.16, 0.01, "black", 0, 1.05, -0.295)                       # flush plate


def vanity(f, it):
    w, n = it.get("w", 1.0), it.get("basins", 1)
    d = 0.48
    f.box(w, 0.42, d, "oak", 0, 0.66, 0)
    f.box(0.004, 0.38, 0.004, "oak_dark", 0, 0.66, d / 2)
    f.box(w + 0.02, 0.03, d + 0.02, "stone_light", 0, 0.885, 0)
    for bx in ((-w / 4, w / 4) if n == 2 else (0,)):
        bsn = f.cyl(0.19, 0.90, 1.03, "ceramic", ox=bx, oz=0.03, rz=0.16, n=40)
        f.ms.hollow_top(f.name(False), bsn, 0.012, 0.10)
        f.cyl(0.012, 0.90, 1.16, "black", ox=bx, oz=-0.17, n=10)
        f.box(0.016, 0.016, 0.15, "black", bx, 1.155, -0.10)
    f.box(w - 0.10, 0.80, 0.01, "mirror", 0, 1.55, -d / 2 + 0.006)
    f.box(w - 0.20, 0.025, 0.04, "bulb", 0, 1.99, -d / 2 + 0.03)
    f.light(0, 1.95, -d / 2 + 0.10, 6, radius=0.10)


def fontein(f, it):
    b = f.box(0.36, 0.12, 0.25, "ceramic", 0, 0.86, 0)
    f.ms.hollow_top(f.name(False), b, 0.02, 0.08)
    f.cyl(0.01, 0.92, 1.06, "black", ox=0.10, oz=-0.09, n=8)
    f.box(0.30, 0.30, 0.01, "mirror", 0, 1.45, -0.12)


def radiator(f, it):
    w, h = it.get("w", 0.5), it.get("h", 1.6)
    bars = max(2, round(w / 0.07))
    for i in range(bars):
        f.box(0.035, h, 0.03, "lacquer", -w / 2 + (i + 0.5) * w / bars, 0.25 + h / 2, 0.05)
    for y in (0.29, 0.25 + h - 0.04):
        f.box(w, 0.04, 0.025, "lacquer", 0, y, 0.025)


def techniek(f, it):
    g = F(f.ms, it, f.lights, 0.0, 0.0, 0.0)
    g.box(0.70, 1.25, 0.45, "appliance", 1.40, 1.55, 5.71 + 0.225)          # WTW
    for dx in (-0.22, -0.07, 0.07, 0.22):
        g.cyl(0.08, 2.17, 2.55, "alu", ox=1.40 + dx, oz=5.94, n=16)
    g.box(0.16, 0.90, 0.60, "lacquer", 0.27, 1.50, 6.92)                      # verdeler
    g.cyl(0.24, 0.0, 1.30, "appliance", ox=0.60, oz=7.56, n=32)               # boiler
    g.box(0.45, 0.55, 0.28, "appliance", 0.60, 1.85, 7.46)
    for y in (0.50, 0.70):
        g.box(0.50, 0.14, 0.12, "alu", 1.40, y, 7.41)
    for y in (0.425, 1.28):                                                    # wasmachine + droger
        g.box(0.60, 0.85, 0.60, "appliance", 2.13, y, 7.51)
        g.box(0.36, 0.36, 0.01, "screen", 2.13, y + 0.04, 7.205)


BUILDERS = {
    "bed": bed, "nightstand": nightstand, "wardrobe": wardrobe, "sofa": sofa, "armchair": armchair,
    "coffee_table": coffee_table, "side_table": side_table, "chair": chair, "dining_table": dining_table,
    "bar_stool": bar_stool, "rug": rug, "tv_unit": tv_unit, "dresser": dresser, "bookshelf": bookshelf,
    "plant": plant, "floor_lamp": floor_lamp, "pendant": pendant, "downlight": downlight, "desk": desk,
    "coat_rack": coat_rack, "curtains": curtains, "bistro_table": bistro_table, "planter": planter,
    "kitchen_d": kitchen_d, "bath": bath, "walkin_shower": walkin_shower, "voorzetwand": voorzetwand,
    "wall_toilet": wall_toilet, "vanity": vanity, "fontein": fontein, "radiator": radiator,
    "techniek": techniek,
}


def build_items(mats, items, rooms):
    """Returns (MeshSet with all geometry, list of light specs)."""
    ms = MeshSet(mats)
    lights = []
    ceil = {r["id"]: r["ceil"] for r in rooms}
    for it in items:
        fn = BUILDERS.get(it["type"])
        if fn is None:
            raise SystemExit(f"furniture.json: unknown type {it['type']!r} ({it['id']})")
        f = F(ms, it, lights)
        if it["type"] in ("pendant", "downlight"):
            fn(f, it, ceil=ceil.get(it.get("room"), WALL_HEIGHT))
        else:
            fn(f, it)
    return ms, lights
