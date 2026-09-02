import * as THREE from 'three';
import { S } from './state.js';
import { WALL_HEIGHT, WALL_THICK, DOOR_H } from './constants.js';
import {
  WALL_MAT, FLOOR_MAT, CEIL_MAT, BASEBOARD_MAT, DOORFRAME_MAT, WINDOW_FRAME_MAT,
  METAL_MAT, ALU_MAT, RAILING_MAT, HANDRAIL_MAT, PANE_MAT, FROSTED_MAT,
  CONCRETE_MAT, DORPEL_MAT, CLADDING_MAT,
} from './materials.js';

/* Small mesh helper used all over: an axis box at (x, y, z) rotated ry. */
export function box(w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  S.scene.add(m);
  return m;
}

/* Clone a tiled material with the map repeat fitted to a face of w x h metres
 * (the canvas covers `metres` x `metres`). */
export function tiledClone(mat, w, h, metres = 1.2) {
  const m = mat.clone();
  if (mat.map) {
    m.map = mat.map.clone();
    m.map.needsUpdate = true;
    m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
    m.map.repeat.set(Math.max(0.25, w / metres), Math.max(0.25, h / metres));
    m.map.anisotropy = mat.map.anisotropy;
  }
  return m;
}

/* ===== APARTMENT GEOMETRY =====
 * Local frame of every segment builder: the mesh is rotated by
 * angle = atan2(dx, dz), so local +Z runs along the segment from (x1,z1) to
 * (x2,z2) and local +X is the right-hand normal (dz, -dx)/len. */
export function addWall(x1, z1, x2, z2, thick = WALL_THICK, opts = {}) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);
  const h = opts.height || WALL_HEIGHT;

  // Each wall gets its own material clone (sharing the plaster map) so the
  // design panel can repaint individual rooms / accent walls independently.
  const wall = new THREE.Mesh(new THREE.BoxGeometry(thick, h, len), (opts.mat || WALL_MAT).clone());
  wall.position.set(cx, h / 2, cz);
  wall.rotation.y = angle;
  S.scene.add(wall);

  // Slim white plint (7 cm) on both faces. New-build NL apartments come
  // without plinten; this is the modern one buyers fit with their floor.
  if (!opts.noPlinth) {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(thick + 0.024, 0.07, len + 0.024), BASEBOARD_MAT);
    pl.position.set(cx, 0.035, cz);
    pl.rotation.y = angle;
    S.scene.add(pl);
  }

  S.wallSegs.push({ x1, z1, x2, z2, len, angle, t: thick });
  return wall;
}

/* Thin finish panel glued to one face of a wall: gevelbekleding on the
 * outside, limewash in the corridor, tiles in the bathrooms. `off` is the
 * signed offset along the segment's right-hand normal; y0..y1 the height. */
export function addFacePanel(x1, z1, x2, z2, off, y0, y1, mat, thickness = 0.03) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return null;
  const nx = dz / len, nz = -dx / len;
  const cx = (x1 + x2) / 2 + nx * off, cz = (z1 + z2) / 2 + nz * off;
  const m = new THREE.Mesh(new THREE.BoxGeometry(thickness, y1 - y0, len), mat);
  m.position.set(cx, (y0 + y1) / 2, cz);
  m.rotation.y = Math.atan2(dx, dz);
  S.scene.add(m);
  return m;
}

/* Gevelbekleding: verticale Basralocus delen. Runs from below the balcony
 * slab to the slab above so the facade reads as one continuous skin. */
export function addCladding(x1, z1, x2, z2, off) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  return addFacePanel(x1, z1, x2, z2, off, -0.30, 3.15, tiledClone(CLADDING_MAT, len, 3.45, 1.0));
}

/* Nestelkozijn (white, RAL 9010) with a 2.315 m opening. The jambs sit OUTSIDE
 * the opening so the full plan width of the doorway stays clear. Entrance
 * door: hardwood (Red Grandis) frame. Bathroom/toilet: kunststeen dorpel. */
export function addDoorFrame(x1, z1, x2, z2, thick = WALL_THICK, g = {}) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);
  const dirX = dx / len, dirZ = dz / len;
  const frameMat = g.entrance ? WINDOW_FRAME_MAT : DOORFRAME_MAT;

  const openH = DOOR_H;
  const jambW = 0.045;
  const jambD = thick + 0.03;

  for (const [px, pz, sgn] of [[x1, z1, -1], [x2, z2, 1]]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(jambD, openH + jambW, jambW), frameMat);
    jamb.position.set(px + dirX * sgn * (jambW / 2), (openH + jambW) / 2, pz + dirZ * sgn * (jambW / 2));
    jamb.rotation.y = angle;
    S.scene.add(jamb);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(jambD, jambW, len), frameMat);
  head.position.set(cx, openH + jambW / 2, cz);
  head.rotation.y = angle;
  S.scene.add(head);

  // Wall fill between the head and the ceiling
  const aboveH = WALL_HEIGHT - openH - jambW;
  if (aboveH > 0.04) {
    const above = new THREE.Mesh(new THREE.BoxGeometry(thick, aboveH, len + jambW * 2), WALL_MAT.clone());
    above.position.set(cx, openH + jambW + aboveH / 2, cz);
    above.rotation.y = angle;
    S.scene.add(above);
  }
  if (g.dorpel) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(thick + 0.02, 0.02, len), DORPEL_MAT);
    d.position.set(cx, 0.01, cz);
    d.rotation.y = angle;
    S.scene.add(d);
  }
}

