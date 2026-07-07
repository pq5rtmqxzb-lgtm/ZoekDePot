import { S } from './state.js';
import { DEFAULT_WALL_HEX, KIND_DEFAULT_FINISH } from './constants.js';
import { paintRoomWalls, setRoomFloor, reapplyAccents } from './paint.js';
import { setTimeOfDay } from './tod.js';
import { showToast } from './toast.js';

/* --- scheme save / load --------------------------------------------- */
export function resetSchemeToDefaults() {
  S.scheme.v = 1; S.scheme.tod = 'dag'; S.scheme.rooms = {}; S.scheme.acc = {};
  for (const room of S.rooms) {
    S.scheme.rooms[room.id] = { w: DEFAULT_WALL_HEX, f: KIND_DEFAULT_FINISH[room.kind] };
  }
}
export function applyScheme() {
  for (const room of S.rooms) {
    const rs = S.scheme.rooms[room.id];
    if (!rs) continue;
    paintRoomWalls(room, rs.w);
    setRoomFloor(room, rs.f);
  }
  reapplyAccents();
  setTimeOfDay(S.scheme.tod, true);  // page load / reset: show the mood at once
}
export function encodeScheme() {
  try { return btoa(JSON.stringify(S.scheme)); } catch (e) { return ''; }
}
export function loadScheme() {
  resetSchemeToDefaults();
  let enc = null;
  const m = location.hash.match(/scheme=([^&]+)/);
  if (m) enc = decodeURIComponent(m[1]);
  else { try { enc = localStorage.getItem('huisScheme'); } catch (e) {} }
  if (enc) {
    try {
      const s = JSON.parse(atob(enc));
      if (s && s.v === 1) {
        S.scheme.tod = s.tod || 'dag';
        S.scheme.acc = s.acc || {};
        for (const room of S.rooms) {
          if (s.rooms && s.rooms[room.id]) {
            S.scheme.rooms[room.id].w = s.rooms[room.id].w ?? DEFAULT_WALL_HEX;
            S.scheme.rooms[room.id].f = s.rooms[room.id].f ?? KIND_DEFAULT_FINISH[room.kind];
          }
        }
      }
    } catch (e) { /* ignore corrupt scheme */ }
  }
}
export function saveAndShare() {
  const enc = encodeScheme();
  try { localStorage.setItem('huisScheme', enc); } catch (e) {}
  const url = location.origin + location.pathname + '#scheme=' + enc;
  try { history.replaceState(null, '', '#scheme=' + enc); } catch (e) {}
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(
      () => showToast('Link gekopieerd — bewaard & deelbaar'),
      () => showToast('Bewaard (kopiëren niet toegestaan)'));
  } else {
    showToast('Bewaard in deze browser');
  }
}
