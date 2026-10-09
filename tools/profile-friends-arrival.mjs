import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3012';
const output = process.argv[2] || 'artifacts/friends-arrival/profile.json';
await mkdir(join(output, '..'), { recursive: true });
const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const report = { origin, errors: [], method: 'Fresh browser context, actual Friends arena, fixed spawn camera. Frame gaps, long tasks, stage CPU times and slow WebGL calls from launch through settling. Menu rendering excluded. These are local Chromium/Metal measurements, not remote player FPS.' };
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 740 } });
  page.setDefaultTimeout(180000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.addInitScript(({ disableArrival, disableWarmup, cold }) => {
    localStorage.setItem('killsync.friends.menu.pause', 'true');
    localStorage.setItem('sunline.preferences.v1', JSON.stringify({ renderScale: .7, shadows: true }));
    window.arrivalProfile = { start: Infinity, frames: [], tasks: [], gl: [], stages: [], compiles: [], disableArrival, disableWarmup };
    if(cold){
      const coefficient=.01+Math.random()*.01,source=WebGL2RenderingContext.prototype.shaderSource;
      WebGL2RenderingContext.prototype.shaderSource=function(shader,code){
        if(this.getShaderParameter(shader,this.SHADER_TYPE)===this.FRAGMENT_SHADER && code.includes('gl_FragColor')){
          code=code.replace(/void main\s*\(\s*\)/,'uniform float arrivalCacheProbe;\nvoid main()').replace(/}\s*$/,`gl_FragColor.rgb+=vec3(arrivalCacheProbe)*${coefficient.toFixed(14)};\n}`);
        }
        return source.call(this,shader,code);
      };
    }
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.startTime >= arrivalProfile.start) arrivalProfile.tasks.push({ at: e.startTime - arrivalProfile.start, ms: e.duration }); }).observe({ type: 'longtask', buffered: true });
    for (const method of ['compileShader', 'linkProgram', 'getProgramInfoLog', 'getShaderInfoLog', 'getProgramParameter', 'getUniformLocation', 'getActiveUniform', 'getActiveAttrib', 'texImage2D', 'texSubImage2D', 'bufferData', 'drawElements', 'drawElementsInstanced', 'useProgram']) {
      const original = WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method] = function(...args) {
        const start = performance.now();
        try { return original.apply(this, args); }
        finally {
          if (method === 'compileShader') arrivalProfile.compiles.push(start - arrivalProfile.start);
          const ms = performance.now() - start;
          if (ms > 10 && start >= arrivalProfile.start) arrivalProfile.gl.push({ method, at: start - arrivalProfile.start, ms, stack: ms > 100 ? new Error().stack : undefined });
        }
      };
    }
    let previous;
    function frame(now) {
      if (previous !== undefined && previous >= arrivalProfile.start) arrivalProfile.frames.push({ at: previous - arrivalProfile.start, ms: now - previous });
      previous = now; requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, { disableArrival: process.env.FRIENDS_ARRIVAL_DISABLE_EFFECT === 'true', disableWarmup: process.env.FRIENDS_ARRIVAL_DISABLE_WARMUP === 'true', cold:process.env.FRIENDS_ARRIVAL_COLD==='true' });
  await page.route('**/src/game/rendering/FriendsMenuScene.ts*', r => r.fulfill({ contentType: 'application/javascript', body: 'export function createFriendsMenuScene(){return()=>{};}' }));
  await page.route('**/assets/FriendsMenuScene-*.js', r => r.fulfill({ contentType: 'application/javascript', body: 'export function createFriendsMenuScene(){return()=>{};}' }));
  for (const [file, name, method] of [
    ['src/game/Renderer3D.ts', 'Renderer3D', 'render'],
    ['src/game/rendering/FriendsWorldArrival.ts', 'FriendsWorldArrival', 'render'],
    ['src/game/rendering/FriendsShaderWarmup.ts', 'FriendsShaderWarmup', 'update'],
    ['src/game/rendering/FriendsFrontierVisuals.ts', 'FriendsFrontierVisuals', 'update'],
    ['src/game/rendering/FriendsForestLOD.ts', 'FriendsForestLOD', 'update'],
  ]) {
    await page.route('**/' + file + '*', async route => {
      const response = await route.fetch();
      const instrumentation = `
const arrivalOriginal=${name}.prototype.${method};
${name}.prototype.${method}=function(...args){
  if((${JSON.stringify(name)}==='FriendsWorldArrival'&&arrivalProfile.disableArrival)||(${JSON.stringify(name)}==='FriendsShaderWarmup'&&arrivalProfile.disableWarmup))return false;
  const start=performance.now();try{return arrivalOriginal.apply(this,args);}finally{
    const ms=performance.now()-start;if(ms>25&&start>=arrivalProfile.start)arrivalProfile.stages.push({name:${JSON.stringify(name)},at:start-arrivalProfile.start,ms});
  }
};`;
      await route.fulfill({ response, body: await response.text() + instrumentation });
    });
  }
  await page.goto(origin + '/?mode=friends', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your name', { exact: true }).fill('Arrival profile');
  const cdp = await page.context().newCDPSession(page);
  if (process.env.FRIENDS_ARRIVAL_CPU === 'true') { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  await page.evaluate(() => { arrivalProfile.start = performance.now(); });
  await page.getByRole('button', { name: 'Play on my own', exact: true }).click({ noWaitAfter: true });
  await page.locator('.coop-arena').waitFor({ state: 'attached' });
  await page.waitForTimeout(Number(process.env.FRIENDS_ARRIVAL_PROFILE_MS || 45000));
  if (process.env.FRIENDS_ARRIVAL_CPU === 'true') {
    const { profile } = await cdp.send('Profiler.stop');
    await writeFile(output.replace(/\.json$/, '.cpuprofile'), JSON.stringify(profile));
    const samples = new Map();
    profile.samples.forEach((id,i) => samples.set(id,(samples.get(id)||0)+(profile.timeDeltas[i]||0)));
    report.cpu = profile.nodes.map(n => ({ name:n.callFrame.functionName, url:n.callFrame.url, line:n.callFrame.lineNumber+1, ms:(samples.get(n.id)||0)/1000 })).sort((a,b)=>b.ms-a.ms).slice(0,35);
  }
  report.result = await page.evaluate(() => {
    const element = document.querySelector('.coop-arena');
    let fiber = element[Object.keys(element).find(k => k.startsWith('__reactFiber'))], bridge;
    while (fiber) { let hook = fiber.memoizedState; while (hook) { const v = hook.memoizedState?.current; if (v?.getFriendsTerrain && v?.setFriendsTool) bridge = v; hook = hook.next; } fiber = fiber.return; }
    const profile = arrivalProfile;
    const renderer=bridge?.renderer.renderer,gl=renderer?.getContext();
    const programs={checked:0,pending:0,failed:[]};
    for(const program of renderer?.info.programs||[]){
      if(!program.isReady()){programs.pending++;continue;}
      programs.checked++;
      if(!gl.getProgramParameter(program.program,gl.LINK_STATUS))programs.failed.push({id:program.id,log:gl.getProgramInfoLog(program.program)});
    }
    const buckets = [];
    for (let at = 0; at < performance.now() - profile.start; at += 5000) {
      const times = profile.frames.filter(f => f.at >= at && f.at < at + 5000).map(f => f.ms).sort((a,b) => a-b);
      buckets.push({ at, frames: times.length, medianMs: times[Math.floor(times.length*.5)], p95Ms: times[Math.floor(times.length*.95)], maxMs: times.at(-1), over100Ms: times.filter(t=>t>100).length, compiles: profile.compiles.filter(t=>t>=at&&t<at+5000).length });
    }
    return { buckets, frames:profile.frames, tasks: profile.tasks, gl: profile.gl, stages: profile.stages, programs, glError:gl?.getError(), warmup: bridge?.renderer.friendsShaderWarmup?.stats, spawnPreparation:bridge?.friendsWorldArrival?.preparationStats, terrain: bridge?.frontierVisuals.terrainStats, arrival: bridge?.friendsWorldArrival?.sequence, render: bridge?.renderer.getPerformanceStats() };
  });
  await page.screenshot({ path: output.replace(/\.json$/, '.png') });
  console.log(JSON.stringify({ errors: report.errors, cpu:report.cpu, buckets: report.result.buckets, warmup: report.result.warmup, spawnPreparation:report.result.spawnPreparation, slowestGL: report.result.gl.sort((a,b)=>b.ms-a.ms).slice(0,8), slowestStages: report.result.stages.sort((a,b)=>b.ms-a.ms).slice(0,8) }, null, 2));
} catch (error) { report.failure = String(error); throw error; }
finally { await mkdir(join(output, '..'), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
