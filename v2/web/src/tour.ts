// Guided tour ("Rondleiding"): the camera walks by itself from room to room,
// stops, looks around slowly and names the room — for visitors who find
// steering through a 3D world hard. Only the stops are written by hand; the
// walking paths between them are found on the same collision data the
// walker uses (A* on a grid, kept to the middle of corridors and doors, then
// straightened and rounded), so they follow a changed furniture layout.
import { roomAt, type CollisionData } from "./collision";

export interface Stop {
  title: string;
  at: [number, number];      // where to stand (plan frame: x east, z south)
  look: [number, number];    // the point to face
  pitch?: number;            // degrees, negative = down
  dwell?: number;            // seconds
}

export const STOPS: Stop[] = [
  { title: "De hal", at: [1.3, 8.75], look: [6.9, 8.75] },
  { title: "De tweede badkamer", at: [3.25, 10.75], look: [0.9, 10.75] },
  { title: "Slaapkamer 2", at: [3.0, 11.95], look: [1.2, 13.4] },
  { title: "Slaapkamer 1", at: [3.4, 3.35], look: [0.9, 2.0], pitch: -10 },
  { title: "De badkamer", at: [4.4, 5.6], look: [6.3, 5.3], pitch: -10 },
  { title: "De woonkamer", at: [8.0, 5.6], look: [9.0, 1.8] },
  { title: "De eethoek", at: [10.1, 9.8], look: [8.0, 13.6] },
  { title: "De keuken", at: [7.3, 13.4], look: [5.0, 10.4], pitch: -12 },
  { title: "Het grote balkon", at: [7.3, 14.95], look: [9.3, 17.6] },
];

const CELL = 0.08;           // A* grid, metres
const MIN_CLEAR = 0.3;       // walkable: this far from every wall and piece (walker radius 0.25)
const LOS_CLEAR = 0.34;      // straightened segments keep a little more room
const SPEED = 0.8;           // m/s, an unhurried walk
const LOOK_AHEAD = 1.2;      // m: walking, the camera faces the path this far ahead
const PAN = (22 * Math.PI) / 180, PAN_PERIOD = 12;   // the slow look around at a stop
const WALK_PITCH = -5, STOP_PITCH = -7;              // degrees

type P = [number, number];

/** Distance from (x, z) to the nearest wall surface or furniture box. */
export function clearance(data: CollisionData, x: number, z: number): number {
  let best = Infinity;
  for (const w of data.walls) {
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
    const L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / L2));
    best = Math.min(best, Math.hypot(x - w.x1 - dx * t, z - w.z1 - dz * t) - w.r);
  }
  for (const b of data.boxes) {
    const a = (b.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const lx = c * (x - b.x) - s * (z - b.z), lz = s * (x - b.x) + c * (z - b.z);
    const ox = Math.abs(lx) - b.w / 2, oz = Math.abs(lz) - b.d / 2;
    best = Math.min(best, ox > 0 || oz > 0 ? Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) : Math.max(ox, oz));
  }
  return best;
}

/** Inside the flat or a balcony? Door thresholds lie in the small gaps between
 * room outlines, so a point a few centimetres from a room counts too. */
function inside(data: CollisionData, x: number, z: number): boolean {
  const e = 0.15;
  return [[0, 0], [e, 0], [-e, 0], [0, e], [0, -e]].some(([dx, dz]) => roomAt(data.rooms, x + dx, z + dz));
}

