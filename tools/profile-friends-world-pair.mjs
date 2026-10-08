import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {friendsBaselineModules} from './friends-baseline-modules.mjs';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3001';
const directory=process.env.FRIENDS_PAIR_OUTPUT||'artifacts/friends-render-third-pass/paired';await mkdir(directory,{recursive:true});
const baseline=await friendsBaselineModules(undefined,['FriendsForestLOD'],'artifacts/friends-render-third-pass/source');
const browser=await playwright.chromium.launch({headless:true,args:[`--use-angle=${process.env.FRIENDS_TEST_ANGLE||'metal'}`,'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const report={date:new Date().toISOString(),origin,errors:[],method:'One real Friends arena, frozen world/animation state, identical frame-indexed camera poses; alternate A/B and B/A each pair. Both forest controllers initialized fresh to match packing/LOD history and JIT exposure; original runtime forest hidden. Native drawing buffer, MSAA, geometry/materials and shadow scheduling retained. GPU queries drained asynchronously. Readback runs separate from timed renders. Timings are the world pass and forest update, not gameplay FPS.'};
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(180000);
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'||/GL_INVALID_|GL_OUT_OF_MEMORY/.test(m.text()))report.errors.push(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('cinematicEffects','off');localStorage.setItem('killsync.friends.menu.pause','true');const raf=requestAnimationFrame.bind(window);window.benchmarkRaf=raf;window.requestAnimationFrame=callback=>raf(t=>{if(!window.freezeMain)callback(t);});});
 await page.route('**/src/game/rendering/FriendsMenuScene.ts*',route=>route.fulfill({contentType:'application/javascript',body:'export function createFriendsMenuScene(){return()=>{};}'}));
 await page.route('**/src/game/multiplayer/MultiplayerRendererBridge.ts*',async route=>{const response=await route.fetch();const body=await response.text()+`\n{const original=MultiplayerRendererBridge.prototype.render;MultiplayerRendererBridge.prototype.render=function(...args){window.bridge=this;window.lastSnapshot=args[0];if(window.freezeMain)return;return original.apply(this,args);};}\n`;await route.fulfill({response,body});});
 await page.goto(`${origin}/?mode=friends`);await page.getByLabel('Your name',{exact:true}).fill('Forest pair');await page.getByRole('button',{name:'Open my island',exact:true}).click();await page.getByRole('button',{name:'Head into the island',exact:true}).click();await page.locator('.coop-arena').waitFor();await page.waitForFunction(()=>window.bridge?.frontierVisuals?.forestLOD.arrivalReady);
 await page.evaluate(()=>bridge.frontierVisuals.setEnvironment({hour:9,speed:0,windSpeed:0}));await page.waitForTimeout(15000);
 const result=await page.evaluate(async({baselineUrl,pairs,cpuOnly,location,sameForest,compareOnly,baselineControl,fallOnly})=>{
  const b=window.bridge,r=b.renderer.renderer,scene=b.renderer.scene,camera=b.renderer.camera,v=b.frontierVisuals;
  window.freezeMain=true;
  const snapshot=structuredClone(window.lastSnapshot.friends.frontier),elapsed=5000,clock=v.environmentPreview.time(window.lastSnapshot.friends.worldElapsedMs||0,elapsed);
  const {FriendsForestLOD}=await import(baselineUrl);
  const runtimeForest=v.forestLOD;
  runtimeForest.group.visible=false;
  const CandidateForest=baselineControl?FriendsForestLOD:(await import('/src/game/rendering/FriendsForestLOD.ts')).FriendsForestLOD;
  const current=new CandidateForest(scene,r,m=>v.clouds.shade(m));
  const old=new FriendsForestLOD(scene,r,m=>v.clouds.shade(m));old.group.visible=false;
  for(let i=0;i<1200&&(!old.arrivalReady||!current.arrivalReady);i++)await new Promise(resolve=>setTimeout(resolve,25));if(!old.arrivalReady||!current.arrivalReady)throw new Error('Baseline forest failed to load');
  const forests=sameForest?[current,current]:[old,current],cache=v.atmosphere.shadowCache;
  if(!cache)throw new Error('Shadow cache missing');
  cache.invalidate();let side=0;
  const prepare=cache.prepare.bind(cache);cache.prepare=function(c){if(side===1)prepare(c);else{this.restore();this.pending=false;}};
  const gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(!ext)throw new Error('GPU timer queries unavailable');
  let uploadedBytes=0;const bufferSubData=gl.bufferSubData.bind(gl);
  gl.bufferSubData=function(target,offset,data,sourceOffset,length){uploadedBytes+=length!==undefined?length*data.BYTES_PER_ELEMENT:data.byteLength;return bufferSubData(...arguments);};
  const pending=[],phases=[],images=[];const size={x:0,y:0,set(x,y){this.x=x;this.y=y;return this;},floor(){this.x=Math.floor(this.x);this.y=Math.floor(this.y);return this;}};
  const collect=()=>{if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw new Error('Disjoint GPU timer');for(let i=pending.length-1;i>=0;i--){const p=pending[i];if(gl.getQueryParameter(p.q,gl.QUERY_RESULT_AVAILABLE)){p.sample.gpu=gl.getQueryParameter(p.q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(p.q);pending.splice(i,1);}}};
  let drawElapsed=elapsed;
  const draw=(s,shadow)=>{
   side=s;forests[1-s].group.visible=false;
   const start=performance.now();forests[s].update(snapshot,t=>v.terrain.supports(t.x,t.y,t.z),new Set(),camera,true,drawElapsed);const update=performance.now()-start;
   r.shadowMap.needsUpdate=shadow;r.info.reset();uploadedBytes=0;
   return{update};
  };
  const read=(s)=>{draw(s,true);r.render(scene,camera);r.getDrawingBufferSize(size);const a=new Uint8Array(size.x*size.y*4);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,a);if(gl.getError())throw new Error('GL readback error');return a;};
  const compare=(a,b)=>{let changedPixels=0,max=0,sum=0;for(let i=0;i<a.length;i+=4){let changed=false;for(let k=0;k<4;k++){const d=Math.abs(a[i+k]-b[i+k]);max=Math.max(max,d);sum+=d*d;changed||=d!==0;}if(changed)changedPixels++;}return{changedPixels,maxChannelDifference:max,rmsChannelDifference:Math.sqrt(sum/a.length),pixels:a.length/4};};
  const position=camera.position.clone();
  if(location==='dense'){
   const entry=runtimeForest.entries.reduce((best,e)=>Math.hypot(e.tree.x-10700,e.tree.y-4200)<Math.hypot(best.tree.x-10700,best.tree.y-4200)?e:best);
   position.set(entry.tree.x,entry.tree.z+180,entry.tree.y+200);
  }
  const pose=(yaw,frame)=>{camera.position.copy(position);camera.rotation.set(-.3,yaw,0,'YXZ');camera.updateMatrixWorld();v.atmosphere.update(clock,elapsed+frame*1000/60);v.clouds.update(0,(elapsed+frame*1000/60)/1000,camera);};
  const comparisons=[];
  for(const dpr of [1,2]){
   r.setPixelRatio(dpr);
   for(const [frame,yaw]of [-2.3,-2.1,-2.5,.8].entries()){
    pose(yaw,frame*6);const a=read(0),repeat=read(0),b=read(1);
    comparisons.push({dpr,yaw,repeat:compare(a,repeat),...compare(a,b)});
   }
  }
  if(compareOnly){old.dispose();current.dispose();return{comparisons,sameForest,baselineControl};}
  if(fallOnly){
   r.setPixelRatio(1);pose(-2.3,0);
   const tree=runtimeForest.entries.reduce((best,e)=>e.sphere.center.distanceToSquared(position)<best.sphere.center.distanceToSquared(position)?e:best).tree;
   snapshot.harvested.push(tree.id);snapshot.revision++;
   snapshot.interaction={actions:{},damage:[],contacts:[{id:tree.id,tree,kind:'wood',value:6,total:6,by:'benchmark',until:6000,at:5000,broken:true,serial:99999,x:tree.x,y:tree.y,z:tree.z,nx:0,ny:1,nz:0}]};
   for(const s of [0,1]){draw(s,true);r.render(scene,camera);}
   const samples=[[],[]];
   for(let frame=0;frame<600;frame++){
    drawElapsed=elapsed+(frame+1)*1.5;
    for(const s of frame%2?[1,0]:[0,1]){
     const versions=new Map([...forests[s].buckets.values()].map(bucket=>[bucket,bucket.mesh.instanceMatrix.version]));
     const sample=draw(s,false);sample.matrixUploadBytes=0;
     for(const bucket of forests[s].buckets.values()){
      const attribute=bucket.mesh.instanceMatrix;
      if(attribute.version!==versions.get(bucket))sample.matrixUploadBytes+=attribute.updateRanges.length?attribute.updateRanges.reduce((bytes,range)=>bytes+range.count*4,0):attribute.array.byteLength;
      attribute.clearUpdateRanges();attribute.onUploadCallback();
     }
     samples[s].push(sample);
    }
   }
   const stats=values=>{const sorted=values.slice().sort((a,b)=>a-b);return{mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]};};
   const falling=samples.map(s=>({frames:s.length,update:stats(s.map(x=>x.update)),matrixUploadBytes:stats(s.map(x=>x.matrixUploadBytes))}));
   old.dispose();current.dispose();return{comparisons,falling,method:'Stationary camera, one falling natural tree, 600 paired CPU updates over 900 ms of animation. Upload bytes are required changed-buffer ranges; GPU upload callbacks simulated after the initial real render.'};
  }
  if(cpuOnly){
   const times=[[],[]];
   for(let frame=-120;frame<600;frame++){
    pose(-2.3+Math.sin(frame*Math.PI*2/120)*.2,Math.max(0,frame));
    for(const s of frame%2?[1,0]:[0,1]){
     const sample=draw(s,false);if(frame>=0)times[s].push(sample.update);
     for(const bucket of forests[s].buckets.values())bucket.mesh.instanceMatrix.clearUpdateRanges();
    }
   }
   const stats=v=>{v=v.slice().sort((a,b)=>a-b);return{mean:v.reduce((a,b)=>a+b,0)/v.length,p50:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)]};};
   old.dispose();current.dispose();return{comparisons,cpuOnly:times.map(stats)};
  }
  for(const dpr of [1,2])for(const motion of [false,true]){
   r.setPixelRatio(dpr);const samples=[[],[]],reuseBefore=cache.reuses,rendersBefore=cache.renders;
   // Warm both implementations at the same route before timed samples.
   for(let frame=-24;frame<pairs;frame++){
    const angle=motion?Math.sin(Math.max(0,frame)*Math.PI*2/120)*.2:0;pose(-2.3+angle,Math.max(0,frame));
    for(const s of frame%2?[1,0]:[0,1]){
     await new Promise(window.benchmarkRaf);collect();
     const sample=draw(s,frame%6===0),q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
     const start=performance.now();r.render(scene,camera);sample.cpu=performance.now()-start;gl.endQuery(ext.TIME_ELAPSED_EXT);
     Object.assign(sample,{calls:r.info.render.calls,triangles:r.info.render.triangles,uploadedBytes,shadow:frame%6===0,forest:forests[s].stats});
     if(frame>=0)samples[s].push(sample);pending.push({q,sample});
    }
   }
   for(let i=0;i<120&&pending.length;i++){await new Promise(window.benchmarkRaf);collect();}if(pending.length)throw new Error('Unresolved GPU queries');
   const stats=values=>{const v=values.slice().sort((a,b)=>a-b);return{mean:v.reduce((a,b)=>a+b,0)/v.length,p50:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)]};};
   const summary=s=>({frames:s.length,...Object.fromEntries(['gpu','cpu','update','calls','triangles','uploadedBytes'].map(k=>[k,stats(s.map(x=>x[k]))])),shadowFrames:s.filter(x=>x.shadow).length,forest:s.at(-1).forest});
   phases.push({location,dpr,motion,sides:samples.map(summary),shadowReuses:cache.reuses-reuseBefore,shadowRenders:cache.renders-rendersBefore,
    pairedGpuDifference:stats(samples[0].map((a,i)=>a.gpu-samples[1][i].gpu)),pairedCpuDifference:stats(samples[0].map((a,i)=>a.cpu-samples[1][i].cpu))});
  }
  const info=gl.getExtension('WEBGL_debug_renderer_info');const hardware={renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),samples:gl.getParameter(gl.SAMPLES)};
  const settings={viewport:[r.domElement.clientWidth||1600,r.domElement.clientHeight||900],fov:camera.fov,near:camera.near,far:camera.far,
   shadowMapSize:v.atmosphere.lights.sun.shadow.mapSize.toArray(),shadowType:r.shadowMap.type,toneMapping:r.toneMapping};
  old.dispose();current.dispose();return{hardware,position:position.toArray(),clock,settings,snapshot,comparisons,phases,images};
 },{baselineUrl:baseline.urls.FriendsForestLOD,pairs:Number(process.env.FRIENDS_PAIR_FRAMES||120),cpuOnly:process.env.FRIENDS_PAIR_CPU_ONLY==='true',location:process.env.FRIENDS_PAIR_LOCATION||'spawn',sameForest:process.env.FRIENDS_PAIR_SAME_FOREST==='true',compareOnly:process.env.FRIENDS_PAIR_COMPARE_ONLY==='true',baselineControl:process.env.FRIENDS_PAIR_BASELINE_CONTROL==='true',fallOnly:process.env.FRIENDS_PAIR_FALL_ONLY==='true'});
 Object.assign(report,result);delete report.images;assert.deepEqual(report.errors,[]);
 assert(report.comparisons.every(c=>c.repeat.changedPixels===0),'World baseline is not repeatable');
 assert(report.comparisons.every(c=>c.changedPixels===0),'World appearance changed');
 console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=String(error);throw error;}
finally{await writeFile(`${directory}/world-pair.json`,JSON.stringify(report,null,2)+'\n');await browser.close();await baseline.dispose();}
