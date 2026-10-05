// ZoekDePot v2 viewer: the Blender-built apartment with baked lighting.
// Model frame = data/model.json frame (x east, y up, z south, metres).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { resolve, roomAt, type CollisionData } from "./collision";
import { Lightmaps, MOOD_LOOK, type Manifest, type Mood } from "./lightmaps";
import { Walker } from "./controls";
import { Tour, planTour, clearance } from "./tour";

const ASSETS = `${import.meta.env.BASE_URL}assets`;
const EYE = 1.68, RADIUS = 0.25, SPEED = 1.4, HFOV = 100;

// quality tier: full on desktops (2K textures, full lightmaps, bloom),
// lite on touch devices (1K textures, half-size lightmaps, no post-processing);
// ?quality=full|lite overrides
const query = new URLSearchParams(location.search);
const tier = query.get("quality") ?? (matchMedia("(pointer: coarse)").matches ? "lite" : "full");
const lite = tier === "lite";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, lite ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
camera.rotation.order = "YXZ";
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;   // reflections only (see Lightmaps)

// full tier: HDR render (4x MSAA) -> bloom on what is brighter than white
// (lamp bulbs, sun patches) -> AgX tone mapping in the OutputPass
let composer: EffectComposer | null = null;
let bloom: UnrealBloomPass | null = null;
if (!lite) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.15, 2.5);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

function resize(): void {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer?.setPixelRatio(renderer.getPixelRatio());
  composer?.setSize(w, h);
  camera.aspect = w / h;
  // a wide 100° horizontally: a screen shows far less than the eye takes in, so
  // at a normal 78° rooms feel small; the wide view brings floor and ceiling
  // into view (vertical fov clamped on portrait screens)
  const v = 2 * Math.atan(Math.tan((HFOV * Math.PI) / 360) / camera.aspect) * (180 / Math.PI);
  camera.fov = Math.max(45, Math.min(100, v));
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const loadBar = document.getElementById("load")!;
const loadText = document.getElementById("loadtext")!;
const help = document.getElementById("help")!;
const roomEl = document.getElementById("room")!;

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<T>;
}

const [collision, manifest] = await Promise.all([
  json<CollisionData>(`${ASSETS}/collision.json`),
  json<Manifest>(`${ASSETS}/lightmaps/manifest.json`),
]);
const lightmaps = new Lightmaps(manifest, `${ASSETS}/lightmaps`, envMap, lite);
// one manager for the model, its textures and the lightmaps: the bar counts files
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => { loadBar.style.width = `${(100 * loaded) / total}%`; };
const gltfLoader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const [gltf] = await Promise.all([
  gltfLoader.loadAsync(`${ASSETS}/${lite ? "apartment-lite" : "apartment"}/scene.gltf`),
  lightmaps.load(new THREE.TextureLoader(manager)),
]);
// the structural slabs and the far ground are never seen from inside
gltf.scene.traverse((o) => { if (o.name.startsWith("slab")) o.visible = false; });
lightmaps.apply(gltf.scene);
scene.add(gltf.scene);
loadBar.style.opacity = "0";
loadText.hidden = true;
document.getElementById("start")!.hidden = false;

// ---- state -------------------------------------------------------------
const walker = new Walker(canvas, document.getElementById("stick")!);
walker.onFirstInput = () => hideHelp();
const params = new URLSearchParams(location.search);
const pos = { x: collision.spawn.x, z: collision.spawn.z };
walker.yaw = (collision.spawn.yaw * Math.PI) / 180;
const p = params.get("pos")?.split(",").map(Number);
if (p && p.length >= 2 && p.every(Number.isFinite)) {
  pos.x = p[0]; pos.z = p[1];
  if (p.length > 2) walker.yaw = (p[2] * Math.PI) / 180;
  if (p.length > 3) walker.pitch = (p[3] * Math.PI) / 180;
}

