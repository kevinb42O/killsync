import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3000';
const directory = 'artifacts/shovel-merge';
await mkdir(directory, { recursive: true });
const report = { origin, checks: [], errors: [] };
const check = name => { report.checks.push(name); console.log('PASS', name); };
const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 740 } });
page.setDefaultTimeout(60000);
page.on('pageerror', e => report.errors.push(e.message));
try {
  await page.addInitScript(() => {
    localStorage.setItem('sunline.preferences.v1', JSON.stringify({ renderScale: .7, shadows: false }));
    localStorage.setItem('cinematicEffects', 'subtle');
    localStorage.setItem('killsync.friends.menu.pause', 'true');
    let locked = null;
    Object.defineProperty(document, 'pointerLockElement', { get: () => locked });
    HTMLCanvasElement.prototype.requestPointerLock = function () { locked = this; queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange'))); return Promise.resolve(); };
    document.exitPointerLock = () => { locked = null; queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange'))); };
  });
  // Match the existing rendering harness: keep hot refresh from resetting the
  // disposable test island while other local development is running.
  await page.route('**/@vite/client', route => route.fulfill({ contentType: 'application/javascript', body: 'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s);}s.textContent=content;}export function removeStyle(id){document.getElementById(id)?.remove();}' }));
  await page.goto(origin + '/?mode=friends', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your name', { exact: true }).fill('Shovel review');
  await page.getByRole('button', { name: 'Play on my own', exact: true }).click({ noWaitAfter: true });
  await page.locator('.coop-arena').waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'), undefined, { timeout: 120000 });
  await page.evaluate(() => {
    const element = document.querySelector('.coop-arena'), key = Object.keys(element).find(k => k.startsWith('__reactFiber'));
    let fiber = element[key], simulation, bridge, input;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const value = hook.memoizedState?.current;
        if (value?.createSnapshot && value?.setInput) simulation = value;
        if (value?.getFriendsTerrain && value?.setFriendsTool) bridge = value;
        if (value?.type === 'input') input = hook.memoizedState;
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    if (!simulation || !bridge || !input) throw new Error('Arena test refs not found');
    const f = simulation.friendsFrontier, p = [...simulation.players.values()][0];
    window.shovelReview = { simulation, bridge, input, start: { mined: f.snapshot().mined, soil: f.pack(p).soil }, contacts: [] };
    f.terrain.addGrade([8000, 8000, 0, 512]); f.terrain.set(250, 250, -1, 2);
    p.x = 7952; p.y = 8016; p.z = 0; p.verticalVelocity = 0;
    input.current.selectedSlot = 3;
    bridge.renderer.yaw = -Math.PI / 2; bridge.renderer.pitch = -Math.atan2(26, 64);
    const contact = f.contact.bind(f);
    f.contact = (...args) => {
      contact(...args);
      const r = window.shovelReview, filling = Boolean(r.input.current.aiming);
      r.contacts.push({ fill: filling, broken: args[2], zoom: p.isAiming });
      window.dispatchEvent(new MouseEvent('mouseup', { button: filling ? 2 : 0, bubbles: true }));
    };
  });
  await page.keyboard.press('3');
  await page.waitForFunction(() => document.querySelector('.frontier-toolbelt [aria-pressed=true]')?.textContent.includes('Shovel'));
  assert.equal(await page.locator('.frontier-toolbelt').getByText('Earthwork', { exact: true }).count(), 0);
  assert.equal(await page.locator('.frontier-toolbelt').getByText('Shovel', { exact: true }).count(), 1);
  check('one Shovel slot; Earthwork removed');
  await page.mouse.move(550, 370);
  await page.evaluate(() => { const r = window.shovelReview; r.bridge.renderer.yaw = -Math.PI / 2; r.bridge.renderer.pitch = -Math.atan2(26, 64); });
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => window.shovelReview.contacts.some(c => c.fill));
  await page.mouse.up({ button: 'right' });
  const filled = await page.evaluate(() => {
    const r = window.shovelReview, f = r.simulation.friendsFrontier;
    return { cell: f.terrain.material(250, 250, 0), mined: f.snapshot().mined - r.start.mined, soil: f.pack([...r.simulation.players.values()][0]).soil - r.start.soil, zoom: r.bridge.renderer.isAimingDownSights, contacts: r.contacts };
  });
  assert.equal(filled.cell, 1); assert.equal(filled.mined, 0); assert.equal(filled.soil, 0); assert.equal(filled.zoom, false);
  assert.equal(filled.contacts.filter(c => c.fill).length, 1);
  assert.equal(filled.contacts[0].zoom, false);
  check('right mouse alone fills against stone with no zoom, including artifact slot selected');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.shovelReview.simulation.friendsFrontier.terrain.material(250, 250, 1)), 0);
  check('right mouse release stops placement');
  await page.screenshot({ path: directory + '/filled.png' });
  await page.mouse.down();
  await page.waitForFunction(() => window.shovelReview.contacts.some(c => c.broken));
  await page.mouse.up();
  const dug = await page.evaluate(() => {
    const r = window.shovelReview, f = r.simulation.friendsFrontier;
    return { cell: f.terrain.material(250, 250, 0), mined: f.snapshot().mined - r.start.mined, soil: f.pack([...r.simulation.players.values()][0]).soil - r.start.soil };
  });
  assert.deepEqual(dug, { cell: 0, mined: 1, soil: 1 });
  check('left mouse digs the filled soil once and awards one soil');
  await page.mouse.down({ button: 'right' });
  await page.keyboard.press('m');
  await page.locator('.friends-map').waitFor();
  await page.waitForTimeout(500);
  const menuState = await page.evaluate(() => {
    const r = window.shovelReview;
    return { aiming: r.input.current.aiming, cell: r.simulation.friendsFrontier.terrain.material(250, 250, 0) };
  });
  assert.deepEqual(menuState, { aiming: false, cell: 0 });
  await page.mouse.up({ button: 'right' });
  await page.keyboard.press('m');
  await page.locator('.friends-map').waitFor({ state: 'detached' });
  check('opening the atlas cancels a held shovel fill before contact');

  await page.keyboard.press('4');
  await page.waitForFunction(() => document.querySelector('.frontier-toolbelt [aria-pressed=true]')?.textContent.includes('Combat'));
  await page.keyboard.press('5');
  await page.waitForFunction(() => document.querySelector('.frontier-toolbelt [aria-pressed=true]')?.textContent.includes('Rope'));
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => document.querySelector('.frontier-toolbelt [aria-pressed=true]')?.textContent.includes('Axe'));
  check('Combat is 4, Rope is 5, wheel wraps to Axe');
  await page.keyboard.press('2');
  await page.evaluate(() => { window.shovelReview.input.current.selectedSlot = 0; });
  await page.waitForFunction(() => [...window.shovelReview.simulation.players.values()][0].selectedSlot === 0);
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => window.shovelReview.bridge.renderer.isAimingDownSights);
  check('right mouse still zooms with Pickaxe');
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => !window.shovelReview.bridge.renderer.isAimingDownSights);
  assert.deepEqual(report.errors, []);
  check('no browser runtime errors');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error);
  report.state = await page.evaluate(() => {
    const r = window.shovelReview;
    return r && { input: r.input.current, player: [...r.simulation.players.values()][0], contacts: r.contacts, frontier: r.simulation.friendsFrontier.snapshot().interaction };
  }).catch(() => null);
  await page.screenshot({ path: directory + '/failure.png' }).catch(() => {});
  throw error;
} finally {
  await writeFile(directory + '/checks.json', JSON.stringify(report, null, 2));
  await browser.close();
}
