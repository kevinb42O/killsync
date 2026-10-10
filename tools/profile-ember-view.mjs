import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(homedir()+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(180000);
 await page.routeWebSocket('ws://localhost:3000/**',()=>{});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().startsWith('EMBER '))console.log(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('killsync.friends.menu.pause','true');window.nativeRAF=requestAnimationFrame.bind(window);window.requestAnimationFrame=f=>nativeRAF(t=>{if(!window.emberPaused)f(t);});});
 await page.route('**/src/game/rendering/FriendsMenuScene.ts*',r=>r.fulfill({contentType:'application/javascript',body:'export function createFriendsMenuScene(){return()=>{};}'}));
 for(const [file,name,method,extra] of [['src/game/multiplayer/MultiplayerRendererBridge.ts','MultiplayerRendererBridge','render','window.emberBridge=this;'],['src/game/rendering/FriendsFrontierVisuals.ts','FriendsFrontierVisuals','update','window.emberArgs=args;']])await page.route('**/'+file+'*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\n{const fn=${name}.prototype.${method};${name}.prototype.${method}=function(...args){${extra}return fn.apply(this,args);};}`});});
 await page.goto('http://localhost:3000/?mode=friends',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Your name',{exact:true}).fill('Ember performance');
 if(await page.getByRole('button',{name:'Play on my own',exact:true}).count())await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});
 else {await page.getByRole('button',{name:'Open my island',exact:true}).click();await page.getByRole('button',{name:'Head into the island',exact:true}).click();}
 await page.waitForFunction(()=>window.emberBridge&&window.emberArgs?.[0]);
 await page.waitForFunction(()=>window.emberBridge?.friendsWorldArrival?.sequence?.active===false,undefined,{timeout:180000});
 await page.waitForTimeout(5000);
 console.log('Arena loaded; settling production terrain at Ember Lookout');
 await page.evaluate(async()=>{
  window.emberPaused=true;const b=emberBridge,c=b.renderer.camera;
  c.position.set(37560,510,40350);c.lookAt(34240,2200,33792);c.updateMatrixWorld();
  b.frontierVisuals.setEnvironment({hour:18.5,speed:0,windSpeed:0});
  const args=emberArgs.slice();args[1]=37560;args[2]=40350;window.fixedEmberArgs=args;
  b.frontierVisuals.retreats.setCampfireState({fuelSeconds:0,siteFuelSeconds:{'ember-camp':120},roasts:{}});
  for(let i=0;i<100;i++){b.frontierVisuals.update(...args);b.scenicRailVisuals?.update(c,true);b.frontierVisuals.retreats.update(args[3]/1000,c,b.frontierVisuals.soundscapeEnvironment.daylight,[0,1,0]);await new Promise(r=>setTimeout(r,100));}
 });
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const report=await page.evaluate(async()=>{
  const b=emberBridge,r=b.renderer.renderer,scene=b.renderer.scene,c=b.renderer.camera,gl=r.getContext();
  const hardware=gl.getExtension('WEBGL_debug_renderer_info');
  const all=[];scene.traverse(o=>all.push(o));
  const lights=all.filter(o=>o.isLight).map(o=>({name:o.name,type:o.type,intensity:o.intensity,distance:o.distance,visible:o.visible,shadow:o.castShadow}));
  const med=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
  const phases=[];
  async function measure(name,select){
   const originals=all.map(o=>[o,o.visible]);select?.();
   const times=[],submissions=[],calls=[],tris=[];
   for(let i=0;i<18;i++){
    r.info.reset();const start=performance.now();r.render(scene,c);const submitted=performance.now();gl.finish();
    if(i>=6){times.push(performance.now()-start);submissions.push(submitted-start);calls.push(r.info.render.calls);tris.push(r.info.render.triangles);}
    await new Promise(resolve=>nativeRAF(resolve));
   }
   phases.push({name,completedMs:med(times),submissionMs:med(submissions),draws:med(calls),triangles:med(tris),programs:r.info.programs.length});console.log('EMBER '+JSON.stringify(phases.at(-1)));
   for(const [o,v] of originals)o.visible=v;
  }
  const cache=b.renderer.friendsMatrixUploadCache;
  if(!cache)throw new Error('Matrix cache not installed');
  function pixels(){r.render(scene,c);gl.finish();const data=new Uint8Array(r.domElement.width*r.domElement.height*4);gl.readPixels(0,0,r.domElement.width,r.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;}
  cache.setEnabled(false);await measure('cache-disabled');const before=pixels();
  cache.setEnabled(true);await measure('cache-enabled');const after=pixels();
  let changedPixels=0,maxChannelDelta=0;for(let i=0;i<before.length;i+=4){let changed=false;for(let j=0;j<4;j++){const d=Math.abs(before[i+j]-after[i+j]);if(d)changed=true;maxChannelDelta=Math.max(maxChannelDelta,d);}if(changed)changedPixels++;}
  const visualComparison={changedPixels,maxChannelDelta,pixels:before.length/4};
  cache.setEnabled(false);await measure('cache-disabled-repeat');
  cache.setEnabled(true);await measure('cache-enabled-repeat');
  const visualCases=[];
  function compareCurrent(name){
    // Settle shadows once, then compare identical scene state on both paths.
    r.render(scene,c);gl.finish();
    cache.setEnabled(false);const native=pixels();
    cache.setEnabled(true);const cached=pixels();
    let changedPixels=0,maxChannelDelta=0,nonBlackPixels=0;
    for(let i=0;i<native.length;i+=4){let changed=false;for(let j=0;j<4;j++){const delta=Math.abs(native[i+j]-cached[i+j]);if(delta)changed=true;maxChannelDelta=Math.max(maxChannelDelta,delta);}if(changed)changedPixels++;if(native[i]||native[i+1]||native[i+2])nonBlackPixels++;}
    visualCases.push({name,changedPixels,maxChannelDelta,nonBlackPixels,glError:gl.getError()});
  }
  for(const variant of [
    {name:'camera-pan',position:[37560,510,40350],target:[38500,400,41700],hour:18.5},
    {name:'camera-move-and-midday-sun',position:[37450,600,40180],target:[34240,2200,33792],hour:12},
    {name:'night-and-local-flashlight',position:[37560,510,40350],target:[34240,2200,33792],hour:0},
    {name:'summit-with-flashlight',position:[35000,4000,34500],target:[34240,2200,33792],hour:0},
  ]){
    c.position.set(...variant.position);c.lookAt(...variant.target);c.updateMatrixWorld();
    b.frontierVisuals.setEnvironment({hour:variant.hour,speed:0,windSpeed:0});
    b.frontierVisuals.setCraneCameraLight(variant.hour===0);
    b.frontierVisuals.update(...fixedEmberArgs);b.frontierVisuals.syncFlashlightWithCamera();
    compareCurrent(variant.name);
  }
  c.position.set(37560,510,40350);c.lookAt(34240,2200,33792);c.updateMatrixWorld();
  b.frontierVisuals.setCraneCameraLight(false);b.frontierVisuals.setEnvironment({hour:18.5,speed:0,windSpeed:0});
  b.frontierVisuals.update(...fixedEmberArgs);b.frontierVisuals.syncFlashlightWithCamera();
  // Verify the user's original screenshot resolution without reducing quality.
  r.setSize(2870,1622,false);c.aspect=2870/1622;c.updateProjectionMatrix();
  cache.setEnabled(false);await measure('full-resolution-cache-disabled');
  cache.setEnabled(true);await measure('full-resolution-cache-enabled');
  compareCurrent('full-resolution-lookout');
  r.setSize(1600,900,false);c.aspect=1600/900;c.updateProjectionMatrix();
  const uniformNames=new Map();
  for(const program of r.info.programs)for(const uniform of program.getUniforms().seq)if(uniform.addr)uniformNames.set(uniform.addr,uniform.id);
  const matrixUploads={};
  const glCalls={};
  for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','useProgram','getProgramParameter','uniformMatrix4fv','uniform3fv','uniform1f','uniform1i','bindVertexArray','bindTexture','getError']) {
    const original=gl[name].bind(gl);gl[name]=function(...args){const t=performance.now();try{return original(...args);}finally{const v=glCalls[name]??={calls:0,ms:0};v.calls++;v.ms+=performance.now()-t;if(name==='uniformMatrix4fv'){const id=uniformNames.get(args[0])??'unknown',m=matrixUploads[id]??={calls:0,ms:0};m.calls++;m.ms+=performance.now()-t;}}};
  }
  const groups={};
  all.filter(o=>o.isMesh||o.isPoints).forEach(o=>{
   const prior=o.onBeforeRender;o.onBeforeRender=function(...args){let root=this;while(root.parent&&root.parent!==scene)root=root.parent;const key=root.name||root.type;const group=groups[key]??={draws:0,triangles:0};group.draws++;const geometry=args[3],part=args[5];const count=part?.count??Math.min(geometry.drawRange.count,geometry.index?.count??(geometry.attributes.position?.count??0));group.triangles+=count/3*(this.isInstancedMesh?this.count:1);prior.apply(this,args);};
  });
  r.render(scene,c);gl.finish();
  return {method:'Actual production arena, fixed Ember Lookout camera, 1600x900 viewport. Warmed repeated renders with GPU completion (gl.finish); diagnostic variants only in isolated browser, restored afterwards. World arrival completed before sampling; camera and all related selectors moved to Ember. No appearance or quality settings changed in game code.',hardware:hardware?gl.getParameter(hardware.UNMASKED_RENDERER_WEBGL):null,buffer:[r.domElement.width,r.domElement.height],phases,lights,groups,glCalls,matrixUploads,visualComparison,visualCases,uploadCache:{...cache.stats},terrain:b.frontierVisuals.terrainStats,forest:b.frontierVisuals.forestStats,glError:gl.getError()};
 });
 const {profile:cpuProfile}=await cdp.send('Profiler.stop');
 const weights=new Map();cpuProfile.samples.forEach((id,i)=>weights.set(id,(weights.get(id)||0)+(cpuProfile.timeDeltas[i]||0)));
 report.cpuHotspots=cpuProfile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber+1,ms:(weights.get(n.id)||0)/1000})).sort((a,b)=>b.ms-a.ms).slice(0,30);
 await mkdir('artifacts/ember-performance',{recursive:true});
 await writeFile('artifacts/ember-performance/render.cpuprofile',JSON.stringify(cpuProfile));
 await page.screenshot({path:'artifacts/ember-performance/matrix-cache.png'});
 await writeFile('artifacts/ember-performance/matrix-cache.json',JSON.stringify({...report,errors},null,2));
 console.log(JSON.stringify({...report,errors},null,2));
}finally{await browser.close();}
