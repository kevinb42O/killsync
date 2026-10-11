import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',dir='artifacts/soaring';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),report={errors:[],consoleErrors:[],captures:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  await page.goto(origin+'/tools/friends-soaring-review.html');await page.waitForFunction(()=>window.soaringReview?.frames>100,{},{timeout:90000});
  await page.evaluate(()=>{const gl=window.soaringReview.renderer.getContext();while(gl.getError()!==gl.NO_ERROR){}});
  for(const view of ['forward','up','crew','volcano']){
    await page.evaluate(v=>window.soaringReview.setView(v),view);await page.waitForTimeout(2500);await page.screenshot({path:`${dir}/${view}.png`});
    const state=await page.evaluate(()=>{const r=window.soaringReview,g=r.scene.getObjectByName('friends-soaring');return {gl:r.renderer.getContext().getError(),rigs:g.children.filter(c=>c.name.includes('paraglider')).length,lines:g.children.filter(c=>c.name.includes('paraglider')).every(c=>c.getObjectByName('paraglider-suspension-lines').visible),finiteCamera:r.camera.position.toArray().every(Number.isFinite)};});
    if(state.gl!==0)console.log(JSON.stringify(report.consoleErrors));assert.equal(state.gl,0);assert.equal(state.rigs,3);assert.equal(state.lines,true);assert.equal(state.finiteCamera,true);report.captures.push({view,...state});
  }
  await page.evaluate(()=>window.soaringReview.setView('launch'));await page.waitForFunction(()=>window.soaringReview.sim.createSnapshot().players[0].friendsSoaring?.phase==='ready',{},{timeout:12000});
  await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.soaringReview.sim.createSnapshot().players[0].friendsSoaring?.phase==='flying',{},{timeout:12000});await page.keyboard.up('KeyW');
  report.launch=await page.evaluate(()=>window.soaringReview.sim.createSnapshot().players[0].friendsSoaring);assert.equal(report.launch.phase,'flying');await page.screenshot({path:`${dir}/launched.png`});
  assert.deepEqual(report.errors,[]);await writeFile(`${dir}/browser-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
