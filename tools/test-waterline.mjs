import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const directory='artifacts/waterline',errors=[],captures=[];await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto((process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3015')+'/tools/underwater-review.html?view=split');
 await page.waitForFunction(()=>window.underwaterReview);await page.evaluate(()=>underwaterReview.pause());
 for(const [name,y,pitch,roll]of [['split',154.5,0,0],['just-above',155,0,0],['just-below',154,0,0],['tilted',154.5,.15,.3],['above',180,0,0],['below',125,0,0]]){
  const check=await page.evaluate(({y,pitch,roll})=>{
   const r=underwaterReview;r.view('split');r.camera.position.y=y;r.camera.rotation.x=pitch;r.camera.rotation.z=roll;r.camera.updateMatrixWorld(true);r.setTime(20000);r.draw();
   return {gl:r.renderer.getContext().getError(),calls:r.renderer.info.render.calls,memory:{...r.renderer.info.memory},fog:r.scene.fog.color.getHexString(),underwater:r.enhanced.overlay.visible};
  },{y,pitch,roll});assert.equal(check.gl,0);captures.push({name,...check});await page.screenshot({path:`${directory}/${name}.png`});
 }
 const stress=await page.evaluate(()=>{
  const r=underwaterReview;r.view('split');r.draw();const before={...r.renderer.info.memory};
  for(let i=0;i<80;i++){r.camera.position.y=154.5+Math.sin(i)*8;r.camera.rotation.z=Math.sin(i*.2)*.4;r.setTime(20000+i*16);r.draw();}
  r.view('split');r.draw();return {before,after:{...r.renderer.info.memory},gl:r.renderer.getContext().getError()};
 });assert.deepEqual(stress.after,stress.before);assert.equal(stress.gl,0);assert.deepEqual(errors,[]);
 await page.goto((process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3015')+'/tools/river-review.html?view=underwater',{timeout:60000});
 await page.waitForFunction(()=>window.riverReview);
 await page.waitForTimeout(3000);
 await page.evaluate(()=>{riverReview.view('underwater_split');});
 await page.waitForTimeout(1000);await page.screenshot({path:directory+'/world-split.png'});
 const world=await page.evaluate(()=>({gl:riverReview.renderer.getContext().getError(),...riverReview.stats()}));
 console.log(JSON.stringify({world,errors}));assert.equal(world.gl,0);assert.deepEqual(errors,[]);
 await writeFile(directory+'/checks.json',JSON.stringify({captures,stress,world,errors},null,2));console.log(JSON.stringify({captures,stress,world,errors},null,2));
}finally{await browser.close();}