/* Fixed glass beside a door (zijlicht in the nestelkozijn): white frame, one
 * pane floor-to-head, wall fill above. Collides like a wall. */
export function addSidelight(x1, z1, x2, z2, thick = 0.10) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);
  const fw = 0.045, fd = thick + 0.03;
  const grp = new THREE.Group();
  for (const s of [-1, 1]) grp.add(new THREE.Mesh(new THREE.BoxGeometry(fd, DOOR_H + fw, fw), DOORFRAME_MAT)
    .translateZ(s * (len / 2 - fw / 2)).translateY((DOOR_H + fw) / 2));
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(fd, fw, len), DOORFRAME_MAT).translateY(DOOR_H + fw / 2));
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(fd, fw, len), DOORFRAME_MAT).translateY(fw / 2));
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(len - 2 * fw, DOOR_H - fw), PANE_MAT);
  pane.rotation.y = Math.PI / 2;
  pane.position.y = fw + (DOOR_H - fw) / 2;
  grp.add(pane);
  const aboveH = WALL_HEIGHT - DOOR_H - fw;
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(thick, aboveH, len), WALL_MAT.clone())
    .translateY(DOOR_H + fw + aboveH / 2));
  grp.position.set(cx, 0, cz);
  grp.rotation.y = angle;
  S.scene.add(grp);
  S.wallSegs.push({ x1, z1, x2, z2, len, angle, t: thick });
}

/* Houten hef-schuifpui (Red Grandis) with a fixed pane and a sliding pane.
 * The sliding pane is drawn slid open in front of the fixed one, so the
 * opening you walk through is a real one: the fixed half collides, the open
 * half is the walkable gap. g.slide ('x1' | 'x2') names the end whose pane
 * moves; `out` is the outdoor side (+1/-1 along the right-hand normal). */
export function addSlidingDoor(x1, z1, x2, z2, thick = WALL_THICK, g = {}, out = 1) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);
  const inn = -(out || 1);                   // local X sign of the indoor side
  const grp = new THREE.Group();

  const glassTop = 2.50, jamb = 0.08, headH = 0.08, sillH = 0.03, frameD = 0.12;
  // Outer frame: jambs, head, low sill/threshold (hef-schuifpui: onderrollend)
  for (const s of [-1, 1]) grp.add(new THREE.Mesh(new THREE.BoxGeometry(frameD, glassTop + headH, jamb), WINDOW_FRAME_MAT)
    .translateZ(s * (len / 2 - jamb / 2)).translateY((glassTop + headH) / 2));
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(frameD, headH, len), WINDOW_FRAME_MAT).translateY(glassTop + headH / 2));
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(frameD + 0.04, sillH, len), WINDOW_FRAME_MAT).translateY(sillH / 2));
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, len - 2 * jamb), ALU_MAT).translateY(sillH + 0.006).translateX(inn * 0.03));
  // Wall fill above the frame up to the ceiling, plus cladding on the outside
  const aboveH = WALL_HEIGHT - glassTop - headH;
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(thick, aboveH, len), WALL_MAT.clone())
    .translateY(glassTop + headH + aboveH / 2));

  // Panels
  const innerW = len - 2 * jamb, pw = innerW / 2;
  const stile = 0.09, rail = 0.09, bottomRail = 0.13, panelT = 0.07;
  const ph = glassTop - sillH;
  function panel(zc, xc, withHandle, handleEnd) {
    const p = new THREE.Group();
    for (const s of [-1, 1]) p.add(new THREE.Mesh(new THREE.BoxGeometry(panelT, ph, stile), WINDOW_FRAME_MAT)
      .translateZ(s * (pw / 2 - stile / 2)));
    p.add(new THREE.Mesh(new THREE.BoxGeometry(panelT, rail, pw - 2 * stile), WINDOW_FRAME_MAT).translateY(ph / 2 - rail / 2));
    p.add(new THREE.Mesh(new THREE.BoxGeometry(panelT, bottomRail, pw - 2 * stile), WINDOW_FRAME_MAT).translateY(-ph / 2 + bottomRail / 2));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(pw - 2 * stile, ph - rail - bottomRail), PANE_MAT);
    glass.rotation.y = Math.PI / 2;
    glass.position.y = (bottomRail - rail) / 2;
    p.add(glass);
    if (withHandle) {   // handgreep zilverkleurig, on the leading stile, indoor side
      const hnd = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.035), METAL_MAT);
      hnd.position.set(inn * (panelT / 2 + 0.02), -ph / 2 + 1.05, handleEnd * (pw / 2 - stile / 2));
      p.add(hnd);
    }
    p.position.set(xc, sillH + ph / 2, zc);
    return p;
  }
  const slideEnd = g.slide === 'x1' ? -1 : 1;          // local Z sign of the moving pane's own half
  const fixedZ = -slideEnd * pw / 2;                    // fixed pane sits in the other half
  grp.add(panel(fixedZ, -inn * 0.025, false, 0));      // outer track
  // Sliding pane, slid ~85 % open over the fixed pane on the inner track
  grp.add(panel(fixedZ + slideEnd * pw * 0.15, inn * 0.03, true, slideEnd));

  grp.position.set(cx, 0, cz);
  grp.rotation.y = angle;
  S.scene.add(grp);

  // Collision only for the fixed half (world coordinates of that sub-span)
  const t0 = slideEnd > 0 ? 0 : 0.5, t1 = t0 + 0.5;
  const fx1 = x1 + dx * t0, fz1 = z1 + dz * t0, fx2 = x1 + dx * t1, fz2 = z1 + dz * t1;
  S.wallSegs.push({ x1: fx1, z1: fz1, x2: fx2, z2: fz2, len: len / 2, angle, t: 0.06 });
}

