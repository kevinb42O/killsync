import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const directory='artifacts/fishing-species',origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014';
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const report={errors:[],species:[],giant:[],pool:{}};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/tools/friends-fishing-review.html');
 await page.waitForFunction(()=>window.fishingReview);
 for(const species of ['trout','perch','zander','pike','mackerel','cod','tuna','shark']){
  await page.evaluate(s=>{const r=fishingReview;r.setStage('held');r.setSpecies(s);r.setSize(s==='shark'?10:s==='tuna'?4:1);},species);
  await page.waitForFunction(s=>{const f=fishingReview.fishing.fishes.get(1);return f?.species===s&&f.model;},species);
  await page.waitForTimeout(350);
  const result=await page.evaluate(()=>{
   const r=fishingReview,f=r.fishing.fishes.get(1),box=new r.THREE.Box3().setFromObject(f.model.root),points=[];
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new r.THREE.Vector3(x,y,z).project(r.handCamera).toArray());
   return {species:f.species,clips:f.model.clips.length,points,gl:r.renderer.getContext().getError(),text:document.querySelector('.friends-fishing-log').innerText};
  });
  assert.equal(result.gl,0);assert(result.points.flat().every(Number.isFinite));assert(result.text.toLowerCase().includes(species));
  await page.screenshot({path:`${directory}/held-${species}.png`});report.species.push(result);
  for(const stage of ['reeling','dry','swimming']){
   await page.evaluate(stage=>fishingReview.setStage(stage),stage);await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>fishingReview.renderer.getContext().getError()),0);
   if(stage==='dry')await page.screenshot({path:`${directory}/dry-${species}.png`});
  }
 }
 for(const viewport of [{width:1440,height:900},{width:360,height:740}]){
  await page.setViewportSize(viewport);
  await page.evaluate(()=>{fishingReview.setStage('held');fishingReview.setSpecies('shark');fishingReview.setSize(10);});await page.waitForTimeout(300);
  for(const fov of [70,98,120]){
   const result=await page.evaluate(fov=>{const r=fishingReview;r.handCamera.fov=fov;r.handCamera.updateProjectionMatrix();return {fov};},fov);
   await page.waitForTimeout(100);
   report.giant.push({...viewport,...result});await page.screenshot({path:`${directory}/shark-${viewport.width}-${fov}.png`});
  }
 }
 // Replace identities/species repeatedly while templates stay cached.
 await page.evaluate(()=>fishingReview.pause());
 report.pool=await page.evaluate(async()=>{
  const r=fishingReview,all=['trout','perch','zander','pike','mackerel','cod','tuna','shark'];
  for(const s of all)await r.loadFishingFish(s);
  const update=()=>r.fishing.update(r.state(),[r.player],'review',7,r.camera,10000,16,true,r.project,()=>false);
  for(let i=0;i<80;i++){
   r.setStage('held');r.setSpecies(all[i%8]);r.state().fish[0].id=100+i;update();await new Promise(resolve=>setTimeout(resolve,0));update();
  }
  return {active:r.fishing.fishes.size,pooled:r.fishing.pool.length,modelChildren:[...r.fishing.fishes.values(),...r.fishing.pool].map(f=>f.root.children.length)};
 });
 assert(report.pool.active+report.pool.pooled<=2);assert(report.pool.modelChildren.every(n=>n<=1));assert.deepEqual(report.errors,[]);
 await writeFile(`${directory}/validation.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({species:report.species.map(s=>({name:s.species,clips:s.clips})),giant:report.giant.length,pool:report.pool,errors:report.errors},null,2));
}finally{await browser.close();}
