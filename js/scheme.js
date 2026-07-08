import { S } from './state.js';
import { DEFAULT_WALL_HEX, KIND_DEFAULT_FINISH } from './constants.js';
import { paintRoomWalls, setRoomFloor, reapplyAccents } from './paint.js';
import { setTimeOfDayT } from './tod.js';
import { rebuildCustomFromScheme } from './customFurniture.js';
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
  rebuildCustomFromScheme();
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
/* --- scheme gallery ---------------------------------------------------
 * Named saves in localStorage['huisSchemes'] = [{ name, savedAt, enc }].
 * enc reuses encodeScheme()'s format, so gallery entries and share URLs are
 * interchangeable. Capped at 20 entries (oldest evicted). The legacy
 * single-slot 'huisScheme' save is migrated into the gallery on first read. */
const GALLERY_KEY = 'huisSchemes';
const GALLERY_MAX = 20;

export function listSavedSchemes() {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter(e => e && e.name && e.enc) : [];
    }
    const legacy = localStorage.getItem('huisScheme');
    if (legacy) {
      const seeded = [{ name: 'Mijn schema', savedAt: Date.now(), enc: legacy }];
      localStorage.setItem(GALLERY_KEY, JSON.stringify(seeded));
      return seeded;
    }
  } catch (e) { /* private mode / corrupt store */ }
  return [];
}

function writeGallery(list) {
  try { localStorage.setItem(GALLERY_KEY, JSON.stringify(list)); return true; }
  catch (e) { return false; }
}

export function saveSchemeAs(name) {
  name = (name || '').trim().slice(0, 30);
  if (!name) { showToast('Geef het schema eerst een naam'); return false; }
  const list = listSavedSchemes();
  const entry = { name, savedAt: Date.now(), enc: encodeScheme() };
  const i = list.findIndex(e => e.name === name);
  let msg = `Schema "${name}" bewaard`;
  if (i >= 0) { list[i] = entry; msg = `Schema "${name}" bijgewerkt`; }
  else {
    list.push(entry);
    if (list.length > GALLERY_MAX) {
      const evicted = list.shift();
      msg = `"${name}" bewaard — oudste ("${evicted.name}") is verwijderd (max ${GALLERY_MAX})`;
    }
  }
  if (!writeGallery(list)) { showToast('Opslaan mislukt (privémodus?)'); return false; }
  showToast(msg);
  return true;
}

export function loadSchemeByName(name) {
  const entry = listSavedSchemes().find(e => e.name === name);
  if (!entry) { showToast('Schema niet gevonden'); return false; }
  resetSchemeToDefaults();
  if (!decodeAndMergeScheme(entry.enc)) { showToast('Schema is beschadigd'); return false; }
  applyScheme();
  showToast(`Schema "${name}" geladen`);
  return true;
}

export function deleteSchemeByName(name) {
  writeGallery(listSavedSchemes().filter(e => e.name !== name));
  showToast(`Schema "${name}" verwijderd`);
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
