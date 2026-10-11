import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory=process.env.PIER_ARTIFACT_DIR||'artifacts/coastal-pier';
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),report={errors:[],captures:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('[vite] failed to connect to websocket'))report.errors.push(m.text());});
  await page.goto(origin+'/tools/friends-coastal-pier-review.html');
  await page.waitForFunction(()=>window.coastalPierReview?.scene.getObjectByName('west-beach-timber-dock')?.userData.modelReady);
  await page.locator('aside').evaluate(el=>{el.style.display='none';});
  await page.waitForFunction(()=>coastalPierReview.scene.getObjectByName('belvedere-seaside-pier')?.userData.chairsReady);
  await page.waitForTimeout(5000);
  for(const view of ['overview','deck','landing','pavilion','inside','seated','supports','dock','dock-entry','dock-walking']){
    await page.evaluate(v=>coastalPierReview.setView(v),view);await page.waitForTimeout(2000);
    await page.waitForFunction(()=>window.coastalPierReview?.scene.getObjectByName('west-beach-timber-dock')?.userData.modelReady);
    await page.locator('aside').evaluate(el=>{el.style.display='none';});
    await page.screenshot({path:`${directory}/${view}.png`});
    const capture=await page.evaluate(()=>{const r=coastalPierReview,pier=r.scene.getObjectByName('belvedere-seaside-pier'),dock=r.scene.getObjectByName('west-beach-timber-dock');let meshes=0,triangles=0,chairCount=0;pier.traverse(o=>{if(o.isInstancedMesh&&o.parent.name==='pier-chairs-detailed')chairCount+=o.userData.chairCapacity??o.count;if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return {ready:pier.userData.modelReady,chairsReady:pier.userData.chairsReady,chairCount,supports:pier.userData.supports.length,dockReady:dock.userData.modelReady,meshes,triangles,gl:r.renderer.getContext().getError(),renderedTriangles:r.renderer.info.render.triangles,calls:r.renderer.info.render.calls};});
    assert.equal(capture.ready,true);assert.equal(capture.chairsReady,true);assert.equal(capture.chairCount,22);assert.equal(capture.dockReady,true);assert(capture.meshes<=40);assert(capture.triangles>10000);assert.equal(capture.gl,0);report.captures.push({view,...capture});
  }
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await writeFile(`${directory}/validation.json`,JSON.stringify(report,null,2));await browser.close();}
