import * as THREE from 'three';
import { S } from './state.js';
import { WALL_HEIGHT } from './constants.js';
import {
  MATTRESS_MAT, LINEN_MAT, PILLOW_MAT, BEDFRAME_MAT, SOFA_MAT, TABLE_MAT,
  CHAIR_MAT, COUNTER_MAT, CABINET_MAT, MARBLE_MAT, CERAMIC_MAT, METAL_MAT,
  WARDROBE_MAT,
} from './materials.js';
import { addBoxObstacle, addRotatedBoxObstacle } from './collision.js';

/* ===== FURNITURE HELPERS ===== */
export function addBed(x, z, ry, w, d) {
  // Bed frame (low), mattress on top, pillows + duvet
  const frameH = 0.30;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, frameH, d), BEDFRAME_MAT);
  frame.position.set(x, frameH / 2, z);
  frame.rotation.y = ry;
  S.scene.add(frame);

  const matt = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.18, d - 0.06), MATTRESS_MAT);
  matt.position.set(x, frameH + 0.09, z);
  matt.rotation.y = ry;
  S.scene.add(matt);

  // Duvet (covers bottom 2/3 of mattress)
  const duvet = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.10, 0.06, d * 0.62),
    LINEN_MAT
  );
  // Offset along bed's length (local +z is the foot of bed if ry=0)
  const localDuvetZ = d * 0.13;
  duvet.position.set(
    x + Math.sin(ry) * localDuvetZ,
    frameH + 0.20,
    z + Math.cos(ry) * localDuvetZ
  );
  duvet.rotation.y = ry;
  S.scene.add(duvet);

  // Headboard
  const hbH = 0.45;
  const hb = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.04, hbH, 0.06),
    BEDFRAME_MAT
  );
  const localHbZ = -d / 2 - 0.03;
  hb.position.set(
    x + Math.sin(ry) * localHbZ,
    frameH + hbH / 2,
    z + Math.cos(ry) * localHbZ
  );
  hb.rotation.y = ry;
  S.scene.add(hb);

  // Pillows (2 small for queen+, 1 for single)
  const nPillows = w > 1.3 ? 2 : 1;
  const pillowOffsets = nPillows === 2 ? [-w * 0.22, w * 0.22] : [0];
  for (const po of pillowOffsets) {
    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.34, 0.10, 0.30),
      PILLOW_MAT
    );
    const localPx = po;
    const localPz = -d / 2 + 0.30;
    pillow.position.set(
      x + Math.cos(ry) * localPx + Math.sin(ry) * localPz,
      frameH + 0.18 + 0.05,
      z - Math.sin(ry) * localPx + Math.cos(ry) * localPz
    );
    pillow.rotation.y = ry;
    S.scene.add(pillow);
  }

  // Collision AABB — axis-aligned, computed for the bed's footprint
  addRotatedBoxObstacle(x, z, w, d, ry);
}

export function addSofa(x, z, ry) {
  const w = 2.20, d = 0.95, seatH = 0.45;
  // Base
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, seatH, d), SOFA_MAT);
  base.position.set(x, seatH / 2, z);
  base.rotation.y = ry;
  S.scene.add(base);
  // Back (along the -z local edge)
  const backH = 0.55;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, backH, 0.18), SOFA_MAT);
  const localBz = -d / 2 + 0.09;
  back.position.set(
    x + Math.sin(ry) * localBz,
    seatH + backH / 2,
    z + Math.cos(ry) * localBz
  );
  back.rotation.y = ry;
  S.scene.add(back);
  // Arms
  for (const sgn of [-1, 1]) {
    const armW = 0.18, armH = 0.55;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, d), SOFA_MAT);
    const localAx = sgn * (w / 2 - armW / 2);
    arm.position.set(
      x + Math.cos(ry) * localAx,
      armH / 2 + 0.10,
      z - Math.sin(ry) * localAx
    );
    arm.rotation.y = ry;
    S.scene.add(arm);
  }
  // Cushions on seat
  for (const sgn of [-1, 0, 1]) {
    const cu = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, d - 0.20), PILLOW_MAT);
    const localCx = sgn * 0.66;
    cu.position.set(
      x + Math.cos(ry) * localCx,
      seatH + 0.06,
      z - Math.sin(ry) * localCx
    );
    cu.rotation.y = ry;
    S.scene.add(cu);
  }
  addRotatedBoxObstacle(x, z, w, d, ry);
}

