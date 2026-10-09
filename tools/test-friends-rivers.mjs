import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const out='artifacts/river-implementation',origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000';
const selected=process.argv.slice(2),views=selected.length?selected:['deepmere','skyfalls','skyfalls_underpass','world_gate','gate_run','bridge','water_bridge','gorge','mouth','island'];
await mkdir(out,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const report={errors:[],views:[],date:new Date().toISOString()};
const page=await browser.newPage({viewport:{width:1280,height:820}});
page.on('pageerror',e=>{report.errors.push(e.stack||e.message);console.error(e.stack||e.message);});page.on('console',m=>{if(m.type()==='error'){report.errors.push(m.text());console.error(m.text());}else if(m.text().startsWith('River review:'))console.log(m.text());});
try{
  await page.goto(`${origin}/tools/river-review.html`,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.riverReview?.frames()>20,undefined,{timeout:180000});
  report.addedGeometry=await page.evaluate(()=>{
    const group=riverReview.scene.getObjectByName('connected-island-rivers');
    return {meshBatches:group.children.length,triangles:group.children.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0),depthMaskBytes:group.children.reduce((n,m)=>n+(m.material.uniforms?.bathymetry?.value.image.data.byteLength??0),0)};
  });
  await page.evaluate(()=>document.querySelector('aside').hidden=true);
  for(const name of views){
    await page.evaluate(name=>riverReview.view(name),name);
    await page.waitForFunction(()=>riverReview.stats().terrain.surfaceJobs===0,undefined,{timeout:90000});
    await page.waitForTimeout(1500);
    report.views.push({name,...await page.evaluate(()=>riverReview.stats())});
    await page.screenshot({path:`${out}/${name}.png`});
    assert.equal(await page.evaluate(()=>riverReview.renderer.getContext().getError()),0,`${name}: WebGL error`);
    console.log('PASS',name);
  }
  if(!selected.length){
    await page.evaluate(()=>{riverReview.view('bridge');riverReview.hour(20);});await page.waitForTimeout(3500);await page.screenshot({path:`${out}/bridge-dusk.png`});
    await page.evaluate(()=>{riverReview.view('deepmere');riverReview.hour(23);});await page.waitForTimeout(3500);await page.screenshot({path:`${out}/lake-night.png`});
  }
  assert.deepEqual(report.errors,[]);
  console.log(`PASS ${selected.length?'selected views':'daylight, dusk, night'}, WebGL, and browser errors`);
}catch(e){report.failure=String(e);await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw e;}
finally{await writeFile(`${out}/render-checks${selected.length?'-'+selected.join('-'):''}.json`,JSON.stringify(report,null,2));await browser.close();}
