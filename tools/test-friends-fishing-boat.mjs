import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory='artifacts/fishing-boat';
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),report={errors:[],captures:[]};
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin+'/tools/friends-coastal-pier-review.html');
  await page.waitForFunction(()=>window.coastalPierReview?.scene.getObjectByName('west-beach-fishing-boat')?.userData.modelReady);
  await page.locator('aside').evaluate(e=>e.style.display='none');
  for(const view of ['boat','dock','mooring']) {
    await page.evaluate(v=>window.coastalPierReview.setView(v),view);await page.waitForTimeout(2500);
    await page.screenshot({path:`${directory}/${view}.png`});
    const capture=await page.evaluate(()=>{
      const r=window.coastalPierReview,b=r.scene.getObjectByName('west-beach-fishing-boat');let meshes=0,triangles=0;
      b.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
      return {meshes,triangles,ready:b.userData.modelReady,gl:r.renderer.getContext().getError(),heave:b.position.y};
    });
    assert.equal(capture.ready,true);assert.equal(capture.gl,0);assert(capture.meshes<=24);assert(capture.triangles<50000);
    report.captures.push({view,...capture});
  }
  assert.notEqual(report.captures[0].heave,report.captures[1].heave);
  await page.evaluate(()=>window.coastalPierReview.sailBoat());await page.waitForTimeout(600);
  await page.screenshot({path:`${directory}/sailing.png`});
  const sailing=await page.evaluate(()=>{const r=window.coastalPierReview,state=r.sim.createSnapshot(),v=state.friends.vehicles.find(v=>v.kind==='fishingBoat'),mesh=r.scene.getObjectByName(v.id);return {pilotId:v.pilotId,moored:v.moored,x:v.x,y:v.y,visualX:mesh.position.x,visualY:mesh.position.z,ropesVisible:mesh.userData.boatMotion.ropes.some(r=>r.visible)};});
  assert.equal(sailing.pilotId,'review');assert.equal(sailing.moored,false);assert.equal(sailing.ropesVisible,false);assert.equal(sailing.x,sailing.visualX);assert.equal(sailing.y,sailing.visualY);
  await page.getByRole('button',{name:'Third-person sailing view O'}).click();await page.waitForTimeout(400);
  assert.equal(await page.getByRole('button',{name:'First-person sailing view O'}).getAttribute('aria-pressed'),'true');
  await page.screenshot({path:`${directory}/third-person.png`});
  await page.getByRole('button',{name:'First-person sailing view O'}).click();await page.waitForTimeout(200);
  const wheelLeft=await page.evaluate(()=>window.coastalPierReview.scene.getObjectByName('fishing-boat-steering-wheel').rotation.z);
  await page.evaluate(()=>window.coastalPierReview.steerBoat(9));await page.waitForTimeout(300);
  const wheelRight=await page.evaluate(()=>window.coastalPierReview.scene.getObjectByName('fishing-boat-steering-wheel').rotation.z);
  assert(wheelLeft>1);assert(wheelRight<-.4);
  await page.screenshot({path:`${directory}/helm-right.png`});
  const glass=await page.evaluate(()=>{const b=window.coastalPierReview.scene.getObjectByName('west-beach-fishing-boat'),materials=[];b.traverse(o=>{if(o.visible&&o.userData.boatGlass)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.push({opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite});});return materials;});
  assert.equal(glass.length,0,'window panes must not render');
  await page.getByRole('button',{name:'Third-person sailing view O'}).click();
  const release=await page.evaluate(()=>window.coastalPierReview.stopBoat());for(const axis of ['x','y','z'])assert(Math.abs(release.before[axis]-release.after[axis])<.01);
  await page.waitForTimeout(100);assert.equal(await page.getByRole('button',{name:/sailing view O/}).count(),0);
  Object.assign(report,{wheelLeft,wheelRight,glass,release});await page.waitForTimeout(600);
  await page.screenshot({path:`${directory}/fishing-deck.png`});
  await page.evaluate(()=>window.coastalPierReview.castFromBoat());await page.waitForTimeout(600);
  await page.screenshot({path:`${directory}/fishing-deck.png`});
  const fishing=await page.evaluate(()=>{const state=window.coastalPierReview.sim.createSnapshot();return {pilotId:state.friends.vehicles.find(v=>v.kind==='fishingBoat').pilotId,swimming:state.players[0].motion.swimming,seated:Boolean(state.players[0].friendsSeat),casts:state.friends.fishing.casts.length};});
  assert.equal(fishing.pilotId,undefined);assert.equal(fishing.swimming,false);assert.equal(fishing.seated,false);assert.equal(fishing.casts,1);
  Object.assign(report,{sailing,fishing});
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await writeFile(`${directory}/validation.json`,JSON.stringify(report,null,2));await browser.close();}
