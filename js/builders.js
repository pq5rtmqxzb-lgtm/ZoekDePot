import * as THREE from 'three';
import { S } from './state.js';
import { WALL_HEIGHT, WALL_THICK } from './constants.js';
import {
  WALL_MAT, FLOOR_MAT, CEIL_MAT, BASEBOARD_MAT, TRIM_MAT, CROWN_MAT,
  DOORFRAME_MAT, WINDOW_FRAME_MAT, METAL_MAT, RAILING_MAT,
} from './materials.js';

/* ===== APARTMENT GEOMETRY ===== */
export function addWall(x1, z1, x2, z2, thick = WALL_THICK) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);

  const geo = new THREE.BoxGeometry(thick, WALL_HEIGHT, len);
  // Each wall gets its own material clone (sharing the plaster map) so the
  // design panel can repaint individual rooms / accent walls independently.
  const wall = new THREE.Mesh(geo, WALL_MAT.clone());
  wall.position.set(cx, WALL_HEIGHT / 2, cz);
  wall.rotation.y = angle;
  S.scene.add(wall);

  // Baseboard (taller) + secondary trim strip just above it
  const bb = new THREE.Mesh(
    new THREE.BoxGeometry(thick + 0.06, 0.18, len + 0.02),
    BASEBOARD_MAT
  );
  bb.position.set(cx, 0.09, cz);
  bb.rotation.y = angle;
  S.scene.add(bb);

  const bbTrim = new THREE.Mesh(
    new THREE.BoxGeometry(thick + 0.08, 0.03, len + 0.02),
    TRIM_MAT
  );
  bbTrim.position.set(cx, 0.18 + 0.015, cz);
  bbTrim.rotation.y = angle;
  S.scene.add(bbTrim);

  // Crown molding (taller) + secondary trim strip just below it
  const cm = new THREE.Mesh(
    new THREE.BoxGeometry(thick + 0.05, 0.14, len + 0.02),
    CROWN_MAT
  );
  cm.position.set(cx, WALL_HEIGHT - 0.07, cz);
  cm.rotation.y = angle;
  S.scene.add(cm);

  const cmTrim = new THREE.Mesh(
    new THREE.BoxGeometry(thick + 0.08, 0.03, len + 0.02),
    TRIM_MAT
  );
  cmTrim.position.set(cx, WALL_HEIGHT - 0.14 - 0.015, cz);
  cmTrim.rotation.y = angle;
  S.scene.add(cmTrim);

  S.wallSegs.push({ x1, z1, x2, z2, len, angle, t: thick });
  return wall;
}

/* Slim modern door casing. The jambs sit OUTSIDE the opening (centred just
 * past the endpoints) so the full plan width of the doorway stays clear —
 * the old chunky pillars inside the span made every door read ~20 cm
 * narrower than the floor plan. Opening height is the NL standard 2.32 m. */
export function addDoorFrame(x1, z1, x2, z2, thick = WALL_THICK) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);
  const dirX = dx / len, dirZ = dz / len;

  const openH = 2.32;
  const jambW = 0.08;
  const jambD = thick + 0.06;

  for (const [px, pz, sgn] of [[x1, z1, -1], [x2, z2, 1]]) {
    const jamb = new THREE.Mesh(
      new THREE.BoxGeometry(jambD, openH + 0.04, jambW), DOORFRAME_MAT);
    jamb.position.set(px + dirX * sgn * (jambW / 2),
                      (openH + 0.04) / 2,
                      pz + dirZ * sgn * (jambW / 2));
    jamb.rotation.y = angle;
    S.scene.add(jamb);
  }

  // Head casing — a slim board across the top of the opening
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(jambD, jambW, len + jambW * 2), DOORFRAME_MAT);
  head.position.set(cx, openH + jambW / 2, cz);
  head.rotation.y = angle;
  S.scene.add(head);

  // Wall fill between the head casing and the ceiling
  const aboveH = WALL_HEIGHT - openH - jambW;
  if (aboveH > 0.04) {
    const above = new THREE.Mesh(
      new THREE.BoxGeometry(thick, aboveH, len + jambW * 2), WALL_MAT);
    above.position.set(cx, openH + jambW + aboveH / 2, cz);
    above.rotation.y = angle;
    S.scene.add(above);
  }
}

