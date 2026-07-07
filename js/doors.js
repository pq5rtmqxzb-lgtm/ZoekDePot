import * as THREE from 'three';
import { S } from './state.js';
import { DOOR_LEAF_MAT, METAL_MAT } from './materials.js';

/* ===== DOORS =====
 * Every `kind: 'door'` segment gets a hinged leaf that swings open when the
 * player comes near and falls shut again once they've moved away. The leaf is
 * purely visual — the door span stays a walkable gap in wallSegs (as it always
 * was), so a door can never trap or block the player. Rows in model.json can
 * opt out with `"leaf": false` (closet fronts) or pin the swing side with
 * `"swing": 1 | -1` if the automatic away-from-the-player swing would clip
 * furniture. */

const OPEN_DIST  = 1.8;   // m — start opening when the player is this close
const CLOSE_DIST = 2.4;   // m — close again beyond this (hysteresis, no flutter)
const OPEN_ANGLE = 1.75;  // rad (~100°) fully open
const EASE       = 6.0;   // 1/s — exponential approach rate of the swing

export function buildDoorLeaf(g) {
  if (g.leaf === false) return;
  const dx = g.x2 - g.x1, dz = g.z2 - g.z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.6) return;   // too narrow for a real leaf

  // Pivot at the (x1, z1) jamb; local +X runs along the door span.
  const pivot = new THREE.Group();
  pivot.position.set(g.x1, 0, g.z1);
  const base = Math.atan2(-dz, dx);
  pivot.rotation.y = base;

  const leafW = len - 0.10, leafH = 2.28, leafT = 0.04;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, leafT), DOOR_LEAF_MAT);
  leaf.userData.noMeasure = true;   // a swinging surface gives confusing numbers
  leaf.position.set(0.05 + leafW / 2, leafH / 2, 0);
  pivot.add(leaf);

  // Deurklink — one bar through the leaf so it reads from both sides.
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.14), METAL_MAT);
  handle.userData.noMeasure = true;
  handle.position.set(0.05 + leafW - 0.12, 1.02, 0);
  pivot.add(handle);

  S.scene.add(pivot);
  S.doors.push({ pivot, base, seg: g, angle: 0, target: 0 });
}

export function updateDoors(dt) {
  if (!S.doors.length) return;
  const px = S.playerPos.x, pz = S.playerPos.z;
  const k = 1 - Math.exp(-EASE * dt);
  for (const d of S.doors) {
    const g = d.seg;
    const dx = g.x2 - g.x1, dz = g.z2 - g.z1;
    const L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((px - g.x1) * dx + (pz - g.z1) * dz) / L2));
    const dist = Math.hypot(px - (g.x1 + t * dx), pz - (g.z1 + t * dz));

    if (d.target === 0 && dist < OPEN_DIST) {
      // Swing away from whichever side the player approaches from, so the
      // leaf never sweeps through them. sign(cross(doorDir, player - hinge))
      // picks that side; a `swing` field in model.json overrides it.
      const side = Math.sign(dx * (pz - g.z1) - dz * (px - g.x1)) || 1;
      d.target = (g.swing || side) * OPEN_ANGLE;
    } else if (d.target !== 0 && dist > CLOSE_DIST) {
      d.target = 0;
    }

    d.angle += (d.target - d.angle) * k;
    d.pivot.rotation.y = d.base + d.angle;
  }
}
