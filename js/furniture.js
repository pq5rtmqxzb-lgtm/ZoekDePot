import * as THREE from 'three';
import { S } from './state.js';
import { WALL_HEIGHT, CEIL_LOW } from './constants.js';
import {
  MATTRESS_MAT, LINEN_MAT, LINEN2_MAT, PILLOW_MAT, BEDFRAME_MAT, SOFA_MAT, RUG_MAT,
  TABLE_MAT, CHAIR_MAT, COUNTER_MAT, CABINET_MAT, CABINET_DARK_MAT, MARBLE_MAT,
  CERAMIC_MAT, METAL_MAT, BLACK_METAL_MAT, ALU_MAT, WARDROBE_MAT, WHITE_LACQUER_MAT,
  RADIATOR_MAT, APPLIANCE_MAT, SCREEN_MAT, PLANT_POT_MAT, PLANT_LEAF_MAT, BOOK_MATS,
  PANE_MAT, WALL_TILE_MAT, HANDRAIL_MAT,
} from './materials.js';
import { addBoxObstacle, addRotatedBoxObstacle } from './collision.js';
import { box, tiledClone } from './builders.js';

/* ===== FURNITURE HELPERS =====
 * Local frame of every piece: (ox, oz) offsets rotate with ry; local -z is
 * the "back" (against the wall), local +z the front. */
const rot = (x, z, ox, oz, ry) => [x + Math.cos(ry) * ox + Math.sin(ry) * oz, z - Math.sin(ry) * ox + Math.cos(ry) * oz];
function part(w, h, d, mat, x, z, ry, ox, oy, oz) {
  const [wx, wz] = rot(x, z, ox, oz, ry);
  return box(w, h, d, mat, wx, oy, wz, ry);
}
const FABRIC_HEAD = new THREE.MeshStandardMaterial({ color: 0x8a8f86, roughness: 0.95 });
const SHEER_MAT = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, transparent: true, opacity: 0.62, roughness: 1, side: THREE.DoubleSide, depthWrite: false });
const CURTAIN_MAT = new THREE.MeshStandardMaterial({ color: 0xb9b0a1, roughness: 1 });
const MIRROR_MAT = new THREE.MeshStandardMaterial({ color: 0xa9bcc4, roughness: 0.05, metalness: 0.9 });
const GLOW_MAT = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
const WATER_MAT = new THREE.MeshStandardMaterial({ color: 0xdfe9ea, roughness: 0.35 });
const HOB_MAT = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.2, metalness: 0.3 });

export function addBed(x, z, ry, w, d) {
  const frameH = 0.26;
  part(w, frameH, d, BEDFRAME_MAT, x, z, ry, 0, frameH / 2, 0);
  part(w - 0.06, 0.22, d - 0.06, MATTRESS_MAT, x, z, ry, 0, frameH + 0.11, 0);
  part(w - 0.02, 0.07, d * 0.62, LINEN2_MAT, x, z, ry, 0, frameH + 0.245, d * 0.14);   // dekbed
  part(w + 0.06, 1.0, 0.08, FABRIC_HEAD, x, z, ry, 0, 0.5, -d / 2 - 0.04);              // hoofdbord
  const nPillows = w > 1.3 ? 2 : 1;
  for (const po of (nPillows === 2 ? [-w * 0.24, w * 0.24] : [0])) {
    part(w * 0.40, 0.11, 0.42, PILLOW_MAT, x, z, ry, po, frameH + 0.22 + 0.055, -d / 2 + 0.32);
  }
  addRotatedBoxObstacle(x, z, w, d, ry);
}

export function addNightstand(x, z, ry) {
  part(0.45, 0.42, 0.42, WARDROBE_MAT, x, z, ry, 0, 0.21, 0);
  part(0.12, 0.02, 0.12, BLACK_METAL_MAT, x, z, ry, 0, 0.43, 0);
  part(0.02, 0.22, 0.02, BLACK_METAL_MAT, x, z, ry, 0, 0.55, 0);
  part(0.20, 0.16, 0.20, new THREE.MeshStandardMaterial({ color: 0xeee3cf, emissive: 0xffe2b0, emissiveIntensity: 0.4, roughness: 0.8 }),
       x, z, ry, 0, 0.72, 0);
  addRotatedBoxObstacle(x, z, 0.45, 0.42, ry);
}

export function addWardrobe(x, z, ry, w = 1.6, d = 0.6, h = 2.30, mat = WHITE_LACQUER_MAT) {
  part(w, h, d, mat, x, z, ry, 0, h / 2, 0);
  const nDoors = Math.max(2, Math.round(w / 0.5));
  const dw = w / nDoors;
  for (let i = 1; i < nDoors; i++) part(0.008, h - 0.04, 0.02, CABINET_DARK_MAT, x, z, ry, -w / 2 + i * dw, h / 2, d / 2 + 0.005);
  for (let i = 0; i < nDoors; i++) {          // slim vertical grips
    const gx = -w / 2 + i * dw + (i % 2 ? 0.03 : dw - 0.03);
    part(0.012, 0.30, 0.02, BLACK_METAL_MAT, x, z, ry, gx, 1.10, d / 2 + 0.015);
  }
  addRotatedBoxObstacle(x, z, w, d, ry);
}

