import * as THREE from 'three';
import { S } from './state.js';
import { WALL_HEIGHT } from './constants.js';

/* ===== LIGHTING ===== */
export function setupLights() {
  // Hemisphere fill — slightly cooler sky for a daytime-residential feel
  S.hemiLight = new THREE.HemisphereLight(0xeff4fa, 0x3a3028, 0.7);
  S.scene.add(S.hemiLight);

  // Per-room ceiling lights. [x, z, color, intensity, range]
  const lights = [
    [ 3.60,  2.20, 0xfff0d0, 0.85, 6],  // slaapkamer 1
    [ 0.20,  1.80, 0xeef4ff, 0.55, 3],  // slaapkamer 1 NW tip
    [ 2.85,  4.55, 0xfff0d0, 0.55, 3],  // slaapkamer 1 entry alcove
    [ 5.40,  5.65, 0xf4f8ff, 1.10, 6],  // badkamer (groot) — bright
    [ 5.74,  7.60, 0xeef4ff, 0.50, 3],  // toilet
    [ 1.30,  6.40, 0xeef4ff, 0.55, 4],  // technische berging
    [ 3.18,  6.30, 0xfff0d0, 0.70, 5],  // gang (corridor)
    [ 1.90,  8.70, 0xfff0d0, 0.80, 5],  // gang (south)
    [ 5.40,  8.85, 0xfff0d0, 0.70, 5],  // gang (east arm)
    [ 2.20, 13.40, 0xfff0d0, 0.85, 6],  // slaapkamer 2
    [ 3.50, 10.50, 0xfff0d0, 0.55, 3],  // slaapkamer 2 entry nook
    [ 1.35, 10.50, 0xeef4ff, 0.55, 3],  // badkamer klein
    [ 8.00,  2.20, 0xfff0d0, 0.95, 7],  // woonkamer north strip
    [ 8.50,  6.50, 0xfff0d0, 0.95, 7],  // woonkamer middle (dining)
    [ 5.60, 12.30, 0xfff0d0, 0.95, 7],  // keuken (deep bay)
    [ 8.50, 11.50, 0xfff0d0, 0.95, 7],  // woonkamer south (east)
  ];
  for (const [x, z, color, intensity, range] of lights) {
    const pl = new THREE.PointLight(color, intensity, range);
    pl.position.set(x, WALL_HEIGHT - 0.15, z);
    S.scene.add(pl);
    // Small flush-mount disc visual
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.10, 0.02, 16),
      new THREE.MeshBasicMaterial({ color: color })
    );
    disc.position.set(x, WALL_HEIGHT - 0.01, z);
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
