import * as THREE from 'three';
import { S } from './state.js';
import { PLAYER_R, ENV, WALK_ARRIVE } from './constants.js';

/* ===== TAP-TO-WALK =====
 * Tap a spot and the camera turns and walks there by itself. Tapping a wall
 * walks up to that wall and stops just short of it. */

export function setWalkTarget(cx, cy) {
  const ndc = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  S.raycaster.setFromCamera(ndc, S.camera);
  const ray = S.raycaster.ray;
  // Distance along the ray to the floor plane (y=0); Infinity when the tap
  // points at or above the horizon.
  const floorT = ray.direction.y < -0.02 ? -ray.origin.y / ray.direction.y : Infinity;
  S.raycaster.far = Math.min(floorT, 30);
  const wallHit = S.raycaster.intersectObjects(S.wallMeshes.map(w => w.mesh))[0];

  let tx, tz;
  if (wallHit) {
    const dpx = wallHit.point.x - S.playerPos.x, dpz = wallHit.point.z - S.playerPos.z;
    const dl = Math.hypot(dpx, dpz);
    if (dl < 1e-3) return;
    const stop = Math.max(0, dl - (PLAYER_R + 0.30));
    tx = S.playerPos.x + dpx / dl * stop;
    tz = S.playerPos.z + dpz / dl * stop;
  } else if (isFinite(floorT)) {
    tx = ray.origin.x + ray.direction.x * floorT;
    tz = ray.origin.z + ray.direction.z * floorT;
  } else {
    return;  // tapped the ceiling/sky with nothing in the way
  }

  tx = Math.max(ENV.xMin + PLAYER_R, Math.min(ENV.xMax - PLAYER_R, tx));
  tz = Math.max(ENV.zMin + PLAYER_R, Math.min(ENV.zMax - PLAYER_R, tz));
  const dist = Math.hypot(tx - S.playerPos.x, tz - S.playerPos.z);
  if (dist < WALK_ARRIVE) return;

  S.walkTarget = { x: tx, z: tz };
  S.walkPrevDist = dist;
  S.walkStuckT = 0;
  if (!S.walkMarker) {
    S.walkMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.24, 40),
      new THREE.MeshBasicMaterial({ color: 0x55c878, transparent: true, opacity: 0.85,
                                    side: THREE.DoubleSide, depthWrite: false }));
    S.walkMarker.rotation.x = -Math.PI / 2;
    S.walkMarker.renderOrder = 5;
    S.walkMarker.userData.noMeasure = true;
    S.scene.add(S.walkMarker);
  }
  S.walkMarker.position.set(tx, 0.02, tz);
  S.walkMarker.visible = true;
}

export function cancelWalkTarget() {
  S.walkTarget = null;
  if (S.walkMarker) S.walkMarker.visible = false;
}
