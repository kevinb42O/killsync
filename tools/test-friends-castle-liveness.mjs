import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const sharp = require('sharp');
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3005';
const directory = process.env.FRIENDS_TEST_ARTIFACT_DIR || 'artifacts/castle-freeze/liveness';
await mkdir(directory, { recursive: true });
const report = { origin, checks: [], errors: [] };
const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=metal'] });
try {
  for (const mode of ['never-ready', 'no-parallel-extension']) {
    const context = await browser.newContext({ viewport: { width: 900, height: 650 } });
    await context.addInitScript(mode => {
      localStorage.setItem('killsync.friends.menu.pause', 'true');
      localStorage.setItem('sunline.preferences.v1', JSON.stringify({ renderScale: .7, shadows: true }));
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function(...args) { this.canvas.__draws = (this.canvas.__draws || 0) + 1; return original.apply(this, args); };
      }
      if (mode === 'never-ready') {
        const original = WebGL2RenderingContext.prototype.getProgramParameter;
        WebGL2RenderingContext.prototype.getProgramParameter = function(program, name) { return name === 0x91b1 ? false : original.call(this, program, name); };
      } else {
        const original = WebGL2RenderingContext.prototype.getExtension;
        WebGL2RenderingContext.prototype.getExtension = function(name) { return name === 'KHR_parallel_shader_compile' ? null : original.call(this, name); };
      }
    }, mode);
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /GL_INVALID_|GL_OUT_OF_MEMORY/.test(m.text())) report.errors.push(m.text()); });
    if (mode === 'never-ready') await page.route('**/textures/frontier/**', async route => { await new Promise(resolve => setTimeout(resolve, 8000)); await route.continue().catch(() => {}); });
    await page.goto(origin + '/?mode=friends', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Your name', { exact: true }).fill(mode);
    await page.getByRole('button', { name: 'Play on my own', exact: true }).click({ noWaitAfter: true });
    await page.locator('.coop-arena').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.coop-arena canvas')].some(c => c.__draws > 100));
    await page.waitForFunction(() => !document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'), undefined, { timeout: 90000 });
    await page.evaluate(() => {
      const element = document.querySelector('.coop-arena'); let fiber = element[Object.keys(element).find(k => k.startsWith('__reactFiber'))], bridge;
      while (fiber) { let hook = fiber.memoizedState; while (hook) { const value = hook.memoizedState?.current; if (value?.getFriendsTerrain && value?.setFriendsTool) bridge = value; hook = hook.next; } fiber = fiber.return; }
      if (!bridge) throw new Error('Arena renderer missing'); window.castleBridge = bridge;
    });
    const captures = [];
    for (const phase of ['arrival', 'turned']) {
      if (phase === 'turned') {
        await page.evaluate(() => { const renderer = castleBridge.renderer, original = renderer.render; renderer.render = function(engine, delta, before) { return original.call(this, engine, delta, () => { before?.(); this.camera.rotation.y += Math.PI; this.camera.updateMatrixWorld(); }); }; });
        await page.waitForTimeout(1500);
      }
      const canvas = page.locator('.coop-arena canvas').first();
      const buffer = await canvas.screenshot({ path: `${directory}/${mode}-${phase}.png` });
      const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const colors = new Set(); let brightness = 0;
      for (let y = Math.floor(info.height * .2); y < info.height * .8; y += 3) for (let x = 15; x < info.width * .45; x += 3) {
        const i = (y * info.width + x) * info.channels; colors.add(`${data[i] >> 4}:${data[i + 1] >> 4}:${data[i + 2] >> 4}`); brightness += data[i] + data[i + 1] + data[i + 2];
      }
      assert(colors.size > 25, `${mode}: blank world`);
      const live = await page.evaluate(() => { const r = castleBridge.renderer.renderer; return { draws: r.domElement.__draws, glError: r.getContext().getError(), warmup: castleBridge.renderer.friendsShaderWarmup.stats }; });
      assert.equal(live.glError, 0); assert(live.draws > 100); captures.push({ phase, colors: colors.size, brightness, ...live });
    }
    assert(Math.abs(captures[0].brightness - captures[1].brightness) > 10000, `${mode}: camera turn did not change world pixels`);
    assert(captures[1].draws > captures[0].draws, `${mode}: drawing stopped`);
    if (mode === 'never-ready') assert(captures[1].warmup.pending, 'Fixture must leave a compilation batch pending');
    else assert(captures[1].warmup.completed > 0, 'Fallback must submit preparation');
    report.checks.push({ mode, captures }); console.log('PASS', mode);
    await context.close();
  }
  assert.deepEqual(report.errors, []);
} catch (error) { report.failure = String(error); throw error; }
finally { await writeFile(directory + '/checks.json', JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
