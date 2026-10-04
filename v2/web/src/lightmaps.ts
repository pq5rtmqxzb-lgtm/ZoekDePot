// Baked lighting: every baked surface shows  albedo x lightmap x scale.
// three.js treats a lightMap as irradiance and multiplies it by the Lambert
// BRDF (albedo / pi), hence lightMapIntensity = scale * pi.
import * as THREE from "three";
import { PropertyBinding } from "three";

export type Mood = "day" | "evening" | "night";

export interface Manifest {
  groups: Record<string, { size: number; objects: string[] }>;
  maps: Record<string, Record<string, { file: string; lite?: string; scale: number }>>;
}

// Per mood: background, exposure (Blender AgX exposure in stops, as in
// v2/blender/lighting.py), brightness of the unbaked exterior, bulbs on?
export const MOOD_LOOK: Record<Mood, { sky: number; exposure: number; outside: number; bulbs: boolean }> = {
  day: { sky: 0xcdd7df, exposure: 1.3, outside: 1.0, bulbs: false },
  evening: { sky: 0xe2a77a, exposure: 1.4, outside: 0.35, bulbs: true },
  night: { sky: 0x0d1220, exposure: 1.4, outside: 0.06, bulbs: true },
};

interface Baked { mat: THREE.MeshStandardMaterial; group: string }

export class Lightmaps {
  private textures = new Map<string, THREE.Texture>();   // `${mood}/${group}`
  private baked: Baked[] = [];
  private outside: { mat: THREE.MeshBasicMaterial; color: THREE.Color }[] = [];
  private bulbs: THREE.MeshStandardMaterial[] = [];

  /** `env`: a soft reflection map, given only to metal, glass and glossy
   * materials (a scene-wide environment would light everything twice). */
  constructor(private manifest: Manifest, private base: string, private env: THREE.Texture,
              private lite = false) {}

  async load(loader: THREE.TextureLoader): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const [mood, groups] of Object.entries(this.manifest.maps)) {
      for (const [group, entry] of Object.entries(groups)) {
        const file = this.lite && entry.lite ? entry.lite : entry.file;
        jobs.push(loader.loadAsync(`${this.base}/${file}`).then((t) => {
          t.colorSpace = THREE.SRGBColorSpace;   // encoded with the sRGB curve: decodes to linear
          t.flipY = false;                       // glTF UV convention
          t.channel = 1;                         // TEXCOORD_1 = the lightmap UVs
          t.generateMipmaps = true;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          this.textures.set(`${mood}/${group}`, t);
        }));
      }
    }
    await Promise.all(jobs);
  }

  /** Give every baked mesh its group's lightmap (one material clone per
   * material x group), turn the rest into unlit exterior or glass. */
  apply(root: THREE.Object3D): void {
    const groupOf = new Map<string, string>();
    for (const [g, info] of Object.entries(this.manifest.groups)) {
      for (const n of info.objects) groupOf.set(PropertyBinding.sanitizeNodeName(n), g);
    }
    const clones = new Map<string, THREE.MeshStandardMaterial>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const group = groupOf.get(mesh.name) ?? groupOf.get(mesh.parent?.name ?? "");
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const out = mats.map((m) => {
        const std = m as THREE.MeshStandardMaterial;
        if (group) {
          const key = `${std.uuid}/${group}`;
          let c = clones.get(key);
          if (!c) {
            c = std.clone();
            // lightmap = all the light; metal and glossy tiles also get a
            // touch of reflection from the environment map
            const shine = std.metalness > 0.5 ? 0.6 : std.roughness < 0.2 ? 0.15 : 0;
            c.envMap = shine ? this.env : null;
            c.envMapIntensity = shine;
            clones.set(key, c);
            this.baked.push({ mat: c, group });
          }
          return c;
        }
        if (std.name === "M_bulb") { this.bulbs.push(std); return std; }
        if (std.transparent || std.opacity < 1) {                         // glass: reflections only
          std.envMap = this.env;
          std.envMapIntensity = 0.5;
          return std;
        }
        const basic = new THREE.MeshBasicMaterial({ map: std.map ?? null, color: std.color.clone() });
        this.outside.push({ mat: basic, color: std.color.clone() });
        return basic;
      });
      mesh.material = Array.isArray(mesh.material) ? out : out[0];
    });
  }

  setMood(mood: Mood): void {
    for (const b of this.baked) {
      const entry = this.manifest.maps[mood]?.[b.group];
      b.mat.lightMap = this.textures.get(`${mood}/${b.group}`) ?? null;
      b.mat.lightMapIntensity = (entry?.scale ?? 1) * Math.PI;
      b.mat.needsUpdate = true;
    }
    const look = MOOD_LOOK[mood];
    for (const o of this.outside) o.mat.color.copy(o.color).multiplyScalar(look.outside);
    for (const m of this.bulbs) m.emissiveIntensity = look.bulbs ? 6 : 0;
  }

  get bakedMaterialCount(): number { return this.baked.length; }
}
