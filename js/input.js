import { S } from './state.js';
import { LOOK_SPEED, JOY_DEADZONE } from './constants.js';
import { designPanelOpen, toggleDesignPanel } from './panel.js';
import { pickAccentWall } from './paint.js';
import { setWalkTarget } from './walk.js';
import { toggleMinimap, minimapTeleport, minimapEl } from './minimap.js';
import { toggleMeasure, measureTap } from './measure.js';
import { moveCustomAt } from './customFurniture.js';
import { showToast } from './toast.js';

/* Touch state */
let lookTouchId = null, lookLastX = 0, lookLastY = 0;
let joystickTouchId = null;
export let joystickActive = false;
let jsCenterX = 0, jsCenterY = 0;
const touchStarts = {};

const joystickEl = document.getElementById('joystickArea');
const knobEl = document.getElementById('joystickKnob');

/* ===== INPUT ===== */
export function setupInput() {
  // Keyboard
  addEventListener('keydown', e => {
    S.keys[e.code] = true;
    if (!S.gameStarted) return;
    if (e.code === 'KeyI') { e.preventDefault(); toggleDesignPanel(); }
    if (e.code === 'KeyM') { e.preventDefault(); toggleMinimap(); }
    if (e.code === 'KeyR') { e.preventDefault(); toggleMeasure(); }
    if (e.code === 'Escape') {
      if (designPanelOpen()) toggleDesignPanel(false);
      else if (S.measure.armed) toggleMeasure(false);
    }
  });
  addEventListener('keyup', e => { S.keys[e.code] = false; });

  // Pointer lock (desktop). While the design panel is open we leave the cursor
  // free so the user can click swatches.
  let isLocked = false;
  S.renderer.domElement.addEventListener('click', e => {
    if (!S.gameStarted || designPanelOpen()) return;
    if (!S.isMobile && !isLocked) {
      // Measuring/moving works without pointer lock, at the clicked spot.
      if (S.measure.armed) { measureTap(e.clientX, e.clientY); return; }
      if (S.moveArm && moveCustomAt(e.clientX, e.clientY)) return;
      S.renderer.domElement.requestPointerLock();
      return;
    }
    if (isLocked && S.measure.armed) { measureTap(innerWidth / 2, innerHeight / 2); return; }
    if (isLocked && S.moveArm && moveCustomAt(innerWidth / 2, innerHeight / 2)) return;
    if (isLocked && S.accentArm) pickAccentWall(innerWidth / 2, innerHeight / 2);
  });
  document.addEventListener('pointerlockchange', () => {
    isLocked = document.pointerLockElement === S.renderer.domElement;
  });
  document.addEventListener('mousemove', e => {
    if (isLocked) {
      S.yaw -= e.movementX * LOOK_SPEED;
      S.pitch = Math.max(-1, Math.min(1, S.pitch - e.movementY * LOOK_SPEED));
    }
  });

  // Touch: every canvas touch is tracked so a short, still tap can be
  // recognised anywhere on screen; dragging on the right side looks around.
  S.renderer.domElement.addEventListener('touchstart', e => {
    if (!S.gameStarted) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      touchStarts[t.identifier] = { t: Date.now(), lx: t.clientX, ly: t.clientY, dist: 0 };
      if (t.clientX > innerWidth * 0.35 && lookTouchId === null) {
        lookTouchId = t.identifier;
        lookLastX = t.clientX;
        lookLastY = t.clientY;
      }
    }
  }, { passive: false });

  S.renderer.domElement.addEventListener('touchmove', e => {
    if (!S.gameStarted) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = touchStarts[t.identifier];
      if (s) {
        s.dist += Math.hypot(t.clientX - s.lx, t.clientY - s.ly);
        s.lx = t.clientX; s.ly = t.clientY;
      }
      if (t.identifier === lookTouchId) {
        S.yaw -= (t.clientX - lookLastX) * LOOK_SPEED * 1.3;
        S.pitch = Math.max(-1, Math.min(1, S.pitch - (t.clientY - lookLastY) * LOOK_SPEED * 1.3));
        lookLastX = t.clientX;
        lookLastY = t.clientY;
      }
    }
  }, { passive: false });

  S.renderer.domElement.addEventListener('touchend', e => {
    if (!S.gameStarted) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = touchStarts[t.identifier];
      // A short, still tap: with the accent-wall picker armed it selects the
      // wall under the finger; otherwise it sets a walk target — tap a spot
      // and the camera turns and walks there by itself (one-finger movement
      // for people who find the joystick fiddly).
      if (s && Date.now() - s.t < 300 && s.dist < 15) {
        if (S.measure.armed) measureTap(t.clientX, t.clientY);
        else if (S.moveArm && moveCustomAt(t.clientX, t.clientY)) { /* placed */ }
        else if (S.accentArm) pickAccentWall(t.clientX, t.clientY);
        else setWalkTarget(t.clientX, t.clientY);
      }
      delete touchStarts[t.identifier];
      if (t.identifier === lookTouchId) lookTouchId = null;
    }
  }, { passive: false });

  S.renderer.domElement.addEventListener('touchcancel', e => {
    for (const t of e.changedTouches) {
      delete touchStarts[t.identifier];
      if (t.identifier === lookTouchId) lookTouchId = null;
    }
  }, { passive: false });

  // Joystick
  joystickEl.addEventListener('touchstart', e => {
    e.preventDefault(); e.stopPropagation();
    const t = e.changedTouches[0];
    joystickTouchId = t.identifier;
    joystickActive = true;
    const r = joystickEl.getBoundingClientRect();
    jsCenterX = r.left + r.width / 2;
    jsCenterY = r.top + r.height / 2;
    updateJoystick(t.clientX, t.clientY);
  }, { passive: false });

  joystickEl.addEventListener('touchmove', e => {
    e.preventDefault(); e.stopPropagation();
    for (const t of e.changedTouches) {
      if (t.identifier === joystickTouchId) updateJoystick(t.clientX, t.clientY);
    }
  }, { passive: false });

  const endJoystick = e => {
    e.preventDefault(); e.stopPropagation();
    for (const t of e.changedTouches) {
      if (t.identifier === joystickTouchId) {
        joystickActive = false;
        joystickTouchId = null;
        S.moveF = 0; S.moveR = 0;
        knobEl.style.transform = 'translate(-50%,-50%)';
      }
    }
  };
  joystickEl.addEventListener('touchend', endJoystick, { passive: false });
  joystickEl.addEventListener('touchcancel', endJoystick, { passive: false });

  // Minimap toggle (mobile button; desktop uses the M key)
  document.getElementById('mapToggle').addEventListener('click', toggleMinimap);
  // Measure toggle (HUD button; desktop also has the R key)
  document.getElementById('measureToggle').addEventListener('click', () => toggleMeasure());
  // Tap/click on the open minimap = teleport to that spot
  minimapEl.addEventListener('click', minimapTeleport);

  // Start button — begin the walkthrough
  document.getElementById('startBtn').addEventListener('click', () => {
    S.gameStarted = true;
    document.getElementById('introOverlay').style.display = 'none';
    if (S.isMobile) showToast('Tik op de vloer om er naartoe te lopen');
  });

  // Viewpoint hook: ?pos=x,z,yaw[,pitch] places the camera (handy for sharing
  // a spot with each other and for automated screenshots).
  const posParam = new URLSearchParams(location.search).get('pos');
  if (posParam) {
    const [px, pz, pyaw, ppitch] = posParam.split(',').map(Number);
    if (isFinite(px) && isFinite(pz)) {
      S.playerPos.x = px; S.playerPos.z = pz;
      if (isFinite(pyaw)) S.yaw = pyaw;
      if (isFinite(ppitch)) S.pitch = ppitch;
      S.gameStarted = true;
      document.getElementById('introOverlay').style.display = 'none';
    }
  }
}

export function updateJoystick(tx, ty) {
  let dx = tx - jsCenterX, dy = ty - jsCenterY;
  const max = 45, d = Math.sqrt(dx * dx + dy * dy);
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }
  knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  // Deadzone against finger jitter/creep; rescale the live range to 0..1.
  const m = Math.min(d, max), dead = max * JOY_DEADZONE;
  if (m < dead) { S.moveF = 0; S.moveR = 0; return; }
  const scaled = (m - dead) / (max - dead);
  S.moveF = (-dy / m) * scaled;
  S.moveR = ( dx / m) * scaled;
}