export function addCoffeeTable(x, z) {
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.6), TABLE_MAT);
  top.position.set(x, 0.42, z);
  S.scene.add(top);
  for (const [ox, oz] of [[-0.48, -0.24], [0.48, -0.24], [-0.48, 0.24], [0.48, 0.24]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.40, 0.05), TABLE_MAT);
    leg.position.set(x + ox, 0.20, z + oz);
    S.scene.add(leg);
  }
  addBoxObstacle(x, z, 1.1, 0.6);
}

export function addDiningTable(x, z, w = 1.40, d = 0.85) {
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), TABLE_MAT);
  top.position.set(x, 0.75, z);
  S.scene.add(top);
  for (const [ox, oz] of [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.73, 0.06), TABLE_MAT);
    leg.position.set(x + ox, 0.365, z + oz);
    S.scene.add(leg);
  }
  // Chairs: pairs along each LONG side, one at each short end.
  const chairs = [];
  if (d > w) {                       // long axis north-south
    for (const oz of [-d / 4, d / 4]) {
      chairs.push([x - w / 2 - 0.42, z + oz, Math.PI / 2]);
      chairs.push([x + w / 2 + 0.42, z + oz, -Math.PI / 2]);
    }
    chairs.push([x, z - d / 2 - 0.42, 0]);
    chairs.push([x, z + d / 2 + 0.42, Math.PI]);
  } else {                           // long axis east-west
    for (const ox of [-w / 4, w / 4]) {
      chairs.push([x + ox, z - d / 2 - 0.42, 0]);
      chairs.push([x + ox, z + d / 2 + 0.42, Math.PI]);
    }
    chairs.push([x - w / 2 - 0.42, z, Math.PI / 2]);
    chairs.push([x + w / 2 + 0.42, z, -Math.PI / 2]);
  }
  for (const [cx, cz, cry] of chairs) addChair(cx, cz, cry);
  addBoxObstacle(x, z, w, d);
}

export function addChair(x, z, ry) {
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.04, 0.40), CHAIR_MAT);
  seat.position.set(x, 0.46, z);
  seat.rotation.y = ry;
  S.scene.add(seat);
  // Back
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.45, 0.04), CHAIR_MAT);
  const localBz = -0.18;
  back.position.set(
    x + Math.sin(ry) * localBz,
    0.46 + 0.225,
    z + Math.cos(ry) * localBz
  );
  back.rotation.y = ry;
  S.scene.add(back);
  // Legs
  const legGeo = new THREE.BoxGeometry(0.04, 0.46, 0.04);
  for (const [ox, oz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) {
    const leg = new THREE.Mesh(legGeo, CHAIR_MAT);
    // Rotate offset by ry
    const rx = Math.cos(ry) * ox + Math.sin(ry) * oz;
    const rz = -Math.sin(ry) * ox + Math.cos(ry) * oz;
    leg.position.set(x + rx, 0.23, z + rz);
    leg.rotation.y = ry;
    S.scene.add(leg);
  }
  addBoxObstacle(x, z, 0.45, 0.45);
}

