// Web assets for the viewer, from the Blender pipeline's output in v2/build/:
//   scene.glb            -> public/assets/apartment.glb  (meshopt geometry, WebP textures <= 2K)
//   lightmaps/*.png      -> public/assets/lightmaps/*.webp (+ manifest.json)
//   collision.json       -> public/assets/collision.json
// Run after v2/blender/bake.py and export_collision.py:  npm run assets
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.resolve(here, "../../build");
const OUT = path.resolve(here, "../public/assets");
const mb = (n) => (n / 1e6).toFixed(1) + " MB";

await mkdir(path.join(OUT, "lightmaps"), { recursive: true });

// 1. the model
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(path.join(BUILD, "scene.glb"));
// the viewer lights everything from the lightmaps: drop the exported lamps
const lights = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === "KHR_lights_punctual");
if (lights) lights.dispose();
await doc.transform(
  dedup(),
  prune({ keepAttributes: true }),   // keep TEXCOORD_1: the lightmap UVs no material references
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [2048, 2048], quality: 88 }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
const glb = path.join(OUT, "apartment.glb");
await io.write(glb, doc);
console.log(`apartment.glb ${mb((await stat(path.join(BUILD, "scene.glb"))).size)} -> ${mb((await stat(glb)).size)}`);

// 2. lightmaps
const manifest = JSON.parse(await readFile(path.join(BUILD, "lightmaps", "manifest.json"), "utf8"));
let total = 0;
for (const [mood, groups] of Object.entries(manifest.maps)) {
  for (const [group, entry] of Object.entries(groups)) {
    const src = path.join(BUILD, "lightmaps", entry.file);
    const file = entry.file.replace(/\.png$/, ".webp");
    await sharp(src).webp({ quality: 92, effort: 5 }).toFile(path.join(OUT, "lightmaps", file));
    total += (await stat(path.join(OUT, "lightmaps", file))).size;
    entry.file = file;
  }
}
await writeFile(path.join(OUT, "lightmaps", "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`lightmaps: ${Object.keys(manifest.maps).length} moods x ${Object.keys(manifest.groups).length} groups, ${mb(total)}`);

// 3. collision + rooms
await copyFile(path.join(BUILD, "collision.json"), path.join(OUT, "collision.json"));
console.log("collision.json copied");
