import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const directory = 'artifacts/campfire-lighting-fix';
await mkdir(directory, { recursive: true });
const report = { method: 'Sequential production builds of current workspace, changing only campfire lighting; Chromium/Metal, DPR 2, 1100x740 CSS viewport, solo host, fixed noon and camera. RAF includes normal simulation and streaming.', errors: [], samples: [] };
for (const [variant, port] of [['before', 3031], ['after', 3032]]) {
  const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 740 }, deviceScaleFactor: 2 });
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => report.errors.push({ variant, message: error.message }));
    page.on('console', message => { if (message.type() === 'error') report.errors.push({ variant, message: message.text() }); });
    await page.addInitScript(() => {
      localStorage.setItem('killsync.friends.menu.pause', 'true');
      localStorage.setItem('sunline.preferences.v1', JSON.stringify({ renderScale: 1, shadows: true }));
      window.frameSamples = [];
      let previous;
      function frame(now) { if (previous) frameSamples.push({ at: now, ms: now - previous }); previous = now; requestAnimationFrame(frame); }
      requestAnimationFrame(frame);
    });
    await page.route('**/assets/FriendsMenuScene-*.js', route => route.fulfill({ contentType: 'application/javascript', body: 'export function createFriendsMenuScene(){return()=>{};}' }));
    await page.goto(`http://127.0.0.1:${port}/?mode=friends`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Your name', { exact: true }).fill('Campfire check');
    await page.getByRole('button', { name: 'Play on my own', exact: true }).click({ noWaitAfter: true });
    await page.locator('.coop-arena').waitFor({ state: 'attached' });
    await page.evaluate(() => {
      const element = document.querySelector('.coop-arena');
      let fiber = element[Object.keys(element).find(key => key.startsWith('__reactFiber'))], simulation, bridge;
      while (fiber) { let hook = fiber.memoizedState; while (hook) { const value = hook.memoizedState?.current; if (value?.createSnapshot && value?.setInput) simulation = value; if (value?.getFriendsTerrain && value?.setFriendsTool) bridge = value; hook = hook.next; } fiber = fiber.return; }
      if (!simulation || !bridge) throw Error('Arena references unavailable');
      window.check = { simulation, bridge, renders: [] };
      bridge.setFriendsEnvironment({ hour: 12, speed: 0 });
      const render = bridge.render.bind(bridge);
      bridge.render = function(...args) { const start = performance.now(); try { return render(...args); } finally { check.renders.push({ at: start, ms: performance.now() - start, stats: bridge.getPerformanceStats() }); } };
    });
    await page.waitForFunction(() => !check.bridge.friendsWorldArrival.sequence.active);
    await page.evaluate(() => {
      const player = [...check.simulation.players.values()][0];
      Object.assign(player, { x: 6470, y: 5552, z: 704, verticalVelocity: 0 });
      check.bridge.renderer.yaw = -Math.PI / 2; check.bridge.renderer.pitch = -.1;
    });
    await page.waitForTimeout(20000);
    for (let repeat = 0; repeat < 2; repeat++) {
      const start = await page.evaluate(() => performance.now());
      await page.waitForTimeout(10000);
      const sample = await page.evaluate(({ variant, repeat, start }) => {
        const quantiles = values => { const sorted = values.slice().sort((a,b) => a-b); return { count: sorted.length, mean: sorted.reduce((a,b) => a+b,0)/sorted.length, p50: sorted[Math.floor(sorted.length*.5)], p95: sorted[Math.floor(sorted.length*.95)], max: sorted.at(-1) }; };
        const bridge = check.bridge, r = bridge.renderer.renderer, gl = r.getContext();
        const frames = quantiles(frameSamples.filter(frame => frame.at > start).map(frame => frame.ms));
        const renders = check.renders.filter(render => render.at > start);
        return { variant, repeat, fps: 1000/frames.mean, frames, renderMs: quantiles(renders.map(render => render.ms)), stats: renders.at(-1)?.stats, forest: bridge.frontierVisuals.forestStats, buffer: [r.domElement.width,r.domElement.height], glError: gl.getError(), preparation: bridge.friendsWorldArrival.preparationStats };
      }, { variant, repeat, start });
      report.samples.push(sample); console.log(JSON.stringify(sample));
      assert.equal(sample.glError, 0);
    }
    await page.screenshot({ path: `${directory}/${variant}-commons-day.png` });
    if (variant === 'after') {
      for (const [label, hour, position] of [['commons-night',22,[6470,5552,704]],['saltwind-night',22,[27205,20704,208]]]) {
        await page.evaluate(({hour,position}) => {
          const player = [...check.simulation.players.values()][0];
          Object.assign(player,{x:position[0],y:position[1],z:position[2],verticalVelocity:0});
          check.bridge.setFriendsEnvironment({hour,speed:0});
          check.bridge.renderer.yaw=-Math.PI/2;check.bridge.renderer.pitch=-.1;
        },{hour,position});
        await page.waitForTimeout(8000);
        await page.screenshot({path:`${directory}/after-${label}.png`});
        const state=await page.evaluate(()=>{
          const r=check.bridge.renderer.renderer,gl=r.getContext();
          return {glError:gl.getError(),programs:r.info.programs.length,pending:r.info.programs.filter(p=>!p.isReady()).length,fireGroups:check.bridge.renderer.scene.children.filter(o=>o.name==='commons-campfire-gathering').map(o=>({visible:o.visible,children:o.children.length}))};
        });
        report[label]=state;assert.equal(state.glError,0);
      }
    }
  } finally { await browser.close(); await writeFile(`${directory}/production-comparison.json`, JSON.stringify(report,null,2)); }
}
assert.deepEqual(report.errors,[]);
