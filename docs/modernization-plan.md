# ZoekDePot v2 — rebuild options and plan

Status: **proposal, nothing decided yet** (2026-10-04)

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

### Option A — Blender as the content pipeline + a modern web viewer ⭐ recommended

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

## Recommended plan (Option A, with D as an optional extra later)

### Phase 0 — Freeze v1
- Tag the current `main` as `v1` and keep it deployed (for example at `/v1/`) until v2 matches it.
- Start v2 in the same repo, in `v2/` or `app/`, so `data/model.json` and `tools/` stay shared.

### Phase 1 — Generate the shell in Blender
- `blender/build_shell.py`: `model.json` → walls (boolean-free extrusion with
  openings), floors and ceilings per room, frames, sliding doors, balcony railings.
- Name the objects consistently (`wall.<room>.<n>`, `floor.<room>`) so the viewer can
  find surfaces for repainting.
- Extend `tools/compare-to-pdf.py` so it also checks the exported `.glb`.
- **Done when:** the glb loads in a plain viewer and every wall is within 0.12 m of the PDF.

### Phase 2 — Materials, furniture, lighting
- PBR materials from the Technische Omschrijving: oak lamella floor, tiles, Red Grandis
  frames, Basralocus cladding.
- Replace the box furniture with real models at the same footprints as v1, so
  the "does it fit" checks stay valid.
- Add a sky and sun matching the building's real orientation (Den Haag latitude), and bake
  lightmaps in Cycles for 2–3 moods.
- **Done when:** screenshots from the same `?pos=` spots clearly beat v1.

### Phase 3 — Web viewer core
- Vite + TypeScript + Three.js (WebGPU with WebGL2 fallback), plus glTF, KTX2 and meshopt loaders.
- First-person controls (desktop and touch), navmesh collision, tap-to-walk.
- Performance budget: under 25 MB on first load, 60 fps on a mid-range phone.

### Phase 4 — Port the features
In order of value: guided tour → minimap → paint and floor schemes + URL sharing →
measure tool → custom furniture blocks → photo mode → time of day (blend between the
baked moods).

### Phase 5 — Testing and deploy
- Port the Playwright smoke test: reachability of every room via the navmesh,
  screenshot per room.
- Netlify gets a build step (`npm run build`), with deploy previews per PR.
- Keep the generated `.glb` in Git LFS or as a build artifact. Keep the `.blend`
  in LFS too.

### Phase 6 — Optional extras
- Splat "showroom" mode (Option D).
- WebXR: walk through it on a Quest headset at true scale, which Three.js supports almost for free.
- Swap-in catalogue: drop real IKEA or other furniture models into the space.

---

## Open questions for you

1. **What matters most?** Photorealism, or ease of changing things (paint, furniture)?
   This decides between A, B and D.
2. **Main device?** Phone or tablet in hand, desktop, or a VR headset?
3. **Do you want to model in Blender yourself**, or should the model come almost
   entirely from scripts? This changes how much of Phase 2 is manual.
4. **Is the apartment already built or close to handover?** If so, a real
   photo/LiDAR scan (Polycam or Scaniverse, then splats) becomes an option too.
