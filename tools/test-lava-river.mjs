import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(homedir()+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const directory='artifacts/lava-river';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const report={errors:[],captures:[],river:{},summit:{}};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto((process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000')+'/tools/lava-river-review.html');await page.waitForFunction(()=>window.lavaReview,{timeout:60000});await page.evaluate(()=>lavaReview.pause());
 for(const view of ['overview','summit','delta','bench']){
  await page.evaluate(view=>{lavaReview.view(view);lavaReview.draw();},view);await page.waitForTimeout(150);
  await page.screenshot({path:`${directory}/${view}.png`});
  const stats=await page.evaluate(()=>({calls:lavaReview.renderer.info.render.calls,triangles:lavaReview.renderer.info.render.triangles,gl:lavaReview.renderer.getContext().getError()}));assert.equal(stats.gl,0);report.captures.push({view,...stats});
 }
 report.river=await page.evaluate(()=>{
  const meshes=[];lavaReview.river.traverse(o=>{if(o.isMesh)meshes.push({name:o.name,instances:o.count||1,triangles:(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.count||1)});});
  const scene=new lavaReview.scene.constructor(),camera=lavaReview.camera,renderer=lavaReview.renderer;
  const parent=lavaReview.river.parent;scene.add(lavaReview.river);
  camera.position.set(42000,7000,43000);camera.lookAt(36700,800,37800);renderer.render(scene,camera);
  const calls=renderer.info.render.calls;parent.add(lavaReview.river);return {meshes,calls};
 });assert.equal(report.river.calls,4);assert.equal(report.errors.length,0,report.errors.join('\n'));
 report.summit=await page.evaluate(()=>{
  const r=lavaReview,scene=new r.scene.constructor(),camera=r.camera,renderer=r.renderer,smoke=r.smoke,parent=smoke.parent,gl=renderer.getContext();
  r.view('summit');scene.add(smoke);renderer.render(scene,camera);gl.finish();
  const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles,geometries=renderer.info.memory.geometries,matrixVersion=smoke.instanceMatrix.version;
  const samples=[];for(let i=0;i<40;i++){smoke.update(14+i*.08);const start=performance.now();renderer.render(scene,camera);gl.finish();samples.push(performance.now()-start);}
  samples.sort((a,b)=>a-b);const stableGeometry=geometries===renderer.info.memory.geometries,stableInstances=matrixVersion===smoke.instanceMatrix.version;
  camera.position.set(100000,8000,100000);camera.lookAt(110000,8000,110000);renderer.render(scene,camera);const offscreenCalls=renderer.info.render.calls;
  parent.add(smoke);r.view('summit');r.draw();return {calls,triangles,puffs:smoke.count,medianRenderMs:samples[20],p95RenderMs:samples[38],stableGeometry,stableInstances,offscreenCalls};
 });assert.equal(report.summit.calls,1);assert.equal(report.summit.triangles,64);assert(report.summit.stableGeometry&&report.summit.stableInstances);assert.equal(report.summit.offscreenCalls,0);
 await page.evaluate(async()=>{const {FriendsVolcanoSmoke}=await import('/artifacts/lava-river/source/baseline-smoke.ts');const r=lavaReview;r.smoke.visible=false;window.oldSummitSmoke=new FriendsVolcanoSmoke();oldSummitSmoke.update(14);r.scene.add(oldSummitSmoke);r.view('summit');r.draw();});
 await page.screenshot({path:`${directory}/summit-before.png`});
 await page.evaluate(()=>{oldSummitSmoke.dispose();lavaReview.smoke.visible=true;lavaReview.draw();});
 await page.screenshot({path:`${directory}/summit.png`});
 await page.click('#listen');await page.waitForFunction(()=>lavaReview.audio.worldLoops.has('oceanSteam'));
 report.audio=await page.evaluate(()=>{
  const audio=lavaReview.audio,loop=audio.worldLoops.get('oceanSteam'),buffer=loop.source.buffer,source=loop.source;
  for(let i=0;i<50;i++)audio.setWorldSound(audio.worldMix);
  const stableSource=audio.worldLoops.get('oceanSteam').source===source;
  const channel=buffer.getChannelData(0);let peak=0,energy=0;for(const n of channel){peak=Math.max(peak,Math.abs(n));energy+=n*n;}
  const near={volume:audio.worldMix.oceanSteam.volume,pan:audio.worldMix.oceanSteam.pan};
  audio.clearSoundscape();return {duration:buffer.duration,channels:buffer.numberOfChannels,loop:source.loop,peak,rms:Math.sqrt(energy/channel.length),stableSource,released:audio.worldLoops.size===0&&audio.retiringWorldSources.size===0,near};
 });assert(report.audio.loop&&report.audio.stableSource&&report.audio.released);assert.equal(report.audio.channels,1);assert(report.audio.duration>22&&report.audio.duration<25);assert(report.audio.peak>.01&&report.audio.peak<.4);assert(report.audio.near.volume>.2);await page.click('#silence');
 await writeFile(`${directory}/checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