/* Fixed window in a facade: low sill wall, glass band, header above. Collides
 * like a wall (you can't walk through a window). */
export function addWindow(x1, z1, x2, z2, thick = WALL_THICK) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);
  const sillH = 0.85, headerH = 0.30;

  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(thick, sillH, len), WALL_MAT.clone()).translateY(sillH / 2));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(thick + 0.06, 0.04, len + 0.04), WINDOW_FRAME_MAT).translateY(sillH + 0.02));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(thick, headerH, len), WALL_MAT.clone()).translateY(WALL_HEIGHT - headerH / 2));
  const paneH = WALL_HEIGHT - headerH - sillH - 0.08;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.08, paneH), PANE_MAT);
  pane.position.set(0, sillH + 0.04 + paneH / 2, 0);
  pane.rotation.y = Math.PI / 2;
  group.add(pane);
  for (const t of [-0.5, 0, 0.5]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, paneH, 0.06), WINDOW_FRAME_MAT);
    m.position.set(0, sillH + 0.04 + paneH / 2, t * (len - 0.10));
    group.add(m);
  }
  group.position.set(cx, 0, cz);
  group.rotation.y = angle;
  S.scene.add(group);
  S.wallSegs.push({ x1, z1, x2, z2, len, angle, t: thick });
}

/* Balkonhek per the Technische Omschrijving: stalen balusters, helder gelaagd
 * glas boven en onder ingeklemd in een aluminium profiel, hardhouten handrail.
 * Also draws the balcony slab edge (fibre-concrete afwerkprofiel) below the
 * floor and the slab of the balcony above at 2.85 m. */
export function addRailing(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);
  const RAIL_H = 1.10;
  const grp = new THREE.Group();

  grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, len + 0.02), ALU_MAT).translateY(0.10));       // bottom clamp
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, len + 0.02), ALU_MAT).translateY(1.02));       // top clamp
  const glassH = 0.90;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.01, glassH), PANE_MAT);
  glass.rotation.y = Math.PI / 2;
  glass.position.y = 0.125 + glassH / 2;
  grp.add(glass);
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, len + 0.02), HANDRAIL_MAT).translateY(RAIL_H - 0.025)); // hardhouten handrail
  // Slab edges: fibre-concrete profile under the floor + the balcony above
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.30, len + 0.02), CONCRETE_MAT).translateY(-0.15));
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, len + 0.02), CONCRETE_MAT).translateY(2.85 + 0.16));

  // Balusters every ~1.2 m
  const nPosts = Math.max(2, Math.ceil(len / 1.2) + 1);
  for (let i = 0; i < nPosts; i++) {
    const t = i / (nPosts - 1);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.06, 0.04), RAILING_MAT);
    post.position.set(-0.05, 0.53, -len / 2 + len * t);
    grp.add(post);
  }
  grp.position.set(cx, 0, cz);
  grp.rotation.y = angle;
  S.scene.add(grp);

  // Treat the railing as a wall for collision (player can't fall off)
  S.wallSegs.push({ x1, z1, x2, z2, len, angle, t: 0.05 });
}

