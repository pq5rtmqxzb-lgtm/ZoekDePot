# ZoekDePot v2 — rebuild options and plan

Status: **Option A chosen** (2026-10-04). See "Decisions" below.

## Where v1 stands

What's in the repo today:

- ~4,500 lines of plain ES modules plus Three.js r160 (vendored), with no build step.
- **All geometry is made in code.** Walls, floors and every piece of furniture are
  `BoxGeometry` blocks placed by hand (`js/builders.js`, `js/furniture.js`).
  Textures are drawn on canvases (`js/textures.js`). Lighting is real-time only.
- Strong points worth keeping:
  - `data/model.json`: wall centrelines, openings, rooms and ceiling heights, checked
    against the PDF vectors to within 0.12 m (`tools/*.py`).
  - Product features: guided tour, tap-to-walk, minimap, measure tool, paint and floor
    schemes shared through the URL, custom furniture blocks, photo mode, a
    time-of-day slider, and a Playwright smoke test that checks every room can be reached.

Why it has hit a ceiling: with boxes made in code it will never look like a real
home. Every visual improvement means more hand-written geometry, and there's no
global illumination, so rooms look flat and "gamey". Adding real furniture,
lamps, curtains or kitchen details is slow.

**The core idea of a rebuild: move from geometry written in code to geometry made
in a 3D tool, and make the web app a viewer.**

---

## The options

### Option A — Blender as the content pipeline + a modern web viewer ⭐ chosen

1. A Blender Python script (`bpy`) reads `data/model.json` and generates the shell:
   walls with real openings, floors, ceilings, window frames and balconies. Each
   room is a named object. The dimensions stay tied to the PDF.