export function addSofa(x, z, ry, w = 2.4, d = 0.95) {
  const seatH = 0.42, backH = 0.45;
  part(w, 0.12, d, SOFA_MAT, x, z, ry, 0, 0.14, 0);                          // base
  part(w, backH, 0.20, SOFA_MAT, x, z, ry, 0, seatH + backH / 2, -d / 2 + 0.10);
  for (const s of [-1, 1]) part(0.16, 0.56, d, SOFA_MAT, x, z, ry, s * (w / 2 - 0.08), 0.28, 0);
  const n = 3, cw = (w - 0.32) / n;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + 0.16 + cw * (i + 0.5);
    part(cw - 0.03, 0.18, d - 0.32, PILLOW_MAT, x, z, ry, cx, 0.29, 0.04);
    part(cw - 0.06, 0.40, 0.14, PILLOW_MAT, x, z, ry, cx, seatH + 0.2, -d / 2 + 0.26);
  }
  part(0.42, 0.40, 0.12, LINEN2_MAT, x, z, ry, -w / 2 + 0.45, 0.56, -d / 2 + 0.34);  // sierkussen
  part(0.42, 0.40, 0.12, LINEN_MAT, x, z, ry, w / 2 - 0.45, 0.56, -d / 2 + 0.34);
  addRotatedBoxObstacle(x, z, w, d, ry);
}

export function addArmchair(x, z, ry, mat = LINEN2_MAT) {
  part(0.82, 0.36, 0.82, mat, x, z, ry, 0, 0.18, 0);
  part(0.82, 0.42, 0.18, mat, x, z, ry, 0, 0.57, -0.32);
  for (const s of [-1, 1]) part(0.12, 0.22, 0.70, mat, x, z, ry, s * 0.35, 0.47, 0.02);
  part(0.56, 0.10, 0.56, PILLOW_MAT, x, z, ry, 0, 0.41, 0.06);
  addRotatedBoxObstacle(x, z, 0.82, 0.82, ry);
}

export function addCoffeeTable(x, z, w = 1.1, d = 0.6, ry = 0) {
  part(w, 0.04, d, TABLE_MAT, x, z, ry, 0, 0.40, 0);
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part(0.04, 0.38, 0.04, BLACK_METAL_MAT, x, z, ry, ox * (w / 2 - 0.05), 0.19, oz * (d / 2 - 0.05));
  part(0.28, 0.06, 0.28, CERAMIC_MAT, x, z, ry, -w * 0.2, 0.45, 0);        // schaal
  part(0.24, 0.03, 0.32, BOOK_MATS[4], x, z, ry, w * 0.22, 0.435, 0.02);    // boek
  addRotatedBoxObstacle(x, z, w, d, ry);
}

export function addSideTable(x, z) {
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 20), TABLE_MAT);
  top.position.set(x, 0.52, z); S.scene.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 10), BLACK_METAL_MAT);
  leg.position.set(x, 0.25, z); S.scene.add(leg);
  addBoxObstacle(x, z, 0.5, 0.5);
}

export function addDiningTable(x, z, w = 1.00, d = 2.20) {
  part(w, 0.04, d, TABLE_MAT, x, z, 0, 0, 0.75, 0);
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part(0.06, 0.73, 0.06, TABLE_MAT, x, z, 0, ox * (w / 2 - 0.08), 0.365, oz * (d / 2 - 0.08));
  const chairs = [];
  if (d > w) {
    for (const oz of [-d / 4, d / 4]) {
      chairs.push([x - w / 2 - 0.30, z + oz, Math.PI / 2]);
      chairs.push([x + w / 2 + 0.30, z + oz, -Math.PI / 2]);
    }
    chairs.push([x, z - d / 2 - 0.30, 0]);
    chairs.push([x, z + d / 2 + 0.30, Math.PI]);
  } else {
    for (const ox of [-w / 4, w / 4]) {
      chairs.push([x + ox, z - d / 2 - 0.30, 0]);
      chairs.push([x + ox, z + d / 2 + 0.30, Math.PI]);
    }
    chairs.push([x - w / 2 - 0.30, z, Math.PI / 2]);
    chairs.push([x + w / 2 + 0.30, z, -Math.PI / 2]);
  }
  for (const [cx, cz, cry] of chairs) addChair(cx, cz, cry);
  // tafelaankleding: vaas + schaal
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.28, 12), CERAMIC_MAT);
  vase.position.set(x, 0.91, z); S.scene.add(vase);
  addBoxObstacle(x, z, w, d);
}

/* Chair: local +z is the front (the sitter faces +z), back at -z. */
export function addChair(x, z, ry) {
  part(0.44, 0.04, 0.44, CHAIR_MAT, x, z, ry, 0, 0.46, 0);
  part(0.42, 0.42, 0.03, CHAIR_MAT, x, z, ry, 0, 0.70, -0.20);
  for (const [ox, oz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) part(0.03, 0.46, 0.03, CHAIR_MAT, x, z, ry, ox, 0.23, oz);
  addBoxObstacle(x, z, 0.46, 0.46);
}

export function addBarStool(x, z) {
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 18), CHAIR_MAT);
  seat.position.set(x, 0.66, z); S.scene.add(seat);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.60, 10), BLACK_METAL_MAT);
  pole.position.set(x, 0.33, z); S.scene.add(pole);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.015, 18), BLACK_METAL_MAT);
  foot.position.set(x, 0.008, z); S.scene.add(foot);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 6, 20), BLACK_METAL_MAT);
  ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.24, z); S.scene.add(ring);
  addBoxObstacle(x, z, 0.34, 0.34);
}

