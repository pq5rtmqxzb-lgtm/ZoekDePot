import * as THREE from 'three';
import { S } from './state.js';
import { WALL_THICK, WALL_HEIGHT, FLOOR_TILE, GROUND_Y, DOOR_H } from './constants.js';
import {
  FLOOR_MAT, TILE_MAT, STONE_TILE_MAT, CARPET_MAT, CEIL_MAT, LAMEL_CEIL_MAT,
  LIMEWASH_MAT, CLADDING_MAT, WALL_TILE_MAT, BARK_MAT, LEAF_MATS, RAL1035_MAT,
  ALU_MAT, ENTRANCE_LEAF_MAT, BLACK_METAL_MAT, WINDOW_FRAME_MAT, PANE_MAT,
  METAL_MAT, CONCRETE_MAT, WALL_MAT,
} from './materials.js';
import {
  addWall, addDoorFrame, addSidelight, addSlidingDoor, addWindow, addRailing,
  addScreen, addRoomFloor, addRoomFloorPoly, addFacePanel, addCladding,
  tiledClone, box,
} from './builders.js';
import { segOnRectEdge, segOnPolyEdge, roomAt } from './rooms.js';
import { skyTex, makeTexture } from './textures.js';
import { buildDoorLeaf } from './doors.js';

const OUTSIDE = new Set(['balkon_n', 'balkon_z', 'corridor']);
const WET = new Set(['badkamer', 'badkklein', 'toilet']);

/* Which side of a segment is which? Samples a point on either side of the
 * centreline (along the right-hand normal (dz,-dx)) and asks the room lookup.
 * out: +1/-1 = the side that is NOT an interior room (balcony, void or the
 * world), 0 = both/neither interior. corridor: side that is the shared
 * corridor. */
function sideInfo(g) {
  const dx = g.x2 - g.x1, dz = g.z2 - g.z1, L = Math.hypot(dx, dz);
  const nx = dz / L, nz = -dx / L;
  const t = (g.t || WALL_THICK) / 2 + 0.22;
  const mx = (g.x1 + g.x2) / 2, mz = (g.z1 + g.z2) / 2;
  const rp = roomAt(mx + nx * t, mz + nz * t), rm = roomAt(mx - nx * t, mz - nz * t);
  const ip = rp && !OUTSIDE.has(rp.id), im = rm && !OUTSIDE.has(rm.id);
  let out = 0;
  if (ip && !im) out = -1; else if (im && !ip) out = +1;
  let corridor = 0;
  if (rp && rp.id === 'corridor') corridor = +1; else if (rm && rm.id === 'corridor') corridor = -1;
  return { out, corridor, rp, rm, ip, im, L };
}

