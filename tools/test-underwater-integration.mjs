import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {homedir} from 'node:os';import {join} from 'node:path';import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory='artifacts/underwater-polish',browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),report={errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('[vite] failed'))report.errors.push(m.text());});
 await page.goto(origin+'/tools/underwater-review.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.underwaterReview);
 report.lamp=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js'),r=underwaterReview;r.pause();r.view('roof');r.hour(true);r.setTime(20000);r.draw();
  const gl=r.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,before=new Uint8Array(w*h*4),after=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,before);
  const lamp=new THREE.PointLight('#ffdda5',25000,600,2);lamp.position.set(12128+80,40,23600+110);r.scene.add(lamp);r.draw();gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,after);
  let brighter=0;for(let i=0;i<before.length;i+=4)if(after[i]+after[i+1]+after[i+2]>before[i]+before[i+1]+before[i+2]+12)brighter++;
  return {brighterPixels:brighter,shafts:r.enhanced.shafts.visible,motes:r.enhanced.motes.visible,gl:gl.getError()};
 });assert(report.lamp.brighterPixels>1000);assert.equal(report.lamp.shafts,false);assert.equal(report.lamp.gl,0);await page.screenshot({path:directory+'/covered-lamp.png'});
 await page.goto(origin+'/tools/flood-water-review.html',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.floodReview);
 report.flood=await page.evaluate(async()=>{
  const {FriendsUnderwaterVisuals}=await import('/src/game/rendering/FriendsUnderwaterVisuals.ts'),r=floodReview,effect=new FriendsUnderwaterVisuals(r.scene);r.view('inside');
  const checks=[];
  for(const [state,action]of [['wet',()=>{}],['sealed',()=>r.seal()],['reopened',()=>r.dig()]]){
   effect.beginFrame();action();effect.update(r.camera,20000,true,1,r.terrain);r.draw();checks.push({state,underwater:effect.overlay.visible,motes:effect.motes.visible,wetCells:[...r.field.cells()].length,gl:r.renderer.getContext().getError()});
  }
  return checks;
 });assert.equal(report.flood[0].underwater,true);assert.equal(report.flood[1].underwater,false);assert.equal(report.flood[2].underwater,true);assert(report.flood.every(c=>c.gl===0));await page.screenshot({path:directory+'/flooded-opening.png'});assert.deepEqual(report.errors,[]);
}finally{await writeFile(directory+'/integration-checks.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
