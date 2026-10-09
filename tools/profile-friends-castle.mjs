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
const output = process.argv[2] || 'artifacts/castle-freeze/profile.json';
await mkdir(join(output, '..'), { recursive: true });
const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const report = { errors: [], method: 'Production Friends scene in Chromium/Metal. Pause the game loop and hold castle geometry, camera, terrain and shadows fixed. Change only the camera supplied to the torch light selector, then render. Count actual WebGL shader compiles/links and timed blocking program queries.' };
report.options = Object.fromEntries(['COLD','SHADOWS','REAL_PIPELINE','WAIT_PREPARE','TRACE_ALL'].map(name=>[name.toLowerCase(),process.env['FRIENDS_CASTLE_'+name]==='true']));
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 740 } });
  page.setDefaultTimeout(180000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || /GL_INVALID_|GL_OUT_OF_MEMORY/.test(m.text())) report.errors.push(m.text()); });
  await page.addInitScript(({ cold, shadows }) => {
    localStorage.setItem('killsync.friends.menu.pause', 'true');
    localStorage.setItem('sunline.preferences.v1', JSON.stringify({ renderScale: .7, shadows }));
    window.castleFrames = [];
    let previous;
    const measure = now => {
      if (previous !== undefined) window.castleFrames.push(now - previous);
      previous = now; requestAnimationFrame(measure);
    };
    requestAnimationFrame(measure);
    if (cold) {
      // A unique coefficient and a zero-valued uniform create fresh compiler
      // inputs even when the driver has cached earlier runs. Default uniform
      // value zero preserves all output pixels, including packed depth.
      const coefficient = .01 + Math.random() * .01;
      const source = WebGL2RenderingContext.prototype.shaderSource;
      WebGL2RenderingContext.prototype.shaderSource = function(shader, code) {
        if (this.getShaderParameter(shader, this.SHADER_TYPE) === this.FRAGMENT_SHADER && code.includes('gl_FragColor')) {
          code = code.replace(/void main\s*\(\s*\)/, 'uniform float castleCacheProbe;\nvoid main()')
            .replace(/}\s*$/, `gl_FragColor.rgb += vec3(castleCacheProbe) * ${coefficient.toFixed(14)};\n}`);
        }
        return source.call(this, shader, code);
      };
    }
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(t => { if (!window.castleProfilePaused) callback(t); });
  }, { cold: process.env.FRIENDS_CASTLE_COLD === 'true', shadows: process.env.FRIENDS_CASTLE_SHADOWS === 'true' });
  if (process.env.FRIENDS_CASTLE_DISABLE_PREPARE === 'true') {
    await page.route('**/src/game/rendering/FriendsShaderWarmup.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nFriendsShaderWarmup.prototype.update=function(){};\n' });
    });
  }
  await page.route('**/src/game/rendering/FriendsMenuScene.ts*', r => r.fulfill({ contentType: 'application/javascript', body: 'export function createFriendsMenuScene(){return()=>{};}' }));
  await page.goto(origin + '/?mode=friends', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your name', { exact: true }).fill('Castle profile');
  await page.getByRole('button', { name: 'Play on my own', exact: true }).click({ noWaitAfter: true });
  await page.locator('.coop-arena').waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.querySelector('.coop-arena') && !document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'));
  await page.evaluate(() => { window.castleFrames = []; });
  if (process.env.FRIENDS_CASTLE_WAIT_PREPARE === 'true') {
    await page.waitForFunction(() => {
      const element = document.querySelector('.coop-arena');
      if (!element) return false;
      let fiber = element[Object.keys(element).find(k => k.startsWith('__reactFiber'))];
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook) {
          const stats = hook.memoizedState?.current?.renderer?.friendsShaderWarmup?.stats;
          if (stats) return stats.submitted > 0 && stats.queued === 0 && !stats.scanning && !stats.pending;
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      return false;
    }, undefined, { timeout: 90000 });
  }
  report.result = await page.evaluate(async ({realPipeline, traceAll}) => {
    const element = document.querySelector('.coop-arena');
    let fiber = element[Object.keys(element).find(k => k.startsWith('__reactFiber'))], bridge;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const value = hook.memoizedState?.current;
        if (value?.getFriendsTerrain && value?.setFriendsTool) bridge = value;
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    if (!bridge) throw new Error('Arena renderer unavailable');
    const preparationTimes = window.castleFrames.slice();
    window.castleProfilePaused = true;
    const r = bridge.renderer.renderer, scene = bridge.renderer.scene, camera = bridge.renderer.camera;
    const torches = scene.getObjectByName('highfall-torchlit-fortress');
    const lights = torches.children.filter(o => o.isPointLight);
    const gl = r.getContext(), hardware = gl.getExtension('WEBGL_debug_renderer_info');
    let compiled = 0, linked = 0, queryMs = 0;
    let glTimings = {};
    const methods = traceAll
      ? [...new Set([...Object.getOwnPropertyNames(WebGL2RenderingContext.prototype), ...Object.getOwnPropertyNames(WebGLRenderingContext.prototype)])]
          .filter(name => name !== 'constructor' && typeof gl[name] === 'function')
      : ['texImage2D','texSubImage2D','bufferData','bufferSubData','getUniformLocation','getAttribLocation','getActiveUniform','getActiveAttrib','getShaderInfoLog','getProgramInfoLog','getShaderParameter','useProgram','drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','bindVertexArray'];
    for (const name of methods) {
      const original = gl[name].bind(gl);
      gl[name] = function(...args) {
        const start = performance.now();
        try { return original(...args); }
        finally { const ms = performance.now() - start, timing = glTimings[name] ??= { calls:0,totalMs:0,maxMs:0 }; timing.calls++; timing.totalMs += ms; timing.maxMs = Math.max(timing.maxMs,ms); }
      };
    }
    const compile = gl.compileShader.bind(gl), link = gl.linkProgram.bind(gl), query = gl.getProgramParameter.bind(gl);
    gl.compileShader = shader => { compiled++; return compile(shader); };
    gl.linkProgram = program => { linked++; return link(program); };
    gl.getProgramParameter = (program, name) => {
      const start = performance.now();
      try { return query(program, name); } finally { queryMs += performance.now() - start; }
    };
    const arrivalView = [];
    if (realPipeline) {
      // Use the same HDR target and output colour space as gameplay. Rendering
      // directly to the canvas needs different programs and is not evidence
      // of a cold-material stall on a normal castle approach.
      const target = bridge.renderer.nightVision?.buffer;
      if (!target) throw new Error('Production HDR target unavailable');
      r.setRenderTarget(target);
      for (let i = 0; i < 2; i++) {
        compiled = linked = queryMs = 0;
        const start = performance.now(); r.render(scene, camera);
        arrivalView.push({ renderMs: performance.now() - start, compiled, linked });
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    camera.position.set(18304, 4600, 14400);
    camera.lookAt(18304, 4900, 11744);
    camera.updateMatrixWorld();
    r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
    const far = camera.position.clone().set(60000, 12000, 60000);
    const near = torches.positions[0].clone();
    const frames = [];
    for (const [phase, selector] of [['far-warmup', far], ['far-steady', far], ['enter-castle', near], ['castle-steady', near], ['leave-castle', far], ['reenter-castle', near]]) {
      compiled = linked = queryMs = 0;
      glTimings = {};
      const previousPrograms = new Set(r.info.programs.map(p => p.id));
      const updateStart = performance.now(); torches.update(5, selector);
      const updateMs = performance.now() - updateStart, start = performance.now();
      r.render(scene, camera);
      const renderMs = performance.now() - start;
      const newPrograms = r.info.programs.filter(p => !previousPrograms.has(p.id)).map(p => {
        const objects = new Set();
        scene.traverse(o => {
          for (const m of o.material ? Array.isArray(o.material) ? o.material : [o.material] : []) {
            const programs = r.properties.get(m).programs;
            if (programs && [...programs.values()].some(program => program.id === p.id)) objects.add(o.name || o.type);
          }
        });
        return { id: p.id, objects: [...objects].slice(0, 12), cacheKey: p.cacheKey };
      });
      frames.push({ phase, updateMs, renderMs, compiled, linked, programQueryMs: queryMs, glTimings, visibleTorchLights: lights.filter(l => l.visible).length, activeTorchLights: lights.filter(l => l.visible && l.intensity > 0).length, programs: r.info.programs.length, newPrograms, calls: r.info.render.calls, triangles: r.info.render.triangles });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const frameTimes = preparationTimes.sort((a,b) => a-b);
    return { renderer: hardware && gl.getParameter(hardware.UNMASKED_RENDERER_WEBGL), warmup: bridge.renderer.friendsShaderWarmup?.stats, realPipeline, arrivalView, frames,
      preparationFrames: { count: frameTimes.length, p95Ms: frameTimes[Math.floor(frameTimes.length*.95)], maxMs: frameTimes.at(-1), stallsOver500Ms: frameTimes.filter(t=>t>500).length } };
  }, {realPipeline: process.env.FRIENDS_CASTLE_REAL_PIPELINE === 'true', traceAll: process.env.FRIENDS_CASTLE_TRACE_ALL === 'true'});
  assert.deepEqual(report.errors, []);
  if (process.env.FRIENDS_CASTLE_ASSERT_STABLE === 'true') {
    const frames = report.result.frames.slice(1);
    assert(frames.every(f => f.visibleTorchLights === 8), 'Castle must retain eight lights in the shader layout');
    assert(frames.every(f => f.compiled === 0 && f.linked === 0), 'Entering/leaving the castle compiled new shaders');
    assert.equal(frames.find(f => f.phase === 'far-steady').activeTorchLights, 0);
    assert.equal(frames.find(f => f.phase === 'enter-castle').activeTorchLights, 8);
  }
  if (process.env.FRIENDS_CASTLE_ASSERT_PREPARED === 'true') {
    assert(report.result.frames.every(f => f.compiled === 0 && f.linked === 0), 'First castle view compiled new shaders');
    assert.equal(report.result.warmup.failures, 0);
  }
  if (process.env.FRIENDS_CASTLE_ASSERT_NO_STALL === 'true') {
    assert(report.result.frames.every(f=>f.renderMs<500),'Castle render stalled over 500 ms despite shader preparation');
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) { report.failure = String(error); throw error; }
finally { await writeFile(output, JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
