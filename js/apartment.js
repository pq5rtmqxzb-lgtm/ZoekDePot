import * as THREE from 'three';
import { S } from './state.js';
import { WALL_THICK, FLOOR_TILE, GROUND_Y } from './constants.js';
import { FLOOR_MAT, TILE_MAT, STONE_TILE_MAT, BARK_MAT, LEAF_MATS } from './materials.js';
import {
  addWall, addDoorFrame, addSlidingDoor, addWindow, addRailing,
  addRoomFloor, addRoomFloorPoly,
} from './builders.js';
import { segOnRectEdge, segOnPolyEdge } from './rooms.js';
import { skyTex, makeTexture } from './textures.js';
import { buildDoorLeaf } from './doors.js';

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
    if (g.kind === 'door') buildDoorLeaf(g);
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
  cyclorama.userData.noMeasure = true;
  S.scene.add(cyclorama);
  // Outdoor ground plane — the apartment is on the 2e verdieping, so the
  // forest floor lies ~6 m below the apartment floor.
  const outdoor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x5d6b42, roughness: 1.0 })
  );
  outdoor.rotation.x = -Math.PI / 2;
  outdoor.position.set(4.2, GROUND_Y, 6.9);
  outdoor.userData.noMeasure = true;
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
    // South rows (seen from balkon zuid + slaapkamer 2) — kept at street
    // distance and slightly lighter scales so the southern light stays open.
    [-2.0, 24.0, 1.05], [3.5, 25.0, 0.95], [9.0, 23.5, 1.05], [13.0, 25.0, 1.15],
    [0.5, 29.0, 1.35],  [6.0, 30.0, 1.40], [11.5, 29.5, 1.30],
    // West side (past the NW tip and the slaapk2 windows).
    [-6.5, 3.0, 1.20], [-7.5, 8.5, 1.35], [-6.0, 13.0, 1.20],
  ];
  buildForest(FOREST);
  buildNeighborhood();
}

/* One old-growth tree: tapered bark trunk from the forest floor, a few thick
 * limbs, and a cluster of overlapping leaf masses centred near apartment
 * height (the canopy of a mature tree at 2e-verdieping level).
 *
 * computeTreeParts returns transform lists instead of meshes so buildForest
 * can pack the whole forest into 6 InstancedMeshes (1 trunk + 1 limb + one
 * per leaf material) — ~150 draw calls collapse into 6. The per-(x,z)
 * deterministic PRNG (and its exact call order) is unchanged, so the layout
 * is pixel-identical to the per-mesh version. */
function computeTreeParts(x, z, s = 1.0) {
  const trunkH = 8.0 * s;
  const parts = { trunks: [], limbs: [], blobs: [] };
  const q = new THREE.Quaternion(), e = new THREE.Euler();

  parts.trunks.push(new THREE.Matrix4().compose(
    new THREE.Vector3(x, GROUND_Y + trunkH / 2, z),
    q.setFromEuler(e.set(0, (x * 7 + z * 13) % 1, 0)).clone(),
    new THREE.Vector3(s, s, s)));

  const canopyY = GROUND_Y + trunkH;          // canopy centre ≈ apartment level
  for (let b = 0; b < 3; b++) {
    const a = b * 2.3 + x + z;
    parts.limbs.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x + Math.cos(a) * 0.55 * s, canopyY - 0.25 * s, z + Math.sin(a) * 0.55 * s),
      q.setFromEuler(e.set(Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7, 'XYZ')).clone(),
      new THREE.Vector3(s, s, s)));
  }

  // Leaf masses — deterministic offsets per tree (same sequence as always)
  let seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const blobs = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = (0.9 + rnd() * 0.9) * s;
    const matIndex = Math.floor(rnd() * LEAF_MATS.length);
    const bx = x + (rnd() - 0.5) * 2.6 * s;
    let bz = z + (rnd() - 0.5) * 2.6 * s;
    // Foliage may overhang a balcony, but must not poke through the facades:
    // clamp blob extents against the north face, the south face and the west
    // side depending on which row the tree belongs to.
    if (z < 0 && bx > -2.5 && bx < 11.5 && bz + r > -1.25) bz = -1.25 - r;
    if (z > 17 && bx > -2.5 && bx < 12.5 && bz - r < 18.0) bz = 18.0 + r;
    if (x < -3 && bz > -2 && bz < 18 && bx + r > -2.0) bx = -2.0 - r;
    const by = canopyY + (rnd() - 0.35) * 2.6 * s;
    const sy = 0.75 + rnd() * 0.25;
    parts.blobs.push({
      matIndex,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(bx, by, bz), q.identity().clone(),
        new THREE.Vector3(r, r * sy, r)),
    });
  }
  return parts;
}

