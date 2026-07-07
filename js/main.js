import * as THREE from 'three';
import {
  WALL_HEIGHT, CEILING_FROM_JSON, scaledFov, PLAYER_H,
  MOVE_SPEED, ACCEL, DECEL, BOB_AMP, BOB_FREQ,
  WALK_TURN_SPEED, WALK_ARRIVE, TOD_FADE,
} from './constants.js';
import { S } from './state.js';
import { loadModel } from './data.js';
import { setupTextures } from './textures.js';
import { buildApartment } from './apartment.js';
import { placeFurniture } from './furniture.js';
import { setupLights, enableShadows } from './lights.js';
import { setupInput, joystickActive } from './input.js';
import { buildDesignPanel, refreshPanel, designPanelOpen } from './panel.js';
import { loadScheme, applyScheme } from './scheme.js';
import { applyTodLerp } from './tod.js';
import { roomAt } from './rooms.js';
import { resolveCollision } from './collision.js';
import { cancelWalkTarget } from './walk.js';
import { drawMinimap } from './minimap.js';
import { updateDoors } from './doors.js';
import { updateMeasureLabel } from './measure.js';

await loadModel();

/* ===== INIT ===== */
function init() {
  if (CEILING_FROM_JSON !== WALL_HEIGHT) {
    console.warn(
      'Ceiling height mismatch: WALL_HEIGHT =', WALL_HEIGHT,
      'vs apartment.json levels[0].ceiling_height_m =', CEILING_FROM_JSON
    );
  }
  S.clock = new THREE.Clock();

  S.scene = new THREE.Scene();
  S.scene.background = new THREE.Color(0xb8c8d8);
  S.scene.fog = new THREE.Fog(0xb8c8d8, 22, 60);

  S.camera = new THREE.PerspectiveCamera(scaledFov(innerWidth / innerHeight),
                                         innerWidth / innerHeight, 0.1, 50);
  S.camera.position.copy(S.playerPos);

  S.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  S.renderer.setSize(innerWidth, innerHeight);
  S.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  S.renderer.toneMappingExposure = 1.1;
  if (!S.isMobile) {
    S.renderer.shadowMap.enabled = true;
    S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  document.body.insertBefore(S.renderer.domElement, document.getElementById('ui'));

  setupTextures(S.renderer.capabilities.maxAnisotropy);
  buildApartment();
  placeFurniture();
  setupLights();
  enableShadows();
  setupInput();

  // Design tool: build the panel, then load any saved/shared scheme and apply it.
  buildDesignPanel();
  loadScheme();
  applyScheme();
  enableShadows();   // again: applyScheme can swap floor materials
  refreshPanel();

  window.addEventListener('resize', () => {
    S.camera.aspect = innerWidth / innerHeight;
    S.camera.fov = scaledFov(S.camera.aspect);
    S.camera.updateProjectionMatrix();
    S.renderer.setSize(innerWidth, innerHeight);
    S.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  });

  // Read-only state hook, companion to the ?pos= viewpoint hook — lets
  // automated screenshots/tests see where the player ended up.
  window.__state = () => ({
    x: S.playerPos.x, z: S.playerPos.z, camY: S.camera.position.y,
    yaw: S.yaw, pitch: S.pitch, tod: S.scheme.tod, todFading: !!S.todAnim,
    room: S.currentRoom && S.currentRoom.id,
    doorOpen: S.doors.filter(d => Math.abs(d.angle) > 1).length,
    exposure: S.renderer.toneMappingExposure,
    measureDist: S.measure.points.length === 2 ? S.measure.dist : null,
    measurePts: S.measure.points.map(p => [p.x, p.y, p.z]),
  });

  // Prevent default touch behaviors on the canvas only — leave overlays
  // free to receive normal taps for buttons.
  S.renderer.domElement.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());

  animate();
}