export function addRug(x, z, w, d, mat = RUG_MAT, ry = 0) {
  const m = part(w, 0.012, d, mat, x, z, ry, 0, 0.007, 0);
  m.receiveShadow = true;
  return m;
}

/* TV-meubel against a wall (wall at local -z) with a 65" screen above it. */
export function addTvUnit(x, z, ry, w = 1.8) {
  part(w, 0.42, 0.42, WARDROBE_MAT, x, z, ry, 0, 0.21, 0);
  for (let i = 1; i < 3; i++) part(0.008, 0.36, 0.02, CABINET_DARK_MAT, x, z, ry, -w / 2 + i * w / 3, 0.21, 0.215);
  part(1.45, 0.83, 0.03, SCREEN_MAT, x, z, ry, 0, 1.20, -0.21 + 0.03);
  part(1.49, 0.87, 0.02, BLACK_METAL_MAT, x, z, ry, 0, 1.20, -0.21 + 0.012);
  part(0.9, 0.06, 0.12, BLACK_METAL_MAT, x, z, ry, 0, 0.46, -0.05);           // soundbar
  addRotatedBoxObstacle(x, z, w, 0.42, ry);
}

export function addBookshelf(x, z, ry, w = 1.8, h = 2.1, d = 0.32) {
  part(w, 0.02, d, WARDROBE_MAT, x, z, ry, 0, 0.01, 0);
  part(w, h, 0.02, WARDROBE_MAT, x, z, ry, 0, h / 2, -d / 2 + 0.01);
  for (const s of [-1, 1]) part(0.02, h, d, WARDROBE_MAT, x, z, ry, s * (w / 2 - 0.01), h / 2, 0);
  const shelves = 5, sh = h / shelves;
  for (let i = 1; i <= shelves; i++) part(w - 0.04, 0.02, d, WARDROBE_MAT, x, z, ry, 0, i * sh, 0);
  // books: runs of blocks on every shelf, a few gaps + one plant
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < shelves; i++) {
    let bx = -w / 2 + 0.06;
    while (bx < w / 2 - 0.12) {
      const bw = 0.03 + rnd() * 0.04, bh = 0.18 + rnd() * 0.12;
      if (rnd() < 0.12) { bx += 0.18; continue; }
      part(bw, bh, 0.20, BOOK_MATS[Math.floor(rnd() * BOOK_MATS.length)], x, z, ry, bx + bw / 2, i * sh + 0.02 + bh / 2, 0.02);
      bx += bw + 0.004;
    }
  }
  addRotatedBoxObstacle(x, z, w, d, ry);
}

export function addPlant(x, z, h = 1.6, potR = 0.20) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(potR, potR * 0.8, potR * 1.3, 16), PLANT_POT_MAT);
  pot.position.set(x, potR * 0.65, z); S.scene.add(pot);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, h * 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: 1 }));
  stem.position.set(x, potR * 1.3 + h * 0.27, z); S.scene.add(stem);
  let seed = Math.floor(x * 31 + z * 17);
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const n = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const r = h * (0.14 + rnd() * 0.12);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), PLANT_LEAF_MAT);
    leaf.scale.set(1, 0.55 + rnd() * 0.3, 1);
    leaf.position.set(x + (rnd() - 0.5) * h * 0.5, potR * 1.3 + h * (0.45 + rnd() * 0.5), z + (rnd() - 0.5) * h * 0.5);
    S.scene.add(leaf);
  }
  addBoxObstacle(x, z, potR * 2, potR * 2);
}

export function addFloorLamp(x, z) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16), BLACK_METAL_MAT);
  base.position.set(x, 0.01, z); S.scene.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.55, 8), BLACK_METAL_MAT);
  pole.position.set(x, 0.8, z); S.scene.add(pole);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.26, 18, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe9e1d0, emissive: 0xffe2b0, emissiveIntensity: 0.45, roughness: 0.9, side: THREE.DoubleSide }));
  shade.position.set(x, 1.55, z); S.scene.add(shade);
  const pl = new THREE.PointLight(0xffe2b0, 0.30, 3.2);
  pl.position.set(x, 1.45, z); S.scene.add(pl);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), GLOW_MAT);
  disc.position.set(x, 1.50, z); disc.userData.noMeasure = true; S.scene.add(disc);
  S.pointLightInfo.push({ light: pl, baseI: 0.30, disc });
  addBoxObstacle(x, z, 0.3, 0.3);
}

/* Pendant lamp: cord + warm glass shade + a small point light. */
export function addPendant(x, z, y = 2.05, ceil = WALL_HEIGHT, r = 0.11) {
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, ceil - y, 6), BLACK_METAL_MAT);
  cord.position.set(x, y + (ceil - y) / 2, z); S.scene.add(cord);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, 0.18, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }));
  shade.position.set(x, y, z); S.scene.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.030, 10, 8), GLOW_MAT);
  bulb.position.set(x, y - 0.03, z); bulb.userData.noMeasure = true; S.scene.add(bulb);
  const pl = new THREE.PointLight(0xffe2b0, 0.40, 3.5);
  pl.position.set(x, y - 0.12, z); S.scene.add(pl);
  S.pointLightInfo.push({ light: pl, baseI: 0.40, disc: bulb });
}

