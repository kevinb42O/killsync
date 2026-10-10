import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',directory='artifacts/friends-crane';await mkdir(directory,{recursive:true});
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
  bridge.renderer.yaw=0;bridge.renderer.pitch=-.14;
 });
 console.log('Built crane');
 await page.waitForFunction(()=>document.body.innerText.includes('Freight crane controls'));console.log('Prompt visible');report.checks.push('crane builds on a high player platform through host validation');
 await page.keyboard.press('b');await page.locator('.build-system').waitFor();
 if(await page.getByRole('button',{name:'Close construction library',exact:true}).count())await page.getByRole('button',{name:'Close construction library',exact:true}).click();
 await page.getByRole('button',{name:'Open construction library',exact:true}).click();await page.getByLabel('Search construction pieces',{exact:true}).fill('crane');
 await page.getByRole('button',{name:'Freight crane',exact:false}).first().click();await page.screenshot({path:directory+'/building-menu.png'});console.log('Library verified');report.checks.push('crane is searchable and selectable in the production building menu');
 await page.getByRole('button',{name:'Close construction library',exact:true}).click();await page.keyboard.press('b');await page.keyboard.press('f');
 await page.getByRole('dialog',{name:'Freight crane',exact:true}).waitFor();console.log('Crane menu open');assert.equal(await page.evaluate(()=>document.pointerLockElement),null);
 await page.getByRole('button',{name:'Connect load',exact:true}).click();await page.waitForFunction(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].cargoId==='lantern-core');
 const initial=await page.evaluate(()=>craneReview.simulation.friends.hauling.getCargo()[0].z);
 await page.getByRole('button',{name:/^Raise/}).hover();await page.mouse.down();await page.waitForFunction(initial=>craneReview.simulation.friends.hauling.getCargo()[0].z>initial+100,initial);await page.mouse.move(30,30);await page.mouse.up();await page.waitForFunction(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].mode==='hold');
 await page.getByRole('button',{name:/^Stop \/ hold/}).click();await page.waitForTimeout(1000);await page.screenshot({path:directory+'/controls.png'});
 const held=await page.evaluate(()=>({...craneReview.simulation.friends.hauling.getCargo()[0]}));assert(Math.abs(held.x-8024)<.001&&Math.abs(held.y-8000)<.001);report.checks.push('F opens the real menu, unlocks the pointer and connects / lifts / brakes solo');
 await page.getByRole('button',{name:/^Lower/}).hover();await page.mouse.down();await page.waitForFunction(z=>craneReview.simulation.friends.hauling.getCargo()[0].z<z-30,held.z);
 await page.keyboard.press('Escape');await page.mouse.up();await page.getByRole('dialog',{name:'Freight crane',exact:true}).waitFor({state:'hidden'});await page.waitForFunction(()=>craneReview.simulation.friends.hauling.snapshot().cranes[0].mode==='hold');report.checks.push('lowering works and Escape closes the menu and engages the brake');
 await page.keyboard.press('f');await page.getByRole('button',{name:'Release load',exact:true}).click();await page.waitForFunction(()=>!craneReview.simulation.friends.hauling.snapshot().cranes[0].cargoId);report.checks.push('the release button detaches the load');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:directory+'/mobile-controls.png'});const panel=await page.getByRole('dialog',{name:'Freight crane',exact:true}).boundingBox();assert(panel.x>=0&&panel.x+panel.width<=390);report.checks.push('controls fit a 390px mobile viewport');
 report.held=held;
 const review=await browser.newPage({viewport:{width:1100,height:820}});
 await review.route('**/__crane_model',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><div id="model"></div></body></html>'}));await review.goto(origin+'/__crane_model');
 report.rendering=await review.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js'),{FriendsBuildVisuals}=await import('/src/game/rendering/FriendsBuildVisuals.ts'),{FriendsHaulingVisuals}=await import('/src/game/rendering/FriendsHaulingVisuals.ts'),{FriendsSimulation}=await import('/src/game/multiplayer/FriendsSimulation.ts');
  const scene=new T.Scene(),viewmodel=new T.Scene(),renderer=new T.WebGLRenderer({antialias:true}),camera=new T.PerspectiveCamera(45,1100/820,1,2500);renderer.setSize(1100,820);renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;document.getElementById('model').append(renderer.domElement);scene.background=new T.Color('#9caeb0');scene.add(new T.HemisphereLight('#f4f4de','#3e524a',2.5));const sun=new T.DirectionalLight('#fff0cd',3);sun.position.set(-200,500,300);scene.add(sun);
  const builds=new FriendsBuildVisuals(scene);builds.update({revision:1,guestsCanBuild:true,pieces:[{id:1,x:0,y:0,z:220,rotation:0,shape:'crane',finish:'teal',revision:1,author:'Review'},{id:2,x:-64,y:0,z:212,rotation:0,shape:'landing_pad',finish:'teal',revision:1,author:'Review'},{id:3,x:-100,y:0,z:0,rotation:0,shape:'pillar',finish:'teal',revision:1,author:'Review'},{id:4,x:-100,y:0,z:84,rotation:0,shape:'pillar',finish:'teal',revision:1,author:'Review'},{id:5,x:-28,y:0,z:0,rotation:0,shape:'pillar',finish:'teal',revision:1,author:'Review'},{id:6,x:-28,y:0,z:84,rotation:0,shape:'pillar',finish:'teal',revision:1,author:'Review'}]});
  const pad=builds.group.getObjectByName('creation:landing_pad:teal:world');pad.scale.x=.7;
  const floor=new T.Mesh(new T.PlaneGeometry(1800,1800),new T.MeshStandardMaterial({color:'#819383',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-1;scene.add(floor);
  const snapshot=new FriendsSimulation([{id:'review',label:'Review',color:'#fff'}]).createSnapshot(),cargo=snapshot.friends.hauling.cargo[0];Object.assign(cargo,{x:120,y:0,z:18});snapshot.friends.hauling.cargo=[cargo];snapshot.friends.hauling.ropes=[];snapshot.friends.hauling.cranes=[{pieceId:1,x:0,y:0,z:220,rotation:0,length:288,mode:'hold',blocked:false,cargoId:cargo.id,anchorX:0,anchorY:0,anchorZ:48}];Object.assign(snapshot.players[0],{x:0,y:300,z:220});const hauling=new FriendsHaulingVisuals(scene,viewmodel);hauling.update(snapshot,'review',0,0,()=>({x:0,y:0,z:0}),false);
  camera.position.set(520,450,520);camera.lookAt(18,185,0);renderer.render(scene,camera);const memory=renderer.info.memory.geometries;for(let i=0;i<60;i++){hauling.update(snapshot,'review',0,0,()=>({x:0,y:0,z:0}),false);renderer.render(scene,camera);}window.craneModel={scene,renderer,camera,builds,hauling};return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,stableGeometry:memory===renderer.info.memory.geometries,glError:renderer.getContext().getError()};
 });await review.screenshot({path:directory+'/model.png'});assert(report.rendering.stableGeometry);assert.equal(report.rendering.glError,0);report.checks.push('production crane, rope and cargo render without GL errors or growing geometry buffers');
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}catch(e){report.failure=String(e);report.text=await page.locator('body').innerText().catch(()=>null);report.state=await page.evaluate(()=>{const r=window.craneReview;return r&&{p:[...r.simulation.players.values()][0],cargo:r.simulation.friends.hauling.getCargo(),cranes:r.simulation.friends.hauling.snapshot().cranes,pieces:r.simulation.friendsBuilding.getPieces()};}).catch(()=>null);await page.screenshot({path:directory+'/failure.png'}).catch(()=>{});throw e;}finally{await writeFile(directory+'/checks.json',JSON.stringify(report,null,2));await browser.close();}
