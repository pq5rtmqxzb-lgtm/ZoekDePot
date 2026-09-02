import * as THREE from 'three';
import { S } from './state.js';
import { WALL_HEIGHT } from './constants.js';
import { roomAt } from './rooms.js';

/* ===== LIGHTING ===== */
export function setupLights() {
  // Hemisphere fill — slightly cooler sky for a daytime-residential feel
  S.hemiLight = new THREE.HemisphereLight(0xeff4fa, 0x3a3028, 0.7);
  S.scene.add(S.hemiLight);

  // Ceiling light points at the positions of the "plafondlichtpunt" symbols
  // on the sales drawing (the centraaldozen the buyer hangs fixtures on).
  // [x, z, color, intensity, range]. The height follows the room's ceiling.
  const lights = [
    [ 2.52,  2.10, 0xfff0d0, 0.90, 6],  // slaapkamer 1 ("2 e")
    [-0.20,  1.70, 0xfff0d0, 0.40, 3],  // slaapkamer 1 NW tip (fill)
    [ 2.85,  4.55, 0xfff0d0, 0.40, 3],  // slaapkamer 1 entry alcove (fill)
    [ 5.40,  5.69, 0xf4f8ff, 1.10, 6],  // badkamer ("2 f")
    [ 5.80,  7.58, 0xeef4ff, 0.50, 3],  // toilet ("i 3")
    [ 1.55,  6.50, 0xeef4ff, 0.55, 4],  // technische berging ("3 j")
    [ 3.19,  6.40, 0xfff0d0, 0.65, 5],  // gang noord ("3 h")
    [ 1.09,  8.81, 0xfff0d0, 0.65, 5],  // gang bij de voordeur ("3 h")
    [ 3.19,  8.81, 0xfff0d0, 0.65, 5],  // gang midden ("3")
    [ 5.34,  8.81, 0xfff0d0, 0.65, 5],  // gang oost ("3 h")
    [ 2.26, 13.42, 0xfff0d0, 0.90, 6],  // slaapkamer 2 ("4 k")
    [ 3.50, 10.55, 0xfff0d0, 0.50, 3],  // slaapkamer 2 entry nook ("4 k")
    [ 1.86, 10.55, 0xeef4ff, 0.60, 3.5],// badkamer klein ("4 L")
    [ 8.57,  2.15, 0xfff0d0, 0.95, 7],  // woonkamer noord ("1 a")
    [ 8.57,  6.50, 0xfff0d0, 0.95, 7],  // woonkamer eettafel ("1 a")
    [ 8.57,  8.91, 0xfff0d0, 0.80, 6],  // woonkamer midden ("1")
    [ 8.57, 11.68, 0xfff0d0, 0.95, 7],  // woonkamer zuid ("1 b")
    [-1.00,  7.60, 0xf6f8ff, 0.55, 4],  // corridor (lijnverlichting)
    [-1.00, 10.90, 0xf6f8ff, 0.55, 4],  // corridor (lijnverlichting)
  ];
  for (const [x, z, color, intensity, range] of lights) {
    const room = roomAt(x, z);
    const ceil = (room && room.ceil) || WALL_HEIGHT;
    const pl = new THREE.PointLight(color, intensity, range);
    pl.position.set(x, ceil - 0.15, z);
    S.scene.add(pl);
    // Small flush-mount disc visual
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.10, 0.02, 16),
      new THREE.MeshBasicMaterial({ color: color })
    );
    disc.position.set(x, ceil - 0.01, z);
    disc.userData.noMeasure = true;
    S.scene.add(disc);
    S.pointLightInfo.push({ light: pl, baseI: intensity, disc });
  }

  // Sun key from above — daylit balconies
  S.sunLight = new THREE.DirectionalLight(0xfff4d8, 0.55);
  S.sunLight.position.set(6, 18, -8);
  if (!S.isMobile) {
    S.sunLight.castShadow = true;
    S.sunLight.shadow.mapSize.set(2048, 2048);
    const sc = S.sunLight.shadow.camera;   // ortho frustum covering the envelope
    sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13;
    sc.near = 1; sc.far = 60;
    S.sunLight.shadow.bias = -0.0004;
    S.sunLight.shadow.normalBias = 0.03;   // thin (0.10 m) interior walls: fights acne
    // Fixed target at the envelope centre so the per-mood sunPos re-aims the
    // shadow camera automatically.
    S.sunLight.target.position.set(4.6, 0, 8.2);
    S.scene.add(S.sunLight.target);
  }
  S.scene.add(S.sunLight);
}

