"""Phase 2b: download CC0 scans and make the surface textures.

    python v2/blender/textures.py [--only floor_hout,plaster] [--res 2k]

For every material in v2/data/materials.json this writes
v2/build/textures/<material>_{color,rough,normal}.jpg plus index.json
(texture size in metres and rotation), which common.make_materials picks
up. Sources are Poly Haven scans (CC0), cached in v2/assets/cache/.

kinds
- scan:   the scan as is (tint null), or recoloured to `tint` keeping its
          weave/grain: color = tint * (1 + detail * (luminance/mean - 1)).
- planks: a plank floor composed from raw-wood scans: every plank is cut
          from a random spot of a random source, gets its own slight tone,
          and the rows are staggered; edges get a fine V-groove. Tileable.
- tiles:  tiles with grout lines on a fine surface scan, slight tone per tile.
- patchwork: hexagonal patchwork tiles (cement-tile look), every hexagon its
          own random motif in a fixed palette; drawn, no scan needed.
Needs numpy + Pillow (both come with the bpy wheel / requirements.txt).
"""
import io
import json
import pathlib
import sys
import urllib.request

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONFIG = ROOT / "v2" / "data" / "materials.json"
CACHE = ROOT / "v2" / "assets" / "cache"
OUT = ROOT / "v2" / "build" / "textures"
UA = {"User-Agent": "ZoekDePot-v2-pipeline (github.com/pq5rtmqxzb-lgtm/ZoekDePot)"}
Image.MAX_IMAGE_PIXELS = None


# ------------------------------------------------------------------ download

def _get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()