export function addKitchenIsland(x, z, ry, w = 2.115, d = 0.70, style = 'cabinet') {
  if (style === 'stone') {
    // Marble monolith (waterfall edges) like the developer's render
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, 0.90, d), MARBLE_MAT);
    block.position.set(x, 0.45, z);
    block.rotation.y = ry;
    S.scene.add(block);
    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8), METAL_MAT);
    const fox = w * 0.28, foz = 0;
    faucet.position.set(x + Math.cos(ry) * fox + Math.sin(ry) * foz, 1.04,
                        z - Math.sin(ry) * fox + Math.cos(ry) * foz);
    S.scene.add(faucet);
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.34), METAL_MAT);
    const sox = w * 0.28;
    sink.position.set(x + Math.cos(ry) * sox, 0.885, z - Math.sin(ry) * sox);
    sink.rotation.y = ry;
    S.scene.add(sink);
    addRotatedBoxObstacle(x, z, w, d, ry);
    return;
  }
  // Base cabinets
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.85, d), CABINET_MAT);
  base.position.set(x, 0.425, z);
  base.rotation.y = ry;
  S.scene.add(base);
  // Counter top
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.04, d + 0.04), COUNTER_MAT);
  top.position.set(x, 0.87, z);
  top.rotation.y = ry;
  S.scene.add(top);
  // 4 cooktop hobs
  for (let i = 0; i < 4; i++) {
    const ox = (i - 1.5) * (w * 0.18);
    const oz = -d * 0.12;
    const rx = Math.cos(ry) * ox + Math.sin(ry) * oz;
    const rz = -Math.sin(ry) * ox + Math.cos(ry) * oz;
    const hob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.015, 18), METAL_MAT);
    hob.position.set(x + rx, 0.895, z + rz);
    S.scene.add(hob);
  }
  // Faucet
  const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.30, 8), METAL_MAT);
  const fox = w * 0.30;
  const foz = d * 0.20;
  const frx = Math.cos(ry) * fox + Math.sin(ry) * foz;
  const frz = -Math.sin(ry) * fox + Math.cos(ry) * foz;
  faucet.position.set(x + frx, 1.04, z + frz);
  S.scene.add(faucet);
  // Sink (recessed rectangle visible from above)
  const sink = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.30), METAL_MAT);
  const sox = w * 0.30, soz = d * 0.05;
  const srx = Math.cos(ry) * sox + Math.sin(ry) * soz;
  const srz = -Math.sin(ry) * sox + Math.cos(ry) * soz;
  sink.position.set(x + srx, 0.86, z + srz);
  sink.rotation.y = ry;
  S.scene.add(sink);

  addRotatedBoxObstacle(x, z, w, d, ry);
}

export function addBathtub(x, z, ry, w = 1.65, d = 0.75) {
  // Outer tub shell
  const shell = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d), CERAMIC_MAT);
  shell.position.set(x, 0.275, z);
  shell.rotation.y = ry;
  S.scene.add(shell);
  // Inner water-line — a slightly recessed cavity hint
  const cavity = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.12, 0.04, d - 0.16),
    new THREE.MeshStandardMaterial({ color: 0xd6e8eb, roughness: 0.4 })
  );
  cavity.position.set(x, 0.50, z);
  cavity.rotation.y = ry;
  S.scene.add(cavity);
  // Faucet
  const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), METAL_MAT);
  const tox = -w / 2 + 0.10;
  const trx = Math.cos(ry) * tox;
  const trz = -Math.sin(ry) * tox;
  tap.position.set(x + trx, 0.62, z + trz);
  S.scene.add(tap);

  addRotatedBoxObstacle(x, z, w, d, ry);
}

export function addToiletBowl(x, z, ry) {
  // Tank (against the back wall, local -z)
  const tankD = 0.18, tankW = 0.38, tankH = 0.62;
  const localTz = -0.18;
  const tank = new THREE.Mesh(new THREE.BoxGeometry(tankW, tankH, tankD), CERAMIC_MAT);
  tank.position.set(
    x + Math.sin(ry) * localTz,
    tankH / 2,
    z + Math.cos(ry) * localTz
  );
  tank.rotation.y = ry;
  S.scene.add(tank);
  // Bowl
  const bowl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.48), CERAMIC_MAT);
  const localBz = 0.10;
  bowl.position.set(
    x + Math.sin(ry) * localBz,
    0.21,
    z + Math.cos(ry) * localBz
  );
  bowl.rotation.y = ry;
  S.scene.add(bowl);
  addRotatedBoxObstacle(x, z, 0.42, 0.55, ry);
}

export function addSink(x, z, ry, w = 0.7) {
  const vanH = 0.85;
  const van = new THREE.Mesh(new THREE.BoxGeometry(w, vanH, 0.45), CABINET_MAT);
  van.position.set(x, vanH / 2, z);
  van.rotation.y = ry;
  S.scene.add(van);
  const basin = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.08, 0.40), CERAMIC_MAT);
  basin.position.set(x, vanH + 0.02, z);
  basin.rotation.y = ry;
  S.scene.add(basin);
  // Mirror
  const mirror = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.05, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x9bb3bb, roughness: 0.1, metalness: 0.8 })
  );
  const localMz = -0.21;
  mirror.position.set(
    x + Math.sin(ry) * localMz,
    vanH + 0.5,
    z + Math.cos(ry) * localMz
  );
  mirror.rotation.y = ry;
  S.scene.add(mirror);
  addRotatedBoxObstacle(x, z, w, 0.45, ry);
}

