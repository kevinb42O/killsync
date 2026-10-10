import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',directory='artifacts/friends-aircraft-winch';await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const report={checks:[],errors:[]};const page=await browser.newPage({viewport:{width:1100,height:740},hasTouch:true});page.setDefaultTimeout(60000);
page.on('pageerror',e=>report.errors.push(e.message));
await page.addInitScript(()=>{
 localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:.7,shadows:false}));localStorage.setItem('killsync.friends.menu.pause','true');
 let locked=null;Object.defineProperty(document,'pointerLockElement',{get:()=>locked});HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();};document.exitPointerLock=()=>{locked=null;document.dispatchEvent(new Event('pointerlockchange'));};
});
await page.route('**/@vite/client',r=>r.fulfill({contentType:'application/javascript',body:'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s);}s.textContent=content;}export function removeStyle(id){document.getElementById(id)?.remove();}'}));
try{
 await page.goto(origin+'/?mode=friends',{waitUntil:'domcontentloaded'});await page.getByLabel('Your name',{exact:true}).fill('Winch review');await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});
 await page.locator('.coop-arena').waitFor({state:'attached'});await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'),undefined,{timeout:120000});

 await page.evaluate(()=>{
  const element=document.querySelector('.coop-arena'),key=Object.keys(element).find(k=>k.startsWith('__reactFiber'));let fiber=element[key],simulation,bridge;
  while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;if(value?.createSnapshot&&value?.setInput)simulation=value;if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;hook=hook.next;}fiber=fiber.return;}
  if(!simulation||!bridge)throw new Error('Arena refs unavailable');window.airReview={simulation,bridge};
  const f=simulation.friendsFrontier;f.terrain.addGrade([8000,8000,0,640]);f.testing=true;for(const t of f.treesNear(8000,8000))f.harvested.add(t.id);
  for(let x=245;x<=255;x++)for(let y=245;y<=255;y++)for(let z=-1;z<=75;z++)f.terrain.set(x,y,z,z===-1?2:0);
  const p=[...simulation.players.values()][0],air=simulation.friends.aircraft;simulation.friends.hauling.resetAircraftWinch();
  Object.assign(air,{x:8000,y:8000,z:260,angle:0,pilotId:undefined});Object.assign(p,{x:8100,y:8000,z:260,verticalVelocity:0});
  Object.assign(simulation.friends.hauling.getCargo()[0],{x:8000,y:8000,z:0,vx:0,vy:0,vz:0,angle:0});bridge.setFriendsEnvironment({hour:12,speed:0});bridge.renderer.yaw=-Math.PI/2;bridge.renderer.pitch=-.3;
 });
 await page.keyboard.press('f');await page.waitForFunction(()=>airReview.simulation.friends.vehicles().find(v=>v.kind==='aircraft').pilotId);await page.getByRole('region',{name:'Helicopter winch'}).waitFor();console.log('Pilot HUD ready');
 const state=()=>page.evaluate(()=>({...airReview.simulation.friends.hauling.getAircraftWinch()}));
 await page.keyboard.down('e');await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().length>180);await page.keyboard.up('e');await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().mode==='hold');
 const length=(await state()).length;await page.waitForTimeout(200);assert.equal((await state()).length,length);
 await page.keyboard.down('v');await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().cargoId==='lantern-core');await page.keyboard.up('v');
 await page.keyboard.down('a');await page.waitForFunction(n=>airReview.simulation.friends.hauling.getAircraftWinch().length<n-40,length);await page.keyboard.up('a');
 await page.waitForFunction(()=>airReview.simulation.friends.hauling.getCargo()[0].z>25);assert.equal(await page.evaluate(()=>[...airReview.simulation.players.values()][0].friendsHands?.mask||0),0);report.checks.push('AZERTY E pays out, V attaches, A raises cargo, and release brakes without triggering hand gestures');
 const before=await page.evaluate(()=>({...airReview.simulation.friends.aircraft}));await page.keyboard.down('z');await page.keyboard.down('Space');await page.keyboard.down('e');
 await page.waitForFunction(v=>{const a=airReview.simulation.friends.aircraft,c=airReview.simulation.friends.hauling.getAircraftWinch();return Math.hypot(a.x-v.x,a.y-v.y)>30&&a.z>v.z+15&&c.mode==='lower';},before);
 await page.keyboard.up('z');await page.keyboard.up('Space');await page.keyboard.up('e');await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().mode==='hold');assert((await state()).swayAngle>.05);report.checks.push('flight movement, ascent and winching work simultaneously, with real load sway');
 await page.screenshot({path:directory+'/flying-load.png'});
 await page.keyboard.down('a');await page.keyboard.down('e');await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().mode==='hold');await page.keyboard.up('a');await page.keyboard.up('e');report.checks.push('opposite winch directions brake together');
 await page.keyboard.down('v');await page.waitForTimeout(150);assert((await state()).cargoId);await page.keyboard.up('v');await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().releaseProgress===0);assert((await state()).cargoId);
 await page.keyboard.down('a');await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().mode==='raise');await page.keyboard.press('Escape');await page.keyboard.up('a');await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().mode==='hold');
 await page.getByRole('tab',{name:'Controls',exact:true}).click();await page.getByRole('button',{name:'QWERTY',exact:false}).click();await page.keyboard.press('Escape');await page.getByRole('region',{name:'Helicopter winch'}).waitFor();
 const qLength=(await state()).length;await page.keyboard.down('q');await page.waitForFunction(n=>airReview.simulation.friends.hauling.getAircraftWinch().length<n-8,qLength);await page.keyboard.up('q');report.checks.push('QWERTY Q retracts after switching layout; menus brake the motor and cancel pending release');
 await page.keyboard.down('e');await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().mode==='lower');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('e');await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().mode==='hold');report.checks.push('window blur clears held winch input');
 await page.keyboard.down('v');await page.waitForFunction(()=>!airReview.simulation.friends.hauling.getAircraftWinch().cargoId);await page.keyboard.up('v');report.checks.push('short V holds cancel; a deliberate hold releases the moving load');
 await page.keyboard.press('f');await page.waitForFunction(()=>!airReview.simulation.friends.aircraft.pilotId);await page.keyboard.down('q');await page.waitForFunction(()=>[...airReview.simulation.players.values()][0].friendsHands?.mask===1);await page.keyboard.up('q');report.checks.push('F still leaves the cockpit and Q resumes its original gesture outside it');
 await page.evaluate(()=>{const a=airReview.simulation.friends.aircraft,p=[...airReview.simulation.players.values()][0];Object.assign(p,{x:a.x+100*Math.cos(a.angle),y:a.y+100*Math.sin(a.angle),z:a.z,verticalVelocity:0});});await page.waitForTimeout(100);await page.keyboard.press('f');await page.waitForFunction(()=>airReview.simulation.friends.aircraft.pilotId);
 await page.keyboard.press('Escape');await page.getByRole('tab',{name:'Controls',exact:true}).click();await page.getByRole('button',{name:'MOBILE',exact:false}).click();await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Extend',exact:true}).waitFor();assert.equal(await page.locator('.friends-gesture-touch').count(),0);
 const extend=await page.getByRole('button',{name:'Extend',exact:true}).boundingBox(),stick=await page.locator('.coop-touch-stick').boundingBox(),cdp=await page.context().newCDPSession(page);
 const movementTouch={id:1,x:stick.x+stick.width/2,y:stick.y+stick.height/2-35},winchTouch={id:2,x:extend.x+extend.width/2,y:extend.y+extend.height/2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[movementTouch]});
 await page.waitForFunction(()=>Boolean(airReview.simulation.inputByPlayer.get([...airReview.simulation.players.keys()][0]).movement&1));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[movementTouch,winchTouch]});
 await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().mode==='lower');
 await page.waitForTimeout(250);assert(await page.evaluate(()=>Boolean(airReview.simulation.inputByPlayer.get([...airReview.simulation.players.keys()][0]).movement&1)));report.checks.push('mobile joystick movement remains held while operating the winch with a second finger');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForFunction(()=>airReview.simulation.friends.hauling.getAircraftWinch().mode==='hold');
 await page.getByRole('region',{name:'Helicopter winch'}).getByText('Brake engaged',{exact:true}).waitFor();
 await page.screenshot({path:directory+'/mobile-winch.png'});report.checks.push('mobile hold controls reel the rope and touch cancellation brakes immediately');
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}catch(e){report.failure=String(e);report.text=await page.locator('body').innerText().catch(()=>null);report.state=await page.evaluate(()=>({winch:airReview.simulation.friends.hauling.getAircraftWinch(),cargo:airReview.simulation.friends.hauling.getCargo()[0],feedback:airReview.simulation.friends.hauling.snapshot().feedback})).catch(()=>null);await page.screenshot({path:directory+'/failure.png'}).catch(()=>{});throw e;}finally{await writeFile(directory+'/checks.json',JSON.stringify(report,null,2));await browser.close();}
