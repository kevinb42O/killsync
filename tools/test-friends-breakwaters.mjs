import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const directory='artifacts/breakwaters';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014')+'/tools/friends-coastal-pier-review.html');
  await page.waitForFunction(()=>window.coastalPierReview?.scene.getObjectByName('coastal-golfbrekers'));
  await page.locator('aside').evaluate(el=>el.style.display='none');
  await page.evaluate(async()=>{const {FRIENDS_BREAKWATERS,breakwaterPoint}=await import('/src/game/world/FriendsBreakwaters.ts'),r=window.coastalPierReview,b=FRIENDS_BREAKWATERS[0];window.breakwaterReview={b,breakwaterPoint};const eye=breakwaterPoint(b,250,650),look=breakwaterPoint(b,400);r.camera.position.set(eye.x,200,eye.y);r.camera.lookAt(look.x,-128,look.y);});
  await page.waitForTimeout(6000);
  await page.screenshot({path:directory+'/coast.png'});
  await page.evaluate(()=>{const r=coastalPierReview,{b,breakwaterPoint}=breakwaterReview,p=breakwaterPoint(b,650),look=breakwaterPoint(b,b.length+400);r.camera.position.set(p.x,-76,p.y);r.camera.lookAt(look.x,-135,look.y);});
  await page.waitForTimeout(3000);await page.screenshot({path:directory+'/fishing-top.png'});
  const report=await page.evaluate(()=>{const r=coastalPierReview,g=r.scene.getObjectByName('coastal-golfbrekers');r.pause();const gl=r.renderer.getContext();
    const samples=[];for(let cycle=0;cycle<6;cycle++)for(const visible of cycle%2?[true,false]:[false,true]){g.visible=visible;for(let n=0;n<8;n++)r.renderer.render(r.scene,r.camera);gl.finish();const start=performance.now();for(let n=0;n<30;n++)r.renderer.render(r.scene,r.camera);gl.finish();samples.push({visible,renderMs:(performance.now()-start)/30,calls:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles});}
    g.visible=true;r.renderer.render(r.scene,r.camera);return {groyneCount:g.children.length,samples,gl:gl.getError(),measurement:'Static render-only, paired visible/hidden groynes, GPU synchronized; excludes simulation and terrain streaming.'};});
  assert.equal(report.groyneCount,15);assert.equal(report.gl,0);assert.deepEqual(errors,[]);report.errors=errors;
  await writeFile(directory+'/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
