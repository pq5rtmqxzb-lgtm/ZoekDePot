import * as THREE from 'three';
import { S } from './state.js';
import { ENV, PLAYER_R } from './constants.js';
import { addRotatedBoxObstacle, removeObstacle } from './collision.js';
import { enableShadows } from './lights.js';
import { showToast } from './toast.js';

/* ===== EIGEN MEUBELS =====
 * Simple "does our furniture fit?" placer: the design panel spawns a neutral
 * block with your own name + width/depth/height (cm) in front of you. Each
 * item can be re-placed by tapping the floor (move mode), rotated in 45°
 * steps, or deleted. Items collide like real furniture and persist in
 * scheme.fur, so they travel with the share URL and saved schemes. */

const FUR_MAT = new THREE.MeshStandardMaterial({ color: 0x8d9aa5, roughness: 0.8 });
const EDGE_MAT = new THREE.LineBasicMaterial({ color: 0x39434c });

let nextId = 1;

function buildItemMeshes(data) {
  const w = data.w / 100, d = data.d / 100, h = data.h / 100;
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, FUR_MAT);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), EDGE_MAT);
  mesh.add(edges);
  mesh.position.set(data.x, h / 2, data.z);
  mesh.rotation.y = data.ry;
  S.scene.add(mesh);
  return mesh;
}

function syncScheme() {
  S.scheme.fur = S.customFurn.map(i => i.data);
}

function addItem(data) {
  const mesh = buildItemMeshes(data);
  const obstacle = addRotatedBoxObstacle(data.x, data.z, data.w / 100, data.d / 100, data.ry);
  const item = { mesh, obstacle, data };
  S.customFurn.push(item);
  return item;
}

/* Spawn in front of the player, facing them. */
export function spawnCustom({ name, w, d, h }) {
  const clamp = v => Math.max(10, Math.min(400, Math.round(+v) || 10));
  w = clamp(w); d = clamp(d); h = clamp(h);
  const dist = Math.max(1.0, d / 200 + PLAYER_R + 0.35);
  const x = Math.max(ENV.xMin + 0.3, Math.min(ENV.xMax - 0.3,
    S.playerPos.x - Math.sin(S.yaw) * dist));
  const z = Math.max(ENV.zMin + 0.3, Math.min(ENV.zMax - 0.3,
    S.playerPos.z - Math.cos(S.yaw) * dist));
  const data = {
    id: nextId++,
    name: (name || 'Meubel').trim().slice(0, 24) || 'Meubel',
    w, d, h, x: +x.toFixed(3), z: +z.toFixed(3), ry: +S.yaw.toFixed(3),
  };
  const item = addItem(data);
  syncScheme();
  enableShadows();   // no-op on mobile; flags the new meshes on desktop
  return item;
}

/* Arm move mode: the next floor tap/click re-places this item. */
export function armMove(item) {
  S.moveArm = item;
  showToast(S.isMobile ? `Tik op de vloer voor "${item.data.name}"`
                       : `Klik op de vloer voor "${item.data.name}"`);
}

/* Re-place at a screen tap: project onto the floor plane (y = 0). */
export function moveCustomAt(sx, sy) {
  const item = S.moveArm;
  if (!item) return false;
  const ndc = new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
  S.raycaster.setFromCamera(ndc, S.camera);
  const ray = S.raycaster.ray;
  if (ray.direction.y > -0.02) { showToast('Tik op de vloer'); return true; }
  const t = -ray.origin.y / ray.direction.y;
  const x = Math.max(ENV.xMin + 0.3, Math.min(ENV.xMax - 0.3, ray.origin.x + ray.direction.x * t));
  const z = Math.max(ENV.zMin + 0.3, Math.min(ENV.zMax - 0.3, ray.origin.z + ray.direction.z * t));
  item.data.x = +x.toFixed(3);
  item.data.z = +z.toFixed(3);
  item.mesh.position.set(item.data.x, item.data.h / 200, item.data.z);
  removeObstacle(item.obstacle);
  item.obstacle = addRotatedBoxObstacle(item.data.x, item.data.z,
                                        item.data.w / 100, item.data.d / 100, item.data.ry);
  syncScheme();
  S.moveArm = null;
  showToast(`"${item.data.name}" verplaatst`);
  return true;
}

export function rotateCustom(item) {
  item.data.ry = +((item.data.ry + Math.PI / 4) % (2 * Math.PI)).toFixed(3);
  item.mesh.rotation.y = item.data.ry;
  removeObstacle(item.obstacle);
  item.obstacle = addRotatedBoxObstacle(item.data.x, item.data.z,
                                        item.data.w / 100, item.data.d / 100, item.data.ry);
  syncScheme();
}

export function deleteCustom(item) {
  const i = S.customFurn.indexOf(item);
  if (i >= 0) S.customFurn.splice(i, 1);
  if (S.moveArm === item) S.moveArm = null;
  removeObstacle(item.obstacle);
  S.scene.remove(item.mesh);
  item.mesh.geometry.dispose();
  syncScheme();
}

/* Rebuild all items from scheme.fur (page load, scheme load, reset). */
export function rebuildCustomFromScheme() {
  for (const item of [...S.customFurn]) {
    removeObstacle(item.obstacle);
    S.scene.remove(item.mesh);
    item.mesh.geometry.dispose();
  }
  S.customFurn = [];
  S.moveArm = null;
  for (const raw of S.scheme.fur || []) {
    const data = {
      id: nextId++,
      name: String(raw.name || 'Meubel').slice(0, 24),
      w: Math.max(10, Math.min(400, +raw.w || 10)),
      d: Math.max(10, Math.min(400, +raw.d || 10)),
      h: Math.max(10, Math.min(400, +raw.h || 10)),
      x: Math.max(ENV.xMin, Math.min(ENV.xMax, +raw.x || 0)),
      z: Math.max(ENV.zMin, Math.min(ENV.zMax, +raw.z || 0)),
      ry: +raw.ry || 0,
    };
    addItem(data);
  }
  syncScheme();
  enableShadows();
}
