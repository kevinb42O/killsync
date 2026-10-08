import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {friendsBaselineModules} from './friends-baseline-modules.mjs';

const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3001';
const directory=process.env.FRIENDS_FOREST_OUTPUT||'artifacts/friends-render-third-pass';
const snapshot=process.env.FRIENDS_COMPARE_SNAPSHOT||'artifacts/friends-render-third-pass/source';
await mkdir(directory,{recursive:true});
const baseline=await friendsBaselineModules(undefined,['FriendsForestLOD','FriendsDayNightCycle'],snapshot);
const browser=await playwright.chromium.launch({headless:true,args:[`--use-angle=${process.env.FRIENDS_TEST_ANGLE||'metal'}`]});
const report={date:new Date().toISOString(),origin,snapshot,errors:[]};
try{
 const page=await browser.newPage();page.setDefaultTimeout(120000);
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'||/GL_INVALID_|GL_OUT_OF_MEMORY/.test(m.text()))report.errors.push(m.text());});
 await page.route('**/__forest_equivalence',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
 await page.goto(`${origin}/__forest_equivalence`);
 const result=await page.evaluate(async({baselineUrls,timing})=>{
  const raw=await(await fetch('/src/game/rendering/FriendsForestLOD.ts')).text();
  const THREE=await import(raw.match(/from "([^"]*three\.js[^"]*)"/)[1]);
  const modules=[await import(baselineUrls.FriendsForestLOD),await import('/src/game/rendering/FriendsForestLOD.ts')];
  const {FriendsFrontier,frontierTrees}=await import('/src/game/multiplayer/FriendsFrontier.ts');
  const {FriendsClouds}=await import('/src/game/rendering/FriendsClouds.ts');
  const cycles=[await import(baselineUrls.FriendsDayNightCycle),await import('/src/game/rendering/FriendsDayNightCycle.ts')];
  const natural=[];for(let x=0;x<94;x++)for(let y=0;y<94;y++)natural.push(...frontierTrees(x,y));
  // Deterministic overlapping cards and equal-position trees stress depth ties.
  const dense=Array.from({length:320},(_,i)=>({id:`dense:${i}`,x:6000+(i%16)*85,y:6200+Math.floor(i/16)*95,z:0,scale:.7+(i%9)*.1,kind:['pine','oak','autumnOak'][i%3]}));
  dense.push({...dense[0],id:'coplanar:0'},{...dense[0],id:'coplanar:1'});
  let workerTrees=natural;
  const realWorker=window.Worker;
  window.Worker=class{postMessage(){queueMicrotask(()=>this.onmessage?.({data:workerTrees}));}terminate(){}};
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(960,540);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const camera=new THREE.PerspectiveCamera(108,16/9,2,110000);
  const clouds=new FriendsClouds(renderer);
  const fixtures=modules.map((m,side)=>{
   const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xaec4bd,.000009);
   const sun=new THREE.DirectionalLight(),ambient=new THREE.AmbientLight(),fill=new THREE.HemisphereLight();scene.add(sun,sun.target,ambient,fill);
   Object.assign(sun.shadow.camera,{left:-1700,right:1700,top:1700,bottom:-1700,near:10,far:6500});sun.shadow.camera.updateProjectionMatrix();sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=1.5;sun.shadow.bias=-.0003;
   const cycle=new cycles[side].FriendsDayNightCycle(scene,renderer,camera,{sun,ambient,fill});
   const material=new THREE.MeshStandardMaterial({color:0x779565,roughness:1});clouds.shade(material);
   const ground=new THREE.Mesh(new THREE.PlaneGeometry(110000,110000),material);ground.rotation.x=-Math.PI/2;ground.position.set(24000,-16,24000);ground.receiveShadow=true;scene.add(ground);
   const spot=new THREE.SpotLight(0xffe8c8,0,3000,.8,.5,2);spot.position.set(6000,400,7000);spot.target.position.set(6400,100,6200);spot.castShadow=true;spot.shadow.mapSize.set(512,512);scene.add(spot,spot.target);
   const forest=new m.FriendsForestLOD(scene,renderer,material=>clouds.shade(material));
   return{scene,sun,cycle,forest,spot,ground};
  });
  const ready=async()=>{for(let i=0;i<1200&&!fixtures.every(f=>f.forest.arrivalReady);i++)await new Promise(r=>setTimeout(r,25));if(!fixtures.every(f=>f.forest.arrivalReady))throw new Error('Forest did not load');};
  await ready();
  const snapshot=new FriendsFrontier().snapshot();
  const gl=renderer.getContext(),size=new THREE.Vector2();
  const read=f=>{renderer.render(f.scene,camera);renderer.getDrawingBufferSize(size);const data=new Uint8Array(size.x*size.y*4);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,data);if(gl.getError())throw new Error('WebGL readback error');return data;};
  const compare=(a,b)=>{let changedPixels=0,changedChannels=0,max=0,sum=0;for(let i=0;i<a.length;i+=4){let changed=false;for(let k=0;k<4;k++){const d=Math.abs(a[i+k]-b[i+k]);max=Math.max(max,d);sum+=d*d;if(d){changed=true;changedChannels++;}}if(changed)changedPixels++;}return{changedPixels,changedChannels,maxChannelDifference:max,rmsChannelDifference:Math.sqrt(sum/a.length),pixels:a.length/4};};
  const pose=(position,target,hour=9)=>{camera.position.fromArray(position);camera.lookAt(...target);camera.updateMatrixWorld();for(const f of fixtures)f.cycle.update(hour/24*1440000,5000);clouds.setAtmosphere(fixtures[0].cycle);clouds.update(0,5,camera);};
  const pack=(elapsed=5000,ground=()=>true,dirty=new Set())=>fixtures.forEach(f=>f.forest.update(snapshot,ground,dirty,camera,true,elapsed));
  const captures=[],cases=[];
  for(const dpr of [1,2]){
   renderer.setPixelRatio(dpr);
   for(const [name,position,target] of [
    ['valley',[5900,1100,5700],[10700,500,4200]],
    ['cedar',[10500,900,6000],[10700,1000,4200]],
    ['ridge',[15800,2800,8000],[10700,500,4200]],
    ['reverse',[5900,1100,5700],[5000,1000,9000]],
   ])for(const hour of [9,18,23]){
    pose(position,target,hour);pack();
    const a=read(fixtures[0]),repeat=read(fixtures[0]),b=read(fixtures[1]);
    cases.push({name,dpr,hour,repeat:compare(a,repeat),...compare(a,b),forest:fixtures.map(f=>f.forest.stats)});
    if(name==='valley'&&hour===9&&dpr===1)captures.push(...fixtures.map(f=>{read(f);return renderer.domElement.toDataURL();}));
   }
  }
  // Replace natural entries in both implementations through their normal rebuild.
  for(const f of fixtures){f.forest.natural=dense;f.forest.rebuilt=true;}
  for(const dpr of [1,2]){
   renderer.setPixelRatio(dpr);
   for(let frame=0;frame<12;frame++){
    pose([6200+frame*8,150,7500],[6600,240,6500],frame%3===0?18:9);fixtures.forEach(f=>f.spot.intensity=frame%2?300000:0);pack();
    cases.push({name:'overlap-motion',dpr,frame,...compare(read(fixtures[0]),read(fixtures[1]))});
   }
   snapshot.planted=[{id:'planted:fixture',x:6350,y:7100,z:0,scale:1,kind:'pine'}];snapshot.revision++;pack();
   cases.push({name:'plant',dpr,...compare(read(fixtures[0]),read(fixtures[1]))});
   snapshot.harvested=[dense[0].id];snapshot.revision++;pack();
   cases.push({name:'harvest',dpr,...compare(read(fixtures[0]),read(fixtures[1]))});
   pack(5000,t=>t.id!==dense[1].id,new Set(['11,12']));
   cases.push({name:'support-edit',dpr,...compare(read(fixtures[0]),read(fixtures[1]))});
   snapshot.planted=[];snapshot.harvested=[];snapshot.revision++;pack(5000,()=>true,new Set(['11,12']));
   const t=dense[200];snapshot.interaction={actions:{},damage:[],contacts:[{...t,tree:t,id:t.id,kind:'wood',value:6,total:6,by:'fixture',until:6000,nx:0,ny:1,nz:0,serial:100+dpr,at:5000,broken:true}]};snapshot.harvested=[t.id];snapshot.revision++;
   for(const elapsed of [5000,5300,5700,6000]){pack(elapsed);cases.push({name:'fall',dpr,elapsed,...compare(read(fixtures[0]),read(fixtures[1]))});}
   snapshot.interaction=undefined;snapshot.harvested=[];snapshot.revision++;
  }
  const timings=[];
  if(timing){
   for(const f of fixtures){f.forest.natural=natural;f.forest.rebuilt=true;f.spot.intensity=0;}
   const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(!ext)throw new Error('GPU timer queries unavailable');
   const pending=[];
   const collect=()=>{if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw new Error('Disjoint GPU timer');for(let i=pending.length-1;i>=0;i--){const p=pending[i];if(gl.getQueryParameter(p.q,gl.QUERY_RESULT_AVAILABLE)){p.sample.gpu=gl.getQueryParameter(p.q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(p.q);pending.splice(i,1);}}};
   for(const dpr of [1,2])for(const motion of [false,true]){
    renderer.setSize(1600,900);renderer.setPixelRatio(dpr);
    const samples=[[],[]];
    for(let frame=0;frame<240;frame++){
     await new Promise(requestAnimationFrame);collect();
     // Each pair receives the same frame-indexed camera pose; alternate which
     // implementation goes first on successive pairs to reduce order bias.
     const pair=Math.floor(frame/2),side=(frame%2)^(pair%2),angle=motion?Math.sin(pair*.05)*.2:0;
     pose([5900,1100,5700],[5900+Math.sin(-2.3+angle)*6000,500,5700-Math.cos(-2.3+angle)*6000]);
     const f=fixtures[side],start=performance.now();f.forest.update(snapshot,()=>true,new Set(),camera,true,5000);const update=performance.now()-start;
     renderer.shadowMap.enabled=false;
     const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);const renderStart=performance.now();renderer.render(f.scene,camera);const cpu=performance.now()-renderStart;gl.endQuery(ext.TIME_ELAPSED_EXT);
     const sample={update,cpu,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};if(frame>=40)samples[side].push(sample);pending.push({q,sample});
    }
    for(let i=0;i<120&&pending.length;i++){await new Promise(requestAnimationFrame);collect();}if(pending.length)throw new Error('GPU queries failed to resolve');
    const stats=v=>{v=v.slice().sort((a,b)=>a-b);return{mean:v.reduce((a,b)=>a+b,0)/v.length,p50:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)]};};
    timings.push({dpr,motion,sides:samples.map(s=>({frames:s.length,gpu:stats(s.map(x=>x.gpu)),cpu:stats(s.map(x=>x.cpu)),update:stats(s.map(x=>x.update)),triangles:stats(s.map(x=>x.triangles)),calls:stats(s.map(x=>x.calls))}))});
   }
  }
  const gpuInfo=gl.getExtension('WEBGL_debug_renderer_info');
  const hardware={renderer:gpuInfo?gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),samples:gl.getParameter(gl.SAMPLES)};
  window.Worker=realWorker;fixtures.forEach(f=>{f.forest.dispose();f.cycle.dispose();f.sun.shadow.dispose();f.spot.shadow.dispose();f.ground.geometry.dispose();f.ground.material.dispose();});clouds.release();renderer.dispose();
  return{hardware,naturalTrees:natural.length,cases,timings,captures};
 },{baselineUrls:baseline.urls,timing:process.env.FRIENDS_FOREST_TIMING==='true'});
 for(let i=0;i<result.captures.length;i++)await writeFile(`${directory}/forest-${i?'after':'before'}.png`,Buffer.from(result.captures[i].split(',')[1],'base64'));
 delete result.captures;Object.assign(report,result);
 assert.deepEqual(report.errors,[]);
 assert(report.cases.every(c=>!c.repeat||c.repeat.changedPixels===0),'Baseline is not repeatable');
 assert(report.cases.every(c=>c.changedPixels===0),'Forest changed pixels');
 console.log(JSON.stringify({cases:report.cases.length,maxChangedPixels:Math.max(...report.cases.map(c=>c.changedPixels)),hardware:report.hardware,timings:report.timings,errors:report.errors},null,2));
}catch(error){report.failure=String(error);throw error;}
finally{await writeFile(`${directory}/forest-equivalence.json`,JSON.stringify(report,null,2)+'\n');await browser.close();await baseline.dispose();}