/* Simple massing of the neighbouring blocks: dark volumes across the street
 * to the south, east and west, with a window grid that glows warmly as the
 * time-of-day multiplier rises (updatePointLights drives the emissive).
 * They sit inside the fog range so they fade naturally at night. */
function buildNeighborhood() {
  // [cx, cz, w(x), d(z), h]
  const BLOCKS = [
    [1.0, 38.0, 15, 9, 12], [17.0, 36.0, 11, 9, 10],   // south, across the street
    [26.0, 6.0, 11, 13, 14], [24.5, 16.5, 9, 8, 10],   // east
    [-18.5, 2.0, 9, 11, 12], [-17.5, 12.5, 8, 8, 10],  // west
  ];
  for (const [cx, cz, w, d, h] of BLOCKS) {
    // One shared window layout, drawn twice: the facade map (concrete + dark
    // glass + warm panes) and an emissive map that carries ONLY the lit panes
    // so the facade itself never glows at night.
    const cols = 6, rows = 10;
    const lit = Array.from({ length: rows * cols },
      () => (Math.random() < 0.4 ? 200 + Math.random() * 40 | 0 : 0));
    const drawWindows = emissiveOnly => (ctx, tw, th) => {
      ctx.fillStyle = emissiveOnly ? '#000000' : '#a8a49c';
      ctx.fillRect(0, 0, tw, th);
      const ww = tw / cols, wh = th / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const g = lit[r * cols + c];
          if (emissiveOnly && !g) continue;
          ctx.fillStyle = g ? `rgb(255, ${g}, 150)` : '#4a5058';
          ctx.fillRect(c * ww + ww * 0.22, r * wh + wh * 0.25, ww * 0.56, wh * 0.5);
        }
      }
    };
    const repU = Math.max(1, Math.round(w / 6)), repV = Math.max(1, Math.round(h / 7));
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd8dade, roughness: 0.9,
      map: makeTexture(drawWindows(false), 128, 256, repU, repV),
      emissiveMap: makeTexture(drawWindows(true), 128, 256, repU, repV),
      emissive: 0xffcf9a, emissiveIntensity: 0,   // driven by updatePointLights
    });
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    block.position.set(cx, GROUND_Y + h / 2, cz);
    block.userData.noMeasure = true;
    S.scene.add(block);
    S.neighborMats.push(mat);
  }
}

export function buildForest(spots) {
  const all = { trunks: [], limbs: [], blobs: [] };
  for (const [tx, tz, ts] of spots) {
    const p = computeTreeParts(tx, tz, ts);
    all.trunks.push(...p.trunks);
    all.limbs.push(...p.limbs);
    all.blobs.push(...p.blobs);
  }

  const addInstanced = (geo, mat, matrices) => {
    if (!matrices.length) return;
    const im = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    // Instanced bounding spheres don't auto-fit the instances; 6 always-on
    // draw calls are cheaper than getting culling wrong.
    im.frustumCulled = false;
    im.userData.noMeasure = true;
    S.scene.add(im);
  };

  addInstanced(new THREE.CylinderGeometry(0.22, 0.38, 8.0, 9), BARK_MAT, all.trunks);
  addInstanced(new THREE.CylinderGeometry(0.07, 0.13, 1.7, 6), BARK_MAT, all.limbs);
  LEAF_MATS.forEach((mat, mi) => addInstanced(
    new THREE.SphereGeometry(1, 8, 6), mat,
    all.blobs.filter(b => b.matIndex === mi).map(b => b.matrix)));
}
