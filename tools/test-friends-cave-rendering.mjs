import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}
catch{playwright=require(process.env.PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000';
const directory=process.env.FRIENDS_TEST_ARTIFACT_DIR||'artifacts/cave-entrance-fix';
await mkdir(directory,{recursive:true});
const report={origin,checks:[],errors:[],views:[]};
const browser=await playwright.chromium.launch({headless:true,args:[`--use-angle=${process.env.FRIENDS_TEST_ANGLE||'metal'}`]});
const page=await browser.newPage({viewport:{width:1280,height:960}});
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'||/GL_INVALID_|GL_OUT_OF_MEMORY/.test(m.text()))report.errors.push(m.text());});
// Expose the existing render fixture only in this test, without adding a
// debugging API or modifying the player's saved island.
await page.route('**/tools/frontier-review.ts*',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:await response.text()+'\nwindow.__caveReview={scene,world,renderer,camera,controls};'});
});
const check=name=>{report.checks.push(name);console.log('PASS',name);};
async function settle(){
  await page.waitForFunction(()=>{
    if(!window.__caveReview)return false;
    const {world,camera}=window.__caveReview;
    const position=`${Math.floor(camera.position.x/256)},${Math.floor(camera.position.z/256)}:`;
    return world.volumePlanStamp.startsWith(position)&&world.desired.size>0&&[...world.desired].every(key=>world.chunks.has(key)&&!world.dirty.has(key));
  },undefined,{timeout:60000});
  await page.waitForTimeout(300);
}
async function capture(name){
  const view=await page.evaluate(()=>{
    const {renderer,camera,world}=window.__caveReview;
    return {camera:camera.position.toArray(),glError:renderer.getContext().getError(),volumes:world.terrainStats.volumeActive};
  });
  assert.equal(view.glError,0,`${name}: invalid WebGL draw`);
  await page.locator('canvas').first().screenshot({path:`${directory}/${name}.png`});
  report.views.push({name,...view});
}
try{
  await page.goto(`${origin}/tools/frontier-review.html?scene=caveEntrance`);
  await settle();await page.locator('#hide').click();await capture('outside');
  const rays=await page.evaluate(async()=>{
    const {world,camera}=window.__caveReview;
    const THREE=await import('/node_modules/.vite/deps/three.js');
    const ray=new THREE.Raycaster(),results=[];
    // These pixels used to see sky and floating crystals instead of the
    // vestibule floor, although the simulation already had solid terrain.
    for(const [x,y]of [[650,250],[700,300],[800,330],[600,380]]){
      ray.setFromCamera(new THREE.Vector2(x/1280*2-1,1-y/960*2),camera);
      const hit=ray.intersectObjects([...world.chunks.values()].filter(m=>m.visible))[0];
      const solid=world.terrain.raycast({x:camera.position.x,y:camera.position.z,z:camera.position.y,dx:ray.ray.direction.x,dy:ray.ray.direction.z,dz:ray.ray.direction.y},2600);
      results.push({pixel:[x,y],meshDistance:hit?.distance,solidDistance:solid?.distance});
    }
    return results;
  });
  report.rays=rays;
  for(const ray of rays){assert(ray.meshDistance!==undefined&&ray.solidDistance!==undefined,`missing cave surface at ${ray.pixel}`);assert(Math.abs(ray.meshDistance-ray.solidDistance)<.1,`cave mesh differs from collision terrain at ${ray.pixel}`);}
  check('the exterior view has real cave floors and walls at all formerly missing surfaces');
  await page.evaluate(()=>{
    const {world,camera,controls}=window.__caveReview;
    camera.position.set(6384,world.terrain.surfaceHeight(6384,5352)+62,5352);
    controls.target.set(6480,240,5080);controls.update();
  });
  await settle();await capture('rim');
  check('the closer exterior rim renders without WebGL errors');
  await page.locator('#cathedral').evaluate(button=>button.click());
  await page.locator('#flashlight').evaluate(button=>button.click());
  await settle();await capture('cathedral');
  check('the deeper cave still renders with the held flashlight');
  await page.locator('#tunnelSky').evaluate(button=>button.click());
  await settle();await capture('sky-from-shaft');
  assert(await page.evaluate(()=>window.__caveReview.world.atmosphere.sky.visible));
  check('looking back up through the shaft keeps the exterior sky visible');
  assert.deepEqual(report.errors,[]);
  check('no runtime, shader, or WebGL errors');
}catch(error){report.failure=String(error);report.state=await page.evaluate(()=>({hookPresent:Boolean(window.__caveReview),stats:document.querySelector('#stats')?.textContent}));throw error;}
finally{await writeFile(`${directory}/browser.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}
