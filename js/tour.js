import { S } from './state.js';
import { ENV, WALL_THICK, PLAYER_R, FURN_R, MOVE_SPEED } from './constants.js';
import { showToast } from './toast.js';
import { cancelWalkTarget } from './walk.js';
import { toggleDesignPanel } from './panel.js';
import { toggleMeasure } from './measure.js';

/* ===== RONDLEIDING (guided tour) =====
 * For people who would rather not steer themselves: one tap and the camera
 * strolls a pre-planned route through every room at a calm pace, glancing
 * left and right while walking and turning a slow full circle at each stop.
 *
 * The route is a list of STOPS (a spot in each room). The path between two
 * stops is found at runtime on a walkability grid built from the same wall
 * capsules + furniture boxes resolveCollision() uses, so a furniture change
 * never leaves the tour walking into a wardrobe — it simply routes around it
 * (or skips a stop it can no longer reach, with a toast).
 *
 * Movement is driven in WORLD space (S.tourMove), independent of where the
 * camera looks, so the "kijk om je heen" sway never steers the walk. Any
 * manual movement (WASD, joystick, tap-to-walk, minimap jump) stops the tour;
 * looking around by hand is allowed and merely deflects the camera for a
 * moment before the tour eases it back. */

const TOUR_SPEED   = 0.42;   // × MOVE_SPEED — an unhurried ~1.25 m/s
const TURN_SPEED   = 0.55;   // rad/s — the slow look-around at a stop
const SWAY_AMP     = 0.55;   // rad — how far the head glances left/right while walking
const SWAY_FREQ    = 0.75;   // rad/s — one glance cycle every ~8 s
const YAW_EASE     = 2.2;    // 1/s — how quickly the camera follows the tour's heading
const PITCH_AMP    = 0.10;   // rad — gentle nod while turning at a stop
const ARRIVE       = 0.22;   // m — waypoint reached
const STUCK_T      = 1.6;    // s without progress → replan, then skip
const GRID_RES     = 0.06;   // m — planning grid cell
const PLAN_MARGIN  = 0.10;   // m — extra clearance so the walk keeps off the walls

/* The route. `pause` scales the look-around: 1 = a full slow circle,
 * 0.35 = a short glance (small rooms, the doorstep). */
const STOPS = [
  { room: 'gang',      name: 'Gang (bij de voordeur)',  x: 1.35, z: 8.50, pause: 0.35 },
  { room: 'slaapk1',   name: 'Slaapkamer 1',            x: 3.00, z: 2.50 },
  { room: 'balkon_n',  name: 'Balkon (noord)',          x: 2.20, z: -0.65, pause: 0.7 },
  { room: 'badkamer',  name: 'Badkamer',                x: 4.50, z: 5.80, pause: 0.7 },
  { room: 'toilet',    name: 'Toilet',                  x: 5.50, z: 7.80, pause: 0.35 },
  { room: 'woonkamer', name: 'Woonkamer (zithoek)',     x: 8.50, z: 3.30 },
  { room: 'woonkamer', name: 'Eettafel',                x: 7.50, z: 7.00, pause: 0.7 },
  { room: 'woonkamer', name: 'Keuken',                  x: 5.90, z: 10.70 },
  { room: 'woonkamer', name: 'Woonkamer (zuid)',        x: 9.00, z: 13.20 },
  { room: 'balkon_z',  name: 'Balkon (zuid)',           x: 8.50, z: 16.50, pause: 0.7 },
  { room: 'slaapk2',   name: 'Slaapkamer 2',            x: 2.80, z: 13.30 },
  { room: 'badkklein', name: 'Badkamer (klein)',        x: 1.90, z: 10.70, pause: 0.7 },
  { room: 'gang',      name: 'Terug bij de voordeur',   x: 1.35, z: 8.50, pause: 0.35 },
];

/* ---- walkability grid + path search ---------------------------------- */
let grid = null;   // { nx, nz, blocked: Uint8Array, key }

function gridKey() {
  return `${S.wallSegs.length}|${S.obstacles.length}|${S.furnitureCollision}`;
}