/* Curtains beside a schuifpui: rail + two panels drawn to the sides, on the
 * indoor side (inn = +1 for +z indoors, -1 for -z indoors; pui along x). */
export function addCurtains(x1, x2, zLine, inn, sheer = true) {
  const zc = zLine + inn * 0.24;
  const mat = sheer ? SHEER_MAT : CURTAIN_MAT;
  box(x2 - x1 + 0.4, 0.03, 0.03, ALU_MAT, (x1 + x2) / 2, 2.62, zc);
  for (const [xa, s] of [[x1, 1], [x2, -1]]) {
    const w = 0.55;
    const m = box(w, 2.56, 0.08, mat, xa + s * (w / 2 - 0.15), 1.30, zc);
    m.castShadow = false;
  }
}

/* --- keuken (keukenopstelling D) ------------------------------------- */
function addKitchen() {
  // Wall line along the gang wall (x 4.44..6.94, z 9.64..10.26): base
  // cabinets + counter, upper cabinets, tall unit (oven + fridge) at the east end.
  const z0 = 9.64, dep = 0.62, ztop = z0 + dep;
  const xa = 4.44, xb = 6.34, xt = 6.94;
  box(xb - xa, 0.10, dep - 0.06, CABINET_DARK_MAT, (xa + xb) / 2, 0.05, z0 + dep / 2);              // plint
  box(xb - xa, 0.76, dep, WHITE_LACQUER_MAT, (xa + xb) / 2, 0.10 + 0.38, z0 + dep / 2);             // onderkasten
  for (let x = xa + 0.6; x < xb - 0.1; x += 0.6) box(0.008, 0.70, 0.02, CABINET_DARK_MAT, x, 0.48, ztop + 0.005);
  box(xb - xa + 0.02, 0.04, dep + 0.03, COUNTER_MAT, (xa + xb) / 2, 0.88, z0 + dep / 2 + 0.01);      // werkblad
  box(xb - xa, 0.55, 0.02, tiledClone(MARBLE_MAT, 2, 0.6, 1.0), (xa + xb) / 2, 0.90 + 0.275, z0 + 0.01); // achterwand
  box(xb - xa, 0.75, 0.36, WHITE_LACQUER_MAT, (xa + xb) / 2, 1.45 + 0.375, z0 + 0.18);              // bovenkasten
  for (let x = xa + 0.6; x < xb - 0.1; x += 0.6) box(0.008, 0.70, 0.02, CABINET_DARK_MAT, x, 1.825, z0 + 0.365);
  // tall unit: oven at eye level + fridge
  box(xt - xb, 2.20, dep, WHITE_LACQUER_MAT, (xb + xt) / 2, 1.10, z0 + dep / 2);
  box(0.56, 0.58, 0.02, SCREEN_MAT, (xb + xt) / 2, 1.30, ztop + 0.005);                            // oven
  box(0.52, 0.03, 0.03, ALU_MAT, (xb + xt) / 2, 1.06, ztop + 0.02);
  box(0.008, 1.10, 0.02, CABINET_DARK_MAT, (xb + xt) / 2 - 0.29, 0.62, ztop + 0.005);
  box(0.012, 0.32, 0.02, BLACK_METAL_MAT, xb + 0.05, 1.75, ztop + 0.015);
  // kleine apparaten op het blad
  box(0.22, 0.30, 0.22, APPLIANCE_MAT, 4.75, 1.05, z0 + 0.36);                                     // waterkoker/koffie
  box(0.30, 0.16, 0.20, WARDROBE_MAT, 5.55, 0.98, z0 + 0.36);                                      // broodplank
  addBoxObstacle((xa + xt) / 2, z0 + dep / 2, xt - xa, dep);

  // Kookeiland: stone monolith x 5.42..6.40, z 11.24..13.85 (PDF), sink at
  // the north end, induction hob at the south end, stools on the east side.
  const ix = 5.91, iz = 12.545, iw = 0.98, id = 2.61, ih = 0.92;
  box(iw, ih, id, tiledClone(MARBLE_MAT, 2.6, 0.9, 1.0), ix, ih / 2, iz);
  box(0.44, 0.02, 0.42, COUNTER_MAT, 5.64, ih + 0.001, 11.78);                                     // spoelbak (opbouw, zwart)
  box(0.40, 0.16, 0.38, new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.4, metalness: 0.4 }), 5.64, ih - 0.08, 11.78);
  const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.36, 10), BLACK_METAL_MAT);
  tap.position.set(5.64 + 0.26, ih + 0.18, 11.78); S.scene.add(tap);
  const tapArm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), BLACK_METAL_MAT);
  tapArm.rotation.z = Math.PI / 2; tapArm.position.set(5.64 + 0.14, ih + 0.36, 11.78); S.scene.add(tapArm);
  box(0.52, 0.008, 0.86, HOB_MAT, 5.72, ih + 0.005, 13.12);                                        // inductiekookplaat
  for (const [dx, dz] of [[-0.11, -0.22], [0.11, -0.22], [-0.11, 0.0], [0.11, 0.0], [0, 0.26]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.085, 20), new THREE.MeshBasicMaterial({ color: 0x5a5c60, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(5.72 + dx, ih + 0.012, 13.12 + dz); S.scene.add(ring);
  }
  box(0.06, 0.008, 0.86, ALU_MAT, 6.02, ih + 0.006, 13.12);                                        // downdraft afzuiging
  addBoxObstacle(ix, iz, iw, id);
  for (const sz of [12.05, 12.65, 13.25]) addBarStool(6.78, sz);
  addPendant(5.91, 11.95, 1.95);
  addPendant(5.91, 13.10, 1.95);
}

/* --- sanitair ---------------------------------------------------------- */
export function addOvalBath(x, z, ry, w = 1.8, d = 0.72, h = 0.58) {
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.46, h, 40), CERAMIC_MAT);
  shell.scale.set(w, 1, d); shell.position.set(x, h / 2, z); shell.rotation.y = ry; S.scene.add(shell);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 40), WATER_MAT);
  inner.scale.set(w - 0.16, 1, d - 0.16); inner.position.set(x, h - 0.09, z); inner.rotation.y = ry; S.scene.add(inner);
  addRotatedBoxObstacle(x, z, w, d, ry);
}

