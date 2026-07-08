import * as THREE from 'three';
import { S } from './state.js';
import { updatePointLights } from './lights.js';

/* --- time-of-day ----------------------------------------------------- */
export const TOD = {
  dag:   { hemiSky: 0xeff4fa, hemiGround: 0x3a3028, hemiI: 0.70,
           sun: 0xfff4d8, sunI: 0.55, sunPos: [6, 18, -8],
           bg: 0xb8c8d8, fog: 0xb8c8d8, fogNear: 22, fogFar: 60,
           exposure: 1.10, pointMul: 1.0, sky: 0xffffff },
  avond: { hemiSky: 0xf3ddc4, hemiGround: 0x2a2018, hemiI: 0.42,
           sun: 0xffb066, sunI: 0.34, sunPos: [-10, 9, -6],
           bg: 0xc99a72, fog: 0xb9885f, fogNear: 16, fogFar: 52,
           exposure: 1.06, pointMul: 1.3, sky: 0xffc596 },
  nacht: { hemiSky: 0x202a3c, hemiGround: 0x141009, hemiI: 0.16,
           sun: 0x35435f, sunI: 0.10, sunPos: [4, 14, 6],
           bg: 0x141821, fog: 0x10131b, fogNear: 12, fogFar: 46,
           exposure: 1.22, pointMul: 1.8, sky: 0x2a3552 },
};

// Preset hexes/arrays -> lerpable Colors/Vector3.
export function todTargets(t) {
  return {
    hemiSky: new THREE.Color(t.hemiSky), hemiGround: new THREE.Color(t.hemiGround),
    hemiI: t.hemiI,
    sun: new THREE.Color(t.sun), sunI: t.sunI, sunPos: new THREE.Vector3(...t.sunPos),
    bg: new THREE.Color(t.bg), fog: new THREE.Color(t.fog),
    fogNear: t.fogNear, fogFar: t.fogFar,
    exposure: t.exposure, pointMul: t.pointMul,
    sky: new THREE.Color(t.sky),
  };
}

// Snapshot the LIVE values so a re-click mid-fade retargets gracefully.
export function todSnapshot() {
  return {
    hemiSky: S.hemiLight.color.clone(), hemiGround: S.hemiLight.groundColor.clone(),
    hemiI: S.hemiLight.intensity,
    sun: S.sunLight.color.clone(), sunI: S.sunLight.intensity, sunPos: S.sunLight.position.clone(),
    bg: S.scene.background.clone(), fog: S.scene.fog.color.clone(),
    fogNear: S.scene.fog.near, fogFar: S.scene.fog.far,
    exposure: S.renderer.toneMappingExposure, pointMul: S.curPointMul,
    sky: S.skyMat ? S.skyMat.color.clone() : new THREE.Color(0xffffff),
  };
}

export function applyTodState(s) {
  if (S.hemiLight) {
    S.hemiLight.color.copy(s.hemiSky);
    S.hemiLight.groundColor.copy(s.hemiGround);
    S.hemiLight.intensity = s.hemiI;
  }
  if (S.sunLight) {
    S.sunLight.color.copy(s.sun);
    S.sunLight.intensity = s.sunI;
    S.sunLight.position.copy(s.sunPos);
  }
  S.curPointMul = s.pointMul;
  updatePointLights();   // single owner of intensity (mood × distance cull)
  if (S.scene.background) S.scene.background.copy(s.bg);
  if (S.scene.fog) { S.scene.fog.color.copy(s.fog); S.scene.fog.near = s.fogNear; S.scene.fog.far = s.fogFar; }
  if (S.renderer) S.renderer.toneMappingExposure = s.exposure;
  if (S.skyMat) S.skyMat.color.copy(s.sky);
}

export const todMix = (a, b, e) => a + (b - a) * e;
export const smoothstep = t => t * t * (3 - 2 * t);

// Field-wise blend of two lerpable states (from todTargets/todSnapshot).
export function lerpTodStates(f, g, e) {
  return {
    hemiSky: f.hemiSky.clone().lerp(g.hemiSky, e),
    hemiGround: f.hemiGround.clone().lerp(g.hemiGround, e),
    hemiI: todMix(f.hemiI, g.hemiI, e),
    sun: f.sun.clone().lerp(g.sun, e),
    sunI: todMix(f.sunI, g.sunI, e),
    sunPos: f.sunPos.clone().lerp(g.sunPos, e),
    bg: f.bg.clone().lerp(g.bg, e),
    fog: f.fog.clone().lerp(g.fog, e),
    fogNear: todMix(f.fogNear, g.fogNear, e),
    fogFar: todMix(f.fogFar, g.fogFar, e),
    exposure: todMix(f.exposure, g.exposure, e),
    pointMul: todMix(f.pointMul, g.pointMul, e),
    sky: f.sky.clone().lerp(g.sky, e),
  };
}

export function applyTodLerp(anim) {
  applyTodState(lerpTodStates(anim.from, anim.to, smoothstep(anim.t)));
}

/* Continuous time of day: t ∈ [0..1] runs dag (0) → avond (0.5) → nacht (1)
 * as piecewise keyframes, eased inside each half so the presets land exact. */
export const TOD_PRESETS = [['dag', 'Dag', 0], ['avond', 'Avond', 0.5], ['nacht', 'Nacht', 1]];

export function todTargetsAt(t) {
  t = Math.max(0, Math.min(1, t));
  return t <= 0.5
    ? lerpTodStates(todTargets(TOD.dag), todTargets(TOD.avond), smoothstep(t / 0.5))
    : lerpTodStates(todTargets(TOD.avond), todTargets(TOD.nacht), smoothstep((t - 0.5) / 0.5));
}

export function setTimeOfDayT(t, instant = false) {
  t = Math.max(0, Math.min(1, +t || 0));
  S.scheme.tod = t;
  const to = todTargetsAt(t);
  if (instant || !S.hemiLight || !S.sunLight) {
    S.todAnim = null;
    applyTodState(to);
    return;
  }
  S.todAnim = { from: todSnapshot(), to, t: 0 };  // animate() drives the fade
}

// Named-mood wrapper (kept for the preset buttons and old call sites).
export function setTimeOfDay(mode, instant = false) {
  const preset = TOD_PRESETS.find(([id]) => id === mode);
  setTimeOfDayT(preset ? preset[2] : 0, instant);
}
