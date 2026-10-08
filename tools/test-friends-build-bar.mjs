import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3014';
const directory = 'artifacts/build-bar';
await mkdir(directory, { recursive: true });
const report = { origin, checks: [], errors: [] };
const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 740 } });
page.setDefaultTimeout(45000);
page.on('pageerror', error => report.errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('sunline.preferences.v1', JSON.stringify({ renderScale: .7, shadows: false }));
  localStorage.setItem('cinematicEffects', 'subtle');
  localStorage.setItem('killsync.friends.menu.pause', 'true');
  let locked = null;
  Object.defineProperty(document, 'pointerLockElement', { get: () => locked });
  HTMLCanvasElement.prototype.requestPointerLock = function () { locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); };
  document.exitPointerLock = () => { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
});
await page.route('**/@vite/client', route => route.fulfill({ contentType: 'application/javascript', body: 'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s);}s.textContent=content;}export function removeStyle(id){document.getElementById(id)?.remove();}' }));
const enter = async () => {
  await page.goto(origin + '/?mode=friends', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your name', { exact: true }).fill('Build bar review');
  await page.getByRole('button', { name: 'Play on my own', exact: true }).click({ noWaitAfter: true });
  await page.locator('.coop-arena').waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'), undefined, { timeout: 120000 });
  await page.keyboard.press('b');
  // Island startup can delay keyup beyond the existing hold-B threshold.
  // Close the library if that tap was interpreted as a hold under load.
  await page.locator('.build-system').waitFor();
  if (await page.getByRole('button', { name: 'Close construction library', exact: true }).count()) {
    await page.getByRole('button', { name: 'Close construction library', exact: true }).click();
  }
  await page.locator('.build-quickbar[data-visible=true]').waitFor();
};
const selectedSlot = () => page.locator('.build-quickbar .build-toolbar button[aria-pressed=true]').getAttribute('aria-label');
const waitSlot = index => page.waitForFunction(index => document.querySelector('.build-quickbar .build-toolbar button[aria-pressed=true]')?.getAttribute('aria-label')?.startsWith(`Slot ${index}:`), index);
const wheel = async (deltaY, shiftKey = false, overBar = false) => {
  await page.evaluate(({ deltaY, shiftKey, overBar }) => {
    const target = overBar ? document.querySelector('.build-quickbar .build-toolbar') : window;
    target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, shiftKey }));
  }, { deltaY, shiftKey, overBar });
};
try {
  await enter();
  console.log('Entered build mode');
  assert.equal(await page.locator('.build-quickbar .build-toolbar button').count(), 8);
  const dimensions = await page.locator('.build-quickbar').boundingBox();
  assert.ok(dimensions.width < 600 && dimensions.height < 75);
  report.desktopDimensions = dimensions;
  await page.screenshot({ path: directory + '/desktop.png' });
  report.checks.push('eight icon slots fit in a bar under 600px wide and 75px tall');

  await wheel(100);
  await waitSlot(2);
  assert.match(await selectedSlot(), /^Slot 2:/);
  await page.keyboard.press('8');
  await waitSlot(8);
  await wheel(100);
  await waitSlot(1);
  assert.match(await selectedSlot(), /^Slot 1:/);
  await wheel(-100);
  await waitSlot(8);
  assert.match(await selectedSlot(), /^Slot 8:/);
  report.checks.push('world scroll follows slot order and wraps both ways; number shortcuts select directly');

  await page.getByRole('button', { name: 'Construction controls', exact: true }).click();
  const rotation = () => page.locator('.build-controls__angle').innerText();
  assert.equal(await rotation(), '0°');
  await wheel(120, true);
  await page.waitForFunction(() => document.querySelector('.build-controls__angle')?.textContent === '90°');
  assert.equal(await rotation(), '90°');
  assert.match(await selectedSlot(), /^Slot 8:/);
  await page.keyboard.press('r');
  await page.waitForFunction(() => document.querySelector('.build-controls__angle')?.textContent === '180°');
  assert.equal(await rotation(), '180°');
  await page.getByRole('button', { name: 'Construction controls', exact: true }).click();
  await wheel(100, false, true);
  await waitSlot(1);
  assert.match(await selectedSlot(), /^Slot 1:/);
  report.checks.push('Shift scroll and R rotate without selecting; scrolling over the bar selects once');

  await page.getByRole('button', { name: 'Open construction library', exact: true }).click();
  await page.getByLabel('Search construction pieces').fill('bench');
  await page.getByRole('button', { name: /^Bench / }).dragTo(page.locator('.build-toolbar button').nth(3));
  assert.match(await page.locator('.build-toolbar button').nth(3).getAttribute('aria-label'), /Bench/);
  await page.locator('.build-toolbar button').nth(3).dragTo(page.locator('.build-toolbar button').nth(0));
  assert.match(await page.locator('.build-toolbar button').nth(0).getAttribute('aria-label'), /Bench/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('killsync.friends.build-toolbar.v1')));
  assert.equal(saved[0], 'bench');
  assert.equal(saved[3], 'block');
  assert.equal(new Set(saved).size, 8);
  report.checks.push('dragging a library item assigns a slot; dragging slots swaps them without duplicates and saves the order');
  await page.waitForTimeout(5200);
  assert.equal(await page.getByRole('dialog', { name: 'Construction library' }).count(), 1);
  await page.screenshot({ path: directory + '/library.png' });
  report.checks.push('idle timeout leaves the construction library open and accessible');
  await page.getByRole('button', { name: 'Close construction library', exact: true }).click();
  await page.mouse.move(20, 20);
  await page.waitForTimeout(5600);
  assert.equal(await page.locator('.build-quickbar').getAttribute('data-visible'), 'false');
  assert.equal(await page.locator('.build-quickbar').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('.build-quickbar').getAttribute('inert'), '');
  await page.screenshot({ path: directory + '/idle.png' });
  await wheel(100);
  assert.equal(await page.locator('.build-quickbar').getAttribute('data-visible'), 'true');
  report.checks.push('bar hides after five seconds, leaves accessibility/focus, and returns on scroll');

  await page.setViewportSize({ width: 375, height: 740 });
  await page.keyboard.press('8');
  await waitSlot(8);
  const narrow = await page.locator('.build-quickbar').boundingBox();
  assert.ok(narrow.x >= 0 && narrow.x + narrow.width <= 375 && narrow.height < 75);
  const scroll = await page.locator('.build-quickbar .build-toolbar').evaluate(node => ({ width: node.clientWidth, content: node.scrollWidth, left: node.scrollLeft, selected: node.querySelector('[aria-pressed=true]').getBoundingClientRect(), bounds: node.getBoundingClientRect() }));
  assert.ok(scroll.content > scroll.width && scroll.left > 0);
  assert.ok(scroll.selected.x >= scroll.bounds.x && scroll.selected.right <= scroll.bounds.right + 1);
  await page.screenshot({ path: directory + '/narrow.png' });
  report.checks.push('375px layout remains compact, scrolls horizontally, and brings the selected slot into view');

  await page.setViewportSize({ width: 1100, height: 740 });
  await enter();
  assert.match(await page.locator('.build-toolbar button').nth(0).getAttribute('aria-label'), /Bench/);
  assert.match(await selectedSlot(), /^Slot 1: Bench/);
  report.checks.push('saved customization is restored after a full game reload');
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error);
  await page.screenshot({ path: directory + '/failure.png' }).catch(() => {});
  throw error;
} finally {
  await writeFile(directory + '/checks.json', JSON.stringify(report, null, 2));
  await browser.close();
}
