import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',directory='artifacts/friends-telescopic-crane';await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const report={checks:[],errors:[]};const page=await browser.newPage({viewport:{width:1100,height:740}});page.setDefaultTimeout(60000);
page.on('pageerror',e=>report.errors.push(e.message));
await page.addInitScript(()=>{
 localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:.7,shadows:false}));localStorage.setItem('killsync.friends.menu.pause','true');
 let locked=null;Object.defineProperty(document,'pointerLockElement',{get:()=>locked});HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();};document.exitPointerLock=()=>{locked=null;document.dispatchEvent(new Event('pointerlockchange'));};
});
await page.route('**/@vite/client',r=>r.fulfill({contentType:'application/javascript',body:'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s);}s.textContent=content;}export function removeStyle(id){document.getElementById(id)?.remove();}'}));
try{
 await page.goto(origin+'/?mode=friends',{waitUntil:'domcontentloaded'});await page.getByLabel('Your name',{exact:true}).fill('Crane review');await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});
 await page.locator('.coop-arena').waitFor({state:'attached'});await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'),undefined,{timeout:120000});
 await page.evaluate(async()=>{
  const element=document.querySelector('.coop-arena'),key=Object.keys(element).find(k=>k.startsWith('__reactFiber'));let fiber=element[key],simulation,bridge;
  while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;if(value?.createSnapshot&&value?.setInput)simulation=value;if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;hook=hook.next;}fiber=fiber.return;}
  if(!simulation||!bridge)throw new Error('Arena refs unavailable');window.craneReview={simulation,bridge};
  const f=simulation.friendsFrontier;f.terrain.addGrade([8000,8000,0,640]);f.testing=true;
  for(const t of f.treesNear(8000,8000))f.harvested.add(t.id);
  // Use a flat, explicitly authored cargo staging surface for the UI fixture.
  for(let x=248;x<=253;x++)for(let y=248;y<=252;y++){for(let z=-1;z<=52;z++)f.terrain.set(x,y,z,z===-1?2:0);}
  const ground=Math.max(...[7800,7900,8024].flatMap(x=>[7920,8000,8080].map(y=>f.terrain.floor(x,y,5900,0)??0))),height=Math.ceil(ground/32)*32+400;
  const player=[...simulation.players.values()][0];Object.assign(player,{x:7840,y:8088,z:height,verticalVelocity:0});
  simulation.friendsBuilding.pieces=[{id:400,shape:'landing_pad',finish:'stone',author:'Review',revision:1,x:7840,y:8000,z:height-8,rotation:0}];simulation.friendsBuilding.revision++;simulation.friendsBuilding.nextId=401;
  Object.assign(simulation.friends.hauling.getCargo()[0],{x:8024,y:8000,z:Math.max(...[-36,0,36].flatMap(x=>[-28,0,28].map(y=>f.terrain.floor(8024+x,8000+y,5900,0)??0))),vx:0,vy:0,vz:0});
  const built=simulation.friendsBuild(player.id,{requestId:1,action:'place',shape:'crane',finish:'teal',pose:{x:7904,y:8000,z:height,rotation:0}});
  if(!built.ok)throw new Error(built.message);craneReview.pieceId=simulation.friendsBuilding.getPieces().find(p=>p.shape==='crane').id;
  bridge.setFriendsEnvironment({hour:12,speed:0});bridge.renderer.yaw=0;bridge.renderer.pitch=-.14;
 });
 console.log('Built crane');
 await page.waitForFunction(()=>document.body.innerText.includes('Freight crane controls'));console.log('Prompt visible');report.checks.push('crane builds on a high player platform through host validation');
 await page.keyboard.press('b');await page.locator('.build-system').waitFor();
 if(await page.getByRole('button',{name:'Close construction library',exact:true}).count())await page.getByRole('button',{name:'Close construction library',exact:true}).click();
 await page.getByRole('button',{name:'Open construction library',exact:true}).click();await page.getByLabel('Search construction pieces',{exact:true}).fill('crane');
 await page.getByRole('button',{name:'Freight crane',exact:false}).first().click();await page.screenshot({path:directory+'/building-menu.png'});console.log('Library verified');report.checks.push('crane is searchable and selectable in the production building menu');
 await page.getByRole('button',{name:'Close construction library',exact:true}).click();await page.keyboard.press('b');await page.keyboard.press('f');
 await page.getByRole('dialog',{name:'Freight crane',exact:true}).waitFor();console.log('Crane menu open');assert.equal(await page.evaluate(()=>document.pointerLockElement),null);


 const view=page.locator('.friends-crane-live-view');
 const cameraOptions=()=>page.evaluate(()=>({...craneReview.bridge.craneControlView.options}));
 const originalCrane=await page.evaluate(()=>{const c=craneReview.simulation.friends.hauling.snapshot().cranes[0];return {angle:c.angle,mastExtension:c.mastExtension,boomExtension:c.boomExtension};});
 const rect=await view.boundingBox(),cx=rect.x+rect.width*.45,cy=rect.y+rect.height*.45;
 const dragCamera=async(dx,dy)=>{await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+dx,cy+dy,{steps:8});await page.mouse.up();return cameraOptions();};
 const defaultCamera=await cameraOptions(),rightCamera=await dragCamera(70,0);assert(rightCamera.orbit<defaultCamera.orbit);
 const leftCamera=await dragCamera(-70,0);assert(Math.abs(leftCamera.orbit-defaultCamera.orbit)<.01);
 const upCamera=await dragCamera(0,-50);assert(upCamera.elevation>leftCamera.elevation);
 const downCamera=await dragCamera(0,50);assert(Math.abs(downCamera.elevation-defaultCamera.elevation)<.01);
 assert.deepEqual(await page.evaluate(()=>{const c=craneReview.simulation.friends.hauling.snapshot().cranes[0];return {angle:c.angle,mastExtension:c.mastExtension,boomExtension:c.boomExtension};}),originalCrane);
 await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(rect.x+rect.width+70,cy,{steps:8});await page.mouse.up();
 assert.equal(await view.getAttribute('data-dragging'),'false');const releasedCamera=await cameraOptions();await page.mouse.move(cx,cy+40);assert.deepEqual(await cameraOptions(),releasedCamera);
 await page.mouse.move(cx,cy);await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await view.getAttribute('data-dragging'),'false');await page.mouse.up();
 await page.getByRole('button',{name:'Reset camera',exact:true}).click();assert.deepEqual(await cameraOptions(),defaultCamera);
 const buttonCamera=await cameraOptions();await page.getByRole('button',{name:'Orbit camera left',exact:true}).click();assert((await cameraOptions()).orbit>buttonCamera.orbit);assert.equal(await view.getAttribute('data-dragging'),'false');await page.getByRole('button',{name:'Reset camera',exact:true}).click();
 report.checks.push('camera drag orbits left/right and tilts up/down; capture outside, mouse release, blur, reset, and toolbar controls work without moving the crane');
 await page.getByRole('button',{name:'Connect load',exact:true}).click();await page.waitForFunction(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].cargoId==='lantern-core');
 // Lift vertically out of the carved pickup bay before moving over surrounding terrain.
 await page.getByRole('button',{name:'Extend up',exact:true}).hover();await page.mouse.down();await page.waitForFunction(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].mastExtension>900);await page.mouse.up();
 const initial=await page.evaluate(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].mastExtension);
 await page.getByRole('button',{name:'Extend up',exact:true}).focus();await page.keyboard.down('Space');
 await page.getByRole('button',{name:'Extend arm',exact:true}).hover();await page.mouse.down();
 await page.waitForFunction(n=>{const c=craneReview.simulation.friends.hauling.snapshot().cranes[0];return c.mastExtension>n+90&&c.boomExtension>90;},initial);
 await page.mouse.move(30,30);await page.mouse.up();await page.waitForFunction(()=>{const c=craneReview.simulation.friends.hauling.snapshot().cranes[0];return c.boomMode==='hold'&&c.mastMode==='up';});await page.keyboard.up('Space');
 await page.waitForFunction(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].mastMode==='hold');
 report.checks.push('mast and arm extend together with a connected load; releasing outside a button brakes only that axis');
 const beforeTurn=await page.evaluate(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].angle);
 await page.getByRole('button',{name:'Turn left',exact:true}).hover();await page.mouse.down();await page.waitForFunction(a=>craneReview.simulation.friends.hauling.snapshot().cranes[0].angle>a+.12,beforeTurn);await page.mouse.up();
 const held=await page.evaluate(async()=>{const c=craneReview.simulation.friends.hauling.snapshot().cranes[0],cargo=craneReview.simulation.friends.hauling.getCargo()[0],{craneOutlet,craneCargoAnchor}=await import('/src/game/multiplayer/FriendsCrane.ts');return {c,outlet:craneOutlet(c),anchor:craneCargoAnchor(cargo,c)};});assert(Math.hypot(held.outlet.x-held.anchor.x,held.outlet.y-held.anchor.y)>.1);assert(Math.abs(Math.hypot(held.outlet.x-held.anchor.x,held.outlet.y-held.anchor.y,held.outlet.z-held.anchor.z)-held.c.length)<2);report.checks.push('menu turns the prefab smoothly and the actual connected load swings on its cable');
 await page.getByRole('button',{name:'Natural swing',exact:false}).click();await page.waitForFunction(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].antiSway);report.checks.push('anti-sway switches through the actual menu');
 await page.getByRole('button',{name:'Standard speed',exact:false}).click();await page.waitForFunction(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].precision);report.checks.push('precision speed switches through the actual menu');
 await page.getByRole('button',{name:'View whole crane',exact:true}).click();await page.locator('.friends-crane-controls').evaluate(e=>e.scrollTop=0);await page.waitForTimeout(400);await page.screenshot({path:directory+'/controls.png'});
 // Drive to the maximum through the authoritative motor and the real world collision environment.
 await page.evaluate(()=>{
  const s=craneReview.simulation,h=s.friends.hauling,player=[...s.players.values()][0],id=craneReview.pieceId,env=s.haulingEnvironment();
  h.controlCrane(player,id,'crane_release',env,true,s.elapsedMs);h.controlCrane(player,id,'crane_precision',env,true,s.elapsedMs);
  h.controlCrane(player,id,'crane_mast_up',env,true,s.elapsedMs);
  for(let t=0;t<16000;t+=50){h.controlCrane(player,id,'crane_heartbeat',env,true,s.elapsedMs+t);h.update(50,s.elapsedMs+t,[player],new Map(),env);}
  h.controlCrane(player,id,'crane_extend',env,true,s.elapsedMs+16000);
  for(let t=16000;t<39000;t+=50){h.controlCrane(player,id,'crane_heartbeat',env,true,s.elapsedMs+t);h.update(50,s.elapsedMs+t,[player],new Map(),env);}
  h.controlCrane(player,id,'crane_stop_all',env,true,s.elapsedMs+39000);
  const c=h.getCraneStates()[0];s.friendsBuilding.parkCrane(id,c.angle,c.mastExtension,c.boomExtension);
 });
 console.log('Giant host motor sweep completed');
 const giant=await page.evaluate(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0]);assert.equal(giant.mastExtension,2912,JSON.stringify(giant));assert.equal(giant.boomExtension,2888,JSON.stringify(giant));report.giant=giant;report.checks.push('real host motors reach a 256m mast and 256m arm with world collision checks enabled');
 await page.waitForTimeout(700);await page.locator('.friends-crane-controls').evaluate(e=>e.scrollTop=0);await page.screenshot({path:directory+'/giant-crane.png'});
 await page.getByRole('button',{name:'Turn right',exact:true}).hover();await page.mouse.down();await page.waitForFunction(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].armMode==='right');await page.keyboard.press('Escape');await page.mouse.up();await page.waitForFunction(()=>{const c=craneReview.simulation.friends.hauling.snapshot().cranes[0];return c.armMode==='hold'&&c.mastMode==='hold'&&c.boomMode==='hold';});report.checks.push('Escape brakes all axes on the fully extended crane');
 await page.keyboard.press('f');await page.getByRole('dialog',{name:'Freight crane',exact:true}).waitFor();await page.setViewportSize({width:390,height:844});await page.locator('.friends-crane-controls').evaluate(e=>e.scrollTop=0);await page.screenshot({path:directory+'/mobile-controls.png'});

 const mobileView=await view.boundingBox(),cameraTouch=await page.context().newCDPSession(page),touchCameraBefore=await cameraOptions();
 const tx=mobileView.x+mobileView.width*.6,ty=mobileView.y+mobileView.height*.4;
 await cameraTouch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty,id:2}]});
 await cameraTouch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx-35,y:ty-25,id:2}]});
 await cameraTouch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 const touchCameraAfter=await cameraOptions();assert(touchCameraAfter.orbit>touchCameraBefore.orbit);assert(touchCameraAfter.elevation>touchCameraBefore.elevation);assert.equal(await view.getAttribute('data-dragging'),'false');
 await page.getByRole('button',{name:'Reset camera',exact:true}).click();report.checks.push('touch drag orbits and tilts the camera, and touch cancellation releases camera capture');
 const button=page.getByRole('button',{name:'Turn right',exact:true});await button.scrollIntoViewIfNeeded();const bounds=await button.boundingBox(),touch=await page.context().newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,id:1}]});await page.waitForFunction(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].armMode==='right');await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForFunction(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].armMode==='hold');report.checks.push('touch holds rotate the crane; touch cancellation applies the brake');
 const panel=await page.getByRole('dialog',{name:'Freight crane',exact:true}).boundingBox();assert(panel.x>=0&&panel.x+panel.width<=390);assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}catch(e){report.failure=String(e);report.text=await page.locator('body').innerText().catch(()=>null);report.state=await page.evaluate(()=>craneReview.simulation.friends.hauling.snapshot().cranes).catch(()=>null);await page.screenshot({path:directory+'/failure.png'}).catch(()=>{});throw e;}finally{await writeFile(directory+'/checks.json',JSON.stringify(report,null,2));await browser.close();}
