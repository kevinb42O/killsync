import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3005';
const directory = process.env.FRIENDS_TEST_ARTIFACT_DIR || 'artifacts/castle-freeze/route';
await mkdir(directory, { recursive: true });
const report = { origin, errors: [], phases: [], method: 'Actual Friends game render/update loop and terrain workers, shadows enabled. Move the final render camera continuously along a castle survey route; the avatar stays at arrival. Shader compile counters and frame gaps cover streaming, shadow updates, world rendering and HDR composition.' };
const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1100, height: 740 } }); page.setDefaultTimeout(30000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || /GL_INVALID_|GL_OUT_OF_MEMORY/.test(m.text())) report.errors.push(m.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('killsync.friends.menu.pause', 'true');
    localStorage.setItem('sunline.preferences.v1', JSON.stringify({ renderScale: .7, shadows: true }));
    window.castleRouteProfile = { phase: 'startup', compiles: 0, frames: [] };
    const compile = WebGL2RenderingContext.prototype.compileShader;
    WebGL2RenderingContext.prototype.compileShader = function(...args) { castleRouteProfile.compiles++; return compile.apply(this,args); };
    let previous;
    const frame = now => { if (previous !== undefined) castleRouteProfile.frames.push({ phase: castleRouteProfile.phase, ms: now-previous }); previous=now; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  await page.route('**/src/game/rendering/FriendsMenuScene.ts*', r => r.fulfill({ contentType: 'application/javascript', body: 'export function createFriendsMenuScene(){return()=>{};}' }));
  await page.goto(origin+'/?mode=friends', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your name', { exact: true }).fill('Castle route');
  await page.getByRole('button', { name: 'Play on my own', exact: true }).click({ noWaitAfter: true });
  await page.locator('.coop-arena').waitFor();
  await page.waitForFunction(() => document.querySelector('.coop-arena') && !document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'));
  await page.evaluate(() => {
    const element = document.querySelector('.coop-arena'); let fiber=element[Object.keys(element).find(k=>k.startsWith('__reactFiber'))],bridge;
    while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;hook=hook.next;}fiber=fiber.return;}
    if(!bridge)throw new Error('Arena renderer missing'); window.castleBridge=bridge;
    bridge.setFriendsEnvironment({hour:12,speed:0});
    window.castleStages=[];
    for (const [name,object,method] of [['frontier',bridge.frontierVisuals,'update'],['world',bridge.renderer.renderer,'render']]) {
      const original=object[method];object[method]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const ms=performance.now()-start;if(ms>100)castleStages.push({name,ms,phase:castleRouteProfile.phase});}};
    }
    const original=bridge.renderer.render;
    bridge.renderer.render=function(engine,delta,before){return original.call(this,engine,delta,()=>{
      before?.(); const route=window.castleRoute; if(!route)return;
      const t=Math.min(1,(performance.now()-route.start)/route.duration),s=t*t*(3-2*t);
      this.camera.position.set(...route.from.map((v,i)=>v+(route.to[i]-v)*s));
      this.camera.lookAt(...route.look); this.camera.updateMatrixWorld();
    });};
  });
  await page.waitForFunction(() => { const s=castleBridge.renderer.friendsShaderWarmup.stats; return s.submitted>0&&!s.pending&&!s.scanning&&s.queued===0; },undefined,{timeout:90000});
  report.preparation=await page.evaluate(()=>castleBridge.renderer.friendsShaderWarmup.stats);
  // Draw a settled outer approach before the continuous movement samples.
  const poses=[
    ['outer-approach',[21800,4700,19200],[18304,4900,13000],3000],
    ['viaduct',[20100,4700,16600],[18304,4700,13600],4000],
    ['gate',[18304,4580,14100],[18304,4900,11744],3000],
    ['court',[18304,4580,12900],[18304,4900,11744],3000],
    ['keep',[18100,4820,11950],[18304,5200,11744],3000],
    ['roof',[18304,5920,12300],[18304,4900,13500],3000],
    ['return',[21800,4700,19200],[18304,4900,13000],4000],
  ];
  let from=await page.evaluate(()=>castleBridge.renderer.camera.position.toArray());
  for(const [phase,to,look,duration]of poses){
    const before=await page.evaluate(({phase,from,to,look,duration})=>{castleRouteProfile.phase=phase;window.castleRoute={from,to,look,duration,start:performance.now()};return castleRouteProfile.compiles;},{phase,from,to,look,duration});
    await page.waitForTimeout(duration+350);
    // Include the first RAF after a long submission, rather than sampling
    // before that frame gap has reached the observer.
    await page.waitForFunction(phase=>castleRouteProfile.frames.filter(f=>f.phase===phase).length>30,phase);
    const sample=await page.evaluate(({phase,before})=>{
      const times=castleRouteProfile.frames.filter(f=>f.phase===phase).map(f=>f.ms).sort((a,b)=>a-b);
      const r=castleBridge.renderer.renderer,gl=r.getContext();
      return{phase,frames:times.length,p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1),stallsOver500Ms:times.filter(t=>t>500).length,shaderCompiles:castleRouteProfile.compiles-before,glError:gl.getError(),warmup:castleBridge.renderer.friendsShaderWarmup.stats,terrain:castleBridge.frontierVisuals.terrainStats,stages:castleStages.filter(s=>s.phase===phase)};
    },{phase,before});
    report.phases.push(sample); console.log(JSON.stringify(sample));
    if(phase==='court'||phase==='roof')await page.locator('.coop-arena canvas').first().screenshot({path:directory+'/'+phase+'.png'});
    assert.equal(sample.glError,0);assert(sample.frames>30,phase+': insufficient rendered frames');
    from=to;
  }
  assert(report.phases.every(p=>p.stallsOver500Ms===0),'Route contains a frame stalled over 500 ms; see the complete phase report');
  assert.deepEqual(report.errors,[]);
}catch(error){
  report.failure=String(error);
  if(page&&!page.isClosed()){
    report.body=await page.locator('body').innerText().catch(()=>null);
    await page.screenshot({path:directory+'/failure.png'}).catch(()=>{});
  }
  throw error;
}
finally{await writeFile(directory+'/checks.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
