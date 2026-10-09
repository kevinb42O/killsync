import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const dir='artifacts/submerged-dressing';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),report={errors:[],views:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('[vite] failed'))report.errors.push(m.text());});
 await page.goto('http://localhost:3014/tools/river-review.html?view=underwater',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.riverReview,{},{timeout:60000});
 for(const name of ['underwater','underwater_sea']){
  await page.evaluate(name=>{const r=riverReview;r.view(name);},name);
  await page.waitForTimeout(4000);await page.waitForFunction(()=>window.riverReview&&riverReview.stats().terrain.surfaceJobs===0&&riverReview.stats().terrain.volumeJobs===0,{},{timeout:60000});await page.waitForTimeout(1000);
  await page.screenshot({path:`${dir}/${name}.png`});report.views.push(await page.evaluate(name=>{const r=riverReview,d=r.underwater.dressing;return {name,camera:r.camera.position.toArray(),scenery:d?{visible:d.root.visible,...d.stats,rocks:d.rocks.count,plants:d.plants.count}:null,gl:r.renderer.getContext().getError(),...r.stats()};},name));
 }
 assert.deepEqual(report.errors,[]);assert.equal(report.views[0].scenery.visible,true);assert.ok(report.views[0].scenery.placedTiles>50);assert.ok(Math.abs(report.views[1].camera[0]-40000)<.001);assert.equal(report.views[1].scenery.visible,true);
 await page.goto('http://localhost:3014/tools/submerged-review.html');await page.waitForFunction(()=>window.submergedReview);await page.waitForTimeout(700);await page.evaluate(()=>submergedReview.pause());
 for(const name of ['lake','sea','abyss','swimming']){await page.evaluate(name=>{const r=submergedReview;r.view(name);for(let i=0;i<60;i++)r.draw();if(name==='abyss'&&!r.effect.overlay.visible)throw Error('Abyss camera is not submerged');},name);await page.screenshot({path:`${dir}/local-${name}.png`});}
 await page.evaluate(()=>{submergedReview.view('lake');for(let i=0;i<60;i++)submergedReview.draw();});
 report.performance=await page.evaluate(async()=>{
  const r=submergedReview,d=r.effect.dressing,gl=r.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),buckets=[[],[]],calls=[];
  const before={...r.renderer.info.memory};
  for(let i=0;i<100;i++){const visible=i%2===1;d.root.visible=visible;let q;if(ext&&i>20){q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);}r.renderer.render(r.scene,r.camera);if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);buckets[Number(visible)].push(q);}calls[Number(visible)]=r.renderer.info.render.calls;await new Promise(requestAnimationFrame);}
  const median=queries=>{const vals=[];if(ext&&!gl.getParameter(ext.GPU_DISJOINT_EXT))for(const q of queries){if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))vals.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}return vals.sort((a,b)=>a-b)[Math.floor(vals.length/2)]??null;};
  const samples=d.stats.sampledTiles;r.camera.position.y=220;r.effect.beginFrame();r.effect.update(r.camera,100000,true,1,r.terrain,false);r.renderer.render(r.scene,r.camera);const land={visible:d.root.visible,samples:d.stats.sampledTiles,draws:r.renderer.info.render.calls};
  for(let i=0;i<80;i++){r.effect.beginFrame();r.effect.update(r.camera,100000+i*16,true,1,r.terrain,false);}
  return {gpuWithout:median(buckets[0]),gpuWith:median(buckets[1]),calls,before,after:{...r.renderer.info.memory},land,landQueries:d.stats.sampledTiles-samples};
 });assert.equal(report.performance.land.visible,false);assert.equal(report.performance.landQueries,0);assert.equal(report.performance.calls[1]-report.performance.calls[0],3);assert.deepEqual(report.performance.before,report.performance.after);
}finally{await writeFile(dir+'/checks.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
