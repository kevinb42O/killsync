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
const directory=process.env.FRIENDS_TEST_ARTIFACT_DIR||'artifacts/dungeon-expedition';
await mkdir(directory,{recursive:true});
const report={origin,checks:[],errors:[],views:[]};
const browser=await playwright.chromium.launch({headless:true,args:[`--use-angle=${process.env.FRIENDS_TEST_ANGLE||'metal'}`]});
const page=await browser.newPage({viewport:{width:1280,height:960}});
// Keep the captured fixture stable while other work changes the dev server.
await page.routeWebSocket('**/*',socket=>socket.close());
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.text().startsWith('[vite] failed to connect to websocket.'))return;if(m.type()==='error'||/GL_INVALID_|GL_OUT_OF_MEMORY/.test(m.text()))report.errors.push(m.text());});
// Expose the existing render fixture only in this test, without adding a
// debugging API or modifying the player's saved island.
await page.route('**/tools/frontier-review.ts*',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:await response.text()+'\nwindow.__caveReview={scene,world,renderer,camera,controls,snapshot};'});
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
 await page.goto(`${origin}/tools/frontier-review.html?scene=cathedral`,{waitUntil:'domcontentloaded'});
 await settle();await page.locator('#hide').click();await page.locator('#flashlight').evaluate(button=>button.click());
 for(const [id,name]of [['descent-mine','upper-mine'],['descent-crystal','crystal-cavern'],['descent-forge','heart-forge'],['descent-vault','bedrock-vault'],['descent-bedrock','last-stone']]){
  await page.evaluate(async id=>{
   const {CAVE_DESCENT_ROOMS,CAVE_BEDROCK_ROOM}=await import('/src/game/world/FriendsCaveDescent.ts');
   const r=[...CAVE_DESCENT_ROOMS,CAVE_BEDROCK_ROOM].find(r=>r.id===id),{camera,controls}=window.__caveReview;
   camera.position.set(r.x-180,r.floor+62,r.y-144);controls.target.set(r.x+60,r.floor+32,r.y+200);controls.update();
  },id);
  await settle();await capture(name);check(`${name} streams and renders at player eye height`);
  if(id==='descent-forge'){
   await page.evaluate(()=>{const r=window.__caveReview;r.editBefore=['30,14','31,14'].map(key=>r.world.chunks.get(key));if(r.editBefore.some(m=>!m))throw new Error('Missing boundary review chunks');r.snapshot.terrain.edits.push([496,232,-40,0]);r.snapshot.terrain.revision++;});
   await page.waitForFunction(()=>{const r=window.__caveReview;return r.world.terrain.material(496,232,-40)===0&&['30,14','31,14'].every((key,i)=>r.world.chunks.get(key)!==r.editBefore[i]&&!r.world.dirty.has(key));},undefined,{timeout:60000});
   await settle();
   await page.evaluate(()=>{const r=window.__caveReview;r.editBefore=['30,14','31,14'].map(key=>r.world.chunks.get(key));r.snapshot.terrain.edits=r.snapshot.terrain.edits.filter(e=>!(e[0]===496&&e[1]===232&&e[2]===-40));r.snapshot.terrain.revision++;});
   await page.waitForFunction(()=>{const r=window.__caveReview;return r.world.terrain.material(496,232,-40)!==0&&['30,14','31,14'].every((key,i)=>r.world.chunks.get(key)!==r.editBefore[i]&&!r.world.dirty.has(key));},undefined,{timeout:60000});
   await settle();check('boundary excavation remeshes both neighbors and restores the sealed layer');
  }
 }
 const counts=await page.evaluate(()=>{const group=window.__caveReview.world.group;return {stairs:group.getObjectByName('eight-unit-dungeon-stairs').count,lava:group.getObjectByName('lantern-descent-expedition').children.filter(c=>c.name.startsWith('dungeon-lava-')).length,chests:group.getObjectByName('cave-treasures').children.length};});
 assert(counts.stairs>500);assert.equal(counts.lava,4);assert.equal(counts.chests,14);report.content=counts;
 await page.locator('#openTreasures').evaluate(button=>button.click());
 await page.evaluate(()=>{const {camera,controls}=window.__caveReview;camera.position.set(6410,766,5630);controls.target.set(6480,744,5552);controls.update();});
 await settle();await capture('home-relic');
 assert(await page.evaluate(()=>window.__caveReview.world.group.getObjectByName('sunline-expedition-home-relic').visible));
 check('the recovered relic appears at the campfire');
 assert.deepEqual(report.errors,[]);check('no runtime, shader or WebGL errors');
}catch(error){report.failure=String(error);report.state=await page.evaluate(()=>({hookPresent:Boolean(window.__caveReview),stats:document.querySelector('#stats')?.textContent}));throw error;}
finally{await writeFile(`${directory}/browser.json`,JSON.stringify(report,null,2)+'\n');await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();}