/* ===== APARTMENT GEOMETRY (Type R3.sp, bouwnummer 25) ===== */
export function buildApartment() {
  // Geometry is driven by data/model.json. Coords: +X east, +Z south, origin
  // at the NW corner of the north facade (same frame as the sales drawing).
  //
  //   noord balkon ─────────────────────────────────────────┐
  //   NW-punt │ slaapkamer 1 │ woonkamer (noordstrook)      │
  //   trappenhuis ─┐ badkamer + toilet │                    │
  //   corridor ▌voordeur→ gang ──────► woonkamerdeur        │
  //           ▌ techn. berging + kasten                     │
  //           ▌ badk. klein │ nis │ keuken ┃ woonkamer      │
  //           ▌ slaapkamer 2       │ keukenbaai (kolom)     │
  //   zuid balkon (3.6 m diep) ──────────────── ZO-penant ──┘

  // === Floor + ceiling per room (data-driven from ROOMS) ===
  const KIND_BASE_MAT = { hout: FLOOR_MAT, tegel: TILE_MAT, steen: STONE_TILE_MAT, tapijt: CARPET_MAT };
  LAMEL_CEIL_MAT.userData.tileM = 1.0;
  for (const room of S.rooms) {
    const [tw, td] = FLOOR_TILE[room.kind] || FLOOR_TILE.hout;
    const base = KIND_BASE_MAT[room.kind] || FLOOR_MAT;
    // Balcony "ceilings" are the underside of the balcony above (lamellen,
    // per the Technische Omschrijving: afgewerkt in de gevelbekleding) at
    // 2.85 m; the corridor has the lamellenplafond at 2.55 m.
    const balcony = room.id.startsWith('balkon');
    const ceilH = balcony ? 2.85 : room.ceil;
    const ceilMat = (balcony || room.id === 'corridor') ? LAMEL_CEIL_MAT : CEIL_MAT;
    room.floorMeshes = room.rects.map(r => addRoomFloor(r, base, tw, td, ceilH, ceilMat))
      .concat(room.polys.map(p => addRoomFloorPoly(p, base, tw, td, ceilH, ceilMat)));
  }

  // Walls, doors, sliding-door visuals, windows and railings — model.json geom.
  S.geom.forEach((g, i) => {
    const t = g.t || WALL_THICK;
    let mesh = null;
    switch (g.kind) {
      case 'wall':
        mesh = addWall(g.x1, g.z1, g.x2, g.z2, t);
        break;
      case 'door': {
        const si = sideInfo(g);
        g.dorpel = !!((si.rp && WET.has(si.rp.id)) || (si.rm && WET.has(si.rm.id)));
        addDoorFrame(g.x1, g.z1, g.x2, g.z2, t, g);
        buildDoorLeaf(g);
        break;
      }
      case 'sidelight': addSidelight(g.x1, g.z1, g.x2, g.z2, t); break;
      case 'sliding': {
        const si = sideInfo(g);
        addSlidingDoor(g.x1, g.z1, g.x2, g.z2, t, g, si.out || 1);
        // Cladding on the outside of the wall fill above the pui
        if (si.out) addFacePanel(g.x1, g.z1, g.x2, g.z2, si.out * (t / 2 + 0.015), 2.58, 3.15,
                                 tiledClone(CLADDING_MAT, si.L, 0.6, 1.0));
        break;
      }
      case 'window': addWindow(g.x1, g.z1, g.x2, g.z2, t); break;
      case 'railing': addRailing(g.x1, g.z1, g.x2, g.z2); break;
      case 'screen': addScreen(g.x1, g.z1, g.x2, g.z2); break;
      default: console.warn('Onbekend geom-type', g.kind, g);
    }
    if (mesh) {
      mesh.userData.geomIndex = i;
      S.wallMeshes.push({ mesh, seg: g, index: i });
    }
  });

  buildCorridor();

  // Assign each solid wall to every room whose floor-rect edge it lies on (or
  // that contains it, for the columns), so the design panel can repaint a
  // single room. Shared walls land in both neighbours' lists (acceptable —
  // repainting either room paints the party wall).
  for (const wm of S.wallMeshes) {
    const mx = (wm.seg.x1 + wm.seg.x2) / 2, mz = (wm.seg.z1 + wm.seg.z2) / 2;
    for (const room of S.rooms) {
      if (room.rects.some(r => segOnRectEdge(wm.seg, r)) ||
          room.polys.some(p => segOnPolyEdge(wm.seg, p)) ||
          roomAt(mx, mz) === room) room.walls.push(wm);
    }
  }

  // === Finish panels: gevelbekleding outside, limewash on the corridor side ===
  for (const wm of S.wallMeshes) {
    const g = wm.seg;
    if (g.corridorWall) continue;
    const t = g.t || WALL_THICK;
    const si = sideInfo(g);
    if (g.clad === 'all') {          // the free-standing ZO-penant: all four faces
      const off = t / 2 + 0.015;
      addCladding(g.x1, g.z1, g.x2, g.z2, off);
      addCladding(g.x1, g.z1, g.x2, g.z2, -off);
      const dx = g.x2 - g.x1, dz = g.z2 - g.z1, L = Math.hypot(dx, dz);
      const nx = dz / L, nz = -dx / L;
      // end caps: a short panel across the thickness just beyond each end
      for (const [px, pz, s] of [[g.x1, g.z1, -1], [g.x2, g.z2, 1]]) {
        addCladding(px + nx * off, pz + nz * off, px - nx * off, pz - nz * off, s * 0.015);
      }
      continue;
    }
    if (si.corridor) {
      addFacePanel(g.x1, g.z1, g.x2, g.z2, si.corridor * (t / 2 + 0.006), 0, 2.55,
                   tiledClone(LIMEWASH_MAT, si.L, 2.55, 2.0), 0.012);
    } else if (si.out) {
      const ro = si.out > 0 ? si.rp : si.rm;
      if (!ro || ro.id.startsWith('balkon')) addCladding(g.x1, g.z1, g.x2, g.z2, si.out * (t / 2 + 0.015));
    }
  }

  buildBathroomTiles();
  buildOutdoorFittings();

  // === Sky cyclorama (outside, beyond the balconies) ===
  S.skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
  const cyclorama = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 22, 48, 1, true), S.skyMat);
  cyclorama.position.set(4.2, 5, 6.9);
  cyclorama.userData.noMeasure = true;
  S.scene.add(cyclorama);
  // Outdoor ground plane — the apartment is on the 2e verdieping, so the
  // forest floor lies ~6 m below the apartment floor.
  const outdoor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x5d6b42, roughness: 1.0 }));
  outdoor.rotation.x = -Math.PI / 2;
  outdoor.position.set(4.2, GROUND_Y, 6.9);
  outdoor.userData.noMeasure = true;
  S.scene.add(outdoor);

  // The building itself below and above this floor, so looking down from a
  // balcony shows facade rather than a floating slab: two dark cladding
  // bands (floor below + floor above) along the facades.
  buildBuildingMass();

  const FOREST = [
    [-4.0, -5.8, 1.10], [1.0, -6.2, 1.30], [5.5, -5.6, 1.00],
    [9.5, -6.4, 1.25],  [13.5, -5.8, 1.10],
    [-7.0, -9.5, 1.50], [-1.5, -10.5, 1.55], [3.5, -11.0, 1.45],
    [8.0, -10.0, 1.50], [12.5, -11.5, 1.60],
    [-5.0, -14.5, 1.70], [0.0, -15.0, 1.70], [6.0, -15.5, 1.65],
    [-8.0, -2.0, 1.35], [-9.5, -7.0, 1.50],
    [-2.0, 24.0, 1.05], [3.5, 25.0, 0.95], [9.0, 23.5, 1.05], [13.0, 25.0, 1.15],
    [0.5, 29.0, 1.35],  [6.0, 30.0, 1.40], [11.5, 29.5, 1.30],
    [-6.5, 3.0, 1.20], [-7.5, 8.5, 1.35], [-6.0, 13.0, 1.20],
  ];
  buildForest(FOREST);
  buildNeighborhood();
}