/* ===== POINT-LIGHT INTENSITY + OCCLUSION CULLING =====
 * updatePointLights() is the single owner of point-light intensity:
 * baseI × time-of-day multiplier × cull factor. A light is culled only when
 * the player is beyond its falloff range (so they are not inside its pool)
 * AND a solid wall blocks the straight line between them — pools you can
 * actually see (open woonkamer/keuken sightlines, through doorway gaps) stay
 * lit, while lights in closed-off rooms drop out of the shader's light loop.
 * The cull factor eases over a few ticks so doorway crossings fade instead
 * of popping, and the flush discs stay visible either way. */
export function updatePointLights() {
  for (const p of S.pointLightInfo) {
    p.light.intensity = p.baseI * S.curPointMul * (p.cull ?? 1);
    p.light.visible = p.light.intensity > 0.005;
  }
  // Neighbour windows: dark by day (mul 1.0), glowing by night (mul 1.8).
  const glow = Math.max(0, Math.min(1, (S.curPointMul - 1.0) / 0.8));
  for (const m of S.neighborMats) m.emissiveIntensity = glow * 0.9;
}

const CULL_INTERVAL = 0.15;   // s between visibility passes
const CULL_EASE = 0.45;       // per-pass approach factor (~3 passes to settle)
let cullTimer = 0;

// Does the 2D segment player->light cross a solid wall? Railings and glass
// (t <= 0.06) don't count. ~120 segs × 25 lights every 0.15 s — negligible.
function sightBlocked(px, pz, lx, lz) {
  const ori = (ax, az, bx, bz, cx, cz) =>
    Math.sign((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
  for (const w of S.wallSegs) {
    if ((w.t || 1) <= 0.06) continue;
    if (ori(px, pz, lx, lz, w.x1, w.z1) !== ori(px, pz, lx, lz, w.x2, w.z2) &&
        ori(w.x1, w.z1, w.x2, w.z2, px, pz) !== ori(w.x1, w.z1, w.x2, w.z2, lx, lz)) {
      return true;
    }
  }
  return false;
}

export function updateLightCulling(dt) {
  cullTimer -= dt;
  if (cullTimer > 0) return;
  cullTimer = CULL_INTERVAL;
  const px = S.playerPos.x, pz = S.playerPos.z;
  for (const p of S.pointLightInfo) {
    const lx = p.light.position.x, lz = p.light.position.z;
    const d = Math.hypot(lx - px, lz - pz);
    const R = p.light.distance || 6;
    const target = (d <= R + 1 || !sightBlocked(px, pz, lx, lz)) ? 1 : 0;
    p.cull = (p.cull ?? 1) + (target - (p.cull ?? 1)) * CULL_EASE;
    if (Math.abs(p.cull - target) < 0.02) p.cull = target;
  }
  updatePointLights();
}

/* Flag every lit mesh for the sun's shadow pass. Skipped on mobile (perf) and
 * for MeshBasicMaterial (sky cyclorama, light discs, bulbs, walk marker).
 * Glass stays receive-only so sunlight streams in through the schuifpuien. */
export function enableShadows() {
  if (S.isMobile) return;
  S.scene.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m || m.isMeshBasicMaterial) return;
    o.receiveShadow = true;
    o.castShadow = !m.transparent;
    if (o.geometry && (o.geometry.type === 'PlaneGeometry' || o.geometry.type === 'ShapeGeometry')) {
      // Floors/ceilings are single-sided planes; without this the shadow pass
      // culls them and the sun leaks through the roof.
      m.shadowSide = THREE.DoubleSide;
    }
  });
  for (const f of S.FLOOR_FINISHES) if (f.mat) f.mat.shadowSide = THREE.DoubleSide;
}
