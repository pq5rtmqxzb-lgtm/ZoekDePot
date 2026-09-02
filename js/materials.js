import * as THREE from 'three';

/* ===== SHARED MATERIALS / OBJECTS =====
 * Colours follow the Technische Omschrijving + kleur- en materiaalstaat of
 * Ypsilon Park where it speaks: wanden behangklaar (here: painted plaster),
 * plafonds sausklaar wit, binnenkozijnen + binnendeuren wit RAL 9010,
 * buitenkozijnen Red Grandis transparant gelakt met kleurbeits, gevel
 * verticale Basralocus delen (onbehandeld) met zwart voegprofiel, balkonhek
 * glas met hardhouten handrail, sanitair wit, badkamerradiator wit. */
export const WALL_MAT = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.92, metalness: 0 });
export const FLOOR_MAT = new THREE.MeshStandardMaterial({ color: 0xd9be99, roughness: 0.55, metalness: 0.04 });
// Ceilings face down, so they only catch the hemisphere light's ground tint
// and read nearly black. A soft emissive keeps them white painted plaster.
export const CEIL_MAT = new THREE.MeshStandardMaterial({
  color: 0xfafaf7, roughness: 0.95,
  emissive: 0xfff8ee, emissiveIntensity: 0.34,
});
// Slim white plint (the apartment is delivered without plinten; a modern white
// 7 cm one is what buyers add with a floor).
export const BASEBOARD_MAT = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.5, metalness: 0.02 });
// Binnenkozijnen: hardhouten nestelkozijnen, wit RAL 9010.
export const DOORFRAME_MAT = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5, metalness: 0.02 });
// Buitenkozijnen + schuifpuien: Red Grandis, transparant gelakt met kleurbeits.
export const WINDOW_FRAME_MAT = new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.55, metalness: 0.02 });
// Binnendeuren: vlakke stompe deur, fabrieksmatig gelakt (wit).
export const DOOR_LEAF_MAT = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.45, metalness: 0.02 });
// Woningentreedeur: vlakke deur met hardhoutfineer, transparant gelakt.
export const ENTRANCE_LEAF_MAT = new THREE.MeshStandardMaterial({ color: 0x8a5e3c, roughness: 0.5, metalness: 0.02 });
// Kunststeen binnendorpel (badkamer/toilet), antraciet.
export const DORPEL_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6, metalness: 0.05 });

// Residential additions
export const TILE_MAT       = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.45, metalness: 0.05 });
export const WALL_TILE_MAT  = new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.35, metalness: 0.05 });
export const STONE_TILE_MAT = new THREE.MeshStandardMaterial({ color: 0xb6ada0, roughness: 0.85, metalness: 0.0 });
export const CARPET_MAT     = new THREE.MeshStandardMaterial({ color: 0xb9b8b3, roughness: 1.0, metalness: 0.0 });
// Gevelbekleding: verticale Basralocus delen met zwart aluminium voegprofiel.
export const CLADDING_MAT   = new THREE.MeshStandardMaterial({ color: 0x9a7a5a, roughness: 0.85, metalness: 0.0 });
// Algemene ruimten: limewash "betonlook" wanden, lamellenplafond.
export const LIMEWASH_MAT   = new THREE.MeshStandardMaterial({ color: 0xb8b4ad, roughness: 0.95, metalness: 0.0 });
export const LAMEL_CEIL_MAT = new THREE.MeshStandardMaterial({ color: 0xb8916a, roughness: 0.8, metalness: 0.0,
                                                               emissive: 0x6a5237, emissiveIntensity: 0.25 });
