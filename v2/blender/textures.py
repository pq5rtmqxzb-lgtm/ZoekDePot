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


def make_tiles(name, spec, res, ppm=1024):
    rng = np.random.default_rng(spec.get("seed", 7))
    s = fetch(spec["source"], res)
    tw, th = spec["tile_size"]
    nx, ny = max(1, round(1.2 / tw)), max(1, round(1.2 / th))   # ~1.2 m tile-able patch
    W, H = round(nx * tw * ppm), round(ny * th * ppm)
    sw, sh = s["size"]
    base = resize(s["color"], round(sw * ppm), round(sh * ppm))
    reps = (int(np.ceil(H / base.shape[0])), int(np.ceil(W / base.shape[1])), 1)
    base = np.tile(base, reps)[:H, :W]
    L = lum(base)
    detail = 1.0 + 0.6 * (L / L.mean() - 1.0)
    color = hex_rgb(spec["color"])[None, None, :] * detail[..., None]
    for j in range(ny):
        for i in range(nx):
            y0, y1 = round(j * H / ny), round((j + 1) * H / ny)
            x0, x1 = round(i * W / nx), round((i + 1) * W / nx)
            color[y0:y1, x0:x1] *= 1.0 + rng.normal(0, spec.get("variation", 0.02))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cw, ch = W / nx, H / ny
    dx = np.minimum(xx % cw, cw - (xx % cw))
    dy = np.minimum(yy % ch, ch - (yy % ch))
    half = spec.get("grout", 0.003) * ppm / 2
    d = np.minimum(dx, dy)
    gm = np.clip((half + 1 - d), 0, 1)[..., None]                  # 1 in the grout
    color = color * (1 - gm) + hex_rgb(spec["grout_color"])[None, None, :] * gm
    rough = np.full((H, W), spec.get("roughness", 0.3), np.float32)
    rough = rough * (1 - gm[..., 0]) + 0.85 * gm[..., 0]
    # normal: tile edges slope into the grout over ~1.5 mm
    bevel = half + 1.5e-3 * ppm
    nxm = np.where(dx < bevel, np.sign((xx % cw) - cw / 2) * -0.35 * (1 - dx / bevel), 0) * (dx <= dy)
    nym = np.where(dy < bevel, np.sign((yy % ch) - ch / 2) * 0.35 * (1 - dy / bevel), 0) * (dy < dx)
    n = np.stack([nxm, nym, np.ones_like(nxm)], -1)
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
