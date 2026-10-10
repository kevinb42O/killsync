import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',directory='artifacts/friends-aircraft-landing';await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const report={checks:[],errors:[]};const page=await browser.newPage({viewport:{width:1100,height:740},hasTouch:true});page.setDefaultTimeout(60000);
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.addInitScript(()=>{
 localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:.7,shadows:false}));localStorage.setItem('killsync.friends.menu.pause','true');
 let locked=null;Object.defineProperty(document,'pointerLockElement',{get:()=>locked});HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();};document.exitPointerLock=()=>{locked=null;document.dispatchEvent(new Event('pointerlockchange'));};
});
await page.route('**/@vite/client',r=>r.fulfill({contentType:'application/javascript',body:'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s);}s.textContent=content;}export function removeStyle(id){document.getElementById(id)?.remove();}'}));
try{
 await page.goto(origin+'/?mode=friends',{waitUntil:'domcontentloaded'});await page.getByLabel('Your name',{exact:true}).fill('Landing review');await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});
 await page.locator('.coop-arena').waitFor({state:'attached'});await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'),undefined,{timeout:120000});

 await page.evaluate(()=>{
  const element=document.querySelector('.coop-arena'),key=Object.keys(element).find(k=>k.startsWith('__reactFiber'));let fiber=element[key],simulation,bridge;
  while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;if(value?.createSnapshot&&value?.setInput)simulation=value;if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;hook=hook.next;}fiber=fiber.return;}
  if(!simulation||!bridge)throw new Error('Arena refs unavailable');window.airReview={simulation,bridge};
  const f=simulation.friendsFrontier;f.terrain.addGrade([8000,8000,0,512]);f.testing=true;for(const t of f.treesNear(8000,8000))f.harvested.add(t.id);
  for(let x=245;x<=255;x++)for(let y=245;y<=255;y++)for(let z=-1;z<=75;z++)f.terrain.set(x,y,z,z===-1?2:0);
  const p=[...simulation.players.values()][0],air=simulation.friends.aircraft;simulation.friends.hauling.resetAircraftWinch();
  f.terrain.set(254,250,0,2);
  Object.assign(air,{x:8000,y:8000,z:260,angle:0,pilotId:undefined});Object.assign(p,{x:8100,y:8000,z:260,verticalVelocity:0});
  Object.assign(simulation.friends.hauling.getCargo()[0],{x:8000,y:8000,z:0,vx:0,vy:0,vz:0,angle:0});bridge.setFriendsEnvironment({hour:12,speed:0});bridge.renderer.yaw=-Math.PI/2;bridge.renderer.pitch=-.3;
 });
 await page.keyboard.press('f');await page.waitForFunction(()=>airReview.simulation.friends.vehicles().find(v=>v.kind==='aircraft').pilotId);await page.getByRole('region',{name:'Helicopter winch'}).waitFor();console.log('Pilot HUD ready');
 await page.keyboard.down('Control');
 await page.waitForFunction(()=>airReview.simulation.friends.aircraft.z<85);
 await page.screenshot({path:directory+'/approach.png'});
 await page.waitForFunction(()=>airReview.simulation.friends.aircraft.z===46);
 await page.waitForTimeout(500);
 const state=await page.evaluate(()=>{const a=airReview.simulation.friends.aircraft,d=airReview.bridge.friendsVehicleVisuals.group.getObjectByName('helicopter-rotor-dust');return {x:a.x,y:a.y,z:a.z,groundZ:a.groundZ,dustVisible:d.visible,particles:d.geometry.getAttribute('position').count};});
 assert.equal(state.x,8000);assert.equal(state.y,8000);assert.equal(state.z,46);assert.equal(state.dustVisible,true);assert.equal(state.particles,96);
 await page.screenshot({path:directory+'/touchdown.png'});
 await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>airReview.simulation.friends.aircraft.z),46);
 await page.keyboard.up('Control');await page.keyboard.down('Space');await page.waitForFunction(()=>airReview.simulation.friends.aircraft.z>146);await page.keyboard.up('Space');
 report.checks.push('uneven terrain footprint touchdown remains stationary, emits bounded dust, and takes off cleanly');report.state=state;
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}catch(e){report.failure=String(e);await page.screenshot({path:directory+'/failure.png'}).catch(()=>{});throw e;}finally{await writeFile(directory+'/checks.json',JSON.stringify(report,null,2));await browser.close();}
