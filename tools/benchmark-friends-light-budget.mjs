import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3001';
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});page.setDefaultTimeout(120000);
 await page.addInitScript(()=>{localStorage.setItem('cinematicEffects','off');localStorage.setItem('killsync.friends.menu.pause','true');});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/game/rendering/FriendsMenuScene.ts*',r=>r.fulfill({contentType:'application/javascript',body:'export function createFriendsMenuScene(){return()=>{};}'}));
 await page.route('**/src/game/multiplayer/MultiplayerRendererBridge.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\n{const original=MultiplayerRendererBridge.prototype.render;MultiplayerRendererBridge.prototype.render=function(...args){window.bridge=this;window.lastRenderArgs=args;return original.apply(this,args);};}\n'});});
 console.log('Opening Friends benchmark');await page.goto(origin+'/?mode=friends');await page.getByLabel('Your name',{exact:true}).fill('Render research');await page.getByRole('button',{name:'Open my island',exact:true}).click();await page.getByRole('button',{name:'Head into the island',exact:true}).click();await page.locator('.coop-arena').waitFor();await page.waitForFunction(()=>window.bridge);console.log('Island loaded; settling');await page.waitForTimeout(20000);
 await page.evaluate(()=>{bridge.frontierVisuals.setEnvironment({hour:9,speed:0,windSpeed:0});bridge.renderer.yaw=-2.3;bridge.renderer.pitch=-.3;});await page.waitForTimeout(10000);
 console.log('Measuring alternating GPU samples and pixels');const result=await page.evaluate(async()=>{
  const b=window.bridge,p=b.renderer,r=p.renderer,scene=p.scene,camera=p.camera,budget=p.friendsPointLightBudget;
  if(!budget)throw Error('Point-light budget was not installed');
  const renderFrame=b.render.bind(b),frameArgs=window.lastRenderArgs.slice();frameArgs[2]=1000/60;b.render=()=>{};
  const gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(!ext)throw Error('No GPU timer query extension');
  const target=p.nightVision.buffer;
  const lights=[];scene.traverse(o=>{if(o.isLight)lights.push(o);});
  const authored=lights.map(l=>({light:l,intensity:l.intensity,visible:l.visible}));
  const restore=()=>authored.forEach(s=>{s.light.intensity=s.intensity;s.light.visible=s.visible;});
  r.shadowMap.needsUpdate=false;
  const stat=v=>{const s=v.slice().sort((a,b)=>a-b);return{mean:v.reduce((a,b)=>a+b,0)/v.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)]};};
  const world=()=>{r.setRenderTarget(target);r.info.reset();r.render(scene,camera);r.setRenderTarget(null);};
  const pixels=()=>{world();r.render(p.nightVision.pass,p.nightVision.camera);const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);if(gl.getError())throw Error('WebGL readback error');return bytes;};
  const compare=(a,b)=>{let max=0,changed=0,sum=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);if(d)changed++;sum+=d*d;}return{maxChannelDifference:max,rmsChannelDifference:Math.sqrt(sum/a.length),changedChannels:changed,totalChannels:a.length};};
  async function measure(name,enabled,fullFrame=false){
   budget.enabled=enabled;const gpu=[],cpu=[],calls=[],triangles=[];
   for(let i=0;i<60;i++){
    const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);const start=performance.now();
    if(fullFrame)renderFrame(...frameArgs);else world();
    const elapsed=performance.now()-start;gl.endQuery(ext.TIME_ELAPSED_EXT);gl.flush();
    const deadline=performance.now()+10000;while(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){if(performance.now()>deadline)throw Error('GPU timer timeout');await new Promise(resolve=>setTimeout(resolve,4));}
    if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw Error('Disjoint GPU query');
    const ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);
    if(i>=20){gpu.push(ms);cpu.push(elapsed);calls.push(r.info.render.calls);triangles.push(r.info.render.triangles);}
   }
   return{name,enabled,fullFrame,dpr:r.getPixelRatio(),gpuMs:stat(gpu),cpuMs:stat(cpu),calls:stat(calls),triangles:stat(triangles)};
  }
  for(let i=0;i<12;i++)renderFrame(...frameArgs);
  const phases=[];
  for(const enabled of [false,true,false,true])phases.push(await measure(enabled?'budget-world':'baseline-world',enabled));
  for(const enabled of [false,true,false,true])phases.push(await measure(enabled?'budget-whole-frame':'baseline-whole-frame',enabled,true));
  r.setPixelRatio(2);target.setSize(3200,1800);
  for(const enabled of [false,true,false,true])phases.push(await measure(enabled?'budget-world-dpr2':'baseline-world-dpr2',enabled));
  r.setPixelRatio(1);target.setSize(1600,900);
  const equivalence=[];
  for(const name of ['daylight','flashlight-and-infrared','all-point-lights','switched-off-after-growth']){
   restore();
   if(name==='flashlight-and-infrared')for(const l of lights)if(l.isSpotLight&&l.castShadow)l.intensity=20000000;
   if(name==='all-point-lights')for(const l of lights)if(l.isPointLight)l.intensity=18000;
   if(name==='switched-off-after-growth')for(const l of lights)if(l.isPointLight&&!l.castShadow)l.intensity=0;
   budget.enabled=false;for(let i=0;i<3;i++)pixels();const baseline=pixels();
   budget.enabled=true;for(let i=0;i<3;i++)pixels();const optimized=pixels();
   equivalence.push({name,...compare(baseline,optimized)});
  }
  restore();budget.enabled=true;world();await new Promise(resolve=>setTimeout(resolve,5100));world();
  const slots=[];budget.withLayout(camera,()=>scene.traverseVisible(o=>{if(o.isPointLight&&o.layers.test(camera.layers))slots.push({name:o.name,intensity:o.intensity,shadow:o.castShadow});}));
  const debug=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[1600,900],phases,equivalence,slots,visibleAuthoredPoints:lights.filter(l=>l.isPointLight&&l.visible).length};
 });
 await writeFile('artifacts/render-cost-research/point-light-budget.json',JSON.stringify({date:new Date().toISOString(),browser:browser.version(),origin,errors,method:'Actual Friends spawn, fixed 9 AM camera, unchanged HDR MSAA target. Alternating baseline/budget: 20 warm + 40 disjoint-checked GPU queries each. Whole-frame includes bridge presentation, shadow updates, world, viewmodel, HDR composite. Pixel comparisons freeze world and compare synchronous RGBA readback after HDR composition.',...result},null,2));
 console.log(JSON.stringify({errors,...result}));
 if(result.slots.length!==8)throw Error('Point-light budget did not shrink after stress test');
 if(errors.length||result.equivalence.some(x=>x.maxChannelDifference>1))throw Error('Lighting budget equivalence failed');
}finally{await browser.close();}