/* Add a sliding-glass door span — visual only, no wall collision in the span.
 * Pure decorative: frame + 2 glass panes. Forest backdrop is provided by the
 * sky cyclorama outside. */
export function addSlidingDoor(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);

  const group = new THREE.Group();

  // Top header above door
  const headerH = 0.25;
  const header = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICK + 0.02, headerH, len),
    WINDOW_FRAME_MAT
  );
  header.position.set(0, WALL_HEIGHT - headerH / 2, 0);
  group.add(header);

  // Above-header wall fill (between header and crown) — small
  // (crown is 0.14 thick from ceiling, so leave that clear)

  // Floor track / sill
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICK + 0.04, 0.04, len),
    WINDOW_FRAME_MAT
  );
  sill.position.set(0, 0.02, 0);
  group.add(sill);

  // Two glass panes side by side
  const paneW = (len - 0.06) / 2;
  const paneH = WALL_HEIGHT - headerH - 0.04;
  const paneCY = 0.04 + paneH / 2;
  for (const sgn of [-1, 1]) {
    const px = sgn * (paneW / 2 + 0.015);
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(paneW, paneH),
      new THREE.MeshStandardMaterial({
        color: 0xc8e4ee, transparent: true, opacity: 0.20,
        roughness: 0.05, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.04,
      })
    );
    pane.position.set(px, paneCY, 0);
    pane.rotation.y = Math.PI / 2;
    group.add(pane);
    // Vertical aluminium edge on each pane
    for (const ex of [-paneW / 2, paneW / 2]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, paneH, 0.025),
        METAL_MAT
      );
      edge.position.set(px + ex, paneCY, 0);
      group.add(edge);
    }
  }
  // Center vertical mullion where panes meet
  const mid = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, paneH, 0.04),
    METAL_MAT
  );
  mid.position.set(0, paneCY, 0);
  group.add(mid);

  group.position.set(cx, 0, cz);
  group.rotation.y = angle;
  S.scene.add(group);
  // No wallSegs push — player walks through.
}

/* Fixed window in a facade: low sill wall, glass band, header above. Collides
 * like a wall (you can't walk through a window). */
export function addWindow(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);
  const sillH = 0.85, headerH = 0.30;

  const group = new THREE.Group();
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICK, sillH, len), WALL_MAT.clone());
  sill.position.set(0, sillH / 2, 0);
  group.add(sill);
  const sillTop = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICK + 0.06, 0.04, len + 0.04), WINDOW_FRAME_MAT);
  sillTop.position.set(0, sillH + 0.02, 0);
  group.add(sillTop);
  const header = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICK, headerH, len), WALL_MAT.clone());
  header.position.set(0, WALL_HEIGHT - headerH / 2, 0);
  group.add(header);

  const paneH = WALL_HEIGHT - headerH - sillH - 0.08;
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(len - 0.08, paneH),
    new THREE.MeshStandardMaterial({
      color: 0xc8e4ee, transparent: true, opacity: 0.20, side: THREE.DoubleSide,
      roughness: 0.05, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.04,
    })
  );
  pane.position.set(0, sillH + 0.04 + paneH / 2, 0);
  pane.rotation.y = Math.PI / 2;
  group.add(pane);
  // Frame edges + a centre mullion
  for (const t of [-0.5, 0, 0.5]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, paneH, 0.05), WINDOW_FRAME_MAT);
    m.position.set(t * (len - 0.10), sillH + 0.04 + paneH / 2, 0);
    group.add(m);
  }

  group.position.set(cx, 0, cz);
  group.rotation.y = angle;
  S.scene.add(group);
  S.wallSegs.push({ x1, z1, x2, z2, len, angle, t: WALL_THICK });
}

/* Railing along a line — for balconies. Top rail + bottom rail + vertical
 * balusters. Top rail height is residential standard ~1.1m. */
