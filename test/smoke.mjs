/* Playwright smoke test for the walkthrough app.
 *
 * Usage:  python3 -m http.server 8123   (repo root, separate terminal)
 *         node test/smoke.mjs
 * Env:    PW_EXECUTABLE_PATH  chromium binary override (sandboxes/CI images
 *                             that pre-install a browser); default = the
 *                             browser Playwright downloaded itself.
 *         BASE_URL            default http://localhost:8123
 *
 * Headless note: software WebGL can run at ~2 fps, so movement distances are
 * asserted with generous thresholds — we test "moves at all", not speed.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8123';
const ARTIFACTS = new URL('./artifacts/', import.meta.url).pathname;
mkdirSync(ARTIFACTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const launchOpts = process.env.PW_EXECUTABLE_PATH
  ? { executablePath: process.env.PW_EXECUTABLE_PATH }
  : {};
const browser = await chromium.launch(launchOpts);

// World↔minimap mapping (mirrors mapXY in the app: ENV envelope, pad 8,
// canvas 150x224 CSS px).
const ENV = { xMin: -1.55, xMax: 10.74, zMin: -1.08, zMax: 17.55 };
const MAP_SCALE = Math.min(134 / (ENV.xMax - ENV.xMin), 208 / (ENV.zMax - ENV.zMin));
const mapPoint = (wx, wz) => ({
  x: 8 + (wx - ENV.xMin) * MAP_SCALE,
  y: 8 + (wz - ENV.zMin) * MAP_SCALE,
});

/* ---------- Desktop ---------- */
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(BASE + '/index.html');
await page.waitForFunction(() => typeof window.__state === 'function', null, { timeout: 20000 });
check('app boots (window.__state present)', true);

await page.click('#startBtn');
await page.waitForTimeout(600);

const label0 = await page.textContent('#roomLabel');
check('HUD shows room + m²', /Gang · \d+,\d m²/.test(label0), `label="${label0}"`);

const s0 = await page.evaluate(() => window.__state());
check('spawn in gang', s0.room === 'gang', JSON.stringify(s0));

// WASD forward in the open corridor
await page.keyboard.down('w');
await page.waitForTimeout(1000);
await page.keyboard.up('w');
const sWalk = await page.evaluate(() => window.__state());
check('WASD walking works',
      Math.hypot(sWalk.x - s0.x, sWalk.z - s0.z) > 0.05,
      `moved ${Math.hypot(sWalk.x - s0.x, sWalk.z - s0.z).toFixed(2)} m`);

// Minimap: open with M, click woonkamer centre (world 8.5, 6.5) → teleport
await page.keyboard.press('m');
await page.waitForTimeout(300);
check('minimap opens with M', await page.isVisible('#minimap'));

const mapBox = await page.evaluate(() => {
  const b = document.getElementById('minimap').getBoundingClientRect();
  return { x: b.left, y: b.top };
});
const wk = mapPoint(8.5, 6.5);
await page.mouse.click(mapBox.x + wk.x, mapBox.y + wk.y);
await page.waitForTimeout(400);
const s1 = await page.evaluate(() => window.__state());
check('minimap click teleports to woonkamer', s1.room === 'woonkamer',
      `pos=(${s1.x.toFixed(2)}, ${s1.z.toFixed(2)}) room=${s1.room}`);

const label1 = await page.textContent('#roomLabel');
check('HUD updates after teleport', /Woonkamer · \d+,\d m²/.test(label1), `label="${label1}"`);

// Click the minimap padding corner (outside the plan) → must not move
const beforeNoop = await page.evaluate(() => window.__state());
await page.mouse.click(mapBox.x + 4, mapBox.y + 4);
await page.waitForTimeout(300);
const afterNoop = await page.evaluate(() => window.__state());
check('minimap click outside plan is ignored',
      Math.hypot(afterNoop.x - beforeNoop.x, afterNoop.z - beforeNoop.z) < 0.3,
      `moved ${Math.hypot(afterNoop.x - beforeNoop.x, afterNoop.z - beforeNoop.z).toFixed(2)} m`);

// Design panel: open with I, paint a wall, switch mood
await page.keyboard.press('i');
await page.waitForTimeout(400);
check('design panel opens with I',
      await page.evaluate(() => document.getElementById('designPanel').classList.contains('open')));