export const CONCRETE_MAT   = new THREE.MeshStandardMaterial({ color: 0xc9c7c2, roughness: 0.9, metalness: 0.0 });
export const MATTRESS_MAT   = new THREE.MeshStandardMaterial({ color: 0xf3ece0, roughness: 0.9 });
export const LINEN_MAT      = new THREE.MeshStandardMaterial({ color: 0xc9d6dc, roughness: 0.85 });
export const LINEN2_MAT     = new THREE.MeshStandardMaterial({ color: 0xd9cbb4, roughness: 0.85 });
export const PILLOW_MAT     = new THREE.MeshStandardMaterial({ color: 0xfbf5e8, roughness: 0.95 });
export const BEDFRAME_MAT   = new THREE.MeshStandardMaterial({ color: 0x4b3a28, roughness: 0.7 });
export const SOFA_MAT       = new THREE.MeshStandardMaterial({ color: 0x6d7a78, roughness: 0.95 });
export const RUG_MAT        = new THREE.MeshStandardMaterial({ color: 0xc8b9a2, roughness: 1.0 });
export const TABLE_MAT      = new THREE.MeshStandardMaterial({ color: 0x5a432a, roughness: 0.55 });
export const CHAIR_MAT      = new THREE.MeshStandardMaterial({ color: 0x2e2418, roughness: 0.7 });
export const COUNTER_MAT    = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.35, metalness: 0.25 });
export const CABINET_MAT    = new THREE.MeshStandardMaterial({ color: 0xeae3d3, roughness: 0.55 });
export const CABINET_DARK_MAT = new THREE.MeshStandardMaterial({ color: 0x3b3f42, roughness: 0.6 });
// Stone monolith kitchen island (per the developer's marketing render): warm
// grey marble-ish block. Texture is generated in setupTextures.
export const MARBLE_MAT     = new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.30, metalness: 0.05 });
export const CERAMIC_MAT    = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.25, metalness: 0.05 });
export const GLASS_MAT      = new THREE.MeshStandardMaterial({ color: 0xb8ddee, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.0 });
export const PANE_MAT       = new THREE.MeshStandardMaterial({
  color: 0xd6e8ee, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
  // roughness well above mirror-smooth: a point light a metre away would
  // otherwise smear one specular blob over the whole pane.
  roughness: 0.18, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.015, depthWrite: false,
});
export const FROSTED_MAT    = new THREE.MeshStandardMaterial({ color: 0xe6ecee, transparent: true, opacity: 0.72, roughness: 0.6, side: THREE.DoubleSide });
export const METAL_MAT      = new THREE.MeshStandardMaterial({ color: 0x8e8e8e, roughness: 0.3, metalness: 0.85 });
export const BLACK_METAL_MAT = new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.45, metalness: 0.7 });
export const ALU_MAT        = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.4, metalness: 0.8 });
// Lift doors / postkast: RAL 1035 parelgrijs (pearl metallic beige-grey)
export const RAL1035_MAT    = new THREE.MeshStandardMaterial({ color: 0x8d8a7c, roughness: 0.35, metalness: 0.6 });
export const RAILING_MAT    = BLACK_METAL_MAT;
export const HANDRAIL_MAT   = new THREE.MeshStandardMaterial({ color: 0x8a6748, roughness: 0.6, metalness: 0.0 });
export const WARDROBE_MAT   = new THREE.MeshStandardMaterial({ color: 0x8c6f4f, roughness: 0.55 });
export const WHITE_LACQUER_MAT = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.35, metalness: 0.02 });
export const RADIATOR_MAT   = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.4, metalness: 0.1 });
export const APPLIANCE_MAT  = new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.4, metalness: 0.15 });
export const SCREEN_MAT     = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.2, metalness: 0.4 });
export const PLANT_POT_MAT  = new THREE.MeshStandardMaterial({ color: 0x8b8378, roughness: 0.9 });
export const PLANT_LEAF_MAT = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.9, flatShading: true,
                                                               emissive: 0x2a4a28, emissiveIntensity: 0.25, side: THREE.DoubleSide });
export const BOOK_MATS      = [0xb35a4a, 0x3d5a80, 0xe0c58a, 0x4f6d4f, 0xf1eee6, 0x6b4c9a].map(
  c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
export const SKY_MAT_PLACEHOLDER = null; // assigned after texture build

export const BARK_MAT = new THREE.MeshStandardMaterial({ color: 0x584736, roughness: 0.95 });
// Leaves get a soft self-glow: real foliage is translucent, but the
// hemisphere light leaves downward-facing normals nearly black.
export const LEAF_MATS = [0x4a6b38, 0x557a42, 0x3f5d33, 0x618a4d].map(
  c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true,
                                        emissive: c, emissiveIntensity: 0.42 }));