/* Wall-hung toilet (hangtoilet) against the wall at local -z. */
export function addWallToilet(x, z, ry) {
  part(0.36, 0.30, 0.30, CERAMIC_MAT, x, z, ry, 0, 0.30, -0.08);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.30, 20), CERAMIC_MAT);
  bowl.scale.set(1, 1, 1.25);
  const [bx, bz] = rot(x, z, 0, 0.10, ry);
  bowl.position.set(bx, 0.30, bz); bowl.rotation.y = ry; S.scene.add(bowl);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 20), WHITE_LACQUER_MAT);
  seat.scale.set(1, 1, 1.25); seat.position.set(bx, 0.46, bz); seat.rotation.y = ry; S.scene.add(seat);
  part(0.22, 0.14, 0.008, ALU_MAT, x, z, ry, 0, 1.05, -0.25 + 0.004);          // bedieningsplaat
  addRotatedBoxObstacle(x, z, 0.40, 0.62, ry);
}

/* Tiled voorzetwand (inbouwreservoir) — an axis-aligned block. */
export function addVoorzetwand(x1, z1, x2, z2, h = 1.20) {
  const w = x2 - x1, d = z2 - z1;
  box(w, h, d, tiledClone(WALL_TILE_MAT, Math.max(w, d), h, 1.2), (x1 + x2) / 2, h / 2, (z1 + z2) / 2);
  box(w, 0.02, d, MARBLE_MAT, (x1 + x2) / 2, h + 0.01, (z1 + z2) / 2);
  addBoxObstacle((x1 + x2) / 2, (z1 + z2) / 2, w, d);
}

/* Floating vanity (wall at local -z): cabinet, stone top, opbouwkom(men),
 * mirror + light bar. */
export function addVanity(x, z, ry, w = 1.0, basins = 1, d = 0.48) {
  part(w, 0.48, d, WARDROBE_MAT, x, z, ry, 0, 0.42 + 0.24, 0);
  part(w + 0.02, 0.03, d + 0.02, MARBLE_MAT, x, z, ry, 0, 0.905, 0);
  part(0.008, 0.40, 0.02, CABINET_DARK_MAT, x, z, ry, 0, 0.66, d / 2 + 0.005);
  const bxs = basins === 2 ? [-w / 4, w / 4] : [0];
  for (const bxo of bxs) {
    part(0.42, 0.12, 0.36, CERAMIC_MAT, x, z, ry, bxo, 0.98, 0.02);
    part(0.34, 0.03, 0.28, WATER_MAT, x, z, ry, bxo, 1.03, 0.02);
    part(0.02, 0.22, 0.02, BLACK_METAL_MAT, x, z, ry, bxo, 1.03, -0.18);
    part(0.02, 0.02, 0.14, BLACK_METAL_MAT, x, z, ry, bxo, 1.13, -0.11);
  }
  part(w - 0.1, 0.80, 0.01, MIRROR_MAT, x, z, ry, 0, 1.55, -d / 2 + 0.006);
  part(w - 0.2, 0.03, 0.04, GLOW_MAT, x, z, ry, 0, 1.98, -d / 2 + 0.03);
  addRotatedBoxObstacle(x, z, w, d, ry);
}

export function addFontein(x, z, ry) {
  part(0.36, 0.12, 0.25, CERAMIC_MAT, x, z, ry, 0, 0.86, 0);
  part(0.02, 0.16, 0.02, BLACK_METAL_MAT, x, z, ry, 0.10, 0.98, -0.08);
  const mirror = part(0.30, 0.30, 0.01, MIRROR_MAT, x, z, ry, 0, 1.45, -0.125 + 0.005);
  mirror.userData.noMeasure = false;
  addRotatedBoxObstacle(x, z, 0.36, 0.25, ry);
}

/* Walk-in shower: drain, glass screen (along z at x = sx from sz0..sz1),
 * rain shower on the wall at (hx, hz) with the arm pointing along (nx, nz). */
