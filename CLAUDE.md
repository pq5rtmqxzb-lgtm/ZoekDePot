# ZoekDePot — notes for Claude

A photoreal 3D walkthrough of the owners' new apartment (Ypsilon Park, Den
Haag, bouwnummer 25): Blender scripts build the apartment from data, the
light is baked into lightmaps, and a three.js viewer (`v2/site/`, published
by Netlify) lets people walk through it. How everything works is in
`README.md` and `v2/README.md`; this file is about how we work.

## Working with the owners

- They write Dutch: answer in Dutch then. Commit messages, `note` fields in
  the data and the room tables in `v2/README.md` are Dutch; code, comments
  and the rest of the READMEs are English.
- "Geef me de laatste layout": run `python v2/blender/furniture_plan.py`
  (Pillow only) and send `v2/docs/furniture-plan.png`, with a short table per
  room and the item ids, so they can point at pieces ("schuif `dining` 50 cm
  naar het noorden").
- Clear, concrete changes (a real piece, a colour, a size, a material,
  move/remove something): just do them. A new layout for a room (kitchen,
  living room) that they want to see first: make a proposal drawing
  (`v2/docs/<kamer>-voorstel.png`) and build the 3D model after their OK.
- **No Cycles preview renders** (`render_preview.py`) unless they ask: they
  take long on the cloud CPU. Verify with the checks and the floor plan.
- State the assumptions you made (estimated sizes, a pattern you could not
  see, a height you guessed) in your reply, so they can correct them.
- Changes are collected and baked in one go on the laptop (below), because a
  final bake takes ~45 minutes per mood. Say at the end that a bake is needed.

## Real furniture (the owners' own pieces)

- `"own": true` plus a Dutch `note` with brand, model, colour and size.
- Ask for (or look up) the real dimensions w x d x h when a photo is all
  there is; product pages often list them. Use the real sizes.
- Photos guide shape and colour: match the colour in `materials.json` (a
  tinted Poly Haven scan) and the flat fallback in `common.MATERIALS`.

## Where things live

| What | File |
|---|---|
| Walls, openings, rooms (from the sales drawing) | `data/model.json` (`geom` kinds: wall, door, sidelight, sliding, fixed, window, railing, screen) |
| Furniture layout, one item per line | `v2/data/furniture.json` (x east, z south, metres; `rot` degrees, local -z = back) |
| Finishes and per-room wall/floor rules | `v2/data/materials.json` (`materials`, `rooms`) |
| Furniture builders | `v2/blender/furniture.py` (`BUILDERS`) |
| Footprints for checks, collision and the plan | `v2/blender/check_furniture.py` (`FOOTPRINT`, `AXIS_BOXES`) |
| Flat fallback colours (CI builds without textures) | `v2/blender/common.py` (`MATERIALS`) |
| Texture generators | `v2/blender/textures.py` (`scan`, `planks`, `tiles`, `patchwork`) |
| Guided tour stops | `v2/web/src/tour.ts` (`STOPS`) |

Checklists:
- **New furniture type:** builder in `furniture.py` + `BUILDERS`; a
  `FOOTPRINT` entry if it stands on the floor (ceiling items have none);
  ceiling items also go in the `ceil` list in `build_items`; every new
  material in `common.MATERIALS` *and* (for a texture) `materials.json`.
- **New `geom` kind:** `SOLID_KINDS` (common.py), `SOLID`
  (check_furniture.py), `opening_cut` + a builder in `build_shell.py`, the
  opening check in `check_glb.py`, `KIND_STYLE` in `tools/plan-overlay.py`
  and `tools/pdf-overlay.py`, and how `export_collision.py` treats it.
- Removing or renaming an item: grep for its id (preview views, tour, README).

## Checks (cloud session)

Blender 4.5 as a Python module needs Python 3.11:

```sh
python3.11 -m venv ~/venv311 && ~/venv311/bin/pip install -r v2/blender/requirements.txt pymupdf
PY=~/venv311/bin/python
$PY v2/blender/textures.py              # once per session (downloads Poly Haven scans); --only a,b for new materials
python3 v2/blender/check_furniture.py   # furniture vs walls, rooms, each other
$PY v2/blender/build_shell.py && $PY v2/blender/check_glb.py   # after model.json / materials.json changes
$PY v2/blender/build_furniture.py && $PY v2/blender/export_collision.py
python3 v2/blender/furniture_plan.py    # commit the updated v2/docs/furniture-plan.png
$PY tools/compare-to-pdf.py             # after model.json changes: walls vs the PDF
```

After a layout change also check the tour routes (`npm test` does it on the
laptop; every leg must be found with >= 30 cm clearance).

Commit: the data, scripts, `v2/docs/furniture-plan.png` and
`v2/docs/plan-section.png`. Never commit `v2/build/` or Cycles renders made
only to check something.

## Final bake (owners' laptop, MacBook with Apple M5, Metal GPU)

Started from a suggested-task card or by hand, on the branch with the
changes. Moods: **day only** unless the owners ask for evening too
(their choice, 2026-10-15). The viewer shows only the baked moods: with day
alone the Dag/Avond buttons disappear until evening is baked again.

```sh
source .venv/bin/activate               # Python 3.11 venv with v2/blender/requirements.txt
python v2/blender/textures.py
python v2/blender/build_shell.py && python v2/blender/check_glb.py
python v2/blender/check_furniture.py
python v2/blender/build_furniture.py && python v2/blender/export_collision.py
python v2/blender/bake.py --quality final --moods day   # ~45 min (day + evening ~85); first line names the GPU
cd v2/web && npm install && npm run assets && npm test && npm run site
```

Run the bake in the background and wait for it; it prints one line per map.
Commit `v2/site/` and the `v2/docs/renders/web_*.png` screenshots from
`npm test` as `Final bake (dag): <what changed>`, with the time per
map in the body, and push to the same branch.
