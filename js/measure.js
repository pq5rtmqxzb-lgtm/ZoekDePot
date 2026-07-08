import * as THREE from 'three';
import { S } from './state.js';
import { showToast } from './toast.js';

/* ===== MEASURE TOOL =====
 * "Meet" (R key / HUD button): tap or click two points to see the distance
 * between them in metres — walls, floors, glass and furniture all count;
 * decoration that would give meaningless numbers (sky, outdoor ground, trees,
 * moving door leaves, HUD markers) is flagged userData.noMeasure and skipped.
 * A third tap starts a fresh measurement. */

const MARKER_MAT = new THREE.MeshBasicMaterial({ color: 0xff8b3d, depthTest: false });
const LINE_MAT = new THREE.LineBasicMaterial({ color: 0xff8b3d, depthTest: false });

let markers = [], line = null, labelEl = null;

export function toggleMeasure(force) {
  const on = force !== undefined ? force : !S.measure.armed;
  if (on === S.measure.armed) return;
  S.measure.armed = on;
  if (on) S.accentArm = false;   // the two pick modes are mutually exclusive
  const btn = document.getElementById('measureToggle');
  if (btn) btn.classList.toggle('armed', on);
  if (on) {
    showToast(S.isMobile ? 'Meten: tik twee punten' : 'Meten: klik twee punten');
  } else {
    clearMeasure();
  }
}

export function clearMeasure() {
  for (const m of markers) S.scene.remove(m);
  markers = [];
  if (line) { S.scene.remove(line); line = null; }
  S.measure.points = [];
  S.measure.dist = 0;
  if (labelEl) labelEl.style.display = 'none';
}

export function measureTap(sx, sy) {
  const ndc = new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
  S.raycaster.setFromCamera(ndc, S.camera);
  S.raycaster.far = 60;
  const hit = S.raycaster.intersectObjects(S.scene.children, true)
    .find(h => h.object.isMesh && !h.object.userData.noMeasure);
  if (!hit) { showToast('Geen oppervlak in zicht'); return; }

  if (S.measure.points.length === 2) clearMeasure();   // third tap = restart

  const p = hit.point.clone();
  S.measure.points.push(p);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), MARKER_MAT);
  marker.userData.noMeasure = true;
  marker.renderOrder = 6;
  marker.position.copy(p);
  S.scene.add(marker);
  markers.push(marker);

  if (S.measure.points.length === 2) {
    const [a, b] = S.measure.points;
    line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), LINE_MAT);
    line.userData.noMeasure = true;
    line.renderOrder = 6;
    S.scene.add(line);
    S.measure.dist = a.distanceTo(b);
  }
}

/* Project the midpoint of the measured span into screen space and pin the
 * HTML label there (crisp text beats a texture sprite). Called every frame. */
export function updateMeasureLabel() {
  if (!labelEl) labelEl = document.getElementById('measureLabel');
  if (S.measure.points.length !== 2) { labelEl.style.display = 'none'; return; }
  const [a, b] = S.measure.points;
  const mid = a.clone().add(b).multiplyScalar(0.5).project(S.camera);
  if (mid.z > 1 || Math.abs(mid.x) > 1.15 || Math.abs(mid.y) > 1.15) {
    labelEl.style.display = 'none';   // behind the camera / far off-screen
    return;
  }
  labelEl.style.display = 'block';
  labelEl.style.left = ((mid.x + 1) / 2 * innerWidth) + 'px';
  labelEl.style.top = ((1 - mid.y) / 2 * innerHeight) + 'px';
  labelEl.textContent = S.measure.dist.toFixed(2).replace('.', ',') + ' m';
}