// The toast's `.show` class only lives 1.9 s — under slow headless rendering
// Playwright's click can take longer than that to resolve, so assert on the
// persistent toast text rather than the transient class.
const swatch = page.locator('#dpWallSwatches .swatch').nth(2);
await swatch.click();
await page.waitForTimeout(300);
check('wall swatch paints (selected + toast)',
      await swatch.evaluate(el => el.classList.contains('sel')) &&
      await page.evaluate(() =>
        document.getElementById('dpToast').textContent.length > 0));

// The 1 s mood fade advances at most 0.05 s of animation per frame (dt
// clamp), so at headless ~2 fps it needs ~10 s wall time — hence 30 s.
await page.click('#dpTod .modeBtn[data-tod="avond"]');
await page.waitForFunction(
  () => { const s = window.__state(); return s.tod === 0.5 && !s.todFading; },
  null, { timeout: 30000 });
check('time-of-day fades to avond (tod 0.5)', true);

// Continuous slider: setting 0.75 applies instantly (no fade) and lands
// between the avond and nacht exposures.
const expAvond = await page.evaluate(() => window.__state().exposure);
await page.fill('#dpTodSlider', '0.75');
await page.dispatchEvent('#dpTodSlider', 'input');
await page.waitForTimeout(200);
const s75 = await page.evaluate(() => window.__state());
check('TOD slider applies instantly', s75.tod === 0.75 && !s75.todFading,
      `tod=${s75.tod} fading=${s75.todFading}`);
check('slider mood sits between presets',
      s75.exposure > Math.min(1.06, 1.22) - 1e-6 && s75.exposure < Math.max(1.06, 1.22) + 1e-6 &&
      Math.abs(s75.exposure - expAvond) > 0.001,
      `exposure=${s75.exposure} (avond was ${expAvond})`);

await page.click('#dpTod .modeBtn[data-tod="dag"]');
await page.waitForFunction(
  () => { const s = window.__state(); return s.tod === 0 && !s.todFading; },
  null, { timeout: 30000 });
await page.keyboard.press('Escape');   // close panel

await page.screenshot({ path: ARTIFACTS + 'desktop.png' });
check('no page errors (desktop)', errors.length === 0, errors.join(' | '));
await page.close();

/* ---------- Doors (fresh page, spawn next to the badkamer door) ---------- */
const dpage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const derrors = [];
dpage.on('pageerror', e => derrors.push(String(e)));
// Gang corridor at (3.2, 5.9), 0.6 m from the badkamer door, facing east (+X).
await dpage.goto(BASE + '/index.html?pos=3.2,5.9,-1.5708');
await dpage.waitForFunction(() => typeof window.__state === 'function', null, { timeout: 20000 });
await dpage.waitForFunction(() => window.__state().doorOpen >= 1, null, { timeout: 30000 });
check('door opens on approach', true);

// Walk east through the open doorway into the badkamer — the span must stay
// walkable (door leaves have no collision).
await dpage.keyboard.down('w');
try {
  await dpage.waitForFunction(() => window.__state().room === 'badkamer', null, { timeout: 30000 });
  check('doorway stays walkable (entered badkamer)', true);
} catch {
  const st = await dpage.evaluate(() => window.__state());
  check('doorway stays walkable (entered badkamer)', false, JSON.stringify(st));
}
await dpage.keyboard.up('w');

// Teleport to the south balcony (far from every door) → all doors close.
await dpage.keyboard.press('m');
await dpage.waitForTimeout(300);
const dmapBox = await dpage.evaluate(() => {
  const b = document.getElementById('minimap').getBoundingClientRect();
  return { x: b.left, y: b.top };
});
const bz = mapPoint(8.0, 16.5);
await dpage.mouse.click(dmapBox.x + bz.x, dmapBox.y + bz.y);
await dpage.waitForFunction(() => window.__state().doorOpen === 0, null, { timeout: 30000 });
check('doors close when far away', true);
check('no page errors (doors)', derrors.length === 0, derrors.join(' | '));
await dpage.close();

