import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory='artifacts/underwater-polish';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling']}),report={errors:[],captures:[],performance:{}};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('[vite] failed to connect'))report.errors.push(m.text());});
 await page.goto(origin+'/tools/underwater-review.html');await page.waitForFunction(()=>window.underwaterReview);await page.evaluate(()=>underwaterReview.pause());
 for(const view of ['shallow','bottom','up','deep','roof','surface'])for(const before of [true,false]){
  await page.evaluate(({view,before})=>{underwaterReview.view(view);underwaterReview.version(before);underwaterReview.setTime(20000);underwaterReview.draw();},{view,before});await page.waitForTimeout(180);await page.screenshot({path:`${directory}/${view}-${before?'before':'after'}.png`});
  const check=await page.evaluate(()=>({gl:underwaterReview.renderer.getContext().getError(),calls:underwaterReview.renderer.info.render.calls,triangles:underwaterReview.renderer.info.render.triangles,points:underwaterReview.renderer.info.render.points,motes:underwaterReview.enhanced.motes.visible,shafts:underwaterReview.enhanced.shafts.visible}));assert.equal(check.gl,0);if(view==='roof')assert.equal(check.shafts,false);if(view==='surface')assert.equal(check.motes,false);report.captures.push({view,before,...check});
 }
 await page.evaluate(()=>{underwaterReview.view('bottom');underwaterReview.hour(true);underwaterReview.draw();});await page.screenshot({path:directory+'/night.png'});assert.equal(await page.evaluate(()=>underwaterReview.enhanced.shafts.visible),false);
 await page.evaluate(()=>{underwaterReview.hour(false);underwaterReview.draw();});
 report.performance=await page.evaluate(async()=>{
  const r=underwaterReview,gl=r.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),results={},p=(a,q)=>a.length?a.sort((a,b)=>a-b)[Math.floor((a.length-1)*q)]:null;
  for(const view of ['bottom','up','roof']){
   r.view(view);const buckets=[{cpu:[],queries:[],calls:0},{cpu:[],queries:[],calls:0}];
   for(let i=0;i<160;i++){
    const before=Math.floor(i/8)%2===0,b=buckets[Number(!before)];r.version(before);r.setTime(30000+i*16);r.draw();
    let query;if(timer&&i>=32){query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);}
    const start=performance.now();r.draw();if(i>=32)b.cpu.push(performance.now()-start);b.calls=r.renderer.info.render.calls;
    if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);b.queries.push(query);}await new Promise(requestAnimationFrame);
   }
   const summary=b=>{const gpu=[];if(timer&&!gl.getParameter(timer.GPU_DISJOINT_EXT))for(const q of b.queries){if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}return {cpuP50:p(b.cpu,.5),cpuP95:p(b.cpu,.95),gpuP50:p(gpu,.5),gpuP95:p(gpu,.95),gpuSamples:gpu.length,calls:b.calls};};results[view]={before:summary(buckets[0]),after:summary(buckets[1])};
  }r.version(false);r.view('bottom');r.draw();const memory={...r.renderer.info.memory};for(let i=0;i<120;i++){r.view(i%2?'surface':'bottom');r.setTime(60000+i*16);r.draw();}results.memory={before:memory,after:{...r.renderer.info.memory}};return results;
 });assert.deepEqual(report.performance.memory.before,report.performance.memory.after);
 // Full island integration, including dynamically streamed terrain materials.
 await page.goto(origin+'/tools/river-review.html?view=underwater',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.riverReview);report.world=[];
 for(const [view,hour]of [['underwater',12],['underwater_up',12],['underwater_station',12],['underwater',23]]){
  await page.evaluate(({view,hour})=>{riverReview.view(view);riverReview.hour(hour);},{view,hour});await page.waitForTimeout(1000);await page.waitForFunction(()=>window.riverReview&&riverReview.stats().terrain.surfaceJobs===0&&riverReview.stats().terrain.volumeJobs===0,{},{timeout:60000});await page.waitForTimeout(1500);await page.screenshot({path:`${directory}/world-${view}-${hour}.png`});
  const check=await page.evaluate(()=>({gl:riverReview.renderer.getContext().getError(),...riverReview.stats()}));assert.equal(check.gl,0);report.world.push({view,hour,...check});
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile(directory+'/checks.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
