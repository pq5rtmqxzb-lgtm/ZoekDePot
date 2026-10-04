// 2D collision in the model.json plan frame (x east, z south, metres): the
// walker is a circle; walls are capsules (segment + radius) and furniture is
// rotated boxes, both from v2/build/collision.json (export_collision.py).

export interface Wall { x1: number; z1: number; x2: number; z2: number; r: number; kind: string }
export interface Box { id: string; x: number; z: number; w: number; d: number; rot: number }
export interface Room { id: string; name: string; rects: { x1: number; z1: number; x2: number; z2: number }[]; polys: number[][][] }
export interface CollisionData { walls: Wall[]; boxes: Box[]; rooms: Room[]; spawn: { x: number; z: number; yaw: number } }

/** Push a circle at (x, z) with radius `r` out of every wall and box.
 * A few relaxation passes make it slide along corners instead of sticking. */
export function resolve(data: CollisionData, x: number, z: number, r: number): [number, number] {
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const w of data.walls) {
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
      const L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / L2));
      const px = w.x1 + dx * t, pz = w.z1 + dz * t;
      const ox = x - px, oz = z - pz;
      const d = Math.hypot(ox, oz), min = w.r + r;
      if (d < min) {
        const k = d > 1e-6 ? (min - d) / d : 0;
        if (d > 1e-6) { x += ox * k; z += oz * k; } else { x += min; }
        moved = true;
      }
    }
    for (const b of data.boxes) {
      // into the box frame (rot = degrees, same convention as furniture.json)
      const a = (b.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const lx = c * (x - b.x) - s * (z - b.z);
      const lz = s * (x - b.x) + c * (z - b.z);
      const hx = b.w / 2, hz = b.d / 2;
      const cx = Math.max(-hx, Math.min(hx, lx)), cz = Math.max(-hz, Math.min(hz, lz));
      let ox = lx - cx, oz = lz - cz;
      let d = Math.hypot(ox, oz);
      if (d < r) {
        if (d < 1e-6) {               // centre inside the box: leave by the nearest side
          const ex = hx - Math.abs(lx), ez = hz - Math.abs(lz);
          if (ex < ez) { ox = Math.sign(lx) || 1; oz = 0; d = 0; } else { ox = 0; oz = Math.sign(lz) || 1; d = 0; }
          const push = (ex < ez ? ex : ez) + r;
          const nlx = lx + ox * push, nlz = lz + oz * push;
          x = b.x + c * nlx + s * nlz;
          z = b.z - s * nlx + c * nlz;
        } else {
          const k = (r - d) / d;
          const nlx = lx + ox * k, nlz = lz + oz * k;
          x = b.x + c * nlx + s * nlz;
          z = b.z - s * nlx + c * nlz;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [x, z];
}

function inPoly(x: number, z: number, pts: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** First room containing the point (enclosed rooms are listed first). */
export function roomAt(rooms: Room[], x: number, z: number): Room | null {
  for (const r of rooms) {
    if (r.rects.some((q) => x >= q.x1 && x <= q.x2 && z >= q.z1 && z <= q.z2)) return r;
    if (r.polys.some((p) => inPoly(x, z, p))) return r;
  }
  return null;
}