export function addWardrobe(x, z, ry, w = 1.6, d = 0.55) {
  const h = 2.20;   // freestanding wardrobe height (not floor-to-ceiling)
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), WARDROBE_MAT);
  body.position.set(x, h / 2, z);
  body.rotation.y = ry;
  S.scene.add(body);
  // Door split lines
  const nDoors = Math.max(2, Math.round(w / 0.55));
  const dw = w / nDoors;
  for (let i = 1; i < nDoors; i++) {
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, h - 0.05, 0.02),
      BEDFRAME_MAT
    );
    const localSx = -w / 2 + i * dw;
    const localSz = d / 2 + 0.005;
    const rx = Math.cos(ry) * localSx + Math.sin(ry) * localSz;
    const rz = -Math.sin(ry) * localSx + Math.cos(ry) * localSz;
    seam.position.set(x + rx, h / 2, z + rz);
    seam.rotation.y = ry;
    S.scene.add(seam);
  }
  addRotatedBoxObstacle(x, z, w, d, ry);
}

export function addShowerStall(x, z, ry, w = 0.9, d = 0.9) {
  // Tray
  const tray = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), CERAMIC_MAT);
  tray.position.set(x, 0.04, z);
  tray.rotation.y = ry;
  S.scene.add(tray);
  // Glass walls (2 visible sides) — facing into room
  const gh = 2.0;
  const wall1 = new THREE.Mesh(
    new THREE.PlaneGeometry(w, gh),
    new THREE.MeshStandardMaterial({ color: 0xc8dde0, transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0, side: THREE.DoubleSide })
  );
  const w1lz = d / 2;
  wall1.position.set(x + Math.sin(ry) * w1lz, gh / 2, z + Math.cos(ry) * w1lz);
  wall1.rotation.y = ry;
  S.scene.add(wall1);
  const wall2 = new THREE.Mesh(
    new THREE.PlaneGeometry(d, gh),
    new THREE.MeshStandardMaterial({ color: 0xc8dde0, transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0, side: THREE.DoubleSide })
  );
  const w2lx = w / 2;
  wall2.position.set(x + Math.cos(ry) * w2lx, gh / 2, z - Math.sin(ry) * w2lx);
  wall2.rotation.y = ry + Math.PI / 2;
  S.scene.add(wall2);

  addBoxObstacle(x, z, w, d);
}

/* Bar stool: round seat on a slim centre column with a disc base. */
export function addBarStool(x, z) {
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 18), BEDFRAME_MAT);
  seat.position.set(x, 0.66, z);
  S.scene.add(seat);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.60, 10), METAL_MAT);
  pole.position.set(x, 0.33, z);
  S.scene.add(pole);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 18), METAL_MAT);
  foot.position.set(x, 0.01, z);
  S.scene.add(foot);
  addBoxObstacle(x, z, 0.34, 0.34);
}

/* Pendant lamp: cord + warm glass shade + a small point light. */
export function addPendant(x, z, y = 2.05) {
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, WALL_HEIGHT - y, 6), METAL_MAT);
  cord.position.set(x, y + (WALL_HEIGHT - y) / 2, z);
  S.scene.add(cord);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, 0.16, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xd9cdb4, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      emissive: 0xffe2b0, emissiveIntensity: 0.5, roughness: 0.2,
    }));
  shade.position.set(x, y, z);
  S.scene.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.030, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
  bulb.position.set(x, y - 0.02, z);
  S.scene.add(bulb);
  const pl = new THREE.PointLight(0xffe2b0, 0.40, 3.5);
  pl.position.set(x, y - 0.10, z);
  S.scene.add(pl);
  S.pointLightInfo.push({ light: pl, baseI: 0.40, disc: bulb });
}