/** Walkable grid over the flat: clearance per cell (-1 outside every room). */
class Grid {
  x0: number; z0: number; nx: number; nz: number; clear: Float32Array;
  constructor(private data: CollisionData) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const w of data.walls) {
      x0 = Math.min(x0, w.x1, w.x2); x1 = Math.max(x1, w.x1, w.x2);
      z0 = Math.min(z0, w.z1, w.z2); z1 = Math.max(z1, w.z1, w.z2);
    }
    this.x0 = x0; this.z0 = z0;
    this.nx = Math.ceil((x1 - x0) / CELL) + 1;
    this.nz = Math.ceil((z1 - z0) / CELL) + 1;
    this.clear = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const [x, z] = this.pos(j * this.nx + i);
        this.clear[j * this.nx + i] = inside(data, x, z) ? clearance(data, x, z) : -1;
      }
    }
  }
  pos(c: number): P { return [this.x0 + (c % this.nx) * CELL, this.z0 + Math.floor(c / this.nx) * CELL]; }
  /** The walkable cell nearest to (x, z). */
  cell(x: number, z: number): number {
    const ci = Math.round((x - this.x0) / CELL), cj = Math.round((z - this.z0) / CELL);
    let best = -1, bd = Infinity;
    for (let j = Math.max(0, cj - 8); j <= Math.min(this.nz - 1, cj + 8); j++) {
      for (let i = Math.max(0, ci - 8); i <= Math.min(this.nx - 1, ci + 8); i++) {
        const c = j * this.nx + i, d = (i - ci) ** 2 + (j - cj) ** 2;
        if (this.clear[c] >= MIN_CLEAR && d < bd) { bd = d; best = c; }
      }
    }
    return best;
  }

  /** A* from a to b; steps near walls cost extra, so paths keep to the middle. */
  search(a: P, b: P): P[] | null {
    const start = this.cell(...a), goal = this.cell(...b);
    if (start < 0 || goal < 0) return null;
    const n = this.nx * this.nz, g = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    const [gx, gz] = this.pos(goal);
    const h = (c: number) => { const [x, z] = this.pos(c); return Math.hypot(x - gx, z - gz); };
    const heap = new Heap();
    g[start] = 0;
    heap.push(start, h(start));
    while (heap.size) {
      const c = heap.pop();
      if (done[c]) continue;             // a stale heap entry
      done[c] = 1;
      if (c === goal) break;
      const ci = c % this.nx, cj = Math.floor(c / this.nx);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const nc = j * this.nx + i, cl = this.clear[nc];
          if (cl < MIN_CLEAR || done[nc]) continue;
          const cost = CELL * Math.hypot(di, dj) * (1 + 3 * Math.max(0, 0.8 - cl));
          if (g[c] + cost < g[nc]) {
            g[nc] = g[c] + cost;
            from[nc] = c;
            heap.push(nc, g[nc] + h(nc));
          }
        }
      }
    }
    if (from[goal] < 0 && goal !== start) return null;
    const cells: P[] = [];
    for (let c = goal; c >= 0; c = from[c]) cells.push(this.pos(c));
    cells.reverse();
    return [a, ...cells.slice(1, -1), b];
  }

  /** Is the straight segment a-b at least `min` away from everything (and inside the flat)? */
  free(a: P, b: P, min: number): boolean {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
      if (clearance(this.data, x, z) < min || !inside(this.data, x, z)) return false;
    }
    return true;
  }

  /** Straighten (skip points while the shortcut stays clear), then round the corners. */
  smooth(path: P[]): P[] {
    const out: P[] = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = i + 1;
      while (j + 1 < path.length && this.free(path[i], path[j + 1], LOS_CLEAR)) j++;
      out.push(path[j]);
      i = j;
    }
    let pts = out;
    for (let it = 0; it < 3; it++) {           // Chaikin, keeping a corner whose cut is not clear
      const next: P[] = [pts[0]];
      for (let k = 1; k < pts.length - 1; k++) {
        const [p, q, r] = [pts[k - 1], pts[k], pts[k + 1]];
        const u: P = [q[0] + (p[0] - q[0]) * 0.25, q[1] + (p[1] - q[1]) * 0.25];
        const v: P = [q[0] + (r[0] - q[0]) * 0.25, q[1] + (r[1] - q[1]) * 0.25];
        if (this.free(u, v, MIN_CLEAR)) next.push(u, v); else next.push(q);
      }
      next.push(pts[pts.length - 1]);
      pts = next;
    }
    return pts;
  }
}