def fetch(asset, res="2k"):
    """Download (once) diffuse, roughness and GL normal of a Poly Haven
    texture. Returns dict of float32 arrays (0..1) + physical size (m)."""
    d = CACHE / asset
    d.mkdir(parents=True, exist_ok=True)
    meta = d / "info.json"
    if not meta.exists():
        info = json.loads(_get(f"https://api.polyhaven.com/info/{asset}"))
        files = json.loads(_get(f"https://api.polyhaven.com/files/{asset}"))
        meta.write_text(json.dumps({"dimensions": info.get("dimensions"), "files": files}))
    m = json.loads(meta.read_text())
    files = m["files"]
    maps = {}
    for name, keys in (("color", ("Diffuse", "diff", "col_01", "Color")), ("rough", ("Rough",)),
                       ("normal", ("nor_gl",))):
        key = next((k for k in keys if k in files), None)
        if key is None:
            continue
        p = d / f"{name}_{res}.jpg"
        if not p.exists():
            entry = files[key][res]
            url = (entry.get("jpg") or entry.get("png"))["url"]
            img = Image.open(io.BytesIO(_get(url)))
            img.convert("L" if name == "rough" else "RGB").save(p, quality=95)
        img = Image.open(p)
        maps[name] = np.asarray(img, dtype=np.float32) / 255.0
    dims = m.get("dimensions") or [1000, 1000]
    maps["size"] = (dims[0] / 1000.0, dims[1] / 1000.0)
    return maps


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def lum(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def save(name, color, rough, normal):
    OUT.mkdir(parents=True, exist_ok=True)
    # hue-preserving highlight clamp: clipping one channel alone shifts the
    # hue (pale oak grain would turn green)
    peak = color.max(axis=-1, keepdims=True)
    color = color / np.maximum(1.0, peak / 0.985)
    Image.fromarray((np.clip(color, 0, 1) * 255 + 0.5).astype(np.uint8)).save(OUT / f"{name}_color.jpg", quality=92)
    if rough is not None:
        Image.fromarray((np.clip(rough, 0, 1) * 255 + 0.5).astype(np.uint8), "L").save(OUT / f"{name}_rough.jpg", quality=92)
    if normal is not None:
        Image.fromarray((np.clip(normal, 0, 1) * 255 + 0.5).astype(np.uint8)).save(OUT / f"{name}_normal.jpg", quality=95)


def retarget_rough(r, target, spread=0.6):
    if r is None or target is None:
        return r
    return np.clip(target + (r - r.mean()) * spread, 0.02, 1.0)


def resize(a, w, h):
    mode = "L" if a.ndim == 2 else "RGB"
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), mode).resize((w, h), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0


# ------------------------------------------------------------------ kinds

def make_scan(name, spec, res):
    s = fetch(spec["source"], res)
    color = s["color"]
    if spec.get("tint"):
        L = lum(color)
        detail = spec.get("detail", 0.8)
        f = 1.0 + detail * (L / max(L.mean(), 1e-4) - 1.0)
        color = hex_rgb(spec["tint"])[None, None, :] * f[..., None]
    rough = retarget_rough(s.get("rough"), spec.get("roughness"))
    save(name, color, rough, s.get("normal"))
    return {"size": list(spec.get("size") or s["size"]), "rot": spec.get("rot", 0)}


def make_planks(name, spec, res, ppm=1024):
    rng = np.random.default_rng(spec.get("seed", 25))
    srcs = []
    for a in spec["sources"]:
        s = fetch(a, res)
        sw, sh = s["size"]
        w, h = round(sw * ppm), round(sh * ppm)
        m = {k: resize(s[k], w, h) for k in ("color", "rough", "normal") if k in s}
        # grade each scan to the target first, so planks from different
        # scans share one hue and only the natural variation remains
        c = m["color"]
        L = lum(c)
        chroma = c - L[..., None]
        f = 1.0 + spec.get("grain", 0.75) * (L / L.mean() - 1.0)
        m["color"] = hex_rgb(spec["color"])[None, None, :] * f[..., None] + 0.15 * chroma
        srcs.append(m)
    pw = spec["plank_width"]
    tw, th = spec["tile"]
    rows = max(1, round(th / pw))
    th = rows * pw
    W, H = round(tw * ppm), round(th * ppm)
    color = np.zeros((H, W, 3), np.float32)
    rough = np.zeros((H, W), np.float32)
    normal = np.zeros((H, W, 3), np.float32)
    edge = np.full((H, W), 1e9, np.float32)          # px to the nearest plank edge
    lo, hi = spec["plank_length"]
    for r in range(rows):
        y0, y1 = round(r * H / rows), round((r + 1) * H / rows)
        lens = []
        while sum(lens) < tw:
            lens.append(rng.uniform(lo, hi))
        lens = np.array(lens) * tw / sum(lens)
        start = rng.uniform(0, tw)
        pos = start
        for L in lens:
            a0 = round(pos * ppm)
            n = round(L * ppm)
            cols = (a0 + np.arange(n)) % W
            src = srcs[rng.integers(len(srcs))]
            sh_, sw_ = src["color"].shape[:2]
            ox, oy = rng.integers(sw_), rng.integers(sh_)
            yy = (oy + np.arange(y1 - y0)) % sh_
            xx = (ox + np.arange(n)) % sw_
            if rng.random() < 0.5:
                xx = xx[::-1]
            tone = 1.0 + rng.normal(0, spec.get("variation", 0.05))
            warm = rng.normal(0, 0.012)
            tint = np.array([1 + warm, 1.0, 1 - warm], np.float32) * tone
            color[y0:y1][:, cols] = src["color"][yy][:, xx] * tint
            if "rough" in src:
                rough[y0:y1][:, cols] = src["rough"][yy][:, xx]
            if "normal" in src:
                normal[y0:y1][:, cols] = src["normal"][yy][:, xx]
            # distance to this plank's ends (along x) and to the row edges (along y)
            dx = np.minimum(np.arange(n), n - 1 - np.arange(n)).astype(np.float32)
            dy = np.minimum(np.arange(y1 - y0), y1 - y0 - 1 - np.arange(y1 - y0)).astype(np.float32)
            edge[y0:y1][:, cols] = np.minimum(dx[None, :], dy[:, None])
            pos += L
    # grade the whole floor's brightness back to the target (hue already set)
    target = hex_rgb(spec["color"])
    color = color * (lum(target[None, None, :]).item() / lum(color).mean())
    rough = retarget_rough(rough, spec.get("roughness", 0.7))
    # fine V-groove at every plank edge: darker, rougher
    g = max(1.0, spec.get("groove", 0.0015) * ppm)
    k = np.clip(edge / g, 0, 1)[..., None]
    color = color * (0.72 + 0.28 * k)
    rough = rough + (1 - k[..., 0]) * 0.15
    save(name, color, rough, normal)
    return {"size": [W / ppm, H / ppm], "rot": spec.get("rot", 0)}


def _smooth_noise(rng, h, w, cells):
    """Smooth random field (0 mean, ~unit std) of size h x w with about
    `cells` random knots across the shorter side."""
    k = max(2, int(cells))
    gh, gw = max(2, round(k * h / min(h, w))), max(2, round(k * w / min(h, w)))
    g = rng.normal(0, 1, (gh, gw)).astype(np.float32)
    im = Image.fromarray(((g - g.min()) / (np.ptp(g) + 1e-6) * 255).astype(np.uint8), "L").resize((w, h), Image.BICUBIC)
    a = np.asarray(im, np.float32) / 255.0
    return (a - a.mean()) / (a.std() + 1e-6)


def _hex_ridges(u, v, size, width):
    """1 on the outlines of a pointy-top hexagon grid (cell radius `size`),
    falling off over `width`; u, v in metres, tile-local."""
    q = (np.sqrt(3) / 3 * u - v / 3) / size
    r = (2 / 3 * v) / size
    x, z = q, r
    y = -x - z
    rx, ry, rz = np.round(x), np.round(y), np.round(z)
    dx, dy, dz = np.abs(rx - x), np.abs(ry - y), np.abs(rz - z)
    fix_x = (dx > dy) & (dx > dz)
    fix_y = ~fix_x & (dy > dz)
    rx = np.where(fix_x, -ry - rz, rx)
    ry = np.where(fix_y, -rx - rz, ry)
    rz = -rx - ry
    cu = size * np.sqrt(3) * (rx + rz / 2)                # centre of the nearest hex
    cv = size * 1.5 * rz
    pu, pv = u - cu, v - cv
    apothem = size * np.sqrt(3) / 2
    m = np.maximum(np.abs(pu), np.abs(pu * 0.5 + pv * np.sqrt(3) / 2))
    m = np.maximum(m, np.abs(pu * 0.5 - pv * np.sqrt(3) / 2))
    edge = apothem - m                                    # distance to the hex outline
    return np.clip(1 - edge / width, 0, 1)


def make_tiles(name, spec, res, ppm=1024):
    """Tiles from a height map: tile faces, grout recess with a small bevel,
    optional raised relief (`relief: hex`), handmade glaze undulation
    (`glaze` = height amplitude in m, plus `pillow` at the edges), speckles,
    and per-tile tone/hue variation. Colour/roughness/normal follow."""
    rng = np.random.default_rng(spec.get("seed", 7))
    s = fetch(spec["source"], res)
    tw, th = spec["tile_size"]
    nx, ny = max(1, round(1.2 / tw)), max(1, round(1.2 / th))    # ~1.2 m tileable patch
    W, H = round(nx * tw * ppm), round(ny * th * ppm)
    sw, sh = s["size"]
    base = resize(s["color"], round(sw * ppm), round(sh * ppm))
    reps = (int(np.ceil(H / base.shape[0])), int(np.ceil(W / base.shape[1])), 1)
    base = np.tile(base, reps)[:H, :W]
    L = lum(base)
    color = hex_rgb(spec["color"])[None, None, :] * (1.0 + spec.get("detail", 0.6) * (L / L.mean() - 1.0))[..., None]

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cw, ch = W / nx, H / ny
    lx, ly = xx % cw, yy % ch                                       # px inside the tile
    d = np.minimum(np.minimum(lx, cw - lx), np.minimum(ly, ch - ly))
    half = spec.get("grout", 0.003) * ppm / 2
    gm = np.clip(half + 1 - d, 0, 1)                                # 1 in the grout
    height = np.zeros((H, W), np.float32)
    bevel = 1.5e-3 * ppm
    height -= 0.0015 * np.clip(1 - (d - half) / bevel, 0, 1)        # bevel + grout recess (m)
    # per tile: tone, hue, glaze undulation
    glaze = spec.get("glaze", 0.0)
    for j in range(ny):
        for i in range(nx):
            y0, y1 = round(j * H / ny), round((j + 1) * H / ny)
            x0, x1 = round(i * W / nx), round((i + 1) * W / nx)
            tone = 1.0 + rng.normal(0, spec.get("variation", 0.02))
            hue = 1.0 + rng.normal(0, spec.get("hue_variation", 0.0), 3)
            color[y0:y1, x0:x1] *= (tone * hue)[None, None, :].astype(np.float32)
            if glaze:
                height[y0:y1, x0:x1] += glaze * _smooth_noise(rng, y1 - y0, x1 - x0, 3 + rng.integers(3))
    if spec.get("pillow"):
        height -= spec["pillow"] * (1 - np.clip(d / (0.012 * ppm), 0, 1)) ** 2
    if spec.get("relief") == "hex":
        u, v = (lx - cw / 2) / ppm, (ly - ch / 2) / ppm
        ridge = _hex_ridges(u, v, spec.get("relief_size", 0.12), spec.get("relief_width", 0.0025))
        height += spec.get("relief_height", 0.0008) * ridge
        color *= (1 - 0.04 * ridge)[..., None]
    if glaze:   # glaze pools darker in the hollows of a handmade tile
        hn = (height - height.mean()) / (height.std() + 1e-9)
        color *= (1 + 0.08 * np.clip(hn, -2, 2))[..., None]
    if spec.get("speckle"):
        dots = rng.random((H, W)) < spec["speckle"] / (ppm * ppm)   # density per m2
        dots = dots | np.roll(dots, 1, 0) | np.roll(dots, 1, 1)
        shade = np.where(rng.random((H, W)) < 0.7, 0.75, 1.12).astype(np.float32)
        color = np.where(dots[..., None], color * shade[..., None], color)
    color = color * (1 - gm[..., None]) + hex_rgb(spec["grout_color"])[None, None, :] * gm[..., None]
    rough = np.full((H, W), spec.get("roughness", 0.3), np.float32)
    rough = rough * (1 - gm) + 0.85 * gm
    # normal from the height map (OpenGL convention: +v is up = -row)
    gy, gx = np.gradient(height * ppm)
    n = np.stack([-gx, gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    save(name, color, rough, n * 0.5 + 0.5)
    return {"size": [W / ppm, H / ppm], "rot": spec.get("rot", 0)}


def _hex_cells(u, v, R):
    """Pointy-top hex grid (cell radius R, centre (0, 0) at u = v = 0):
    per point the cell's offset coordinates (col, row) and the point
    relative to the cell centre (pu, pv), all in metres."""
    q = (np.sqrt(3) / 3 * u - v / 3) / R
    r = (2 / 3 * v) / R
    x, z = q, r
    y = -x - z
    rx, ry, rz = np.round(x), np.round(y), np.round(z)
    dx, dy, dz = np.abs(rx - x), np.abs(ry - y), np.abs(rz - z)
    fix_x = (dx > dy) & (dx > dz)
    fix_z = ~fix_x & ~(dy > dz)
    rx = np.where(fix_x, -ry - rz, rx)
    rz = np.where(fix_z, -rx - ry, rz)
    pu, pv = u - R * np.sqrt(3) * (rx + rz / 2), v - R * 1.5 * rz
    row = rz.astype(np.int64)
    col = (rx + (rz - (row & 1)) / 2).astype(np.int64)
    return col, row, pu, pv


def _motif(kind, pu, pv, a, rng):
    """One patchwork motif as [(mask, ink index), ...], painted in order,
    for points (pu, pv) relative to the hex centre; a = apothem."""
    s = np.hypot(pu, pv) / a
    th = np.arctan2(pv, pu) + rng.integers(6) * np.pi / 3
    hd = np.maximum(np.abs(pu), np.maximum(np.abs(pu / 2 + pv * np.sqrt(3) / 2),
                                           np.abs(pu / 2 - pv * np.sqrt(3) / 2))) / a
    c = rng.permutation(len(PATCH_INK))
    out = [(hd > 0.86, c[0])]                                       # border band
    if kind == 0:                                                   # rosette
        n = rng.choice([4, 6, 8])
        out += [(s < 0.78 * np.abs(np.cos(n * th / 2)) ** 0.7, c[1]),
                (s < 0.45 * np.abs(np.cos(n * th / 2)) ** 0.7, c[2]),
                (s < 0.13, c[3])]
    elif kind == 1:                                                 # star in a ring
        n = rng.choice([6, 8])
        tri = np.abs(((th * n / (2 * np.pi)) % 1) - 0.5) * 2
        out += [((s > 0.62) & (s < 0.72), c[1]), (s < 0.30 + 0.30 * tri, c[2]),
                (np.abs(pu) / a + np.abs(pv) / a < 0.22, c[3])]
    elif kind == 2:                                                 # cross with a diamond
        w = 0.13
        out += [((np.abs(pu) / a < w) | (np.abs(pv) / a < w), c[1]),
                (np.abs(pu) / a + np.abs(pv) / a < 0.46, c[2]),
                (np.abs(pu) / a + np.abs(pv) / a < 0.24, c[3]),
                ((np.abs(np.abs(pu) / a - 0.5) < 0.12) & (np.abs(np.abs(pv) / a - 0.5) < 0.12), c[3])]
    elif kind == 3:                                                 # quatrefoil
        k = np.zeros_like(s, bool)
        for i in range(4):
            ang = i * np.pi / 2 + np.pi / 4
            k |= np.hypot(pu / a - 0.30 * np.cos(ang), pv / a - 0.30 * np.sin(ang)) < 0.27
        out += [(k, c[1]), (s < 0.30, c[2]), (s < 0.12, c[0])]
    elif kind == 4:                                                 # concentric hexagons
        out += [((hd > 0.62) & (hd < 0.74), c[1]), ((hd > 0.36) & (hd < 0.50), c[2]), (hd < 0.18, c[3])]
    else:                                                           # corner lilies
        k = np.zeros_like(s, bool)
        for i in range(6):
            ang = i * np.pi / 3 + np.pi / 6
            vx, vy = np.cos(ang) * 1.155, np.sin(ang) * 1.155         # hex vertex (in apothems)
            k |= np.hypot(pu / a - vx, pv / a - vy) < 0.42
        out += [(k & (hd <= 0.86), c[1]), (s < 0.40 * np.abs(np.cos(2 * th)) ** 0.5 + 0.08, c[2]),
                (s < 0.10, c[3])]
    return out


PATCH_INK = ["#2B2A28", "#7E9DBE", "#4F6E91", "#E2A84A", "#C8642F", "#9A9893", "#D8A6A0", "#C9C3B7"]


def make_patchwork(name, spec, res, ppm=1024):
    """Hexagonal patchwork tiles (cement-tile look): every hexagon gets a
    random motif (rosette, star, cross, quatrefoil, concentric, corner
    lilies) in 3-4 colours on a cream ground, a random turn, slight tone
    variation and wear; grout and bevels from the hex outline. Tileable.
    `across` = width across the flats (m)."""
    rng = np.random.default_rng(spec.get("seed", 11))
    across = spec.get("across", 0.20)
    R = across / np.sqrt(3)
    a = across / 2
    nc, nr = spec.get("cols", 6), spec.get("rows", 6)                # nr even: rows repeat in pairs
    W, H = round(nc * across * ppm), round(nr * 1.5 * R * ppm)
    ss = 2                                                           # supersample the motifs
    yy, xx = np.mgrid[0:H * ss, 0:W * ss].astype(np.float64)
    u, v = (xx + 0.5) / (ppm * ss), (yy + 0.5) / (ppm * ss)
    col, row, pu, pv = _hex_cells(u, v, R)
    cid = (col % nc) * nr + (row % nr)
    ink = np.stack([hex_rgb(h) for h in PATCH_INK])
    ground = hex_rgb(spec.get("ground", "#ECE5D8"))
    color = np.broadcast_to(ground, (H * ss, W * ss, 3)).copy().astype(np.float32)
    for k in range(nc * nr):
        m = cid == k
        if not m.any():
            continue
        crng = np.random.default_rng((spec.get("seed", 11), k))
        for mask, ci in _motif(crng.integers(6), pu[m], pv[m], a, crng):
            sel = np.zeros_like(m)
            sel[m] = mask
            color[sel] = ink[ci]
        color[m] *= np.float32(1.0 + crng.normal(0, spec.get("variation", 0.03)))
    color = resize(np.clip(color, 0, 1), W, H)
    # grout + bevel from the distance to the hex outline (full resolution)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    _, _, pu, pv = _hex_cells((xx + 0.5) / ppm, (yy + 0.5) / ppm, R)
    hd = np.maximum(np.abs(pu), np.maximum(np.abs(pu / 2 + pv * np.sqrt(3) / 2), np.abs(pu / 2 - pv * np.sqrt(3) / 2)))
    d = (a - hd) * ppm                                               # px to the outline
    half = spec.get("grout", 0.002) * ppm / 2
    gm = np.clip(half + 1 - d, 0, 1).astype(np.float32)
    height = (-0.0012 * np.clip(1 - (d - half) / (1.2e-3 * ppm), 0, 1)).astype(np.float32)
    # wear: soft mottling of the cement face, a few pale specks
    color *= (1 + 0.05 * _smooth_noise(rng, H, W, 40))[..., None]
    color *= (1 + 0.04 * (rng.random((H, W)) - 0.5))[..., None].astype(np.float32)
    color = color * (1 - gm[..., None]) + hex_rgb(spec.get("grout_color", "#B9B4AA"))[None, None, :] * gm[..., None]
    rough = np.full((H, W), spec.get("roughness", 0.5), np.float32) * (1 - gm) + 0.85 * gm
    gy, gx = np.gradient(height * ppm)
    n = np.stack([-gx, gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    save(name, color, rough, n * 0.5 + 0.5)
    return {"size": [W / ppm, H / ppm], "rot": spec.get("rot", 0)}


KINDS = {"scan": make_scan, "planks": make_planks, "tiles": make_tiles, "patchwork": make_patchwork}


def main():
    args = sys.argv[1:]
    opts = {"only": None, "res": "2k"}
    for i in range(0, len(args) - 1, 2):
        opts[args[i].lstrip("-")] = args[i + 1]
    cfg = json.loads(CONFIG.read_text())
    only = set(opts["only"].split(",")) if opts["only"] else None
    index_p = OUT / "index.json"
    index = json.loads(index_p.read_text()) if index_p.exists() else {}
    for name, spec in cfg["materials"].items():
        if only and name not in only:
            continue
        index[name] = KINDS[spec["kind"]](name, spec, opts["res"])
        print(f"{name:13s} {spec['kind']:6s} {index[name]['size'][0]:.2f} x {index[name]['size'][1]:.2f} m")
    OUT.mkdir(parents=True, exist_ok=True)
    index_p.write_text(json.dumps(index, indent=1))
    print(f"wrote {len(index)} materials to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