function buildGrid(margin) {
  const nx = Math.round((ENV.xMax - ENV.xMin) / GRID_RES) + 1;
  const nz = Math.round((ENV.zMax - ENV.zMin) / GRID_RES) + 1;
  const blocked = new Uint8Array(nx * nz);
  const wallR = PLAYER_R + margin, furnR = FURN_R + margin;
  // Pre-square the wall data once; the inner loop runs ~70k × ~200 times.
  const walls = S.wallSegs.map(w => {
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
    return { x1: w.x1, z1: w.z1, dx, dz, L2: dx * dx + dz * dz, r: (w.t || WALL_THICK) / 2 + wallR,
             xlo: Math.min(w.x1, w.x2) - 1, xhi: Math.max(w.x1, w.x2) + 1,
             zlo: Math.min(w.z1, w.z2) - 1, zhi: Math.max(w.z1, w.z2) + 1 };
  });
  const obs = S.furnitureCollision ? S.obstacles : [];
  for (let i = 0; i < nx; i++) {
    const px = ENV.xMin + i * GRID_RES;
    for (let j = 0; j < nz; j++) {
      const pz = ENV.zMin + j * GRID_RES;
      let b = px < ENV.xMin + wallR || px > ENV.xMax - wallR ||
              pz < ENV.zMin + wallR || pz > ENV.zMax - wallR;
      for (let k = 0; !b && k < walls.length; k++) {
        const w = walls[k];
        if (px < w.xlo || px > w.xhi || pz < w.zlo || pz > w.zhi) continue;
        if (w.L2 < 1e-9) continue;
        const t = Math.max(0, Math.min(1, ((px - w.x1) * w.dx + (pz - w.z1) * w.dz) / w.L2));
        const ex = px - (w.x1 + t * w.dx), ez = pz - (w.z1 + t * w.dz);
        if (ex * ex + ez * ez < w.r * w.r) b = true;
      }
      for (let k = 0; !b && k < obs.length; k++) {
        const o = obs[k];
        if (Math.abs(px - o.cx) < o.hw + furnR && Math.abs(pz - o.cz) < o.hd + furnR) b = true;
      }
      blocked[i * nz + j] = b ? 1 : 0;
    }
  }
  return { nx, nz, blocked, margin, key: gridKey() };
}

function ensureGrid(margin) {
  if (!grid || grid.margin !== margin || grid.key !== gridKey()) grid = buildGrid(margin);
  return grid;
}

const toCell = (x, z) => [Math.round((x - ENV.xMin) / GRID_RES), Math.round((z - ENV.zMin) / GRID_RES)];
const toWorld = (i, j) => ({ x: ENV.xMin + i * GRID_RES, z: ENV.zMin + j * GRID_RES });

/* Nearest free cell to (i, j) within a few cells — the player may stand a
 * hair inside the inflated margin band after sliding along a wall. */
function nearestFree(g, i, j, span = 8) {
  let best = null, bestD = Infinity;
  for (let a = Math.max(0, i - span); a <= Math.min(g.nx - 1, i + span); a++) {
    for (let b = Math.max(0, j - span); b <= Math.min(g.nz - 1, j + span); b++) {
      if (g.blocked[a * g.nz + b]) continue;
      const d = (a - i) * (a - i) + (b - j) * (b - j);
      if (d < bestD) { bestD = d; best = [a, b]; }
    }
  }
  return best;
}

/* 8-neighbour BFS from A to B; returns cell path [[i,j], …] or null. */
function bfs(g, a, b) {
  const { nx, nz, blocked } = g;
  const start = a[0] * nz + a[1], goal = b[0] * nz + b[1];
  if (start === goal) return [a];
  const prev = new Int32Array(nx * nz).fill(-1);
  prev[start] = start;
  let q = [start];
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (q.length) {
    const next = [];
    for (const c of q) {
      const i = (c / nz) | 0, j = c % nz;
      for (const [di, dj] of N) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const n = ni * nz + nj;
        if (blocked[n] || prev[n] !== -1) continue;
        // No cutting corners diagonally past a blocked orthogonal neighbour.
        if (di && dj && (blocked[(i + di) * nz + j] || blocked[i * nz + j + dj])) continue;
        prev[n] = c;
        if (n === goal) {
          const path = [];
          for (let cur = n; cur !== start; cur = prev[cur]) path.push([(cur / nz) | 0, cur % nz]);
          path.push(a);
          return path.reverse();
        }
        next.push(n);
      }
    }
    q = next;
  }
  return null;
}

/* Straight line between two cells free of blocked cells? (sampled) */
function lineFree(g, a, b) {
  const di = b[0] - a[0], dj = b[1] - a[1];
  const steps = Math.max(Math.abs(di), Math.abs(dj)) * 2;
  for (let s = 0; s <= steps; s++) {
    const i = Math.round(a[0] + di * s / steps), j = Math.round(a[1] + dj * s / steps);
    if (g.blocked[i * g.nz + j]) return false;
  }
  return true;
}

