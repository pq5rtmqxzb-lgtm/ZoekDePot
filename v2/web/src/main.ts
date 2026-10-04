// ZoekDePot v2 viewer: the Blender-built apartment with baked lighting.
// Model frame = data/model.json frame (x east, y up, z south, metres).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { resolve, roomAt, type CollisionData } from "./collision";
import { Lightmaps, MOOD_LOOK, type Manifest, type Mood } from "./lightmaps";
import { Walker } from "./controls";

const ASSETS = `${import.meta.env.BASE_URL}assets`;
const EYE = 1.70, RADIUS = 0.25, SPEED = 1.4, HFOV = 78;

const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
camera.rotation.order = "YXZ";
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;   // reflections only (see Lightmaps)

function resize(): void {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // hold ~78° horizontally like the Blender previews (and v1), clamp on portrait screens
  const v = 2 * Math.atan(Math.tan((HFOV * Math.PI) / 360) / camera.aspect) * (180 / Math.PI);
  camera.fov = Math.max(45, Math.min(80, v));
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
// quality tier: full on desktops, lite (1K textures, half-size lightmaps)
// on touch devices; ?quality=full|lite overrides
const query = new URLSearchParams(location.search);
const tier = query.get("quality") ?? (matchMedia("(pointer: coarse)").matches ? "lite" : "full");
const lite = tier === "lite";
const lightmaps = new Lightmaps(manifest, `${ASSETS}/lightmaps`, envMap, lite);
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const [gltf] = await Promise.all([
  gltfLoader.loadAsync(`${ASSETS}/${lite ? "apartment-lite.glb" : "apartment.glb"}`, (e) => {
    if (e.total) loadBar.style.width = `${(100 * e.loaded) / e.total}%`;
  }),
  lightmaps.load(new THREE.TextureLoader()),
]);
// the structural slabs and the far ground are never seen from inside
gltf.scene.traverse((o) => { if (o.name.startsWith("slab")) o.visible = false; });
lightmaps.apply(gltf.scene);
scene.add(gltf.scene);
loadBar.style.opacity = "0";
loadText.textContent = "Klik of tik om te beginnen";

// ---- state -------------------------------------------------------------
const walker = new Walker(canvas, document.getElementById("stick")!);
walker.onFirstInput = () => help.classList.add("hidden");
const params = new URLSearchParams(location.search);
if (params.get("hud") === "0") help.classList.add("hidden");
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
for (const b of document.querySelectorAll<HTMLButtonElement>("#moods button")) {
  b.addEventListener("click", (e) => { e.stopPropagation(); setMood(b.dataset.mood as Mood); });
}
const startMood = params.get("mood") as Mood | null;
setMood(startMood && startMood in MOOD_LOOK ? startMood : "day");

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
  while (dt > 1e-4) { const h = Math.min(dt, 1 / 120); step(h); dt -= h; }
  camera.position.set(pos.x, EYE, pos.z);
  camera.rotation.set(walker.pitch, walker.yaw, 0);
  const room = roomAt(collision.rooms, pos.x, pos.z)?.name ?? "";
  if (room !== lastRoom) { roomEl.textContent = room || "—"; lastRoom = room; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hooks (smoke test / screenshots)
Object.assign(window, {
  __viewer: {
    state: () => ({ x: pos.x, z: pos.z, yaw: walker.yaw, room: lastRoom, mood, tier,
      baked: lightmaps.bakedMaterialCount, info: renderer.info.render,
      fps: 1000 / frameMs, textures: renderer.info.memory.textures }),
    setMood,
    scene,
    ready: true,
  },
});