export function placeFurniture() {
  // Furniture positions use apartment.json coords (+X east, +Z south,
  // origin at NW corner of top facade).

  // === Slaapkamer 1 (x 1.92..5.59, z 0.21..4.21 + NW tip)
  // Queen bed against the east wall, head pointing east
  addBed(4.50, 2.00, -Math.PI / 2, 1.60, 2.00);
  // Wardrobe along the south wall, west of the entry alcove opening
  addWardrobe(4.45, 4.00, Math.PI, 2.00, 0.55);

  // === Badkamer (groot) — x 3.86..6.94, z 4.30..7.04 (PDF: bathtub along the
  // north wall, walk-in shower in the NE corner, double washbasin on the south
  // wall — the 1180/1285 mm callouts).
  addBathtub(4.72, 4.72, 0, 1.70, 0.75);
  addShowerStall(6.46, 4.79, -Math.PI / 2, 0.95, 0.92);  // glass on west + south
  addSink(4.50, 6.80, 0, 0.90);
  addSink(5.45, 6.80, 0, 0.90);

  // === Toilet — separate room (x 4.84..6.63, z 7.14..8.07)
  addToiletBowl(5.74, 7.62, Math.PI);

  // === Technische berging (x 0.19..2.46, z 5.71..7.14): WTW unit. The boiler
  // and wasmachine/droger sit in the closets just south of it (z 7.17..7.92).
  const wtw = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.90, 0.65), CABINET_MAT);
  wtw.position.set(1.30, 0.95, 6.20);
  S.scene.add(wtw);
  addBoxObstacle(1.30, 6.20, 0.65, 0.65);
  for (const ax of [1.45, 2.05]) {
    const app = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.85, 0.60), MATTRESS_MAT);
    app.position.set(ax, 0.425, 7.52);
    S.scene.add(app);
    addBoxObstacle(ax, 7.52, 0.60, 0.60);
  }
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 18), MATTRESS_MAT);
  boiler.position.set(0.60, 0.80, 7.52);
  S.scene.add(boiler);
  addBoxObstacle(0.60, 7.52, 0.56, 0.56);

  // === Slaapkamer 2 (x 0.19..4.31, z 11.51..15.41 + entry nook x 2.64..4.31)
  // Double bed against the west wall, head pointing west
  addBed(1.30, 13.20, Math.PI / 2, 1.60, 2.00);
  // Wardrobe against the east wall, south of the bed (clear of the schuifpui)
  addWardrobe(3.98, 14.20, -Math.PI / 2, 1.50, 0.55);
  // Closet in the entry nook ("4k" in the PDF), against the east wall
  addWardrobe(4.00, 10.50, -Math.PI / 2, 1.40, 0.55);

  // === Badkamer klein (x 0.19..2.54, z 9.64..11.41): shower west, basins north.
  addShowerStall(0.70, 10.60, 0, 0.90, 0.90);
  addSink(1.85, 10.00, Math.PI, 0.90);

  // === Woonkamer (L-shape) ===
  // Sofa along the east wall facing west, in the north strip
  addSofa(9.80, 2.20, -Math.PI / 2);
  addCoffeeTable(8.40, 2.20);

  // Dining table: rectangular, long axis along the length of the living room,
  // beside the kitchen island (walking space on both sides).
  addDiningTable(8.35, 12.00, 1.00, 2.20);

  // Keukenopstelling (PDF): counter against the gang wall (x 4.41..6.94,
  // z 9.64..10.28, with the hobs) + the island x 5.41..6.41, z 11.23..13.80 —
  // a stone monolith with bar stools on the dining side, per the developer's
  // render.
  addKitchenIsland(5.68, 9.97, 0, 2.50, 0.62);
  addKitchenIsland(5.91, 12.52, Math.PI / 2, 2.55, 0.95, 'stone');
  addBarStool(6.65, 11.95);
  addBarStool(6.65, 12.52);
  addBarStool(6.65, 13.09);
  // Pendant lamps over the island and the dining table
  addPendant(5.91, 12.10);
  addPendant(5.91, 12.95);
  addPendant(8.35, 11.45);
  addPendant(8.35, 12.55);

  // Side console under the woonkamer NE window (x 5.18..6.98)
  const console_ = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.78, 0.4), CABINET_MAT);
  console_.position.set(6.10, 0.39, 0.55);
  S.scene.add(console_);
  addBoxObstacle(6.10, 0.55, 1.4, 0.4);
}