/* Shared corridor outside the voordeur (indicative — the sales drawing stops
 * at the party wall). Finishes per the kleur- en materiaalstaat: tapijt
 * gemêleerd lichtgrijs, limewash betonlook wanden, lamellenplafond,
 * lijnverlichting, liftdeuren RAL 1035. */
function buildCorridor() {
  const X0 = -1.96, Z0 = 6.30, Z1 = 12.40;
  const walls = [
    [X0, Z0, X0, Z1, 0.20],          // west wall (with the lifts)
    [X0 - 0.1, Z0, 0.38, Z0, 0.20],  // north end, meets chamfer-2 at (0.375, 6.30)
    [X0 - 0.1, Z1, 0.07, Z1, 0.24],  // south end
  ];
  walls.forEach(([x1, z1, x2, z2, t], i) => {
    const mesh = addWall(x1, z1, x2, z2, t, { mat: LIMEWASH_MAT, noPlinth: true, height: 2.55 });
    const seg = { kind: 'wall', x1, z1, x2, z2, t, corridorWall: true, section: 'CORRIDOR' };
    S.wallMeshes.push({ mesh, seg, index: 900 + i });
  });
  // Lift doors (two, centre-opening) on the west wall
  for (const zc of [7.75, 9.65]) {
    box(0.06, 2.25, 1.20, RAL1035_MAT, X0 + 0.10 + 0.03, 1.125, zc);            // frame surround
    for (const s of [-1, 1]) box(0.02, 2.10, 0.49, ALU_MAT, X0 + 0.10 + 0.07, 1.05, zc + s * 0.255);
    box(0.02, 0.10, 0.06, BLACK_METAL_MAT, X0 + 0.10 + 0.07, 1.15, zc + 0.78);     // call button plate
    box(0.02, 0.06, 0.16, new THREE.MeshBasicMaterial({ color: 0xff8a3a }), X0 + 0.10 + 0.07, 2.32, zc); // floor indicator
  }
  // Trappenhuis door in the north end wall (hardhout met vast glas)
  box(1.03, 2.32, 0.06, WINDOW_FRAME_MAT, -1.05, 1.16, Z0 + 0.10 + 0.03);
  box(0.90, 2.20, 0.045, ENTRANCE_LEAF_MAT, -1.05, 1.10, Z0 + 0.10 + 0.07);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1.2), PANE_MAT);
  glass.position.set(-1.20, 1.45, Z0 + 0.10 + 0.10); S.scene.add(glass);
  box(0.13, 0.018, 0.018, METAL_MAT, -0.72, 1.05, Z0 + 0.10 + 0.11);
  // Lijnverlichting: a slim LED profile down the middle of the ceiling
  box(0.06, 0.03, Z1 - Z0 - 1.2, new THREE.MeshBasicMaterial({ color: 0xfff6e6 }), -1.0, 2.535, (Z0 + Z1) / 2);
  // Huisnummer + bel naast de voordeur (corridor side of the party wall)
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshStandardMaterial({
    map: makeTexture((ctx, w, h) => {
      ctx.fillStyle = '#2b2d30'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f2efe9'; ctx.font = 'bold 84px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('25', w / 2, h / 2 + 4);
    }, 128, 128), roughness: 0.5 }));
  plate.rotation.y = -Math.PI / 2;
  plate.position.set(-0.05 - 0.015, 1.55, 9.30); S.scene.add(plate);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 14), METAL_MAT);
  bell.rotation.z = Math.PI / 2; bell.position.set(-0.05 - 0.02, 1.25, 9.30); S.scene.add(bell);
  // Schoonloopmat voor de voordeur
  box(0.9, 0.012, 0.6, new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 1 }), -0.56, 0.006, 8.50);
}