/* String-pulling: keep only the corners the walk actually needs. */
function simplify(g, path) {
  if (path.length < 3) return path;
  const out = [path[0]];
  let anchor = 0;
  for (let k = 2; k < path.length; k++) {
    if (!lineFree(g, path[anchor], path[k])) { out.push(path[k - 1]); anchor = k - 1; }
  }
  out.push(path[path.length - 1]);
  return out;
}

/* Plan a walk from (x,z) to (tx,tz). Tries with a comfort margin first,
 * then with the exact collision radii. Returns world waypoints or null. */
export function planPath(x, z, tx, tz) {
  for (const margin of [PLAN_MARGIN, 0]) {
    const g = ensureGrid(margin);
    const a = nearestFree(g, ...toCell(x, z)), b = nearestFree(g, ...toCell(tx, tz));
    if (!a || !b) continue;
    const cells = bfs(g, a, b);
    if (!cells) continue;
    const pts = simplify(g, cells).map(([i, j]) => toWorld(i, j));
    pts[pts.length - 1] = { x: tx, z: tz };   // land on the exact stop
    return pts;
  }
  return null;
}

/* ---- tour state machine ---------------------------------------------- */
const T = S.tour;   // { on, stop, phase, ... } lives in state.js

function els() {
  return {
    btn: document.getElementById('tourToggle'),
    bar: document.getElementById('tourBar'),
    txt: document.getElementById('tourText'),
  };
}

function refreshUi() {
  const { btn, bar, txt } = els();
  if (btn) {
    btn.classList.toggle('active', T.on);
    btn.textContent = T.on ? 'Stop' : 'Rondleiding';
    btn.setAttribute('aria-label', T.on ? 'Rondleiding stoppen' : 'Rondleiding starten');
  }
  if (bar) bar.classList.toggle('show', T.on);
  if (txt && T.on) {
    const s = STOPS[T.stop];
    const what = T.phase === 'walk' ? `Op weg naar ${s.name}` : s.name;
    txt.textContent = `${what} · ${T.stop + 1}/${STOPS.length}`;
  }
}

export function tourOn() { return T.on; }

/* Start (or resume after an interruption) the tour. */
export function startTour() {
  if (T.on) return;
  toggleDesignPanel(false);
  toggleMeasure(false);
  cancelWalkTarget();
  if (document.exitPointerLock) document.exitPointerLock();

  // Resume where we left off unless the last run finished (or never began).
  if (T.done || T.stop >= STOPS.length) T.stop = 0;
  T.done = false;
  T.on = true;
  T.total = STOPS.length;
  T.skipped = [];
  T.swayT = 0;
  T.headYaw = S.yaw;
  T.planned = dryRun();
  beginLeg();
  refreshUi();
  showToast(S.isMobile ? 'Rondleiding gestart · tik op Stop om zelf te lopen'
                       : 'Rondleiding gestart · een toets of Stop = zelf lopen');
}

export function stopTour(msg) {
  if (!T.on) return;
  T.on = false;
  T.phase = 'idle';
  T.path = null;
  S.tourMove = null;
  refreshUi();
  if (msg) showToast(msg);
}

export function toggleTour() { T.on ? stopTour('Rondleiding gestopt') : startTour(); }

/* How many of the legs can be planned from the current spot? Purely
 * informational (progress text + test hook); the walk replans live. */
function dryRun() {
  let ok = 0, x = S.playerPos.x, z = S.playerPos.z;
  for (let k = T.stop; k < STOPS.length; k++) {
    const s = STOPS[k];
    if (planPath(x, z, s.x, s.z)) { ok++; x = s.x; z = s.z; }
  }
  return ok;
}

/* Plan the walk to the current stop; skip stops we cannot reach. */
function beginLeg() {
  while (T.stop < STOPS.length) {
    const s = STOPS[T.stop];
    const dist = Math.hypot(s.x - S.playerPos.x, s.z - S.playerPos.z);
    if (dist < ARRIVE * 2) { beginLook(); return; }   // already there
    const path = planPath(S.playerPos.x, S.playerPos.z, s.x, s.z);
    if (path) {
      T.path = path;
      T.wp = path.length > 1 ? 1 : 0;   // path[0] is (about) where we stand
      T.phase = 'walk';
      T.stuckT = 0;
      T.prevDist = Infinity;
      T.replanned = false;
      refreshUi();
      return;
    }
    T.skipped.push(s.name);
    showToast(`${s.name} is niet bereikbaar — overgeslagen`);
    T.stop++;
  }
  finish();
}

function beginLook() {
  const s = STOPS[T.stop];
  T.phase = 'look';
  T.path = null;
  S.tourMove = null;
  T.lookTotal = 2 * Math.PI * (s.pause === undefined ? 1 : s.pause);
  T.lookDone = 0;
  T.lookDir = ((T.stop % 2) ? -1 : 1);   // alternate direction — feels less mechanical
  T.headYaw = S.yaw;
  refreshUi();
}