2. Finish the model in Blender by hand: real furniture models (Poly Haven,
   BlenderKit, Sketchfab CC0, or manufacturers' models), PBR materials, curtains,
   lamps and kitchen details.
3. **Bake the lighting** in Cycles into lightmaps (day, evening, night). This is
   the single biggest jump in realism: soft shadows, light bouncing between
   surfaces, ambient occlusion. It's also cheap to render on a phone.
4. Export to glTF (`.glb`), compressed with Draco or meshopt and KTX2 textures.
5. Web viewer: **Vite + TypeScript + Three.js** (current version, WebGPU
   renderer with WebGL2 fallback). React Three Fiber is an option if a richer UI is wanted.
6. Port the features: walking and collision (on a navmesh via
   `recast-navigation-js`), the tour, minimap, measuring, and URL schemes.

| | |
|---|---|
| Looks | ★★★★☆ (near-archviz thanks to baked GI) |
| Runs on phones | ★★★★★ |
| Effort | Medium–high: about 4–6 focused phases |
| Keeps v1 work | `model.json`, PDF tools, every feature (ported) |
| Catch | Recolouring walls on top of baked light needs care. Bake the light into a separate map and multiply it with the base colour, so wall paint stays changeable. Colour bleeding becomes slightly off, which is acceptable. |

### Option B — Game engine (Unreal 5 / Twinmotion, Unity, Godot)

Unreal 5 with Lumen (or Twinmotion, which is free for individuals) gives real-time
photorealism. It's the industry standard for architectural visualisation.

| | |
|---|---|
| Looks | ★★★★★ |
| Runs on phones | ★☆☆☆☆ for Unreal: no web export, so you'd ship a desktop or Quest build or pay for Pixel Streaming. ★★★☆☆ for Unity Web or Godot, with large downloads and weaker mobile performance. |
| Effort | High, and a new toolchain to learn |
| Keeps v1 work | `model.json` as import data only. All features rebuilt in C#, C++ or Blueprints. |
| Catch | You lose "open a link on your phone and walk through". Best for a VR headset or a desktop experience. |

### Option C — PlayCanvas (web-first engine with a visual editor)

PlayCanvas is an editor in the browser, like Unity but built for the web.
Import the Blender glTF, place furniture and lights visually, and script the
interaction. It also has first-class Gaussian-splat support (see D).

| | |
|---|---|
| Looks | ★★★★☆ (with baked lightmaps from Blender) |
| Runs on phones | ★★★★★ |
| Effort | Medium |
| Keeps v1 work | `model.json` via Blender, features ported to PlayCanvas scripts |
| Catch | The project lives partly in their cloud editor rather than git. The free tier is public; private projects are paid. Less "just code" than A. |

### Option D — Photoreal "splat" mode (add-on to A or C, not a replacement)

Render the Blender scene path-traced from a few hundred camera positions, then
train a **3D Gaussian Splat**. The result is a walkable, photo-realistic copy that
streams in a browser (PlayCanvas/SuperSplat, Spark or Luma viewers).

- Pro: as good as the renders themselves, including reflections and glass.
- Con: frozen. You can't change paint or furniture without re-rendering.
  Collision still comes from the normal model.
- Use it as a "showroom" mode next to the editable model.

### Option E — Ready-made home planner (no code)

Floorplanner (Dutch), Sweet Home 3D (free and open source, with a web viewer
export), HomeByMe or Planner 5D. Trace the plan, drag in furniture from their
catalogues, and share a link.

| | |
|---|---|
| Effort | Very low, about a day |
| Catch | You lose PDF accuracy guarantees, the tour, URL schemes, custom features and ownership. Good for quickly trying furniture layouts, and could even complement v2. |

### Option F — Modernise in place (not a restart)

Add TypeScript and Vite, upgrade to the current Three.js, and add a navmesh and
baked AO, while keeping the generated geometry.
This is the lowest risk, but it doesn't fix the main problem (boxes made in code),
so it's listed for completeness.

---

## Comparison at a glance

| | A Blender + web | B Unreal/Unity | C PlayCanvas | D Splats | E Planner app | F In-place |
|---|---|---|---|---|---|---|
| Visual realism | high | highest | high | photoreal (static) | medium | low–medium |
| Phone link-and-go | ✅ | ❌ / partial | ✅ | ✅ | ✅ | ✅ |
| Editable paint/furniture | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Keeps PDF accuracy | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Everything in git | ✅ | ✅ (large binaries) | partial | ✅ | ❌ | ✅ |
| Effort | medium–high | high | medium | add-on | very low | low |

---

## Decisions (2026-10-04)

| Question | Answer | What it means for the plan |
|---|---|---|
| Direction | **Option A**: Blender pipeline + web viewer | Rebuild in `v2/`, sharing `data/model.json` and `tools/` with v1 |
| Priority | **Photorealism** | High-resolution baked lighting, real furniture models, reflections and post-processing. Option D (splats) becomes the first extra. |
| Main device | **Desktop**; iPad is nice to have | Desktop gets the full quality. iPad gets a lighter tier (smaller textures and lightmaps) and is checked in Safari, but doesn't drive the design. |
| Who builds the model | **Scripts**, with final steps on the owner's laptop | Everything is generated by `bpy` scripts in the repo. The heavy, high-quality bake runs on the laptop's GPU, either with one command or through screen access. |
| Apartment built yet? | **No** | No real scan for now. Splats come from Blender renders. After handover, a phone or LiDAR scan can be compared with the model. |

### Tooling check

Blender **4.5 LTS** runs headless in the cloud session through the `bpy` package
from PyPI. A Cycles render and a Draco-compressed glTF export both work. The
cloud machine has 4 CPU cores and no GPU, so:

- **Cloud session:** generate geometry, materials and furniture, run **draft
  bakes** (low samples, low resolution), export and test.
- **Laptop (GPU):** the **final bake** at full quality. Install the same version
  (Blender 4.5 LTS, free from blender.org) so results match.

---

## Plan

### Phase 0 — Freeze v1 ✅
- Done 2026-10-04: v1 = `main` @ `620add7`. The cloud session can't push tags, so
  create the `v1` tag on GitHub (Releases → "Draft a new release" → tag `v1` on that commit).
- Tag the current `main` as `v1`. v1 stays live at the current URL until v2 matches it.
- Create a `v2/` folder in the same repo. `data/model.json` and `tools/` stay shared.

### Phase 1 — Generate the shell in Blender ✅
- Done 2026-10-04. See [`v2/README.md`](../v2/README.md). The exported glb matches `model.json`
  within 5 mm on every wall face, every opening is checked, and CI rebuilds and checks it.
- `v2/blender/build_shell.py`: `model.json` → walls with real openings, floors and
  ceilings per room, window and door frames, sliding doors, balcony glass and railings,
  plus the façade around the windows (visible from inside).
- Name the objects consistently (`wall.<room>.<n>`, `floor.<room>`) so the viewer can
  find surfaces for repainting.
- Extend `tools/compare-to-pdf.py` so it also checks the exported `.glb`.
- **Done when:** the glb loads and every wall is within 0.12 m of the PDF.

### Phase 2 — Photoreal materials, furniture and lighting
- **2a ✅ (2026-10-04):** furniture from `v2/data/furniture.json` (own beds 140x200 and dining
  table 260x100, suggestions for the rest), kitchen D, sanitary ware, lamps with real light
  sources, wall tiles and plinths. `check_furniture.py` guards the layout.
- **2b ✅:** CC0 Poly Haven scans per `v2/data/materials.json`; the untreated oak plank floor and the
  bathroom tiles are composed from scans so plank size and colour match the real choice.
- **2c:** lightmap bake (draft in the cloud, final on the laptop GPU).
- PBR materials, mostly CC0 from Poly Haven and ambientCG, matched to the
  Technische Omschrijving: oak lamella floor, wall and floor tiles, plaster, Red Grandis
  frames, Basralocus cladding, glass.
- Replace the box furniture with real models at the same footprints as v1, so the
  "does it fit" checks stay valid. Prefer CC0 assets so the repo can be public.
- Lighting:
  - A physical sky and sun matching the building's real orientation in Den Haag.
  - Lightmaps baked in Cycles for three moods: day, evening and night (with the lamps on).
  - The light is stored separately from the colour (irradiance × albedo), so walls
    can still be repainted.
  - Reflection probes per room for floors, glass, taps and mirrors.
- **Done when:** side-by-side screenshots from the same `?pos=` spots clearly beat v1.

### Phase 3 — Web viewer core (desktop first)
- Vite + TypeScript + current Three.js: WebGPU renderer with WebGL2 fallback, and
  glTF, KTX2 and meshopt loaders.
- Colour pipeline for realism: AgX or Neutral tone mapping, bloom on the lamps, SMAA.
- First-person controls: mouse and keyboard first, with a touch layer for iPad.
- Collision on a navmesh (`recast-navigation-js`) generated from the floors.
- Quality tiers:

  | Tier | Lightmaps | Download budget | Target |
  |---|---|---|---|
  | Desktop | 4K per room group | ≈ 60–80 MB | 60 fps on a normal laptop |
  | iPad | 2K | ≈ 25 MB | 30+ fps in Safari |

- Assets are split per room and loaded in the background, so the first room
  appears quickly. No single file goes above 25 MB, which keeps Cloudflare Pages
  available as a free host.

### Phase 4 — Port the features
In order of value:
1. Guided tour
2. Minimap
3. Paint and floor schemes + URL sharing
4. Measure tool
5. Custom furniture blocks
6. Photo mode, with an optional **path-traced still** on desktop (`three-gpu-pathtracer`)
7. Time of day: blend between the baked moods

### Phase 5 — Testing and deploy
- Port the Playwright smoke test: reachability of every room via the navmesh, and a
  screenshot per room in both tiers.
- Netlify gets a build step (`npm run build`), with deploy previews per PR.
- The `.blend` files are not committed, because the scripts regenerate them.
  Baked lightmaps and `.glb` files go in Git LFS or a release asset, not in plain git.

### Phase 6 — Extras
1. **Splat "showroom"** (Option D): path-traced renders from the Blender scene,
   trained into a Gaussian splat, for a walk-through that looks like a photo.
2. WebXR: walk through at true scale on a VR headset.
3. After handover: scan the real apartment and compare it with the model.

### Step-by-step on the laptop (final bake)
1. Install Blender 4.5 LTS (free).
2. `git pull`, then run one command, for example
   `blender -b -P v2/blender/bake.py -- --quality final`.
3. Commit or upload the generated lightmaps. These steps can be done through screen
   access instead.