/* Privacyscherm between neighbouring balconies: frosted glass in an
 * aluminium frame, 1.85 m high. */
export function addScreen(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);
  const grp = new THREE.Group();
  const H = 1.85;
  for (const s of [-1, 1]) grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, H, 0.05), ALU_MAT)
    .translateZ(s * (len / 2 - 0.025)).translateY(H / 2));
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, len), ALU_MAT).translateY(H - 0.02));
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, len), ALU_MAT).translateY(0.10));
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.1, H - 0.16), FROSTED_MAT);
  pane.rotation.y = Math.PI / 2;
  pane.position.y = 0.12 + (H - 0.16) / 2;
  grp.add(pane);
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.30, len + 0.02), CONCRETE_MAT).translateY(-0.15));
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, len + 0.02), CONCRETE_MAT).translateY(2.85 + 0.16));
  grp.position.set(cx, 0, cz);
  grp.rotation.y = angle;
  S.scene.add(grp);
  S.wallSegs.push({ x1, z1, x2, z2, len, angle, t: 0.05 });
}

/* Per-room floor + ceiling. mat = floor material clone. */
// Clone baseMat onto a floor mesh, scaling its texture repeat to the mesh's
// footprint (stored in userData) so plank/tile cadence stays constant across
// room sizes. Reused both at build time and when the design panel swaps floors.
export function applyFloorTiling(mesh, baseMat) {
  const { w, d, tileW, tileD } = mesh.userData;
  const fMat = baseMat.clone();
  if (baseMat.map) {
    fMat.map = baseMat.map.clone();
    fMat.map.needsUpdate = true;
    fMat.map.wrapS = fMat.map.wrapT = THREE.RepeatWrapping;
    fMat.map.center.copy(baseMat.map.center);
    fMat.map.rotation = baseMat.map.rotation;
    fMat.map.repeat.set(Math.max(1, w / tileW), Math.max(1, d / tileD));
    fMat.map.anisotropy = baseMat.map.anisotropy;
  }
  mesh.material = fMat;
}

function ceilingMat(base, w, d) {
  const cMat = base.clone();
  const metres = base.userData.tileM || 2.5;
  if (base.map) {
    cMat.map = base.map.clone();
    cMat.map.needsUpdate = true;
    cMat.map.wrapS = cMat.map.wrapT = THREE.RepeatWrapping;
    cMat.map.repeat.set(Math.max(1, w / metres), Math.max(1, d / metres));
    cMat.map.anisotropy = base.map.anisotropy;
  }
  return cMat;
}

export function addRoomFloor(rect, baseMat = FLOOR_MAT, tileW = 4, tileD = 2, ceilH = WALL_HEIGHT, ceilBase = CEIL_MAT) {
  const { x1, z1, x2, z2 } = rect;
  const w = x2 - x1, d = z2 - z1;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), baseMat);
  floor.userData = { w, d, tileW, tileD };
  applyFloorTiling(floor, baseMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.001, cz);
  S.scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilingMat(ceilBase, w, d));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, ceilH - 0.001, cz);
  S.scene.add(ceil);
  return floor;
}

/* Polygon floor + ceiling for rooms with diagonal/curved boundaries (NW tip,
 * SW corners, balcony curves). points = [[x, z], ...] in world meters. UVs are
 * normalised to the polygon bbox so applyFloorTiling works unchanged. */
export function addRoomFloorPoly(points, baseMat = FLOOR_MAT, tileW = 4, tileD = 2, ceilH = WALL_HEIGHT, ceilBase = CEIL_MAT) {
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const w = maxX - minX, d = maxZ - minZ;

  function shapeGeo(flipZ) {
    // rotation.x = -PI/2 maps shape (x, y) -> world (x, 0, -y), so the floor
    // uses (x, -z); rotation.x = +PI/2 maps (x, y) -> (x, 0, y) for the ceiling.
    const shape = new THREE.Shape(
      points.map(p => new THREE.Vector2(p[0], flipZ ? -p[1] : p[1])));
    const geo = new THREE.ShapeGeometry(shape);
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (pos.getX(i) - minX) / w,
                  ((flipZ ? -pos.getY(i) : pos.getY(i)) - minZ) / d);
    }
    return geo;
  }

  const floor = new THREE.Mesh(shapeGeo(true), baseMat);
  floor.userData = { w, d, tileW, tileD };
  applyFloorTiling(floor, baseMat);
  floor.material.side = THREE.DoubleSide;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  S.scene.add(floor);

  const ceil = new THREE.Mesh(shapeGeo(false), ceilingMat(ceilBase, w, d));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ceilH - 0.001;
  S.scene.add(ceil);
  return floor;
}
