import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory='artifacts/shorebreak';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling']});const report={errors:[],captures:[],performance:{},world:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('[vite] failed to connect'))report.errors.push(m.text());});
 await page.goto(origin+'/tools/water-polish-review.html');await page.waitForFunction(()=>window.waterReview);await page.evaluate(()=>waterReview.pause());
 for(const view of ['lake','overhead','sea','shorebreak']){
  for(const before of [true,false]){
   await page.evaluate(({view,before})=>{waterReview.view(view);waterReview.shoreVersion(before);waterReview.setTime(12);waterReview.draw();},{view,before});await page.waitForTimeout(150);
   await page.screenshot({path:`${directory}/${view}-${before?'before':'after'}.png`});
   const checks=await page.evaluate(()=>({gl:waterReview.renderer.getContext().getError(),calls:waterReview.renderer.info.render.calls,triangles:waterReview.renderer.info.render.triangles}));assert.equal(checks.gl,0);report.captures.push({view,before,...checks});
  }
 }
 await page.evaluate(()=>{waterReview.hour(true);waterReview.draw();});await page.screenshot({path:directory+'/sea-night.png'});
 await page.evaluate(()=>{waterReview.hour(false);waterReview.draw();});
 for(let i=0;i<report.captures.length;i+=2){assert.equal(report.captures[i].calls,report.captures[i+1].calls);assert.equal(report.captures[i].triangles,report.captures[i+1].triangles);}
 report.oceanOverlap=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {islandWater}=await import('/src/game/rendering/FriendsIslandVisuals.ts');
  const r=waterReview,scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1440/900,1,20000);camera.position.set(0,3000,1);camera.lookAt(0,0,0);
  scene.background=new THREE.Color('#baac91');
  const near=islandWater(0,0,8192,8192,0,()=>80,true,16),far=new THREE.Mesh(near.geometry,near.material.clone());
  for(const mesh of [near,far]){mesh.rotation.x=-Math.PI/2;mesh.material.uniforms.waveAmplitude.value=0;mesh.material.uniforms.wavePatch.value=1;mesh.material.uniforms.time.value=12;}
  near.material.uniforms.patchHalfExtent.value=1e8;scene.add(near);
  const gl=r.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,reference=new Uint8Array(w*h*4),composite=new Uint8Array(w*h*4);
  r.renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,reference);
  near.material.uniforms.patchHalfExtent.value=far.material.uniforms.patchHalfExtent.value=2000;
  far.material.uniforms.wavePatch.value=0;far.renderOrder=1;near.renderOrder=2;scene.add(far);
  r.renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,composite);
  let maxDifference=0,total=0;for(let i=0;i<reference.length;i++){const d=Math.abs(reference[i]-composite[i]);maxDifference=Math.max(maxDifference,d);total+=d;}
  near.geometry.dispose();near.material.uniforms.bathymetry.value.dispose();near.material.dispose();far.material.dispose();
  return {maxChannelDifference:maxDifference,meanChannelDifference:total/reference.length};
 });assert(report.oceanOverlap.maxChannelDifference<=3,'Ocean near/far overlap creates a visible seam');
 await page.evaluate(()=>{waterReview.view('shorebreak');waterReview.shoreVersion(false);});
 for(const time of [0,1.5,3,4.5,6]){await page.evaluate(t=>{waterReview.setTime(t);waterReview.draw();},time);await page.screenshot({path:`${directory}/wash-${time}.png`});}
 // At a fixed time, freshwater must keep the previous appearance, while the
 // coastal view must visibly change. Compare rendered pixels, not shader text.
 const {default:sharp}=await import('sharp');
 report.imageDifference={};
 for(const view of ['lake','shorebreak']){
  const before=await sharp(`${directory}/${view}-before.png`).raw().toBuffer(),after=await sharp(`${directory}/${view}-after.png`).raw().toBuffer();
  let changed=0,max=0;for(let i=0;i<before.length;i+=3){let d=0;for(let c=0;c<3;c++){const delta=Math.abs(before[i+c]-after[i+c]);d=Math.max(d,delta);max=Math.max(max,delta);}if(d>3)changed++;}
  report.imageDifference[view]={changedPixels:changed,maxChannelDifference:max};
 }
 assert.equal(report.imageDifference.lake.changedPixels,0,'Shorebreak altered freshwater');
 assert(report.imageDifference.shorebreak.changedPixels>1000,'Coastal breakers are not visible');
 report.performance=await page.evaluate(async()=>{
  const r=waterReview,gl=r.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),result={};
  const percentile=(a,q)=>a.length?a.sort((a,b)=>a-b)[Math.floor((a.length-1)*q)]:null;
  for(const view of ['lake','sea']){
   r.view(view);const buckets=[{cpu:[],queries:[]},{cpu:[],queries:[]}];
   // Both programs stay compiled; alternate in batches to reduce drift.
   for(let i=0;i<160;i++){
    const before=Math.floor(i/8)%2===0,b=buckets[Number(!before)];r.shoreVersion(before);r.setTime(12+i/60);r.draw();
    let query;if(timer&&i>=32){query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);}
    const start=performance.now();r.draw();if(i>=32)b.cpu.push(performance.now()-start);
    if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);b.queries.push(query);}await new Promise(requestAnimationFrame);
   }
   const summary=b=>{const gpu=[];if(timer&&!gl.getParameter(timer.GPU_DISJOINT_EXT))for(const q of b.queries){if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}return {cpuP50:percentile(b.cpu,.5),cpuP95:percentile(b.cpu,.95),gpuP50:percentile(gpu,.5),gpuP95:percentile(gpu,.95),gpuSamples:gpu.length};};
   result[view]={before:summary(buckets[0]),after:summary(buckets[1])};
  }r.shoreVersion(false);return result;
 });
 // Exercise actual island terrain, river shader customizations and underwater.
 await page.goto(origin+'/tools/river-review.html?view=deepmere');await page.waitForFunction(()=>window.riverReview);await page.waitForTimeout(2500);
 for(const [view,hour]of [['deepmere',12],['mouth',12],['water_bridge',12],['underwater_up',12],['deepmere',23]]){
  await page.evaluate(({view,hour})=>{riverReview.view(view);riverReview.hour(hour);},{view,hour});await page.waitForFunction(()=>riverReview.stats().terrain.surfaceJobs===0&&riverReview.stats().terrain.volumeJobs===0,{},{timeout:60000});await page.waitForTimeout(1200);await page.screenshot({path:`${directory}/world-${view}-${hour}.png`});
  const checks=await page.evaluate(()=>({gl:riverReview.renderer.getContext().getError(),...riverReview.stats()}));assert.equal(checks.gl,0);report.world.push({view,hour,...checks});
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile(directory+'/checks.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
