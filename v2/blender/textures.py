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


KINDS = {"scan": make_scan, "planks": make_planks, "tiles": make_tiles}


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
