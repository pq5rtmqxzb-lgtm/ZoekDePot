import * as THREE from 'three';
import { S } from './state.js';
import { applyFloorTiling } from './builders.js';
import { showToast } from './toast.js';

const _accNdc = new THREE.Vector2();

/* --- low-level apply (visual only; scheme is written by the handlers) - */
export function paintRoomWalls(room, hex) {
  for (const wm of room.walls) wm.mesh.material.color.setHex(hex);
}
export function paintAccent(geomIndex, hex) {
  const wm = S.wallMeshes.find(w => w.index === geomIndex);
  if (wm) wm.mesh.material.color.setHex(hex);
}
export function reapplyAccents() {
  for (const [idx, hex] of Object.entries(S.scheme.acc)) paintAccent(+idx, hex);
}
export function finishById(id) { return S.FLOOR_FINISHES.find(f => f.id === id) || S.FLOOR_FINISHES[0]; }
export function setRoomFloor(room, finishId) {
  const base = finishById(finishId).mat;
  for (const m of room.floorMeshes) applyFloorTiling(m, base);
}

/* --- accent-wall picker (raycast the wall you're looking at) ---------- */
export function pickAccentWall(sx, sy) {
  _accNdc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
  S.raycaster.setFromCamera(_accNdc, S.camera);
  S.raycaster.far = 8.0;
  const hits = S.raycaster.intersectObjects(S.wallMeshes.map(w => w.mesh));
  if (!hits.length) { showToast('Geen muur in zicht'); return; }
  const wm = S.wallMeshes.find(w => w.mesh === hits[0].object);
  if (!wm) return;
  S.scheme.acc[wm.index] = S.accentHex;
  paintAccent(wm.index, S.accentHex);
  showToast('Accentmuur geschilderd');
}
