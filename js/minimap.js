import { S } from './state.js';
import { ENV, WALL_THICK } from './constants.js';
import { roomAt } from './rooms.js';
import { resolveCollision } from './collision.js';
import { cancelWalkTarget } from './walk.js';

/* ===== MINIMAP =====
 * Small plattegrond overlay (M key / Kaart button). The apartment outline is
 * drawn once from ROOMS + wallSegs onto an offscreen canvas; per frame we only
 * blit it and draw the player marker on top. */
let mapStatic = null;
let mapScale = 1, mapPad = 8, mapDpr = 1;
export const minimapEl = document.getElementById('minimap');

export function mapXY(x, z) {
  // World x -> right, world z (south) -> down: same orientation as the PDF plan.
  return [mapPad + (x - ENV.xMin) * mapScale, mapPad + (z - ENV.zMin) * mapScale];
}

export function buildMapStatic() {
  const cssW = minimapEl.clientWidth, cssH = minimapEl.clientHeight;
  mapDpr = Math.min(devicePixelRatio, 2);
  minimapEl.width = cssW * mapDpr;
  minimapEl.height = cssH * mapDpr;
  mapScale = Math.min((cssW - 2 * mapPad) / (ENV.xMax - ENV.xMin),
                      (cssH - 2 * mapPad) / (ENV.zMax - ENV.zMin));

  mapStatic = document.createElement('canvas');
  mapStatic.width = minimapEl.width;
  mapStatic.height = minimapEl.height;
  const ctx = mapStatic.getContext('2d');
  ctx.scale(mapDpr, mapDpr);

  for (const room of S.rooms) {
    ctx.fillStyle = room.id.startsWith('balkon')
      ? 'rgba(160,200,255,0.12)' : 'rgba(255,255,255,0.14)';
    for (const r of room.rects) {
      const [x1, y1] = mapXY(Math.min(r.x1, r.x2), Math.min(r.z1, r.z2));
      const [x2, y2] = mapXY(Math.max(r.x1, r.x2), Math.max(r.z1, r.z2));
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
    for (const p of room.polys) {
      ctx.beginPath();
      p.forEach(([x, z], i) => {
        const [mx, my] = mapXY(x, z);
        i ? ctx.lineTo(mx, my) : ctx.moveTo(mx, my);
      });
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.lineCap = 'round';
  for (const w of S.wallSegs) {
    const railing = (w.t || WALL_THICK) <= 0.06;
    ctx.strokeStyle = railing ? 'rgba(232,228,218,0.45)' : '#e8e4da';
    ctx.lineWidth = railing ? 1 : Math.max(1.5, (w.t || WALL_THICK) * mapScale);
    const [x1, y1] = mapXY(w.x1, w.z1), [x2, y2] = mapXY(w.x2, w.z2);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
}

export function drawMinimap() {
  if (!mapStatic) return;
  const ctx = minimapEl.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, minimapEl.width, minimapEl.height);
  ctx.drawImage(mapStatic, 0, 0);
  ctx.scale(mapDpr, mapDpr);

  const [mx, my] = mapXY(S.playerPos.x, S.playerPos.z);
  // Camera forward is (-sin yaw, -cos yaw) in world (x,z) = map (right,down).
  const ang = Math.atan2(-Math.cos(S.yaw), -Math.sin(S.yaw));
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(255,210,74,0.18)';   // view cone
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 14, -0.5, 0.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd24a';                 // facing triangle
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-3.5, 3.2); ctx.lineTo(-3.5, -3.2);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function toggleMinimap() {
  S.minimapOn = !S.minimapOn;
  minimapEl.classList.toggle('show', S.minimapOn);
  // Build lazily on first open: the element needs layout for clientWidth, and
  // wallSegs/ROOMS are fully populated well before any toggle.
  if (S.minimapOn && !mapStatic) buildMapStatic();
}

/* Tap/click on the minimap teleports the player there ("spring naar"). Only
 * points inside a room count — taps on walls or outside the plan are ignored.
 * resolveCollision() then nudges the landing spot out of any wall band. */
export function minimapTeleport(e) {
  if (!mapStatic) return;
  const box = minimapEl.getBoundingClientRect();
  const x = ENV.xMin + (e.clientX - box.left - mapPad) / mapScale;
  const z = ENV.zMin + (e.clientY - box.top - mapPad) / mapScale;
  if (!roomAt(x, z)) return;
  cancelWalkTarget();
  const spot = resolveCollision(x, z);
  S.playerPos.x = spot.x;
  S.playerPos.z = spot.z;
}
