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
  () => { const s = window.__state(); return s.tod === 'avond' && !s.todFading; },
  null, { timeout: 30000 });
check('time-of-day fades to avond', true);
await page.click('#dpTod .modeBtn[data-tod="dag"]');
await page.waitForFunction(
  () => { const s = window.__state(); return s.tod === 'dag' && !s.todFading; },
  null, { timeout: 30000 });
await page.keyboard.press('Escape');   // close panel

await page.screenshot({ path: ARTIFACTS + 'desktop.png' });
check('no page errors (desktop)', errors.length === 0, errors.join(' | '));
await page.close();

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