/* Wall tiles in the wet rooms (thin panels on the room side of each wall,
 * cut around the doors). Badkamers: alle wanden tot het plafond. Toilet:
 * achterwand betegeld, overige wanden sausklaar. */
function buildBathroomTiles() {
  const openings = S.geom.filter(g => g.kind === 'door' || g.kind === 'sidelight');
  function tileEdge(ax, az, bx, bz, nx, nz, h) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    // Collect door spans along this edge (collinear within 12 cm)
    const cuts = [];
    for (const o of openings) {
      const d1 = Math.abs((o.x1 - ax) * nx + (o.z1 - az) * nz), d2 = Math.abs((o.x2 - ax) * nx + (o.z2 - az) * nz);
      if (d1 > 0.12 || d2 > 0.12) continue;
      const t1 = (o.x1 - ax) * ux + (o.z1 - az) * uz, t2 = (o.x2 - ax) * ux + (o.z2 - az) * uz;
      const lo = Math.max(0, Math.min(t1, t2) - 0.05), hi = Math.min(L, Math.max(t1, t2) + 0.05);
      if (hi > lo) cuts.push([lo, hi]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    let s = 0;
    const spans = [];
    for (const [lo, hi] of cuts) { if (lo > s + 0.02) spans.push([s, lo]); s = Math.max(s, hi); }
    if (L > s + 0.02) spans.push([s, L]);
    for (const [t0, t1] of spans) {
      const len = t1 - t0;
      const cx = ax + ux * (t0 + t1) / 2 + nx * 0.007, cz = az + uz * (t0 + t1) / 2 + nz * 0.007;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, h, len), tiledClone(WALL_TILE_MAT, len, h, 1.2));
      m.position.set(cx, h / 2, cz);
      m.rotation.y = Math.atan2(dx, dz);
      S.scene.add(m);
    }
  }
  function tileRect(r, h, edges) {
    if (edges.includes('N')) tileEdge(r.x1, r.z1, r.x2, r.z1, 0, 1, h);
    if (edges.includes('S')) tileEdge(r.x1, r.z2, r.x2, r.z2, 0, -1, h);
    if (edges.includes('W')) tileEdge(r.x1, r.z1, r.x1, r.z2, 1, 0, h);
    if (edges.includes('E')) tileEdge(r.x2, r.z1, r.x2, r.z2, -1, 0, h);
  }
  const H = 2.55 - 0.01;
  const rm = id => S.rooms.find(r => r.id === id);
  tileRect(rm('badkamer').rects[0], H, 'NSWE');
  // the column inside the badkamer (x 5.04..5.60, z 6.40..7.04)
  tileEdge(5.04, 6.40, 5.60, 6.40, 0, -1, H);
  tileEdge(5.04, 6.40, 5.04, 7.04, -1, 0, H);
  tileEdge(5.60, 6.40, 5.60, 7.04, 1, 0, H);
  tileRect(rm('badkklein').rects[0], H, 'NSWE');
  tileRect(rm('toilet').rects[0], H, 'E');
}

/* Outdoor details from the drawing: HWA (hemelwaterafvoer) on the north
 * facade, buitenkraan (bk) on the south facade, wandlichtpunten (1 d). */