export function addWalkInShower(drainX, drainZ, sx, sz0, sz1, hx, hz, nx, nz) {
  box(0.15, 0.006, 0.15, BLACK_METAL_MAT, drainX, 0.004, drainZ);
  if (sz1 > sz0) {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(sz1 - sz0, 2.0), PANE_MAT);
    gl.rotation.y = Math.PI / 2; gl.position.set(sx, 1.0, (sz0 + sz1) / 2); S.scene.add(gl);
    box(0.03, 2.0, 0.03, ALU_MAT, sx, 1.0, sz0);
    box(0.03, 0.03, sz1 - sz0, ALU_MAT, sx, 2.0, (sz0 + sz1) / 2);
    S.wallSegs.push({ x1: sx, z1: sz0, x2: sx, z2: sz1, len: sz1 - sz0, angle: 0, t: 0.03 });
  }
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.38, 8), METAL_MAT);
  arm.rotation.z = nx ? Math.PI / 2 : 0; arm.rotation.x = nz ? Math.PI / 2 : 0;
  arm.position.set(hx + nx * 0.19, 2.15, hz + nz * 0.19); S.scene.add(arm);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 20), METAL_MAT);
  rose.position.set(hx + nx * 0.36, 2.14, hz + nz * 0.36); S.scene.add(rose);
  box(nx ? 0.06 : 0.34, 0.05, nz ? 0.06 : 0.34, METAL_MAT, hx + nx * 0.03, 1.10, hz + nz * 0.03);   // thermostaatkraan
  box(nx ? 0.03 : 0.025, 0.9, nz ? 0.03 : 0.025, METAL_MAT, hx + nx * 0.03 + (nz ? 0.25 : 0), 1.55, hz + nz * 0.03 + (nx ? 0.25 : 0)); // glijstang
}

/* Elektrische designradiator (wit), wall at local -z. */
export function addRadiator(x, z, ry, w = 0.5, h = 1.6, y0 = 0.25) {
  part(w, h, 0.05, RADIATOR_MAT, x, z, ry, 0, y0 + h / 2, 0.02);
  const bars = Math.max(2, Math.round(w / 0.07));
  for (let i = 0; i < bars; i++) part(0.03, h - 0.06, 0.025, RADIATOR_MAT, x, z, ry, -w / 2 + (i + 0.5) * (w / bars), y0 + h / 2, 0.06);
  addRotatedBoxObstacle(x, z, w, 0.1, ry);
}

/* Kapstok + schoenenbank near the voordeur (wall at local -z). */
function addCoatRack(x, z, ry, w = 0.9) {
  part(w, 0.04, 0.03, WARDROBE_MAT, x, z, ry, 0, 1.68, 0.015);
  for (let i = 0; i < 5; i++) part(0.015, 0.03, 0.06, BLACK_METAL_MAT, x, z, ry, -w / 2 + 0.1 + i * (w - 0.2) / 4, 1.62, 0.045);
  part(0.34, 0.80, 0.10, new THREE.MeshStandardMaterial({ color: 0x3d4a5c, roughness: 1 }), x, z, ry, -0.20, 1.25, 0.08);   // jas
  part(0.30, 0.72, 0.09, new THREE.MeshStandardMaterial({ color: 0x8a6d4e, roughness: 1 }), x, z, ry, 0.18, 1.28, 0.08);    // jas
  part(w, 0.04, 0.34, WARDROBE_MAT, x, z, ry, 0, 0.44, 0.20);
  for (const s of [-1, 1]) part(0.03, 0.42, 0.30, BLACK_METAL_MAT, x, z, ry, s * (w / 2 - 0.05), 0.21, 0.20);
  part(0.26, 0.10, 0.28, CHAIR_MAT, x, z, ry, -0.2, 0.05, 0.20);   // schoenen
  const [ox, oz] = rot(x, z, 0, 0.19, ry);   // footprint is the bench, in front of the wall
  addRotatedBoxObstacle(ox, oz, w, 0.38, ry);
}

function addTechniek() {
  // WTW-unit wall-hung on the berging's north wall (PDF x 1.04..1.75, z 5.73..6.18)
  box(0.70, 1.25, 0.45, APPLIANCE_MAT, 1.40, 1.55, 5.71 + 0.225);
  box(0.66, 0.30, 0.02, CABINET_DARK_MAT, 1.40, 1.20, 5.71 + 0.46);
  for (const dx of [-0.22, -0.07, 0.07, 0.22]) {
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, CEIL_LOW - 2.17, 12), ALU_MAT);
    duct.position.set(1.40 + dx, 2.17 + (CEIL_LOW - 2.17) / 2, 5.94); S.scene.add(duct);
  }
  addBoxObstacle(1.40, 5.94, 0.70, 0.45);
  // Meterkast-achtige verdeler op de westwand van de berging
  box(0.16, 0.90, 0.60, WHITE_LACQUER_MAT, 0.19 + 0.08, 1.50, 6.92);
  // Boiler + warmte-afleverset in the boiler closet (x 0.19..1.00, z 7.31..7.81)
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.30, 20), APPLIANCE_MAT);
  boiler.position.set(0.60, 0.65, 7.56); S.scene.add(boiler);
  box(0.45, 0.55, 0.28, APPLIANCE_MAT, 0.60, 1.85, 7.31 + 0.15);
  addBoxObstacle(0.60, 7.56, 0.5, 0.5);
  // Vloerverwarmingsverdeler in the VV closet (x 1.06..1.73)
  box(0.50, 0.14, 0.12, ALU_MAT, 1.40, 0.70, 7.31 + 0.10);
  box(0.50, 0.14, 0.12, ALU_MAT, 1.40, 0.50, 7.31 + 0.10);
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), ALU_MAT);
    p.position.set(1.18 + i * 0.062, 0.25, 7.41); S.scene.add(p);
  }
  // Wasmachine + droger stacked in the WM/CD niche (x 1.80..2.46, z 7.21..7.81)
  for (const y of [0.425, 1.28]) {
    box(0.60, 0.85, 0.60, APPLIANCE_MAT, 2.13, y, 7.51);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 20), SCREEN_MAT);
    door.rotation.x = Math.PI / 2; door.position.set(2.13, y + 0.02, 7.21 - 0.005); S.scene.add(door);
  }
  addBoxObstacle(2.13, 7.51, 0.60, 0.60);
}