class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size(): number { return this.items.length; }
  push(item: number, key: number): void {
    const a = this.items, k = this.keys;
    let i = a.length;
    a.push(item); k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]]; [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items, k = this.keys, top = a[0];
    const lastItem = a.pop()!, lastKey = k.pop()!;
    if (a.length) {
      a[0] = lastItem; k[0] = lastKey;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}

/** A polyline walked by arc length. */
class Path {
  readonly length: number;
  private cum: number[] = [0];
  constructor(readonly pts: P[]) {
    for (let i = 1; i < pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    this.length = this.cum[this.cum.length - 1];
  }
  at(s: number): P {
    s = Math.max(0, Math.min(this.length, s));
    let i = 1;
    while (i < this.pts.length - 1 && this.cum[i] < s) i++;
    const seg = this.cum[i] - this.cum[i - 1] || 1, t = (s - this.cum[i - 1]) / seg;
    const a = this.pts[i - 1], b = this.pts[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
}

/** three.js yaw (rotation.y; 0 = north, -z) that looks from a towards b. */
const yawTo = (a: P, b: P) => Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const rad = (d: number) => (d * Math.PI) / 180;

export interface Pose { x: number; z: number; yaw: number; pitch: number }

/** Plans the walk between every pair of consecutive stops; legs[i] ends at stop i + 1. */
export function planTour(data: CollisionData, stops: Stop[] = STOPS): { legs: P[][]; found: boolean[] } {
  const grid = new Grid(data);
  const legs: P[][] = [], found: boolean[] = [];
  for (let i = 1; i < stops.length; i++) {
    const raw = grid.search(stops[i - 1].at, stops[i].at);
    found.push(raw !== null);
    legs.push(raw ? grid.smooth(raw) : [stops[i - 1].at, stops[i].at]);
  }
  return { legs, found };
}

export class Tour {
  active = false;
  paused = false;
  index = 0;                       // the stop being walked to / looked at
  phase: "walk" | "dwell" = "dwell";
  onChange: () => void = () => {};
  onEnd: () => void = () => {};
  private legs: Path[] | null = null;
  private s = 0;                   // metres along the current leg
  private t = 0;                   // seconds into the current stop
  private pose: Pose = { x: 0, z: 0, yaw: 0, pitch: 0 };

  constructor(private data: CollisionData, readonly stops: Stop[] = STOPS) {}

  /** Plans the walks (well under a second; done once). */
  prepare(): void {
    this.legs ??= planTour(this.data, this.stops).legs.map((l) => new Path(l));
  }

  /** Takes over the camera at its current pose; follow with jump(0). */
  start(from: Pose): void {
    this.prepare();
    this.pose = { ...from };
    this.active = true;
    this.paused = false;
    this.index = 0;
    this.phase = "dwell";
    this.t = 0;
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.onChange();
  }

  /** Go straight to a stop (Vorige / Volgende); snap: face its view at once (behind a fade). */
  jump(i: number, snap = true): void {
    if (!this.active) return;
    this.index = Math.max(0, Math.min(this.stops.length - 1, i));
    const st = this.stops[this.index];
    this.pose.x = st.at[0];
    this.pose.z = st.at[1];
    if (snap) {
      this.pose.yaw = yawTo(st.at, st.look);
      this.pose.pitch = rad(st.pitch ?? STOP_PITCH);
    }
    this.phase = "dwell";
    this.t = 0;
    this.onChange();
  }

  setPaused(p: boolean): void { this.paused = p; this.onChange(); }

  /** Advances by dt seconds; returns the camera pose. */
  update(dt: number): Pose {
    const pose = this.pose;
    if (!this.active || this.paused) return pose;
    const st = this.stops[this.index];
    const lookYaw = yawTo(st.at, st.look);
    let yawTarget: number, pitchTarget: number;
    if (this.phase === "walk") {
      const path = this.legs![this.index - 1];
      // ease in and out: slow start, slow arrival
      const v = SPEED * Math.max(0.2, Math.min(1, (this.s + 0.3) / 1.0, (path.length - this.s + 0.1) / 1.0));
      this.s = Math.min(path.length, this.s + v * dt);
      [pose.x, pose.z] = path.at(this.s);
      const left = path.length - this.s;
      const ahead = path.at(this.s + LOOK_AHEAD);
      const walkYaw = left > 0.05 ? yawTo([pose.x, pose.z], ahead) : lookYaw;
      const w = Math.max(0, Math.min(1, 1 - left / 1.5));      // turn to the view while arriving
      yawTarget = walkYaw + wrap(lookYaw - walkYaw) * w;
      pitchTarget = rad(WALK_PITCH);
      if (left <= 1e-3) { this.phase = "dwell"; this.t = 0; this.onChange(); }
    } else {
      this.t += dt;
      const dwell = st.dwell ?? PAN_PERIOD;
      // a slow look to the left, to the right and back to the middle
      yawTarget = lookYaw + PAN * Math.sin((2 * Math.PI * Math.min(this.t, dwell)) / PAN_PERIOD);
      pitchTarget = rad(st.pitch ?? STOP_PITCH);
      if (this.t >= dwell) {
        if (this.index + 1 < this.stops.length) {
          this.index++;
          this.phase = "walk";
          this.s = 0;
          this.onChange();
        } else {
          this.active = false;
          this.onChange();
          this.onEnd();
        }
      }
    }
    // turn smoothly and never fast (at most ~50°/s)
    const k = 1 - Math.exp(-dt * 2.5), maxTurn = 0.9 * dt;
    pose.yaw += Math.max(-maxTurn, Math.min(maxTurn, wrap(yawTarget - pose.yaw) * k));
    pose.pitch += (pitchTarget - pose.pitch) * k;
    return pose;
  }
}
