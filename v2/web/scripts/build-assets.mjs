// Web assets for the viewer, from the Blender pipeline's output in v2/build/:
//   scene.glb            -> public/assets/apartment[-lite]/scene.gltf (meshopt geometry, WebP textures)
//   lightmaps/*.png      -> public/assets/lightmaps/*.webp (+ manifest.json)
//   collision.json       -> public/assets/collision.json
// Run after v2/blender/bake.py and export_collision.py:  npm run assets
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { mkdir, readFile, writeFile, copyFile, stat, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.resolve(here, "../../build");
const OUT = path.resolve(here, "../public/assets");
const mb = (n) => (n / 1e6).toFixed(1) + " MB";

await mkdir(path.join(OUT, "lightmaps"), { recursive: true });

// 1. the model, in two tiers: full (desktop, textures <= 2K) and lite
//    (iPad / phones, textures <= 1K). Written as .gltf + .bin + one file per
//    texture, so no file comes near the 25 MB limit of free static hosts and
//    the browser fetches the textures in parallel.
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
for (const [name, size, quality] of [["apartment", 2048, 88], ["apartment-lite", 1024, 80]]) {
  const doc = await io.read(path.join(BUILD, "scene.glb"));
  // the viewer lights everything from the lightmaps: drop the exported lamps
  const lights = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === "KHR_lights_punctual");
  if (lights) lights.dispose();
  // With only lightmaps (indirect diffuse) and no lights, normal and
  // roughness maps change nothing on a matte surface: keep them only where
  // the viewer adds reflections (same rule as Lightmaps.apply).
  let dropped = 0;
  for (const m of doc.getRoot().listMaterials()) {
    if (m.getMetallicFactor() > 0.5 || m.getRoughnessFactor() < 0.2) continue;
    for (const t of [m.getNormalTexture(), m.getMetallicRoughnessTexture()]) if (t) dropped++;
    m.setNormalTexture(null);
    m.setMetallicRoughnessTexture(null);
  }
  await doc.transform(
    dedup(),
    prune({ keepAttributes: true }),   // keep TEXCOORD_1: the lightmap UVs no material references
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [size, size], quality }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const dir = path.join(OUT, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await io.write(path.join(dir, "scene.gltf"), doc);
  const files = await readdir(dir);
  const sizes = await Promise.all(files.map(async (f) => (await stat(path.join(dir, f))).size));
  console.log(`${name}/: ${files.length} files, ${mb(sizes.reduce((a, b) => a + b, 0))}, largest ${mb(Math.max(...sizes))}` +
    ` (${dropped} unused normal/roughness maps dropped)`);
}

// 2. lightmaps
const manifest = JSON.parse(await readFile(path.join(BUILD, "lightmaps", "manifest.json"), "utf8"));
let total = 0;
for (const [mood, groups] of Object.entries(manifest.maps)) {
  for (const [group, entry] of Object.entries(groups)) {
    const src = path.join(BUILD, "lightmaps", entry.file);
    const file = entry.file.replace(/\.png$/, ".webp");
    const lite = entry.file.replace(/\.png$/, "-lite.webp");
    await sharp(src).webp({ quality: 92, effort: 5 }).toFile(path.join(OUT, "lightmaps", file));
    const half = Math.round(manifest.groups[group].size / 2);
    await sharp(src).resize(half, half).webp({ quality: 90, effort: 5 }).toFile(path.join(OUT, "lightmaps", lite));
    total += (await stat(path.join(OUT, "lightmaps", file))).size;
    entry.file = file;
    entry.lite = lite;
  }
}
await writeFile(path.join(OUT, "lightmaps", "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`lightmaps: ${Object.keys(manifest.maps).length} moods x ${Object.keys(manifest.groups).length} groups, ${mb(total)}`);

// 3. collision + rooms
await copyFile(path.join(BUILD, "collision.json"), path.join(OUT, "collision.json"));
console.log("collision.json copied");