let mood: Mood = "day";
function setMood(m: Mood): void {
  mood = m;
  lightmaps.setMood(m);
  const look = MOOD_LOOK[m];
  scene.background = new THREE.Color(look.sky);
  renderer.toneMappingExposure = Math.pow(2, look.exposure);   // Blender exposure is in stops
  for (const b of document.querySelectorAll<HTMLButtonElement>("#moods button")) {
    b.setAttribute("aria-pressed", String(b.dataset.mood === m));
  }
}
// only the moods that were baked (a bake can be run per mood: --moods day)
const baked = (Object.keys(MOOD_LOOK) as Mood[]).filter((m) => manifest.maps[m]);
for (const b of document.querySelectorAll<HTMLButtonElement>("#moods button")) {
  if (!baked.includes(b.dataset.mood as Mood)) { b.remove(); continue; }
  b.addEventListener("click", (e) => { e.stopPropagation(); setMood(b.dataset.mood as Mood); });
}
if (baked.length < 2) document.getElementById("moods")!.style.display = "none";
const startMood = params.get("mood") as Mood | null;
setMood(startMood && baked.includes(startMood) ? startMood : baked[0] ?? "day");

// ---- guided tour ("Rondleiding") ----------------------------------------
// for visitors who find steering hard: the camera walks itself from room to
// room (see tour.ts); big buttons to pause, skip or stop
const tour = new Tour(collision);
const tourEl = document.getElementById("tour")!;
const tourBtn = document.getElementById("tourbtn")!;
const fade = document.getElementById("fade")!;
const $ = (id: string) => document.getElementById(id)!;
let tourEnded = false;                               // the panel stays up with "Nog een keer"
// phones get a lower panel (see the CSS): a short step label, the text held
// to three lines unless opened with "Lees meer", and no text while walking
const compact = matchMedia("(max-width: 560px), (max-height: 500px)");
let textOpen = false, textStop = -1;
compact.addEventListener("change", () => renderTour());

function hideHelp(): void {
  help.classList.add("hidden");
  renderTour();
}

function fadeTo(fn: () => void): void {
  fade.style.opacity = "1";
  setTimeout(() => { fn(); fade.style.opacity = "0"; }, 300);
}

function renderTour(): void {
  const on = tour.active || tourEnded;
  tourEl.hidden = !on;
  document.body.classList.toggle("touring", on);
  tourBtn.hidden = on || !help.classList.contains("hidden");
  if (!on) return;
  const n = tour.stops.length, st = tour.stops[tour.index];
  const small = compact.matches;
  const walking = !tourEnded && tour.phase === "walk" && !tour.paused;
  const status = walking ? "onderweg" : tour.paused && !tourEnded ? "gepauzeerd" : "";
  $("tourstep").textContent = tourEnded ? (small ? "Einde" : "Einde van de rondleiding")
    : (small ? `${tour.index + 1}/${n}` : `Stap ${tour.index + 1} van ${n}`) + (status ? ` · ${status}` : "");
  $("tourtitle").textContent = st.title;
  if (textStop !== tour.index) { textOpen = false; textStop = tour.index; }
  const text = $("tourtext"), more = $("tourmore");
  text.textContent = st.text;
  text.hidden = small && walking;
  text.classList.toggle("clamp", small && !textOpen);
  // "Lees meer" only when the three lines cut the text off
  more.hidden = !small || text.hidden || !(textOpen || text.scrollHeight > text.clientHeight + 1);
  more.textContent = textOpen ? "Minder ▴" : "Lees meer ▾";
  more.setAttribute("aria-expanded", String(textOpen));
  $("tourprev").hidden = tourEnded;
  $("tournext").hidden = tourEnded;
  ($("tourprev") as HTMLButtonElement).disabled = tour.index === 0;
  ($("tournext") as HTMLButtonElement).disabled = tour.index === n - 1;
  if (tourEnded) { label("tourpause", "↺", "Nog een keer"); label("tourstop", "", "Zelf rondlopen"); }
  else {
    if (tour.paused) label("tourpause", "▶\uFE0E", "Verder"); else label("tourpause", "❚❚", "Pauze");
    label("tourstop", "✕", "Stoppen");
  }
}

/** Sets a tour button's icon and word (on phones the icon sits above the word). */
function label(id: string, icon: string, word: string): void {
  const [ic, w] = $(id).children;
  ic.textContent = icon;
  w.textContent = word;
}
tour.onChange = renderTour;
tour.onEnd = () => { tourEnded = true; walker.enabled = true; renderTour(); };

function startTour(): void {
  hideHelp();
  tourEnded = false;
  walker.enabled = false;
  document.exitPointerLock?.();
  tour.start({ x: pos.x, z: pos.z, yaw: walker.yaw, pitch: walker.pitch });
  const [sx, sz] = tour.stops[0].at;
  // from the entrance the first stop is right here: just turn; elsewhere fade over
  if (Math.hypot(pos.x - sx, pos.z - sz) < 0.6) tour.jump(0, false); else fadeTo(() => tour.jump(0));
}

