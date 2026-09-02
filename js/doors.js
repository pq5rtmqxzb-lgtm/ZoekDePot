import * as THREE from 'three';
import { S } from './state.js';
import { DOOR_H } from './constants.js';
import { DOOR_LEAF_MAT, ENTRANCE_LEAF_MAT, METAL_MAT, BLACK_METAL_MAT } from './materials.js';

/* ===== DOORS =====
 * Every `kind: 'door'` segment gets a hinged leaf that swings open when the
 * player comes near and falls shut again once they've moved away. The leaf is
 * purely visual — the door span stays a walkable gap in wallSegs, so a door
 * can never trap or block the player.
 *
 * (x1, z1) is the hinge jamb. `open_to: [x, z]` in model.json (read off the
 * door arcs in the sales drawing) pins the side the leaf swings to; without
 * it the leaf swings away from whoever approaches. A leaf never opens into a
 * player standing inside its sweep — it waits until they step back, like a
 * real door would make you do. */

const OPEN_DIST  = 1.8;   // m — start opening when the player is this close
const CLOSE_DIST = 2.4;   // m — close again beyond this (hysteresis, no flutter)
const OPEN_ANGLE = 1.55;  // rad (~89°) fully open — a leaf never pokes into the next wall
const EASE       = 6.0;   // 1/s — exponential approach rate of the swing

export function buildDoorLeaf(g) {
  if (g.leaf === false) return;
  const dx = g.x2 - g.x1, dz = g.z2 - g.z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return;   // too narrow for a real leaf

  // Pivot at the (x1, z1) jamb; local +X runs along the door span.
  const pivot = new THREE.Group();
  pivot.position.set(g.x1, 0, g.z1);
  const base = Math.atan2(-dz, dx);
  pivot.rotation.y = base;

  const entrance = !!g.entrance;
  const leafW = len - 0.06, leafH = DOOR_H - 0.02, leafT = entrance ? 0.054 : 0.04;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, leafT),
                              entrance ? ENTRANCE_LEAF_MAT : DOOR_LEAF_MAT);
  leaf.userData.noMeasure = true;   // a swinging surface gives confusing numbers
  leaf.position.set(0.03 + leafW / 2, 0.01 + leafH / 2, 0);
  pivot.add(leaf);

  // Deurkruk — one bar through the leaf so it reads from both sides
  // (closet fronts get a small knob instead).
  if (g.closet) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, leafT + 0.05, 10), METAL_MAT);
    knob.rotation.x = Math.PI / 2;
    knob.userData.noMeasure = true;
    knob.position.set(0.03 + leafW - 0.06, 1.05, 0);
    pivot.add(knob);
  } else {
    for (const s of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.018, 0.018), entrance ? BLACK_METAL_MAT : METAL_MAT);
      handle.userData.noMeasure = true;
      handle.position.set(0.03 + leafW - 0.11, 1.05, s * (leafT / 2 + 0.03));
      pivot.add(handle);
      const rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 12), entrance ? BLACK_METAL_MAT : METAL_MAT);
      rosette.rotation.x = Math.PI / 2;
      rosette.userData.noMeasure = true;
      rosette.position.set(0.03 + leafW - 0.06, 1.05, s * (leafT / 2 + 0.004));
      pivot.add(rosette);
    }
  }
  if (entrance) {   // spion + cilinderslot
    const spy = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, leafT + 0.01, 10), BLACK_METAL_MAT);
    spy.rotation.x = Math.PI / 2;
    spy.userData.noMeasure = true;
    spy.position.set(0.03 + leafW / 2, 1.50, 0);
    pivot.add(spy);
  }

  // Fixed swing side from the drawing: sign(cross(door dir, target - hinge))
  // is the side `open_to` lies on; the leaf must rotate toward it.
  let fixedSwing = 0;
  if (g.open_to) {
    const [tx, tz] = g.open_to;
    fixedSwing = -Math.sign(dx * (tz - g.z1) - dz * (tx - g.x1)) || 0;
  }
  if (g.swing) fixedSwing = g.swing;

  S.scene.add(pivot);
  S.doors.push({ pivot, base, seg: g, angle: 0, target: 0, fixedSwing, len });
}

export function updateDoors(dt) {
  if (!S.doors.length) return;
  const px = S.playerPos.x, pz = S.playerPos.z;
  const k = 1 - Math.exp(-EASE * dt);
  for (const d of S.doors) {
    const g = d.seg;
    const dx = g.x2 - g.x1, dz = g.z2 - g.z1;
    const L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((px - g.x1) * dx + (pz - g.z1) * dz) / L2));
    const dist = Math.hypot(px - (g.x1 + t * dx), pz - (g.z1 + t * dz));
    // Which side of the door plane is the player on? (+1 = the side a
    // positive swing does NOT go to — see the derivation in the old code:
    // positive rotation swings the leaf away from a player with side +1.)
    const side = Math.sign(dx * (pz - g.z1) - dz * (px - g.x1)) || 1;

    // Closet fronts only open when you come right up to them.
    const openDist = g.closet ? 1.0 : OPEN_DIST, closeDist = g.closet ? 1.4 : CLOSE_DIST;
    if (d.target === 0 && dist < openDist) {
      const swing = d.fixedSwing || side;
      // Don't open into a player standing inside the sweep of the leaf: in
      // the swept sector (closed direction -> open direction) and closer to
      // the hinge than the leaf's reach plus their shoulder width.
      const hingeDist = Math.hypot(px - g.x1, pz - g.z1);
      let blocked = false;
      if (hingeDist < d.len + 0.22) {
        // rotation.y > 0 turns local +X toward -Z, i.e. DEcreases atan2(z, x)
        const a0 = Math.atan2(dz, dx);
        let rel = Math.atan2(pz - g.z1, px - g.x1) - a0;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        blocked = swing > 0 ? (rel <= 0.12 && rel >= -OPEN_ANGLE - 0.12)
                            : (rel >= -0.12 && rel <= OPEN_ANGLE + 0.12);
      }
      if (!blocked) d.target = swing * OPEN_ANGLE;
    } else if (d.target !== 0 && dist > closeDist) {
      d.target = 0;
    }

    d.angle += (d.target - d.angle) * k;
    d.pivot.rotation.y = d.base + d.angle;
  }
}
