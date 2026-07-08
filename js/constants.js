/* ===== CONSTANTS ===== */
export const WALL_HEIGHT = 2.80;
export const WALL_THICK = 0.20;
export const PLAYER_H = 1.70;   // eye height for a 1.80 m-tall person (~0.10 m below the crown)
export const PLAYER_R = 0.26;   // collision radius — small enough to stand right up to a counter

// Camera field of view. A wide FOV makes rooms/furniture look much smaller
// than real life (the screen only fills ~40° of your visual field, so a 100°+
// horizontal rendering minifies everything). We hold the HORIZONTAL fov at
// ~80° and derive the vertical fov from the aspect ratio, clamped for
// portrait phones. PerspectiveCamera takes the VERTICAL fov in degrees.
export const HORIZ_FOV_DEG = 80;
export function scaledFov(aspect) {
  const h = (HORIZ_FOV_DEG * Math.PI) / 360;          // half horizontal fov, rad
  const v = 2 * Math.atan(Math.tan(h) / aspect) * (180 / Math.PI);
  return Math.max(45, Math.min(80, v));
}
export const MOVE_SPEED = 3.0;
export const ACCEL = 14.0;         // 1/s — exponential approach rate to target velocity
export const DECEL = 11.0;         // slightly softer stop
export const JOY_DEADZONE = 0.18;  // fraction of the joystick radius that does nothing
export const BOB_AMP = 0.018;      // m — head-bob amplitude at full walking speed
export const BOB_FREQ = 9.0;       // rad/s — head-bob frequency at full walking speed
export const LOOK_SPEED = 0.003;

// Apartment envelope (outermost walkable extent, balconies included).
// Matches the railings at index.html addRailing(...) calls below.
export const ENV = { xMin: -1.55, xMax: 10.74, zMin: -1.08, zMax: 17.55 };

// Ceiling height — must stay in sync with apartment.json:levels[0].ceiling_height_m.
// init() asserts this matches WALL_HEIGHT.
export const CEILING_FROM_JSON = 2.80;

// Per-room tile cadence + the base material each floor kind starts from.
export const FLOOR_TILE = { hout: [2.0, 2.5], tegel: [1.2, 1.2], steen: [1.5, 1.5] };

// Wall paint palette (named, real-paint-ish). The plaster map is near-white so
// material.color multiplies into a believable painted-plaster tint.
export const PAINT_PALETTE = [
  { name: 'Gebroken wit', hex: 0xf0ece4 },
  { name: 'Warm crème',   hex: 0xe9dcc4 },
  { name: 'Zacht salie',  hex: 0xc7cdb8 },
  { name: 'Saliegroen',   hex: 0x9aa886 },
  { name: 'Kleigrijs',    hex: 0xbcb3a4 },
  { name: 'Terracotta',   hex: 0xc08457 },
  { name: 'Oudroze',      hex: 0xd8b5ad },
  { name: 'Diepblauw',    hex: 0x3f5670 },
  { name: 'Antraciet',    hex: 0x55585c },
  { name: 'Mosterd',      hex: 0xc69a3e },
  { name: 'Donkergroen',  hex: 0x42584a },
];
export const DEFAULT_WALL_HEX = 0xf0ece4;

// Default floor finish id per kind (set once FLOOR_FINISHES is built).
export const KIND_DEFAULT_FINISH = { hout: 'naturel_eiken', tegel: 'tegel', steen: 'natuursteen' };

export const WALK_TURN_SPEED = 3.0;   // rad/s auto-turn toward the target
export const WALK_ARRIVE = 0.25;      // m — close enough, stop

export const TOD_FADE = 1.0;     // seconds

export const GROUND_Y = -6.2;
