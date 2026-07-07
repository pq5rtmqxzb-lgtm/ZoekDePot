import * as THREE from 'three';
import { S } from './state.js';
import { WALL_THICK, FLOOR_TILE, GROUND_Y } from './constants.js';
import { FLOOR_MAT, TILE_MAT, STONE_TILE_MAT, BARK_MAT, LEAF_MATS } from './materials.js';
import {
  addWall, addDoorFrame, addSlidingDoor, addWindow, addRailing,
  addRoomFloor, addRoomFloorPoly,
} from './builders.js';
import { segOnRectEdge, segOnPolyEdge } from './rooms.js';
import { skyTex } from './textures.js';

/* ===== APARTMENT GEOMETRY (Type R3.sp, bouwnummer 25) ===== */
export function buildApartment() {
  // Geometry is driven by apartment.json (Phase 3 of the rebuild).
  // Coords: +X east, +Z south, origin at NW corner of the top facade.
  //
  //                  TOP FACADE  y=0
  //   (-2.5, -1.33)…………………… top balkon ……………………… (10.72, -1.33)
  //          │                                          │
  //   NW zigzag │  slaapk1  │   strip   │  woonkamer    │
  //   (alcove)  │ 5.52 wide │           │   strip       │
  //          └─────┐  4.20  │           │               │
  //                │ gang (C-shape)     ┃ woonkamer     │
  //   (-2.30, 5.85)┤  ┌──────────────┐  ┃   west wall   │
  //                ┤  │ badkamer +   │  ┃   x=6.948     │
  //                ┤  │ toilet (SE)  │  ┃               │
  //                └──┴──────────────┘──┘               │
  //                  │       gang horizontal arm        │
  //   (-2.30, 9.00)──┴──────────┬────────────────────────┤
  //                 slaapk2     │  woonkamer south ext   │
  //                 4.115 wide  │  (wraps east + south)  │
  //                 + badk klein│                        │
  //   (-2.30, 13.802)…………………… bottom balkon ……………… (10.72, 13.802)
  //                 spans full apartment width
  //
  // Door positions: see apartment.json `openings`.

  // === Floor + ceiling per room (data-driven from ROOMS) ===
  const KIND_BASE_MAT = { hout: FLOOR_MAT, tegel: TILE_MAT, steen: STONE_TILE_MAT };
  for (const room of S.rooms) {
    const [tw, td] = FLOOR_TILE[room.kind];
    const base = KIND_BASE_MAT[room.kind];
    room.floorMeshes = room.rects.map(r => addRoomFloor(r, base, tw, td))
      .concat(room.polys.map(p => addRoomFloorPoly(p, base, tw, td)));
  }

  // Walls, doors, sliding-door visuals, windows and railings — APARTMENT_GEOM.
  const geomDispatch = {
    wall:    addWall,
    door:    addDoorFrame,
    sliding: addSlidingDoor,
    window:  addWindow,
    railing: addRailing,
  };
  S.geom.forEach((g, i) => {
    const mesh = geomDispatch[g.kind](g.x1, g.z1, g.x2, g.z2, g.t || WALL_THICK);
    if (g.kind === 'wall' && mesh) {
      mesh.userData.geomIndex = i;
      S.wallMeshes.push({ mesh, seg: g, index: i });
    }
  });

  // Assign each solid wall to every room whose floor-rect edge it lies on, so
  // the design panel can repaint a single room. Shared walls land in both
  // neighbours' lists (acceptable — repainting either room paints the party wall).
  for (const wm of S.wallMeshes) {
    for (const room of S.rooms) {
      if (room.rects.some(r => segOnRectEdge(wm.seg, r)) ||
          room.polys.some(p => segOnPolyEdge(wm.seg, p))) room.walls.push(wm);
    }
  }

  // === Sky cyclorama (outside, beyond the balconies) ===
  S.skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    fog: false,
  });
  const cyclorama = new THREE.Mesh(
    new THREE.CylinderGeometry(40, 40, 22, 48, 1, true),
    S.skyMat
  );
  // Centered roughly on the apartment middle
  cyclorama.position.set(4.2, 5, 6.9);
  S.scene.add(cyclorama);
  // Outdoor ground plane — the apartment is on the 2e verdieping, so the
  // forest floor lies ~6 m below the apartment floor.
  const outdoor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x5d6b42, roughness: 1.0 })
  );
  outdoor.rotation.x = -Math.PI / 2;
  outdoor.position.set(4.2, GROUND_Y, 6.9);
  S.scene.add(outdoor);

  // Old forest on the master-bedroom (north) side: tall trunks rising from
  // the forest floor with broad layered canopies at apartment height, so the
  // bedroom and the noord balkon sit "in the greens".
  const FOREST = [
    // [x, z, scale] — a near row with gaps, a mid row, a far row, and two
    // trees off the NW tip, so the canopy reads deep without walling off
    // the light.
    [-4.0, -5.8, 1.10], [1.0, -6.2, 1.30], [5.5, -5.6, 1.00],
    [9.5, -6.4, 1.25],  [13.5, -5.8, 1.10],
    [-7.0, -9.5, 1.50], [-1.5, -10.5, 1.55], [3.5, -11.0, 1.45],
    [8.0, -10.0, 1.50], [12.5, -11.5, 1.60],
    [-5.0, -14.5, 1.70], [0.0, -15.0, 1.70], [6.0, -15.5, 1.65],
    [-8.0, -2.0, 1.35], [-9.5, -7.0, 1.50],
  ];
  for (const [tx, tz, ts] of FOREST) addForestTree(tx, tz, ts);
}

// One old-growth tree: tapered bark trunk from the forest floor, a few thick
// limbs, and a cluster of overlapping leaf masses centred near apartment
// height (the canopy of a mature tree at 2e-verdieping level).
export function addForestTree(x, z, s = 1.0) {
  const trunkH = 8.0 * s;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * s, 0.38 * s, trunkH, 9), BARK_MAT);
  trunk.position.set(x, GROUND_Y + trunkH / 2, z);
  trunk.rotation.y = (x * 7 + z * 13) % 1;
  S.scene.add(trunk);

  const canopyY = GROUND_Y + trunkH;          // canopy centre ≈ apartment level
  // A couple of visible limbs reaching into the canopy
  for (let b = 0; b < 3; b++) {
    const a = b * 2.3 + x + z;
    const limb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07 * s, 0.13 * s, 1.7 * s, 6), BARK_MAT);
    limb.position.set(x + Math.cos(a) * 0.55 * s, canopyY - 0.25 * s, z + Math.sin(a) * 0.55 * s);
    limb.rotation.z = Math.cos(a) * 0.7;
    limb.rotation.x = Math.sin(a) * 0.7;
    S.scene.add(limb);
  }
  // Leaf masses — low-poly spheres, deterministic offsets per tree
  let seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const blobs = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = (0.9 + rnd() * 0.9) * s;
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(r, 8, 6),
      LEAF_MATS[Math.floor(rnd() * LEAF_MATS.length)]);
    const bx = x + (rnd() - 0.5) * 2.6 * s;
    let bz = z + (rnd() - 0.5) * 2.6 * s;
    // Foliage may overhang the balcony, but must not poke through the facade.
    if (bx > -2.5 && bx < 11.5 && bz + r > -1.25) bz = -1.25 - r;
    blob.position.set(bx, canopyY + (rnd() - 0.35) * 2.6 * s, bz);
    blob.scale.y = 0.75 + rnd() * 0.25;
    S.scene.add(blob);
  }
}
