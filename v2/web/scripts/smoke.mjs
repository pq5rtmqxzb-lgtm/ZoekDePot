// Smoke test for the v2 viewer: starts Vite, opens the viewer in headless
// Chromium, checks it loads with baked lightmaps, walks with the keyboard
// (and is stopped by a wall), switches moods, and saves screenshots to
// v2/docs/renders/web_*.png.   npm test   (after npm run assets)
import { spawn } from "node:child_process";
import { chromium, devices } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../../docs/renders");
const PORT = 5181;
const BASE = `http://localhost:${PORT}/`;

const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: path.resolve(here, ".."), stdio: "pipe" });
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  const open = async (query) => {
    await page.goto(BASE + query);
    await page.waitForFunction(() => window.__viewer?.ready, null, { timeout: 180000 });
    await page.waitForTimeout(1500);
  };

  // 1. loads, spawns in the gang, lightmaps applied
  await open("");
  let s = await page.evaluate(() => window.__viewer.state());
  check("loads + spawns in the gang", s.room === "Gang", `room=${s.room}`);
  check("baked materials have lightmaps", s.baked > 20, `baked=${s.baked}`);
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  // 2. walking east from the spawn: moves, then the wall stops it
  await page.mouse.click(640, 360);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(6000);
  await page.keyboard.up("KeyW");
  const s2 = await page.evaluate(() => window.__viewer.state());
  check("walks forward", s2.x > s.x + 0.5, `x ${s.x.toFixed(2)} -> ${s2.x.toFixed(2)}`);
  check("stays inside the flat", s2.room !== "", `room=${s2.room} at (${s2.x.toFixed(2)}, ${s2.z.toFixed(2)})`);

  // 3. screenshots: same spots as the Blender previews, per mood
  const shots = [
    ["woonkamer", "?pos=9.25,13.45,11.6,-2.2&mood=day&hud=0"],
    ["avond", "?pos=9.25,13.45,11.6,-2.2&mood=evening&hud=0"],
    ["nacht", "?pos=9.25,13.45,11.6,-2.2&mood=night&hud=0"],
    ["keuken", "?pos=9.6,12.8,66.6,-8.3&mood=day&hud=0"],
    ["slaapk1", "?pos=2.3,3.85,-49.5,-12.4&mood=day&hud=0"],
    ["badkamer", "?pos=6.6,4.7,126.2,-13.1&mood=day&hud=0"],
  ];
  for (const [name, q] of shots) {
    await open(q);
    await page.screenshot({ path: path.join(OUT, `web_${name}.png`) });
    const st = await page.evaluate(() => window.__viewer.state());
    console.log(`  web_${name}.png  room=${st.room} mood=${st.mood} calls=${st.info.calls} tris=${st.info.triangles} textures=${st.textures}`);
  }
  check("no page errors after all shots", errors.length === 0, errors.slice(0, 3).join(" | "));

  // 4. the lite tier (iPad / phones): 1K textures, half-size lightmaps, same scene
  await open("?quality=lite&pos=9.25,13.45,11.6,-2.2&mood=day&hud=0");
  const sl = await page.evaluate(() => window.__viewer.state());
  check("lite tier loads", sl.tier === "lite" && sl.baked > 20, `tier=${sl.tier} baked=${sl.baked}`);
  await page.screenshot({ path: path.join(OUT, "web_woonkamer_lite.png") });
  check("no page errors (lite)", errors.length === 0, errors.slice(0, 3).join(" | "));

  // 5. an emulated iPad (touch, coarse pointer): picks the lite tier on its own,
  //    walks with the touch stick (drag on the left half)
  // (pixel ratio 1: software WebGL at 2x makes every touch event wait seconds for a frame)
  await page.close();                     // its render loop would compete for the (software) GPU
  const ipad = await browser.newContext({ ...devices["iPad Pro 11 landscape"], deviceScaleFactor: 1 });
  const tab = await ipad.newPage();
  tab.on("pageerror", (e) => errors.push(String(e)));
  await tab.goto(BASE + "?hud=0", { waitUntil: "domcontentloaded", timeout: 120000 });
  await tab.waitForFunction(() => window.__viewer?.ready, null, { timeout: 180000 });
  const t0 = await tab.evaluate(() => window.__viewer.state());
  check("iPad picks the lite tier", t0.tier === "lite", `tier=${t0.tier}`);
  const vp = tab.viewportSize();
  const cdp = await ipad.newCDPSession(tab);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent",
    { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const sx = vp.width * 0.2, sy = vp.height * 0.7;
  await touch("touchStart", sx, sy);
  for (let i = 1; i <= 3; i++) { await touch("touchMove", sx, sy - 20 * i); }
  await tab.waitForTimeout(4000);
  await touch("touchEnd", 0, 0);
  const t1 = await tab.evaluate(() => window.__viewer.state());
  const moved = Math.hypot(t1.x - t0.x, t1.z - t0.z);
  check("iPad walks with the touch stick", moved > 0.5, `moved ${moved.toFixed(2)} m`);
  await tab.screenshot({ path: path.join(OUT, "web_ipad.png") });
  check("no page errors (iPad)", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ipad.close();
  await browser.close();
} finally {
  server.kill();
}
process.exit(failed ? 1 : 0);