function finish() {
  T.done = true;
  T.stop = STOPS.length;
  stopTour(T.skipped.length
    ? `Rondleiding klaar (overgeslagen: ${T.skipped.join(', ')})`
    : 'Rondleiding klaar — je staat weer bij de voordeur');
}

/* Ease S.yaw toward `target` — the user's own look input only deflects
 * the camera briefly before the tour gently takes over again. */
function easeYaw(target, dt) {
  let diff = target - S.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  S.yaw += diff * Math.min(1, YAW_EASE * dt);
}

/* Per-frame update; called from the game loop before movement. Sets
 * S.tourMove = { vx, vz } (world-space, unit-ish) or null. */
export function updateTour(dt) {
  if (!T.on) { S.tourMove = null; return; }
  S.tourMove = null;

  if (T.phase === 'walk') {
    const wp = T.path[T.wp];
    const dx = wp.x - S.playerPos.x, dz = wp.z - S.playerPos.z;
    const dist = Math.hypot(dx, dz);
    const last = T.wp === T.path.length - 1;
    if (dist < ARRIVE) {
      if (last) { beginLook(); return; }
      T.wp++;
      T.prevDist = Infinity;
      return;
    }
    // Heading of travel; glance left/right around it while walking.
    const heading = Math.atan2(-dx, -dz);   // camera forward is (-sin yaw, -cos yaw)
    T.swayT += dt;
    const sway = SWAY_AMP * Math.sin(T.swayT * SWAY_FREQ);
    let hd = heading - T.headYaw;
    hd = Math.atan2(Math.sin(hd), Math.cos(hd));
    T.headYaw += hd * Math.min(1, YAW_EASE * dt);   // smooth the heading at corners
    easeYaw(T.headYaw + sway, dt);
    S.pitch += (0 - S.pitch) * Math.min(1, dt * 2);

    // Leaving a stop: turn toward where we're going before setting off,
    // rather than shuffling sideways while the head comes round.
    if (Math.abs(hd) > 0.8) { T.stuckT = 0; return; }

    // Slow into the final waypoint; keep pace through intermediate corners.
    const speed = last ? Math.max(0.35, Math.min(1, dist / 0.8)) : 1;
    S.tourMove = { vx: dx / dist * TOUR_SPEED * speed, vz: dz / dist * TOUR_SPEED * speed };

    // Progress watchdog: replan once from where we stand, then skip the stop.
    if (T.prevDist - dist < MOVE_SPEED * TOUR_SPEED * dt * 0.15) T.stuckT += dt;
    else T.stuckT = 0;
    T.prevDist = Math.min(T.prevDist, dist);
    if (T.stuckT > STUCK_T) {
      T.stuckT = 0;
      if (!T.replanned) {
        T.replanned = true;
        grid = null;   // furniture may have moved; rebuild
        const s = STOPS[T.stop];
        const path = planPath(S.playerPos.x, S.playerPos.z, s.x, s.z);
        if (path) { T.path = path; T.wp = path.length > 1 ? 1 : 0; T.prevDist = Infinity; return; }
      }
      T.skipped.push(STOPS[T.stop].name);
      showToast(`${STOPS[T.stop].name} is niet bereikbaar — overgeslagen`);
      T.stop++;
      beginLeg();
    }
    return;
  }

  if (T.phase === 'look') {
    const step = Math.min(TURN_SPEED * dt, T.lookTotal - T.lookDone);
    T.lookDone += step;
    T.headYaw += T.lookDir * step;
    easeYaw(T.headYaw, dt);
    // A gentle nod: up toward the ceiling first, then down to the floor.
    const f = T.lookTotal > 0 ? T.lookDone / T.lookTotal : 1;
    const pitchGoal = PITCH_AMP * Math.sin(f * 2 * Math.PI);
    S.pitch += (pitchGoal - S.pitch) * Math.min(1, dt * 1.5);
    if (T.lookDone >= T.lookTotal - 1e-6) {
      T.stop++;
      if (T.stop >= STOPS.length) { finish(); return; }
      beginLeg();
    }
  }
}

/* Read-only snapshot for window.__state (tests + debugging). */
export function tourState() {
  return { on: T.on, stop: T.stop, total: STOPS.length, phase: T.phase,
           planned: T.planned, done: T.done, skipped: T.skipped.slice(),
           stopName: STOPS[Math.min(T.stop, STOPS.length - 1)].name };
}
