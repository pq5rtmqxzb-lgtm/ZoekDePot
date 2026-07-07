import * as THREE from 'three';

/* ===== SHARED MATERIALS / OBJECTS ===== */
export const WALL_MAT = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.92, metalness: 0 });
export const FLOOR_MAT = new THREE.MeshStandardMaterial({ color: 0xd9be99, roughness: 0.55, metalness: 0.04 });
// Ceilings face down, so they only catch the hemisphere light's ground tint
// and read nearly black. A soft emissive keeps them white painted plaster.
export const CEIL_MAT = new THREE.MeshStandardMaterial({
  color: 0xfafaf7, roughness: 0.95,
  emissive: 0xfff8ee, emissiveIntensity: 0.34,
});
export const BASEBOARD_MAT = new THREE.MeshStandardMaterial({ color: 0x5c4a3a, roughness: 0.7 });
export const TRIM_MAT = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.55, metalness: 0.15 });
export const CROWN_MAT = new THREE.MeshStandardMaterial({ color: 0xe0dcd4, roughness: 0.8 });
// Door casings: light painted wood (NL standard "blank gelakt" white-ish trim)
export const DOORFRAME_MAT = new THREE.MeshStandardMaterial({ color: 0xefece4, roughness: 0.55, metalness: 0.02 });
export const WINDOW_FRAME_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.7 });
// Door leaves: NL standard "blank gelakt" white, a touch warmer than the frames
export const DOOR_LEAF_MAT = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5, metalness: 0.02 });

// Residential additions
export const TILE_MAT       = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.45, metalness: 0.05 });
export const STONE_TILE_MAT = new THREE.MeshStandardMaterial({ color: 0xb6ada0, roughness: 0.85, metalness: 0.0 });
export const MATTRESS_MAT   = new THREE.MeshStandardMaterial({ color: 0xf3ece0, roughness: 0.9 });
export const LINEN_MAT      = new THREE.MeshStandardMaterial({ color: 0xc9d6dc, roughness: 0.85 });
export const PILLOW_MAT     = new THREE.MeshStandardMaterial({ color: 0xfbf5e8, roughness: 0.95 });
export const BEDFRAME_MAT   = new THREE.MeshStandardMaterial({ color: 0x4b3a28, roughness: 0.7 });
export const SOFA_MAT       = new THREE.MeshStandardMaterial({ color: 0x6d7a78, roughness: 0.95 });
export const TABLE_MAT      = new THREE.MeshStandardMaterial({ color: 0x5a432a, roughness: 0.55 });
export const CHAIR_MAT      = new THREE.MeshStandardMaterial({ color: 0x2e2418, roughness: 0.7 });
export const COUNTER_MAT    = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.35, metalness: 0.25 });
export const CABINET_MAT    = new THREE.MeshStandardMaterial({ color: 0xeae3d3, roughness: 0.55 });
// Stone monolith kitchen island (per the developer's marketing render): warm
// grey marble-ish block. Texture is generated in setupTextures.
export const MARBLE_MAT     = new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.30, metalness: 0.05 });
export const CERAMIC_MAT    = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.3, metalness: 0.05 });
export const GLASS_MAT      = new THREE.MeshStandardMaterial({ color: 0xb8ddee, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.0 });
export const METAL_MAT      = new THREE.MeshStandardMaterial({ color: 0x8e8e8e, roughness: 0.3, metalness: 0.85 });
export const RAILING_MAT    = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.7 });
export const WARDROBE_MAT   = new THREE.MeshStandardMaterial({ color: 0x8c6f4f, roughness: 0.55 });
export const SKY_MAT_PLACEHOLDER = null; // assigned after texture build

export const BARK_MAT = new THREE.MeshStandardMaterial({ color: 0x584736, roughness: 0.95 });
// Leaves get a soft self-glow: real foliage is translucent, but the
// hemisphere light leaves downward-facing normals nearly black.
export const LEAF_MATS = [0x4a6b38, 0x557a42, 0x3f5d33, 0x618a4d].map(
  c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true,
                                        emissive: c, emissiveIntensity: 0.42 }));