/* ---------- Measure tool (fresh page, in the gang corridor) ---------- */
const mepage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const meerrors = [];
mepage.on('pageerror', e => meerrors.push(String(e)));
await mepage.goto(BASE + '/index.html?pos=3.21,7.5,-1.5708');   // facing the berging wall
await mepage.waitForFunction(() => typeof window.__state === 'function', null, { timeout: 20000 });
await mepage.keyboard.press('r');
await mepage.waitForTimeout(300);
check('measure mode arms (R key)',
      await mepage.evaluate(() => document.getElementById('measureToggle').classList.contains('armed')));

// Two unlocked clicks measure at the clicked screen points.
await mepage.mouse.click(640, 400);
await mepage.waitForFunction(() => window.__state().measurePts.length === 1, null, { timeout: 15000 });
await mepage.mouse.click(640, 780);
await mepage.waitForFunction(() => window.__state().measurePts.length === 2, null, { timeout: 15000 });
const me = await mepage.evaluate(() => window.__state());
const [A, B] = me.measurePts;
const expect = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
const inBounds = p => p[0] > -2 && p[0] < 11 && p[1] >= 0 && p[1] <= 2.8 && p[2] > -2 && p[2] < 18;
check('measure points hit real surfaces', inBounds(A) && inBounds(B),
      JSON.stringify(me.measurePts));
check('measured distance matches the two points',
      me.measureDist !== null && Math.abs(me.measureDist - expect) < 1e-6,
      `dist=${me.measureDist?.toFixed(3)} expect=${expect.toFixed(3)}`);
await mepage.waitForTimeout(600);   // a frame for the label projection
const labelText = await mepage.textContent('#measureLabel');
check('measure label shows formatted metres',
      new RegExp(`^${me.measureDist.toFixed(2).replace('.', ',')} m$`).test(labelText),
      `label="${labelText}"`);
await mepage.screenshot({ path: ARTIFACTS + 'measure.png' });

// Third click restarts; Escape clears and disarms.
await mepage.mouse.click(400, 400);
await mepage.waitForFunction(() => window.__state().measurePts.length === 1, null, { timeout: 15000 });
await mepage.keyboard.press('Escape');
await mepage.waitForFunction(() => window.__state().measurePts.length === 0, null, { timeout: 15000 });
check('third click restarts, Escape clears',
      await mepage.evaluate(() => !document.getElementById('measureToggle').classList.contains('armed')));
check('no page errors (measure)', meerrors.length === 0, meerrors.join(' | '));
await mepage.close();

/* ---------- Legacy v1 scheme URL still loads ---------- */
const v1enc = Buffer.from(JSON.stringify(
  { v: 1, tod: 'nacht', rooms: {}, acc: {} })).toString('base64');
const vpage = await browser.newPage();
const verrors = [];
vpage.on('pageerror', e => verrors.push(String(e)));
await vpage.goto(BASE + '/index.html#scheme=' + v1enc);
await vpage.waitForFunction(() => typeof window.__state === 'function', null, { timeout: 20000 });
await vpage.waitForFunction(() => window.__state().tod === 1, null, { timeout: 15000 });
check('v1 scheme URL maps nacht to tod 1', true);
check('no page errors (v1 scheme)', verrors.length === 0, verrors.join(' | '));
await vpage.close();

/* ---------- Custom furniture placer ---------- */
const fpage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const ferrors = [];
fpage.on('pageerror', e => ferrors.push(String(e)));
await fpage.goto(BASE + '/index.html');
await fpage.waitForFunction(() => typeof window.__state === 'function', null, { timeout: 20000 });
await fpage.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await fpage.click('#startBtn');
await fpage.keyboard.press('i');
await fpage.waitForTimeout(400);
await fpage.fill('#furName', 'Testkast');
await fpage.fill('#furW', '120');
await fpage.fill('#furD', '60');
await fpage.fill('#furH', '180');
await fpage.click('#furPlace');
await fpage.waitForFunction(() => window.__state().furCount === 1, null, { timeout: 15000 });
const fur0 = (await fpage.evaluate(() => window.__state())).fur[0];
check('furniture spawns with entered dimensions',
      fur0.name === 'Testkast' && fur0.w === 120 && fur0.d === 60 && fur0.h === 180,
      JSON.stringify(fur0));

