import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const directory = new URL('./', import.meta.url).pathname;
const report = { errors: [], checks: [], samples: [] };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 740 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem('killsync.friends.menu.pause', 'true'); });
  await page.goto('http://127.0.0.1:3033/?mode=friends', { waitUntil: 'domcontentloaded' });
  async function launch() {
    await page.getByLabel('Your name', { exact: true }).fill('Graphics verification');
    await page.getByRole('button', { name: 'Play on my own', exact: true }).click({ noWaitAfter: true });
    await page.locator('.coop-arena').waitFor({ state: 'attached' });
    await page.evaluate(() => {
      const element = document.querySelector('.coop-arena');
      let fiber = element[Object.keys(element).find(key => key.startsWith('__reactFiber'))], sim, bridge;
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook) {
          const value = hook.memoizedState?.current;
          if (value?.createSnapshot && value?.setInput) sim = value;
          if (value?.getFriendsTerrain && value?.setFriendsTool) bridge = value;
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      if (!sim || !bridge) throw new Error('Arena references unavailable');
      window.audit = { sim, bridge, frames: [], ticks: 0 };
      const render = bridge.render.bind(bridge), tick = sim.tick.bind(sim);
      bridge.render = (...args) => { audit.frames.push({ at: performance.now(), delta: args[2] }); return render(...args); };
      sim.tick = (...args) => { audit.ticks++; return tick(...args); };
      bridge.setFriendsEnvironment({ hour: 12, speed: 0 });
    });
    await page.waitForFunction(() => !audit.bridge.friendsWorldArrival.sequence.active);
    await page.waitForTimeout(5000);
  }
  const state = () => page.evaluate(() => {
    const b = audit.bridge, r = b.renderer.renderer, nv = b.renderer.nightVision, leaves = [];
    b.renderer.scene.traverse(o => { if (o.isInstancedMesh && o.name.startsWith('forest-') && o.name.includes('-leaves-')) leaves.push({ coverage: o.material.alphaToCoverage, cutoff: o.material.alphaTest, depth: o.material.depthWrite }); });
    return { preferences: JSON.parse(localStorage.getItem('sunline.preferences.v1')), samples: nv.buffer.samples, equipped: nv.equipped, buffer: [r.domElement.width, r.domElement.height], maxSamples: r.capabilities.maxSamples, leaves, glError: r.getContext().getError(), tick: audit.ticks, rendererMemory: r.info.memory };
  });
  async function openGraphics() {
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Graphics', exact: true }).click();
  }
  async function sample(label) {
    const start = await page.evaluate(() => { audit.frames = []; audit.ticks = 0; return performance.now(); });
    await page.waitForTimeout(6000);
    const result = await page.evaluate(start => {
      const frames = audit.frames, intervals = frames.slice(1).map((frame, i) => frame.at - frames[i].at).sort((a,b) => a-b);
      return { fps: frames.length * 1000 / (performance.now() - start), renders: frames.length, ticks: audit.ticks, meanDelta: frames.reduce((s,f) => s+f.delta, 0)/frames.length, p95: intervals[Math.floor(intervals.length*.95)], max: intervals.at(-1) };
    }, start);
    report.samples.push({ label, ...result, state: await state() });
    console.log(JSON.stringify({ label, ...result }));
  }
  await launch();
  report.checks.push({ label: 'Legacy defaults', state: await state() });
  await page.evaluate(() => { const player = [...audit.sim.players.values()][0]; Object.assign(player, { x: 6470, y: 5552, z: 704, verticalVelocity: 0 }); audit.bridge.renderer.yaw = -Math.PI/2; audit.bridge.renderer.pitch = -.1; });
  await page.waitForTimeout(8000);
  await openGraphics();
  assert.equal(await page.getByLabel('Anti-aliasing', { exact: true }).inputValue(), 'auto');
  assert.equal(await page.getByLabel('Frame-rate limit', { exact: true }).inputValue(), '0');
  await page.screenshot({ path: directory + 'graphics-desktop.png' });
  await page.getByLabel('Render resolution', { exact: true }).selectOption('0.7');
  await page.getByLabel('Anti-aliasing', { exact: true }).selectOption('0');
  await page.getByLabel('Frame-rate limit', { exact: true }).selectOption('30');
  await page.getByLabel('Frame-rate limit', { exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await page.getByLabel('Render resolution', { exact: true }).inputValue(), '0.7');
  await page.screenshot({ path: directory + 'graphics-performance-controls.png' });
  await page.getByRole('button', { name: /Back to island/ }).click();
  await page.waitForTimeout(8000);
  let current = await state();
  assert.equal(current.samples, 0); assert.equal(current.preferences.renderScale, .7); assert.equal(current.preferences.frameLimit, 30);
  assert(current.leaves.length > 0 && current.leaves.every(leaf => !leaf.coverage && leaf.cutoff > 0 && leaf.depth));
  await sample('70%, AA off, 30 FPS limit');
  await page.screenshot({ path: directory + 'game-aa-off.png' });
  await page.keyboard.press('n'); await page.waitForTimeout(1500);
  assert.equal((await state()).equipped, true);
  await page.screenshot({ path: directory + 'night-vision-aa-off.png' });
  await page.keyboard.press('n');
  // Check pacing and simulation when GPU work has ample headroom.
  await openGraphics(); await page.getByLabel('Render resolution', { exact: true }).selectOption('0.5');
  await page.getByRole('button', { name: /Back to island/ }).click(); await page.waitForTimeout(5000);
  await sample('50%, AA off, 30 FPS limit');
  assert(report.samples.at(-1).fps <= 31);
  const beforeMove = await page.evaluate(() => { const p = [...audit.sim.players.values()][0]; return { x: p.x, y: p.y }; });
  await page.keyboard.down('z'); await page.waitForTimeout(1000); await page.keyboard.up('z');
  const afterMove = await page.evaluate(() => { const p = [...audit.sim.players.values()][0]; return { x: p.x, y: p.y }; });
  report.checks.push({ label: 'Movement under frame cap', beforeMove, afterMove });
  assert(Math.hypot(afterMove.x-beforeMove.x, afterMove.y-beforeMove.y) > 1);
  await openGraphics();
  await page.getByLabel('Render resolution', { exact: true }).selectOption('1');
  await page.getByLabel('Anti-aliasing', { exact: true }).selectOption('4');
  await page.getByLabel('Frame-rate limit', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: /Back to island/ }).click(); await page.waitForTimeout(8000);
  current = await state(); assert.equal(current.samples, Math.min(4,current.maxSamples));
  assert(current.leaves.every(leaf => leaf.coverage)); assert.equal(current.buffer[0], 2200);
  await page.screenshot({ path: directory + 'game-aa-high.png' });
  report.checks.push({ label: 'Full quality restored', state: current });
  // Save the lighter setting in the actual menu, then reopen the game after a reload.
  await openGraphics(); await page.getByLabel('Render resolution', { exact: true }).selectOption('0.7');
  await page.getByLabel('Anti-aliasing', { exact: true }).selectOption('0');
  await page.getByLabel('Frame-rate limit', { exact: true }).selectOption('30');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Anti-aliasing', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: directory + 'graphics-mobile.png' });
  const overflow = await page.locator('.friends-pause').evaluate(el => el.scrollWidth > el.clientWidth);
  assert.equal(overflow, false);
  await page.setViewportSize({ width: 1100, height: 740 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await launch(); current = await state();
  assert.equal(current.preferences.antialiasing, 0); assert.equal(current.preferences.frameLimit, 30); assert.equal(current.samples, 0);
  assert(current.leaves.length > 0 && current.leaves.every(leaf => !leaf.coverage));
  report.checks.push({ label: 'Saved settings restored on reload', state: current });
  assert.equal(report.errors.length, 0); assert(report.checks.every(check => !check.state || check.state.glError === 0));
  report.passed = true;
} catch (error) { report.failure = String(error); throw error; }
finally { await writeFile(directory + 'verification.json', JSON.stringify(report, null, 2)); await browser.close(); }
