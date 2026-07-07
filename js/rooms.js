import { S } from './state.js';

/* --- room lookup ----------------------------------------------------- */
// A wall belongs to a room if its midpoint sits on (near) one of that room's
// floor-rect edges and within the rect's extent. Diagonal alcove walls that
// match no axis-aligned edge simply keep the default colour.
export function segOnRectEdge(seg, rect, tol = 0.26) {
  const mx = (seg.x1 + seg.x2) / 2, mz = (seg.z1 + seg.z2) / 2;
  const xlo = Math.min(rect.x1, rect.x2), xhi = Math.max(rect.x1, rect.x2);
  const zlo = Math.min(rect.z1, rect.z2), zhi = Math.max(rect.z1, rect.z2);
  if (mx < xlo - tol || mx > xhi + tol || mz < zlo - tol || mz > zhi + tol) return false;
  const d = Math.min(Math.abs(mx - xlo), Math.abs(mx - xhi),
                     Math.abs(mz - zlo), Math.abs(mz - zhi));
  return d < tol;
}

// Is the wall segment's midpoint within tol of any edge of the polygon?
export function segOnPolyEdge(seg, pts, tol = 0.26) {
  const mx = (seg.x1 + seg.x2) / 2, mz = (seg.z1 + seg.z2) / 2;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz;
    if (L2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((mx - ax) * dx + (mz - az) * dz) / L2));
    const px = ax + t * dx, pz = az + t * dz;
    if (Math.hypot(mx - px, mz - pz) < tol) return true;
  }
  return false;
}

export function rectArea(r) { return Math.abs((r.x2 - r.x1) * (r.z2 - r.z1)); }

export function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    s += x1 * z2 - x2 * z1;
  }
  return Math.abs(s) / 2;
}

export function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Which room is the point in? Prefer the smallest matching shape so an
// enclosed room (toilet, en-suite) wins over the larger room around it.
export function roomAt(x, z) {
  let best = null, bestA = Infinity;
  for (const room of S.rooms) {
    for (const r of room.rects) {
      const xlo = Math.min(r.x1, r.x2), xhi = Math.max(r.x1, r.x2);
      const zlo = Math.min(r.z1, r.z2), zhi = Math.max(r.z1, r.z2);
      if (x >= xlo && x <= xhi && z >= zlo && z <= zhi) {
        const a = rectArea(r);
        if (a < bestA) { bestA = a; best = room; }
      }
    }
    for (const p of room.polys) {
      if (pointInPoly(x, z, p)) {
        const a = polyArea(p);
        if (a < bestA) { bestA = a; best = room; }
      }
    }
  }
  return best;
}

export function editTarget() { return S.currentRoom || S.lastRoom || S.rooms.find(r => r.id === 'woonkamer'); }