/* ===== GAME LOOP ===== */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(S.clock.getDelta(), 0.05);

  // Time-of-day fade — also runs on the intro screen so a shared scheme's
  // mood settles before the tour starts.
  if (S.todAnim) {
    S.todAnim.t = Math.min(1, S.todAnim.t + dt / TOD_FADE);
    applyTodLerp(S.todAnim);
    if (S.todAnim.t >= 1) S.todAnim = null;
  }

  if (!S.gameStarted) { S.renderer.render(S.scene, S.camera); return; }

  // Input
  let kf = 0, kr = 0;
  if (S.keys['KeyW'] || S.keys['ArrowUp']) kf += 1;
  if (S.keys['KeyS'] || S.keys['ArrowDown']) kf -= 1;
  if (S.keys['KeyA'] || S.keys['ArrowLeft']) kr -= 1;
  if (S.keys['KeyD'] || S.keys['ArrowRight']) kr += 1;

  let fwd = joystickActive ? S.moveF : kf;
  let rgt = joystickActive ? S.moveR : kr;

  // Manual input always wins; it cancels any pending tap-to-walk target.
  if (S.walkTarget && (joystickActive || kf || kr)) cancelWalkTarget();

  // Tap-to-walk: turn toward the target, then walk up to it.
  let autoWalking = false;
  if (S.walkTarget) {
    const ddx = S.walkTarget.x - S.playerPos.x, ddz = S.walkTarget.z - S.playerPos.z;
    const dist = Math.hypot(ddx, ddz);
    if (dist < WALK_ARRIVE) cancelWalkTarget();
    else {
      const targetYaw = Math.atan2(-ddx, -ddz);   // camera forward is (-sin yaw, -cos yaw)
      let diff = targetYaw - S.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      S.yaw += Math.sign(diff) * Math.min(Math.abs(diff), WALK_TURN_SPEED * dt);
      S.pitch += (0 - S.pitch) * Math.min(1, dt * 2);  // ease back to eye level
      if (Math.abs(diff) < 0.6) {
        fwd = Math.max(0.25, Math.min(1, dist / 0.6));  // slow into the target
        autoWalking = true;
      }
      S.walkMarker.scale.setScalar(1 + 0.15 * Math.sin(performance.now() * 0.006));
    }
  }

  // Normalise so W+D diagonals aren't sqrt(2) x faster than straight ahead.
  const mag = Math.hypot(fwd, rgt);
  if (mag > 1) { fwd /= mag; rgt /= mag; }

  const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw);
  // Camera right vector at yaw is (cos yaw, 0, -sin yaw); camera forward is
  // (-sin yaw, 0, -cos yaw). Strafe was sign-flipped, so D / joystick-right
  // moved the player to their left. Apply +rgt along camera-right.
  const tvx = -(sy * fwd - cy * rgt) * MOVE_SPEED;
  const tvz = -(cy * fwd + sy * rgt) * MOVE_SPEED;

  // Ease the velocity toward the target so starts/stops aren't instant.
  const rate = (tvx || tvz) ? ACCEL : DECEL;
  const k = 1 - Math.exp(-rate * dt);    // framerate-independent smoothing
  S.velX += (tvx - S.velX) * k;
  S.velZ += (tvz - S.velZ) * k;
  if (!tvx && !tvz && Math.hypot(S.velX, S.velZ) < 0.02) { S.velX = 0; S.velZ = 0; }

  const resolved = resolveCollision(S.playerPos.x + S.velX * dt, S.playerPos.z + S.velZ * dt);
  // Re-derive the velocity from the resolved step: the wall-normal component
  // dies, the tangential component survives — smooth sliding along diagonals.
  if (dt > 0) {
    S.velX = (resolved.x - S.playerPos.x) / dt;
    S.velZ = (resolved.z - S.playerPos.z) / dt;
    const s = Math.hypot(S.velX, S.velZ);
    if (s > MOVE_SPEED) { S.velX *= MOVE_SPEED / s; S.velZ *= MOVE_SPEED / s; }
  }
  S.playerPos.x = resolved.x;
  S.playerPos.z = resolved.z;

  // Give up on a walk target when a wall keeps blocking the way.
  if (S.walkTarget && autoWalking) {
    const nd = Math.hypot(S.walkTarget.x - S.playerPos.x, S.walkTarget.z - S.playerPos.z);
    S.walkStuckT = (S.walkPrevDist - nd < MOVE_SPEED * dt * 0.15) ? S.walkStuckT + dt : 0;
    S.walkPrevDist = nd;
    if (S.walkStuckT > 0.8) cancelWalkTarget();
  }

  S.camera.position.copy(S.playerPos);
  // Head-bob — a subtle vertical sway scaled by walking speed; fades out
  // naturally as the smoothed velocity decays, settling at PLAYER_H.
  const speedFrac = Math.min(1, Math.hypot(S.velX, S.velZ) / MOVE_SPEED);
  S.bobPhase += dt * BOB_FREQ * speedFrac;
  S.camera.position.y = PLAYER_H + Math.sin(S.bobPhase) * BOB_AMP * speedFrac;
  S.camera.rotation.order = 'YXZ';
  S.camera.rotation.x = S.pitch;
  S.camera.rotation.y = S.yaw;

  updateDoors(dt);

  // Track which room we're standing in for the HUD + design-panel target.
  const r = roomAt(S.playerPos.x, S.playerPos.z);
  if (r !== S.currentRoom) {
    S.currentRoom = r;
    if (r) S.lastRoom = r;
    const label = r
      ? `${r.name} · ${r.area.toFixed(1).replace('.', ',')} m²`
      : 'Onderweg…';
    document.getElementById('roomLabel').textContent = label;
    if (designPanelOpen()) refreshPanel();
  }

  if (S.minimapOn) drawMinimap();
  updateMeasureLabel();

  S.renderer.render(S.scene, S.camera);
}

/* ===== START ===== */
try {
  init();
} catch (err) {
  console.error('Ons Nieuwe Huis kon niet starten:', err);
  const intro = document.getElementById('introOverlay');
  if (intro) {
    intro.innerHTML =
      '<h1>Ons Nieuwe Huis</h1>' +
      '<p>Je browser ondersteunt geen 3D &mdash; probeer een nieuwere browser.</p>';
  }
}
