import { S } from './state.js';
import { DEFAULT_WALL_HEX, KIND_DEFAULT_FINISH } from './constants.js';
import { paintRoomWalls, setRoomFloor, reapplyAccents } from './paint.js';
import { setTimeOfDayT } from './tod.js';
import { showToast } from './toast.js';

/* --- scheme save / load ---------------------------------------------
 * v2 (current): { v:2, tod: <number 0..1>, rooms, acc, fur:[] }
 * v1 (still accepted from old shared URLs / saves): tod was a mood name. */
const V1_TOD = { dag: 0, avond: 0.5, nacht: 1 };

export function resetSchemeToDefaults() {
  S.scheme.v = 2; S.scheme.tod = 0; S.scheme.rooms = {}; S.scheme.acc = {};
  S.scheme.fur = [];
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
  setTimeOfDayT(S.scheme.tod, true);  // page load / reset: show the mood at once
}
export function encodeScheme() {
  try { return btoa(JSON.stringify(S.scheme)); } catch (e) { return ''; }
}
/* Decode a saved/shared scheme string into S.scheme (on top of defaults).
 * Tolerant: unknown versions are ignored, missing fields keep defaults.
 * Returns true when something was applied. Shared by URL/localStorage
 * loading and the scheme gallery. */
export function decodeAndMergeScheme(enc) {
  try {
    const s = JSON.parse(atob(enc));
    if (!s || (s.v !== 1 && s.v !== 2)) return false;
    S.scheme.tod = typeof s.tod === 'number'
      ? Math.max(0, Math.min(1, s.tod))
      : (V1_TOD[s.tod] ?? 0);
    S.scheme.acc = s.acc || {};
    S.scheme.fur = Array.isArray(s.fur) ? s.fur : [];
    for (const room of S.rooms) {
      if (s.rooms && s.rooms[room.id]) {
        S.scheme.rooms[room.id].w = s.rooms[room.id].w ?? DEFAULT_WALL_HEX;
        S.scheme.rooms[room.id].f = s.rooms[room.id].f ?? KIND_DEFAULT_FINISH[room.kind];
      }
    }
    return true;
  } catch (e) { return false; /* corrupt scheme -> keep defaults */ }
}
export function loadScheme() {
  resetSchemeToDefaults();
  let enc = null;
  const m = location.hash.match(/scheme=([^&]+)/);
  if (m) enc = decodeURIComponent(m[1]);
  else { try { enc = localStorage.getItem('huisScheme'); } catch (e) {} }
  if (enc) decodeAndMergeScheme(enc);
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
