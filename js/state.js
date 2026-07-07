import * as THREE from 'three';
import { PLAYER_H } from './constants.js';

/* ===== STATE =====
 * Single mutable namespace for all cross-module top-level state. */
export const S = {
  camera: null, scene: null, renderer: null, clock: null,
  // Spawn inside the gang (south part, well clear of every wall).
  playerPos: new THREE.Vector3(1.90, PLAYER_H, 8.75),
  yaw: 0, pitch: 0,
  moveF: 0, moveR: 0,
  velX: 0, velZ: 0,     // smoothed world-space walking velocity
  bobPhase: 0,          // head-bob oscillator phase
  gameStarted: false,
  /* Keyboard state */
  keys: {},
  isMobile: ('ontouchstart' in window),
  MODEL: null,
  geom: null,
  rooms: null,
  wallSegs: [],
  wallMeshes: [],       // { mesh, seg, index } for every solid wall
  obstacles: [],
  currentRoom: null,    // room the player is standing in (design target)
  lastRoom: null,       // most recent room we were inside (edit fallback)
  accentArm: false,     // accent-wall pick mode active
  accentHex: 0xc08457,  // currently selected accent colour
  FLOOR_FINISHES: [],   // [{ id, name, mat }], built in setupTextures
  skyMat: null,         // sky cyclorama material (tinted by time-of-day)
  hemiLight: null, sunLight: null,
  pointLightInfo: [],   // { light, baseI, disc, baseColor }
  // Per-room design choices, serialised for save/share.
  scheme: { v: 1, tod: 'dag', rooms: {}, acc: {} },
  todAnim: null,        // { from, to, t } while fading between moods
  curPointMul: 1.0,     // live point-light multiplier (snapshot source)
  texAniso: 1,
  raycaster: new THREE.Raycaster(),
  /* Tap-to-walk state ("tik waar je heen wilt lopen") */
  walkTarget: null,     // { x, z } world-space goal on the floor
  walkMarker: null,     // pulsing floor ring shown while auto-walking
  walkPrevDist: 0, walkStuckT: 0,
  minimapOn: false,
  doors: [],            // { pivot, base, seg, angle, target } hinged leaves
};
