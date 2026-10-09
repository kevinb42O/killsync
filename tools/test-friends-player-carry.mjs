import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3015';
const directory = process.env.FRIENDS_TEST_ARTIFACTS || '/tmp/friends-player-carry-review';
await mkdir(directory, { recursive: true });
const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const report = { checks: [], errors: [] };
let page;
try {
  page = await browser.newPage({ viewport: { width: 1100, height: 740 } });
  page.setDefaultTimeout(30000);
  page.on('pageerror', e => report.errors.push(e.message));
  await page.route('**/@vite/client', route => route.fulfill({ contentType:'application/javascript', body:'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s);}s.textContent=content;}export function removeStyle(id){document.getElementById(id)?.remove();}' }));
  await page.addInitScript(() => {
    localStorage.setItem('sunline.preferences.v1', JSON.stringify({ renderScale: 1, shadows: false }));
    localStorage.setItem('killsync.friends.menu.pause', 'true');
    let locked = null;
    Object.defineProperty(document, 'pointerLockElement', { get: () => locked });
    HTMLCanvasElement.prototype.requestPointerLock = function () { locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); };
    document.exitPointerLock = () => { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
  });
  await page.goto(origin + '/?mode=friends', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your name', { exact: true }).fill('Carrier');
  await page.getByRole('button', { name: 'Play on my own', exact: true }).click({ noWaitAfter: true });
  await page.locator('.coop-arena').waitFor({ state: 'attached', timeout:120000 });
  await page.waitForFunction(() => !document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'), undefined, { timeout: 120000 });
  // Move before mocking pointer lock; the synthetic absolute move must not
  // rotate the camera away from the teammate after setting up the shot.
  await page.mouse.move(550, 370);
  await page.evaluate(() => {
    const element = document.querySelector('.coop-arena'), key = Object.keys(element).find(k => k.startsWith('__reactFiber'));
    let fiber = element[key], simulation, bridge;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const value = hook.memoizedState?.current;
        if (value?.createSnapshot && value?.setInput) simulation = value;
        if (value?.getFriendsTerrain && value?.setFriendsTool) bridge = value;
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    if (!simulation || !bridge) throw new Error('Arena refs unavailable');
    const frontier = simulation.friendsFrontier;
    for (let x = 10800; x <= 12400; x += 400) frontier.terrain.addGrade([x, 12000, 0, 512]);
    for (const tree of frontier.treesNear(12000, 12000, 1200)) frontier.harvested.add(tree.id);
    frontier.snapshotCache = undefined;
    const host = [...simulation.players.values()][0];
    simulation.addPlayer({ id: 'carry-afk-guest', label: 'Friend', color: '#f90' });
    const guest = simulation.players.get('carry-afk-guest');
    Object.assign(host, { x: 12100, y: 12016, z: 0, angle: 0, verticalVelocity: 0 });
    Object.assign(guest, { x: 12220, y: 12016, z: 0, verticalVelocity: 0 });
    bridge.renderer.yaw = -Math.PI / 2; bridge.renderer.pitch = 0;
    window.carryReview = { simulation, bridge, host, guest };
    document.querySelector('.coop-arena canvas').requestPointerLock();
  });
  await page.keyboard.press('6');
  await page.waitForFunction(() => carryReview.simulation.inputByPlayer.get(carryReview.host.id)?.friendsTool === 5);
  await page.mouse.down();
  await page.waitForFunction(() => carryReview.simulation.friends.hauling.snapshot().playerRopes.length === 1);
  await page.mouse.up();
  assert.equal(await page.locator('.friends-player-carry').count(), 0);
  assert.equal(await page.locator('.friends-hauling-feedback').count(), 0);
  report.checks.push('real Rope shortcut and mouse shot attach a teammate without carry text or overlays');
  const initial = await page.evaluate(() => carryReview.guest.x);
  await page.keyboard.press('5');
  await page.keyboard.down('s');
  await page.waitForFunction(initial => carryReview.guest.x < initial - 200, initial);
  await page.keyboard.up('s');
  report.checks.push('switching tools and using real movement controls keeps the AFK passenger following');
  await page.screenshot({ path: directory + '/carrying.png' });
  report.rendering = await page.evaluate(() => ({
    glError: carryReview.bridge.renderer.renderer.getContext().getError(),
    ropes: carryReview.simulation.friends.hauling.snapshot().playerRopes.length,
    visibleRope: Boolean(carryReview.bridge.renderer.scene.getObjectByName('braided-hauling-rope')),
    gap: Math.hypot(carryReview.host.x - carryReview.guest.x, carryReview.host.y - carryReview.guest.y, carryReview.host.z - carryReview.guest.z),
  }));
  assert.equal(report.rendering.glError, 0); assert.equal(report.rendering.ropes, 1); assert(report.rendering.visibleRope);
  if (process.env.FRIENDS_CARRY_PERSPECTIVES === '1') {
    // Render one frozen, connected game state from each player's own camera.
    // Capture the game canvas itself, excluding the host's HTML HUD while
    // inspecting the passenger's first-person renderer.
    await page.evaluate(() => {
      const r = window.carryReview;
      r.frozen = r.simulation.createSnapshot();
      r.originalTick = r.simulation.tick; r.simulation.tick = () => {};
      r.originalRender = r.bridge.render;
      r.bridge.render = function (_snapshot, _localId, dt) {
        this.setFriendsTool(5, false, true, false);
        const result = r.originalRender.call(this, r.frozen, r.capturePlayer, dt, undefined, true, false);
        if (r.capturePending) {
          // Read before the WebGL drawing buffer is discarded on presentation.
          r.captureImage = this.renderer.renderer.domElement.toDataURL('image/png');
          r.capturePending = false;
        }
        return result;
      };
      r.capturePlayer = r.host.id;
      r.bridge.renderer.yaw = -Math.PI / 2; r.bridge.renderer.pitch = 0;
    });
    const capture = async filename => {
      await page.evaluate(() => { carryReview.captureImage = undefined; carryReview.capturePending = true; });
      await page.waitForFunction(() => Boolean(carryReview.captureImage));
      assert.equal(await page.evaluate(() => carryReview.bridge.renderer.viewmodelScene.getObjectByName('rope-launcher')?.visible), true);
      const data = await page.evaluate(() => carryReview.captureImage);
      await writeFile(directory + '/' + filename, Buffer.from(data.split(',')[1], 'base64'));
    };
    await page.waitForTimeout(800);
    await capture('carrier-ropegun-first-person.png');
    await page.evaluate(() => {
      const r = window.carryReview; r.capturePlayer = r.guest.id;
      r.bridge.renderer.yaw = Math.PI / 2; r.bridge.renderer.pitch = 0;
    });
    // Give the normal camera tracking spring time to settle on the passenger.
    await page.waitForTimeout(800);
    await capture('passenger-ropegun-first-person.png');
    await page.evaluate(() => {
      const r = window.carryReview; r.bridge.render = r.originalRender;
      r.simulation.tick = r.originalTick;
      r.bridge.renderer.yaw = -Math.PI / 2; r.bridge.renderer.pitch = 0;
    });
    report.checks.push('captured the same connected state from both first-person cameras with the ropegun equipped');
  }
  await page.keyboard.press('r');
  await page.waitForFunction(() => carryReview.simulation.friends.hauling.snapshot().playerRopes.length === 0);
  await page.waitForFunction(() => !document.querySelector('.friends-player-carry'));
  report.checks.push('real R input releases while another tool is equipped and removes the tether');
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = error.message;
  report.state = await page.evaluate(() => {
    const r = window.carryReview;
    return r ? { host: { x:r.host.x,y:r.host.y,z:r.host.z,angle:r.host.angle }, guest: { x:r.guest.x,y:r.guest.y,z:r.guest.z }, input:r.simulation.inputByPlayer.get(r.host.id), hauling:r.simulation.friends.hauling.snapshot().feedback, yaw:r.bridge.renderer.yaw,pitch:r.bridge.renderer.pitch, text:document.body.innerText } : { text:document.body.innerText };
  }).catch(() => null);
  await page.screenshot({ path: directory + '/failure.png' }).catch(() => {});
  console.error(JSON.stringify(report, null, 2));
  throw error;
} finally {
  await writeFile(directory + '/report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
