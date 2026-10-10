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
 await page.route('**/src/game/multiplayer/MultiplayerRendererBridge.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\n{const original=MultiplayerRendererBridge.prototype.render;MultiplayerRendererBridge.prototype.render=function(...args){window.bridge=this;return original.apply(this,args);};}\n'});});
 await page.goto(origin+'/?mode=friends');await page.getByLabel('Your name',{exact:true}).fill('Render research');await page.getByRole('button',{name:'Open my island',exact:true}).click();await page.getByRole('button',{name:'Head into the island',exact:true}).click();await page.locator('.coop-arena').waitFor();await page.waitForFunction(()=>window.bridge);await page.waitForTimeout(20000);
 await page.evaluate(()=>{bridge.frontierVisuals.setEnvironment({hour:9,speed:0,windSpeed:0});bridge.renderer.yaw=-2.3;bridge.renderer.pitch=-.3;});await page.waitForTimeout(10000);
 const result=await page.evaluate(async(layoutOnly)=>{
  const b=window.bridge,p=b.renderer,r=p.renderer,scene=p.scene,camera=p.camera,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if(!ext)throw Error('No GPU timer query extension');
  // Research reproduces the original layout; benchmark-friends-light-budget compares the implementation.
  p.friendsPointLightBudget?.dispose();
  b.render=()=>{};
  const target=p.nightVision.buffer;
  // Populate original-layout programs before auditing compiled shader arrays.
  r.setRenderTarget(target);r.render(scene,camera);r.setRenderTarget(null);
  const {applyFriendsDirectLighting}=await import('/src/game/rendering/FriendsDirectLighting.ts');
  const originalHooks=new Map();scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:o.material?[o.material]:[]))if(m.isMeshStandardMaterial&&!originalHooks.has(m))originalHooks.set(m,{compile:m.onBeforeCompile,key:m.customProgramCacheKey});});
  const forestController=b.frontierVisuals.forestLOD;const frustum=forestController.frustum;let offscreenTrees=0,offscreenTriangles=0;for(const bucket of forestController.buckets.values())for(const entry of bucket.entries)if(!frustum.intersectsSphere(entry.sphere))offscreenTriangles+=(bucket.mesh.geometry.index?.count||bucket.mesh.geometry.attributes.position.count)/3;for(const entry of forestController.entries)if(entry.supported&&!forestController.removed.has(entry.tree.id)&&entry.sphere.center.distanceToSquared(camera.position)<(1400+entry.sphere.radius)**2&&!frustum.intersectsSphere(entry.sphere))offscreenTrees++;
  const forestWaste={offscreenTrees,offscreenTriangles};
  const shaderLayouts=r.info.programs.map(prog=>{const source=gl.getShaderSource(prog.fragmentShader);return{point:Number(source?.match(/uniform\s+PointLight\s+pointLights\[\s*(\d+)\s*\]/)?.[1]),spot:Number(source?.match(/uniform\s+SpotLight\s+spotLights\[\s*(\d+)\s*\]/)?.[1]),pointShadow:Number(source?.match(/uniform\s+PointLightShadow\s+pointLightShadows\[\s*(\d+)\s*\]/)?.[1]),spotShadow:Number(source?.match(/uniform\s+SpotLightShadow\s+spotLightShadows\[\s*(\d+)\s*\]/)?.[1])};});
  const lights=[];scene.traverse(o=>{if(o.isLight)lights.push({name:o.name,type:o.type,intensity:o.intensity,castShadow:o.castShadow,map:o.shadow?.mapSize.toArray(),autoUpdate:o.shadow?.autoUpdate});});
  const path=o=>{const names=[];for(let n=o;n&&n!==scene;n=n.parent)names.unshift(n.name||n.type);return names.join('/');};
  const root=o=>{let n=o;while(n.parent&&n.parent!==scene)n=n.parent;return n.name||n.type;};
  const draws=[];const originalDirect=r.renderBufferDirect;
  r.shadowMap.needsUpdate=false;
  r.renderBufferDirect=function(cam,s,g,m,o,group){const before={...this.info.render};const out=originalDirect.call(this,cam,s,g,m,o,group);draws.push({path:path(o),root:root(o),camera:cam===camera?'world':'shadow',material:m.name||m.type,materialId:m.uuid,geometryId:g.uuid,instances:o.isInstancedMesh?o.count:1,triangles:this.info.render.triangles-before.triangles,calls:this.info.render.calls-before.calls,transparent:m.transparent,side:m.side});return out;};
  r.setRenderTarget(target);r.info.reset();r.render(scene,camera);r.setRenderTarget(null);r.renderBufferDirect=originalDirect;
  const waterOriginal=new Map();scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:o.material?[o.material]:[]))if(m.userData.frontierWater)waterOriginal.set(m,m.forceSinglePass);});
  const allVisibility=new Map();scene.traverse(o=>allVisibility.set(o,o.visible));
  const restore=()=>{for(const [o,v]of allVisibility)o.visible=v;};
  const stat=v=>{const s=v.slice().sort((a,b)=>a-b);return{mean:v.reduce((a,b)=>a+b,0)/v.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)]};};
  async function measure(name,{dpr=1,samples=2,hide=()=>false,shadow=false,singleWater=false,composite=false,noShadows=false,gates=false}={}){
   restore();for(const [m,h]of originalHooks){m.onBeforeCompile=h.compile;m.customProgramCacheKey=h.key;if(gates)applyFriendsDirectLighting(m);else m.needsUpdate=true;}scene.traverse(o=>{if(hide(o))o.visible=false;});r.setPixelRatio(dpr);target.setSize(1600*dpr,900*dpr);if(target.samples!==samples){target.dispose();target.samples=samples;}
   const waterMaterials=new Set();scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:o.material?[o.material]:[]))if(m.userData.frontierWater)waterMaterials.add(m);});for(const m of waterMaterials)m.forceSinglePass=singleWater?true:waterOriginal.get(m);if(r.shadowMap.enabled===noShadows){r.shadowMap.enabled=!noShadows;scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:o.material?[o.material]:[]))m.needsUpdate=true;});}
   const timings=[],cpu=[],calls=[],triangles=[];
   for(let i=0;i<64;i++){
    r.shadowMap.needsUpdate=shadow;if(shadow)p.dirLight.shadow.needsUpdate=true;
    r.setRenderTarget(target);r.info.reset();const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);const t=performance.now();r.render(scene,camera);cpu.push(performance.now()-t);r.setRenderTarget(null);if(composite)r.render(p.nightVision.pass,p.nightVision.camera);gl.endQuery(ext.TIME_ELAPSED_EXT);gl.flush();
    const deadline=performance.now()+10000;while(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){if(performance.now()>deadline)throw Error('GPU timeout');await new Promise(resolve=>setTimeout(resolve,4));}
    const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT),ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);
    if(disjoint)throw Error('Disjoint GPU query');if(i>=24){timings.push(ms);calls.push(r.info.render.calls);triangles.push(r.info.render.triangles);}
   }
   return{name,dpr,samples,gpuMs:stat(timings),cpuMs:stat(cpu.slice(24)),calls:stat(calls),triangles:stat(triangles)};
  }
  const forest=o=>root(o)==='frontier-instanced-3d-forests';
  const leaf=o=>o.name.startsWith('forest-')&&o.name.includes('-leaves-');
  const phases=[];
  for(const [name,opts]of [['baseline',{}],['no-inactive-point-lights',{hide:o=>o.isPointLight&&o.intensity===0}],['no-inactive-spot-lights',{hide:o=>o.isSpotLight&&o.intensity===0}],['no-dormant-shadow-spots',{hide:o=>o.isSpotLight&&o.intensity===0&&o.castShadow}],['no-inactive-lights',{hide:o=>o.isLight&&o.intensity===0}],['baseline-repeat',{}]]){const phase=await measure(name,opts);phases.push(phase);if(layoutOnly)break;}
  restore();const debug=gl.getExtension('WEBGL_debug_renderer_info');return{viewport:[1600,900],renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),target:{type:target.texture.type,format:target.texture.format},camera:{position:camera.position.toArray(),fov:camera.fov,far:camera.far},forest:b.frontierVisuals.forestStats,forestWaste,shaderLayouts,lights,draws,phases};
 },process.env.FRIENDS_SLOT_LAYOUT_ONLY==='true');
 await writeFile(process.env.FRIENDS_SLOT_LAYOUT_ONLY==='true'?'artifacts/render-cost-research/light-layout.json':'artifacts/render-cost-research/light-slots.json',JSON.stringify({date:new Date().toISOString(),browser:browser.version(),origin,errors,method:'Frozen actual world, fixed spawn camera -2.3/-0.3, 9 AM paused environment. HDR target reused; world pass only, MSAA resolve included at target switch; composite included only in named variant, no NVG copy/viewmodel or simulation. 24 warm + 40 asynchronous GPU samples per sequential variant; disjoint rejection. Draw attribution via actual renderBufferDirect statistics delta. Diagnostic removals change the image and are ceilings, not implementation speedups.',...result},null,2));
 console.log(JSON.stringify({errors,phases:result.phases,forest:result.forest,draws:result.draws.length}));
}finally{await browser.close();}