export function addRailing(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);
  const RAIL_H = 1.10;

  // Top rail
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, len),
    RAILING_MAT
  );
  top.position.set(cx, RAIL_H, cz);
  top.rotation.y = angle;
  S.scene.add(top);

  // Rounded stainless handrail cap on top of the flat rail
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, len, 10),
    METAL_MAT
  );
  cap.rotation.z = Math.PI / 2;          // lie along local X…
  cap.position.set(cx, RAIL_H + 0.045, cz);
  cap.rotation.y = angle + Math.PI / 2;  // …then align with the segment
  cap.rotation.order = 'YZX';
  S.scene.add(cap);

  // Bottom rail
  const bot = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.04, len),
    RAILING_MAT
  );
  bot.position.set(cx, 0.10, cz);
  bot.rotation.y = angle;
  S.scene.add(bot);

  // Glass infill panel (frameless balustrade — common in NL new-builds)
  const glassH = RAIL_H - 0.18;
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(len - 0.05, glassH),
    new THREE.MeshStandardMaterial({
      color: 0xb8d0d8, transparent: true, opacity: 0.30,
      roughness: 0.1, metalness: 0.0, side: THREE.DoubleSide,
    })
  );
  glass.position.set(cx, 0.10 + glassH / 2 + 0.02, cz);
  glass.rotation.y = angle + Math.PI / 2;
  S.scene.add(glass);

  // Posts every ~1.5m to anchor the rail
  const dirX = dx / len, dirZ = dz / len;
  const nPosts = Math.max(2, Math.ceil(len / 1.5) + 1);
  for (let i = 0; i < nPosts; i++) {
    const t = i / (nPosts - 1);
    const px = x1 + dirX * len * t;
    const pz = z1 + dirZ * len * t;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, RAIL_H, 0.05),
      RAILING_MAT
    );
    post.position.set(px, RAIL_H / 2, pz);
    S.scene.add(post);
  }

  // Treat the railing as a wall for collision (player can't fall off)
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

export function addRoomFloor(rect, baseMat = FLOOR_MAT, tileW = 4, tileD = 2) {
  const { x1, z1, x2, z2 } = rect;
  const w = x2 - x1, d = z2 - z1;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), baseMat);
  floor.userData = { w, d, tileW, tileD };
  applyFloorTiling(floor, baseMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.001, cz);
  S.scene.add(floor);

  // Ceiling — clone CEIL_MAT and scale the paint stipple to room size so the
  // texture density stays consistent across small and large rooms.
  const cMat = CEIL_MAT.clone();
  if (CEIL_MAT.map) {
    cMat.map = CEIL_MAT.map.clone();
    cMat.map.needsUpdate = true;
    cMat.map.wrapS = cMat.map.wrapT = THREE.RepeatWrapping;
    cMat.map.repeat.set(Math.max(1, w / 2.5), Math.max(1, d / 2.5));
    cMat.map.anisotropy = CEIL_MAT.map.anisotropy;
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), cMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, WALL_HEIGHT - 0.001, cz);
  S.scene.add(ceil);
  return floor;
}

/* Polygon floor + ceiling for rooms with diagonal/curved boundaries (NW tip,
 * SW corners, balcony curves). points = [[x, z], ...] in world meters. UVs are
 * normalised to the polygon bbox so applyFloorTiling works unchanged. */
export function addRoomFloorPoly(points, baseMat = FLOOR_MAT, tileW = 4, tileD = 2) {
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
  floor.material.side = THREE.DoubleSide;
  floor.userData = { w, d, tileW, tileD };
  applyFloorTiling(floor, baseMat);
  floor.material.side = THREE.DoubleSide;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  S.scene.add(floor);

  const cMat = CEIL_MAT.clone();
  if (CEIL_MAT.map) {
    cMat.map = CEIL_MAT.map.clone();
    cMat.map.needsUpdate = true;
    cMat.map.wrapS = cMat.map.wrapT = THREE.RepeatWrapping;
    cMat.map.repeat.set(Math.max(1, w / 2.5), Math.max(1, d / 2.5));
    cMat.map.anisotropy = CEIL_MAT.map.anisotropy;
  }
  const ceil = new THREE.Mesh(shapeGeo(false), cMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = WALL_HEIGHT - 0.001;
  S.scene.add(ceil);
  return floor;
}