function buildOutdoorFittings() {
  const hwa = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.45, 12), ALU_MAT);
  hwa.position.set(4.55, 1.425, -0.20 - 0.06); S.scene.add(hwa);
  // buitenkraan on the pier between the slaapk2 and keuken puien
  const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8), METAL_MAT);
  tap.rotation.x = Math.PI / 2; tap.position.set(4.30, 0.55, 15.74 + 0.06); S.scene.add(tap);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), METAL_MAT);
  spout.position.set(4.30, 0.50, 15.74 + 0.11); S.scene.add(spout);
  // Wandlampen (x, z, y, normal x, normal z)
  const lamps = [
    [1.24, -0.215, 2.20, 0, -1], [6.00, -0.215, 2.20, 0, -1],   // noord balkon
    [3.85, 15.715, 2.20, 0, 1],                                  // zuid balkon (slaapk2/keuken penant)
    [10.235, 14.80, 2.20, -1, 0],                                // ZO-penant, facing the balcony
  ];
  for (const [x, z, y, nx, nz] of lamps) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.10, 14), BLACK_METAL_MAT);
    body.rotation.z = nx ? Math.PI / 2 : 0; body.rotation.x = nz ? Math.PI / 2 : 0;
    body.position.set(x + nx * 0.05, y, z + nz * 0.05);
    S.scene.add(body);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 14), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }));
    disc.rotation.z = nx ? Math.PI / 2 : 0; disc.rotation.x = nz ? Math.PI / 2 : 0;
    disc.position.set(x + nx * 0.105, y, z + nz * 0.105);
    disc.userData.noMeasure = true;
    S.scene.add(disc);
    const pl = new THREE.PointLight(0xffe2b0, 0.35, 4.5);
    pl.position.set(x + nx * 0.25, y - 0.1, z + nz * 0.25);
    S.scene.add(pl);
    S.pointLightInfo.push({ light: pl, baseI: 0.35, disc });
  }
}

/* Facade bands of the storeys below and above, so the building has body when
 * you look down/up from a balcony. Dark cladding boxes just outside the
 * facade lines + the neighbours' balcony slabs continuing east. */
function buildBuildingMass() {
  const mat = tiledClone(CLADDING_MAT, 12, 6, 1.0);
  // north + south facades: one storey below (-3.4..-0.3) and one above (3.15..6.3)
  for (const [y0, y1] of [[-3.45, -0.32], [3.17, 6.3]]) {
    const h = y1 - y0, yc = (y0 + y1) / 2;
    box(11.0, h, 0.3, mat, 5.2, yc, -0.05);        // north facade band (behind the balcony)
    box(6.3, h, 0.3, mat, 7.6, yc, 13.95);         // south facade, woonkamer part
    box(4.7, h, 0.3, mat, 3.9, yc, 15.75);         // south facade, slaapk2/keuken part
    box(0.3, h, 14.2, mat, -0.05, yc, 7.9);        // west
    box(0.3, h, 16.0, mat, 10.75, yc, 7.0);        // east
  }
  // neighbours' balconies continuing east of ours (slabs), north + south
  for (const [zc, d] of [[-0.635, 0.89], [16.675, 1.75]]) {
    box(8.0, 0.28, d, CONCRETE_MAT, 14.8, -0.16, zc);
    box(8.0, 0.28, d, CONCRETE_MAT, 14.8, 2.99, zc);
  }
}

/* One old-growth tree: tapered bark trunk from the forest floor, a few thick
 * limbs, and a cluster of overlapping leaf masses centred near apartment
 * height (the canopy of a mature tree at 2e-verdieping level). */
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

  let seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const blobs = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = (0.9 + rnd() * 0.9) * s;
    const matIndex = Math.floor(rnd() * LEAF_MATS.length);
    const bx = x + (rnd() - 0.5) * 2.6 * s;
    let bz = z + (rnd() - 0.5) * 2.6 * s;
    // Foliage may overhang a balcony, but must not poke through the facades.
    if (z < 0 && bx > -2.5 && bx < 11.5 && bz + r > -1.45) bz = -1.45 - r;
    if (z > 17 && bx > -2.5 && bx < 12.5 && bz - r < 18.1) bz = 18.1 + r;
    if (x < -3 && bz > -2 && bz < 18 && bx + r > -2.2) bx = -2.2 - r;
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
 * time-of-day multiplier rises (updatePointLights drives the emissive). */
function buildNeighborhood() {
  const BLOCKS = [
    [1.0, 38.0, 15, 9, 12], [17.0, 36.0, 11, 9, 10],   // south, across the street
    [26.0, 6.0, 11, 13, 14], [24.5, 16.5, 9, 8, 10],   // east
    [-18.5, 2.0, 9, 11, 12], [-17.5, 12.5, 8, 8, 10],  // west
  ];
  for (const [cx, cz, w, d, h] of BLOCKS) {
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