function addOutdoorFurniture() {
  // Noord balkon (0.9 m diep): nothing can be passed on a 0.9 m balcony, so
  // the bistro set sits in the west tip (beyond the slaapk1 pui) where it
  // blocks no route; the planter stays at the east end.
  const tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 18), BLACK_METAL_MAT);
  tbl.position.set(1.0, 0.72, -0.72); S.scene.add(tbl);
  const tleg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.70, 8), BLACK_METAL_MAT);
  tleg.position.set(1.0, 0.36, -0.72); S.scene.add(tleg);
  addBoxObstacle(1.0, -0.72, 0.56, 0.56);
  addChair(0.45, -0.72, Math.PI / 2);
  addChair(1.55, -0.72, -Math.PI / 2);
  box(1.6, 0.34, 0.28, PLANT_POT_MAT, 8.2, 0.17, -0.90);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), PLANT_LEAF_MAT);
    g.position.set(7.55 + i * 0.32, 0.45, -0.90); S.scene.add(g);
  }
  addBoxObstacle(8.2, -0.90, 1.6, 0.28);

  // Zuid balkon (3.6 m diep): the bay in front of the woonkamerpui
  // (x 6.72..10.25, z 13.99..15.8) is the walkway to the rest of the
  // balcony, so the loungeset sits in the deep part: sofa along the
  // privacy screen facing west, coffee table + two chairs in front.
  addSofa(10.2, 16.68, -Math.PI / 2, 1.65, 0.85);
  addCoffeeTable(9.05, 16.65, 0.9, 0.5, Math.PI / 2);
  addArmchair(8.1, 15.8, Math.PI / 2 + 0.6, LINEN_MAT);
  addArmchair(7.95, 16.95, Math.PI / 2 - 0.4, LINEN_MAT);
  addPlant(7.0, 17.15, 1.9, 0.26);
  addPlant(2.0, 17.3, 1.5, 0.24);
  addPlant(6.0, 17.1, 1.2, 0.22);
}

