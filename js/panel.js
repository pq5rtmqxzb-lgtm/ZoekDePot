import { S } from './state.js';
import { PAINT_PALETTE } from './constants.js';
import { editTarget } from './rooms.js';
import { paintRoomWalls, reapplyAccents, setRoomFloor } from './paint.js';
import { setTimeOfDayT, TOD_PRESETS } from './tod.js';
import { resetSchemeToDefaults, applyScheme, saveAndShare } from './scheme.js';
import { toggleMeasure } from './measure.js';
import { spawnCustom, armMove, rotateCustom, deleteCustom } from './customFurniture.js';
import { showToast } from './toast.js';

const hex2css = h => '#' + h.toString(16).padStart(6, '0');

/* --- panel UI -------------------------------------------------------- */
export function designPanelOpen() {
  const p = document.getElementById('designPanel');
  return p && p.classList.contains('open');
}
export function toggleDesignPanel(force) {
  const p = document.getElementById('designPanel');
  if (!p) return;
  const open = (force === undefined) ? !p.classList.contains('open') : force;
  p.classList.toggle('open', open);
  if (open) {
    if (document.exitPointerLock) document.exitPointerLock();
    refreshPanel();
  }
  // Note: accent-arm intentionally persists across close so the user can shut
  // the panel and then click/look at the wall to paint (desktop ignores canvas
  // clicks while the panel is open).
}

export function buildDesignPanel() {
  const accentIdx = [5, 7, 8, 3, 10, 9]; // terracotta, diepblauw, antraciet, salie, donkergroen, mosterd

  const wallRow = document.getElementById('dpWallSwatches');
  PAINT_PALETTE.forEach(p => {
    const s = document.createElement('div');
    s.className = 'swatch'; s.dataset.hex = p.hex;
    s.style.background = hex2css(p.hex); s.title = p.name;
    s.addEventListener('click', () => {
      const room = editTarget();
      S.scheme.rooms[room.id].w = p.hex;
      paintRoomWalls(room, p.hex);
      reapplyAccents();
      showToast(`${room.name}: ${p.name}`);
      refreshPanel();
    });
    wallRow.appendChild(s);
  });

  const accentRow = document.getElementById('dpAccentSwatches');
  accentIdx.forEach(i => {
    const p = PAINT_PALETTE[i];
    const s = document.createElement('div');
    s.className = 'swatch'; s.dataset.hex = p.hex;
    s.style.background = hex2css(p.hex); s.title = p.name;
    if (p.hex === S.accentHex) s.classList.add('sel');
    s.addEventListener('click', () => {
      S.accentHex = p.hex;
      accentRow.querySelectorAll('.swatch').forEach(el => el.classList.remove('sel'));
      s.classList.add('sel');
    });
    accentRow.appendChild(s);
  });

  document.getElementById('accentBtn').addEventListener('click', () => {
    S.accentArm = !S.accentArm;
    if (S.accentArm) toggleMeasure(false);   // pick modes are mutually exclusive
    document.getElementById('accentBtn').classList.toggle('armed', S.accentArm);
    showToast(S.accentArm
      ? (S.isMobile ? 'Tik op een muur om de accentkleur te plaatsen'
                    : 'Sluit dit menu, kijk naar een muur en klik')
      : 'Accentmuur uit');
  });

  const floorList = document.getElementById('dpFloors');
  S.FLOOR_FINISHES.forEach(f => {
    const b = document.createElement('button');
    b.className = 'finishBtn'; b.dataset.fid = f.id; b.textContent = f.name;
    b.addEventListener('click', () => {
      const room = editTarget();
      S.scheme.rooms[room.id].f = f.id;
      setRoomFloor(room, f.id);
      showToast(`${room.name}: ${f.name}`);
      refreshPanel();
    });
    floorList.appendChild(b);
  });

  const todRow = document.getElementById('dpTod');
  TOD_PRESETS.forEach(([id, label, t]) => {
    const b = document.createElement('button');
    b.className = 'modeBtn'; b.dataset.tod = id; b.dataset.t = t; b.textContent = label;
    b.addEventListener('click', () => { setTimeOfDayT(t); refreshPanel(); });
    todRow.appendChild(b);
  });
  // Continuous slider between the presets — dragging IS the animation, so it
  // cancels any running fade and applies each position instantly.
  const todSlider = document.getElementById('dpTodSlider');
  todSlider.addEventListener('input', () => {
    S.todAnim = null;
    setTimeOfDayT(+todSlider.value, true);
    refreshPanel();
  });

  // Eigen meubel — spawn a block with your own dimensions in front of you.
  document.getElementById('furPlace').addEventListener('click', () => {
    const item = spawnCustom({
      name: document.getElementById('furName').value,
      w: document.getElementById('furW').value,
      d: document.getElementById('furD').value,
      h: document.getElementById('furH').value,
    });
    showToast(`"${item.data.name}" geplaatst — loop eromheen of verplaats hem`);
    refreshPanel();
  });

  document.getElementById('dpShare').addEventListener('click', saveAndShare);
  document.getElementById('dpReset').addEventListener('click', () => {
    resetSchemeToDefaults(); applyScheme(); refreshPanel(); showToast('Teruggezet naar standaard');
  });
  document.getElementById('dpClose').addEventListener('click', () => toggleDesignPanel(false));
  document.getElementById('designToggle').addEventListener('click', () => toggleDesignPanel());
}

// Sync the panel's highlights with the room we're editing + the current scheme.
export function refreshPanel() {
  const room = editTarget();
  const nameEl = document.getElementById('dpRoomName');
  if (nameEl) nameEl.textContent = room ? room.name : '—';
  const rs = S.scheme.rooms[room.id] || {};
  document.querySelectorAll('#dpWallSwatches .swatch').forEach(el =>
    el.classList.toggle('sel', +el.dataset.hex === rs.w));
  document.querySelectorAll('#dpFloors .finishBtn').forEach(el =>
    el.classList.toggle('sel', el.dataset.fid === rs.f));
  document.querySelectorAll('#dpTod .modeBtn').forEach(el =>
    el.classList.toggle('sel', Math.abs(+el.dataset.t - S.scheme.tod) < 0.03));
  const slider = document.getElementById('dpTodSlider');
  if (slider) slider.value = S.scheme.tod;
  refreshFurnList();
}

// Rebuild the placed-furniture rows (Verplaats / Draai / Verwijder per item).
function refreshFurnList() {
  const list = document.getElementById('furList');
  if (!list) return;
  list.innerHTML = '';
  for (const item of S.customFurn) {
    const row = document.createElement('div');
    row.className = 'furRow';
    const name = document.createElement('span');
    name.className = 'furRowName';
    name.textContent = `${item.data.name} (${item.data.w}×${item.data.d}×${item.data.h})`;
    row.appendChild(name);
    const mk = (label, fn, aria) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.setAttribute('aria-label', `${aria} ${item.data.name}`);
      b.addEventListener('click', fn);
      row.appendChild(b);
    };
    mk('Verplaats', () => { armMove(item); toggleDesignPanel(false); }, 'Verplaats');
    mk('Draai', () => { rotateCustom(item); showToast(`"${item.data.name}" gedraaid`); }, 'Draai');
    mk('Verwijder', () => { deleteCustom(item); refreshFurnList(); showToast(`"${item.data.name}" verwijderd`); }, 'Verwijder');
    list.appendChild(row);
  }
}