// Teleport onto the item via the minimap: resolveCollision must push the
// player back out of its footprint (it collides like real furniture).
await fpage.keyboard.press('Escape');   // close panel
await fpage.keyboard.press('m');
await fpage.waitForTimeout(300);
const fmapBox = await fpage.evaluate(() => {
  const b = document.getElementById('minimap').getBoundingClientRect();
  return { x: b.left, y: b.top };
});
const onFur = mapPoint(fur0.x, fur0.z);
await fpage.mouse.click(fmapBox.x + onFur.x, fmapBox.y + onFur.y);
await fpage.waitForTimeout(400);
const fs = await fpage.evaluate(() => window.__state());
const clearX = Math.abs(fs.x - fur0.x) - (0.60 + 0.26);   // aabb half-w + player r
const clearZ = Math.abs(fs.z - fur0.z) - (0.30 + 0.26);
check('furniture blocks the player (teleport pushed out)',
      clearX > -0.02 || clearZ > -0.02,
      `player=(${fs.x.toFixed(2)}, ${fs.z.toFixed(2)}) fur=(${fur0.x}, ${fur0.z})`);

// Rotate 45°, then share + reload: the item must survive the round-trip.
await fpage.keyboard.press('i');
await fpage.waitForTimeout(400);
await fpage.click('#furList .furRow button:nth-of-type(2)');   // Draai
const furRot = (await fpage.evaluate(() => window.__state())).fur[0];
check('rotate changes ry by 45°', Math.abs(furRot.ry - fur0.ry - Math.PI / 4) < 0.01,
      `ry ${fur0.ry} -> ${furRot.ry}`);
await fpage.click('#dpShare');
await fpage.waitForFunction(() => location.hash.includes('scheme='), null, { timeout: 15000 });
await fpage.reload();
await fpage.waitForFunction(() => typeof window.__state === 'function', null, { timeout: 20000 });
await fpage.waitForFunction(() => window.__state().furCount === 1, null, { timeout: 15000 });
check('furniture survives share-URL reload', true);

// Delete removes mesh + obstacle.
await fpage.click('#startBtn');
await fpage.keyboard.press('i');
await fpage.waitForTimeout(400);
await fpage.click('#furList .furRow button:nth-of-type(3)');   // Verwijder
await fpage.waitForFunction(() => window.__state().furCount === 0, null, { timeout: 15000 });
check('delete removes the item', true);
check('no page errors (furniture)', ferrors.length === 0, ferrors.join(' | '));
await fpage.close();

/* ---------- Mobile emulation ---------- */
const mob = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const mpage = await mob.newPage();
const merrors = [];
mpage.on('pageerror', e => merrors.push(String(e)));
await mpage.goto(BASE + '/index.html');
await mpage.waitForFunction(() => typeof window.__state === 'function', null, { timeout: 20000 });
await mpage.tap('#startBtn');
await mpage.waitForTimeout(500);

await mpage.tap('#mapToggle');
await mpage.waitForTimeout(300);
check('mobile: Kaart button opens minimap', await mpage.isVisible('#minimap'));

const mw = mapPoint(8.5, 6.5);
await mpage.tap('#minimap', { position: { x: mw.x, y: mw.y } });
await mpage.waitForTimeout(400);
const m1 = await mpage.evaluate(() => window.__state());
check('mobile: minimap tap teleports to woonkamer', m1.room === 'woonkamer',
      `pos=(${m1.x.toFixed(2)}, ${m1.z.toFixed(2)}) room=${m1.room}`);

// Tap-to-walk on the canvas (tap the floor ahead, low-centre of screen)
const before = await mpage.evaluate(() => window.__state());
await mpage.touchscreen.tap(195, 600);
await mpage.waitForTimeout(1500);
const after = await mpage.evaluate(() => window.__state());
check('mobile: tap-to-walk works',
      Math.hypot(after.x - before.x, after.z - before.z) > 0.1,
      `moved ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(2)} m`);

await mpage.screenshot({ path: ARTIFACTS + 'mobile.png' });
check('no page errors (mobile)', merrors.length === 0, merrors.join(' | '));

await browser.close();
console.log(results.join('\n'));
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