export function placeFurniture() {
  // Furniture positions use model.json coords (+X east, +Z south, origin at
  // the NW corner of the north facade).

  // === Slaapkamer 1 (x 1.92..5.59, z 0.21..4.21; kolom x 5.08..5.59 z 0.71..1.28)
  // Bed with its head against the east wall, just south of the column.
  // Bed kept 0.71 m clear of the wardrobe so you can walk (and open doors)
  // between them; the headboard stops just south of the column (z 1.28).
  addBed(4.59, 2.10, -Math.PI / 2, 1.60, 2.00);
  addNightstand(5.34, 3.17, -Math.PI / 2);
  addRug(4.10, 2.10, 2.6, 2.4);
  addWardrobe(4.70, 3.91, Math.PI, 1.60, 0.60);        // south wall, west of the pier
  addArmchair(0.45, 2.30, -0.75, LINEN_MAT);           // leeshoek in the NW-punt, back to the chamfer
  addFloorLamp(1.15, 2.95);                            // beside the chair, inside the room (not in the chamfer wall)
  addPlant(0.95, 0.75, 1.5, 0.20);
  addCurtains(1.58, 5.18, -0.085, 1, false);

  // === Badkamer (x 3.86..6.94, z 4.31..7.04) — PDF: vrijstaand ovaal bad
  // along the north wall, walk-in douche NE, hangtoilet on a voorzetwand
  // (between the column and the east wall), wastafel west of the column.
  addOvalBath(4.94, 4.76, 0, 1.80, 0.72);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), METAL_MAT);
  spout.rotation.x = Math.PI / 2; spout.position.set(4.94, 0.78, 4.31 + 0.11); S.scene.add(spout);
  addWalkInShower(6.50, 5.25, 5.95, 4.31, 5.62, 6.45, 4.31, 0, 1);
  addVoorzetwand(5.60, 6.84, 6.94, 7.04, 1.20);
  addWallToilet(6.45, 6.84 - 0.30, Math.PI);
  addVanity(4.475, 7.04 - 0.24, Math.PI, 1.05, 1);
  addRadiator(6.94 - 0.05, 6.15, -Math.PI / 2, 0.5, 1.6);

  // === Toilet (x 4.84..6.63, z 7.14..8.07): hangtoilet east, fontein west
  addVoorzetwand(6.43, 7.14, 6.63, 8.07, 1.20);
  addWallToilet(6.43 - 0.30, 7.60, -Math.PI / 2);
  addFontein(4.84 + 0.13, 7.62, Math.PI / 2);

  // === Technische berging + kasten
  addTechniek();

  // === Gang: kapstok + schoenenbank bij de voordeur, loper in de oostarm
  addCoatRack(1.15, 9.54 - 0.03, Math.PI, 1.0);
  addRug(5.4, 8.86, 2.6, 0.8, new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 1 }));

  // === Slaapkamer 2 (x 0.19..4.31, z 11.51..14.85 + nook x 2.64..4.31 z 9.63..11.41)
  addBed(1.19, 13.35, Math.PI / 2, 1.60, 2.00);        // head against the west wall
  addNightstand(0.42, 12.28, Math.PI / 2);
  addNightstand(0.42, 14.42, Math.PI / 2);
  addRug(1.9, 13.35, 2.4, 2.6);
  addWardrobe(4.01, 13.10, -Math.PI / 2, 2.00, 0.60);  // against the keuken divider wall
  addPlant(3.90, 14.55, 1.6, 0.22);
  // Werkplek against the divider wall (x 4.31), long side along the wall so
  // the 1.67 m-wide entry nook stays walkable; south of both door sweeps
  // (slaapk2 door + badkamer-klein door), chair tucked under the desk.
  box(0.60, 0.03, 1.20, TABLE_MAT, 4.01, 0.74, 11.15);
  for (const dx of [-0.55, 0.55]) box(0.03, 0.72, 0.56, BLACK_METAL_MAT, 4.01 + dx, 0.36, 11.15);
  box(0.02, 0.22, 0.34, SCREEN_MAT, 4.22, 1.02, 11.15);
  addBoxObstacle(4.01, 11.15, 0.60, 1.20);
  addChair(3.55, 11.15, Math.PI / 2);
  addCurtains(1.73, 3.40, 15.74, -1, false);

  // === Badkamer klein (x 0.19..2.54, z 9.64..11.41): inloopdouche west,
  // dubbele wastafel north, designradiator south.
  addWalkInShower(0.67, 10.70, 1.15, 10.05, 10.75, 0.67, 9.64, 0, 1);   // screen ends 0.66 m short of the south wall = the entry
  addVanity(1.90, 9.64 + 0.24, 0, 1.20, 2);
  addRadiator(1.92, 11.41 - 0.05, Math.PI, 0.65, 1.5);

  // === Woonkamer — zithoek in de noordstrook (x 5.74..10.52, z 0.21..4.21)
  addRug(8.35, 2.35, 3.2, 2.7);
  addSofa(10.04, 2.35, -Math.PI / 2, 2.40, 0.95);      // against the east wall, facing the TV
  addArmchair(7.45, 1.15, 0.95);
  addCoffeeTable(8.55, 2.35, 0.6, 1.2);
  addTvUnit(5.69 + 0.21, 2.35, Math.PI / 2, 1.8);      // on the slaapkamer-1 party wall
  addFloorLamp(10.15, 0.75);
  addPlant(6.30, 0.75, 1.8, 0.24);
  addCurtains(7.04, 10.53, -0.085, 1, true);

  // === Eethoek tegenover de woonkamerdeur. The strip is 3.48 m wide: table
  // (1.00) + pushed-back chairs (2 x 0.53) leaves 0.71 m on either side, so
  // nothing else may stand beside the chairs — dressoir and bookshelf go
  // north of the table zone (z < 5.37), against the badkamerblok / east wall.
  addDiningTable(8.78, 7.00, 1.00, 2.20);
  addPendant(8.78, 6.50, 1.85);
  box(1.2, 0.78, 0.45, WARDROBE_MAT, 7.04 + 0.225, 0.39, 4.85);
  for (let i = 1; i < 3; i++) box(0.008, 0.70, 0.02, CABINET_DARK_MAT, 7.04 + 0.455, 0.39, 4.85 - 0.6 + i * 0.4);
  addBoxObstacle(7.04 + 0.225, 4.85, 0.45, 1.2);
  box(0.30, 0.34, 0.30, CERAMIC_MAT, 7.27, 0.95, 4.85);
  addBookshelf(10.52 - 0.16, 4.65, -Math.PI / 2, 1.8, 2.1);   // east wall, between sofa and eethoek

  // === Keuken + kookeiland (keukenopstelling D)
  addKitchen();

  // === Zuidelijke zithoek bij de grote schuifpui + keukenbaai
  addRug(9.0, 12.15, 2.4, 2.0);
  addArmchair(8.45, 12.15, Math.PI - 0.35, LINEN2_MAT);
  addArmchair(9.55, 12.15, Math.PI + 0.35, LINEN2_MAT);
  addSideTable(9.0, 11.35);
  addFloorLamp(10.15, 11.55);
  addPlant(10.0, 13.35, 1.5, 0.22);
  // Keukenbaai: the strip east of the column (0.94 m) is the way to the
  // keuken-pui, the strip west of it (0.67 m) a dead end — a plant lives
  // there; a chair does not fit anywhere without blocking the balcony door.
  addPlant(4.70, 15.20, 1.7, 0.24);
  addCurtains(6.77, 10.19, 13.9, -1, true);

  // === Balkons
  addOutdoorFurniture();
}
