import { S } from './state.js';
import { WALL_THICK, PLAYER_R, ENV } from './constants.js';

/* Axis-aligned obstacle that blocks the player. Reuses resolveCollision() via
 * the shared `obstacles` list. */
export function addBoxObstacle(cx, cz, w, d) {
  S.obstacles.push({ cx, cz, hw: w / 2, hd: d / 2 });
}

/* Same as addBoxObstacle but takes a local-frame footprint (w in local x,
 * d in local z) plus a Y rotation, and emits the AABB of the rotated rect.
 * For ry ∈ {0, ±π/2, π} this reduces to swapping w/d; for arbitrary
 * angles it produces the correct enclosing axis-aligned box. */
export function addRotatedBoxObstacle(cx, cz, w, d, ry) {
  const c = Math.abs(Math.cos(ry));
  const s = Math.abs(Math.sin(ry));
  const aabbW = w * c + d * s;
  const aabbD = w * s + d * c;
  S.obstacles.push({ cx, cz, hw: aabbW / 2, hd: aabbD / 2 });
}

/* ===== WALL COLLISION =====
 * Depenetration resolver: take a proposed position and push the player circle
 * out of every wall capsule (centreline segment + half thickness) and obstacle
 * AABB it overlaps. Unlike a boolean veto, this slides smoothly along diagonal
 * walls and recovers a player who somehow ended up inside a wall band. */
export function resolveCollision(px, pz) {
  for (let iter = 0; iter < 3; iter++) {
    let pushed = false;
    for (const w of S.wallSegs) {
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = w.len;
      // Closest point on the wall centreline segment
      let t = ((px - w.x1) * dx + (pz - w.z1) * dz) / (L * L);
      t = Math.max(0, Math.min(1, t));
      const cx = w.x1 + t * dx, cz = w.z1 + t * dz;
      let ox = px - cx, oz = pz - cz;
      const dist = Math.hypot(ox, oz);
      const minDist = (w.t || WALL_THICK) / 2 + PLAYER_R;
      if (dist < minDist) {
        if (dist > 1e-6) { ox /= dist; oz /= dist; }
        else { ox = -dz / L; oz = dx / L; }   // dead centre: push along the wall normal
        px = cx + ox * minDist;
        pz = cz + oz * minDist;
        pushed = true;
      }
    }
    // Axis-aligned obstacles (benches etc.). AABB inflated by PLAYER_R;
    // push out along the axis of least penetration.
    for (const o of S.obstacles) {
      const overX = o.hw + PLAYER_R - Math.abs(px - o.cx);
      const overZ = o.hd + PLAYER_R - Math.abs(pz - o.cz);
      if (overX > 0 && overZ > 0) {
        if (overX < overZ) px += Math.sign(px - o.cx || 1) * overX;
        else               pz += Math.sign(pz - o.cz || 1) * overZ;
        pushed = true;
      }
    }
    // Bounds — apartment + balconies (matches railings at ENV extents). Inside
    // the loop so a clamp that re-penetrates a wall is fixed next iteration.
    px = Math.max(ENV.xMin + PLAYER_R, Math.min(ENV.xMax - PLAYER_R, px));
    pz = Math.max(ENV.zMin + PLAYER_R, Math.min(ENV.zMax - PLAYER_R, pz));
    if (!pushed) break;
  }
  return { x: px, z: pz };
}