function stopTour(): void {
  tour.stop();
  tourEnded = false;
  walker.enabled = true;
  renderTour();
}

const press = (id: string, fn: () => void) =>
  $(id).addEventListener("click", (e) => { e.stopPropagation(); fn(); });
press("starttour", startTour);
press("startfree", hideHelp);
press("tourbtn", startTour);
press("tourpause", () => (tourEnded ? startTour() : tour.setPaused(!tour.paused)));
press("tourstop", stopTour);
press("tourmore", () => { textOpen = !textOpen; renderTour(); });
press("tourprev", () => fadeTo(() => tour.jump(tour.index - 1)));      // walking: back to the room just left
press("tournext", () => fadeTo(() => tour.jump(tour.index + (tour.phase === "walk" ? 0 : 1))));   // walking: arrive now
addEventListener("keydown", (e) => {
  if (!tour.active || e.repeat) return;
  if (e.code === "Space") { e.preventDefault(); tour.setPaused(!tour.paused); }
  if (e.code === "Escape") stopTour();
});
// work out the walking paths now, so the tour starts without a pause
setTimeout(() => tour.prepare(), 300);

if (params.get("hud") === "0") hideHelp();
if (params.get("tour") === "1") startTour();

// ---- loop --------------------------------------------------------------
const vel = { x: 0, z: 0 };
let last = performance.now();
let lastRoom = "";
let frameMs = 16.7;                                  // smoothed frame time (performance budget checks)
function step(h: number): void {
  const [ix, iz] = walker.intent();
  const speed = SPEED * (walker.running ? 1.8 : 1);
  const k = 1 - Math.exp(-h * 12);                  // smooth start / stop
  vel.x += (ix * speed - vel.x) * k;
  vel.z += (iz * speed - vel.z) * k;
  [pos.x, pos.z] = resolve(collision, pos.x + vel.x * h, pos.z + vel.z * h, RADIUS);
}

function frame(now: number): void {
  // fixed 1/120 s physics steps, so a slow frame never tunnels through a
  // wall and slow devices still walk at the right speed
  frameMs += (now - last - frameMs) * 0.05;
  let dt = Math.min(0.5, (now - last) / 1000);
  last = now;
  if (tour.active) {
    const t = tour.update(dt);
    pos.x = t.x; pos.z = t.z;
    walker.yaw = t.yaw; walker.pitch = t.pitch;
    vel.x = vel.z = 0;
  } else {
    while (dt > 1e-4) { const h = Math.min(dt, 1 / 120); step(h); dt -= h; }
  }
  camera.position.set(pos.x, EYE, pos.z);
  camera.rotation.set(walker.pitch, walker.yaw, 0);
  const room = roomAt(collision.rooms, pos.x, pos.z)?.name ?? "";
  if (room !== lastRoom) { roomEl.textContent = room || "—"; lastRoom = room; }
  if (composer) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hooks (smoke test / screenshots)
Object.assign(window, {
  __viewer: {
    state: () => ({ x: pos.x, z: pos.z, yaw: walker.yaw, room: lastRoom, mood, tier, fov: camera.fov,
      tour: { active: tour.active, ended: tourEnded, index: tour.index, phase: tour.phase, paused: tour.paused },
      baked: lightmaps.bakedMaterialCount, info: renderer.info.render,
      fps: 1000 / frameMs, textures: renderer.info.memory.textures }),
    setMood,
    scene,
    tour,
    /** Every walk between tour stops found, and its closest approach to a wall or piece (m). */
    tourCheck: () => {
      const { legs, found } = planTour(collision);
      let min = Infinity;
      for (const l of legs) {
        for (let i = 1; i < l.length; i++) {
          for (let t = 0; t <= 1; t += 0.05) {
            min = Math.min(min, clearance(collision, l[i - 1][0] + (l[i][0] - l[i - 1][0]) * t,
              l[i - 1][1] + (l[i][1] - l[i - 1][1]) * t));
          }
        }
      }
      return { found, minClearance: min, stops: tour.stops.map((s) => roomAt(collision.rooms, ...s.at)?.name ?? "") };
    },
    ready: true,
  },
});
