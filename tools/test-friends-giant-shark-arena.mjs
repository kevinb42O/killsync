import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory='artifacts/giant-shark-arena';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']}),report={errors:[],checks:[]};
let page;
try{
  page=await browser.newPage({viewport:{width:1200,height:800}});page.setDefaultTimeout(60000);await page.routeWebSocket(/.*/,ws=>ws.close());page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:.7,shadows:false}));localStorage.setItem('cinematicEffects','subtle');localStorage.setItem('killsync.friends.menu.pause','true');
    let locked=null;Object.defineProperty(document,'pointerLockElement',{get:()=>locked});HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));return Promise.resolve();};document.exitPointerLock=()=>{locked=null;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));};
  });
  await page.goto(origin+'/?mode=friends',{waitUntil:'domcontentloaded'});await page.getByLabel('Your name',{exact:true}).fill('Fishing review');await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});await page.locator('.coop-arena').waitFor();await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'));

  await page.evaluate(()=>{
    const el=document.querySelector('.coop-arena'),key=Object.keys(el).find(k=>k.startsWith('__reactFiber'));let fiber=el[key],simulation,bridge;
    while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;if(value?.createSnapshot&&value?.setInput)simulation=value;if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;hook=hook.next;}fiber=fiber.return;}
    if(!simulation||!bridge)throw Error('Arena references unavailable');const p=[...simulation.players.values()][0];Object.assign(p,{x:2800,y:23600,z:-160,verticalVelocity:0,friendsDevFlight:false});bridge.renderer.yaw=Math.PI/2;bridge.renderer.pitch=-.15;window.giantArena={simulation,bridge,p};
  });
  await page.keyboard.press('7');await page.waitForFunction(()=>giantArena.simulation.friends.fishing.snapshot().equipped.includes(giantArena.p.id));
  await page.evaluate(()=>{const r=giantArena,f=r.simulation.friends.fishing,point={x:2350,y:23600,z:-166.5};f.random=()=>.999;f.casts.set(r.p.id,{id:900,playerId:r.p.id,phase:'bite',...point,target:{...point},from:{...point},size:0,atMs:r.simulation.elapsedMs,biteAt:0,lineLength:500});});
  const press=()=>page.evaluate(()=>document.querySelector('.coop-arena canvas').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true})));
  const release=()=>page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true})));
  await press();await page.waitForFunction(()=>giantArena.simulation.friends.fishing.snapshot().casts[0]?.sharkFatigue>.015);await release();
  await page.waitForFunction(()=>giantArena.simulation.friends.fishing.snapshot().casts[0]?.reelActive===false);
  const before=await page.evaluate(()=>giantArena.simulation.friends.fishing.snapshot().casts[0]);await page.waitForTimeout(700);const after=await page.evaluate(()=>giantArena.simulation.friends.fishing.snapshot().casts[0]);
  assert.equal(after.reelElapsedMs,before.reelElapsedMs);assert.notDeepEqual([after.x,after.y],[before.x,before.y]);assert((await page.locator('.friends-fishing-controls').innerText()).includes('Hold to reel'));assert.equal(await page.locator('.friends-fishing-log header b').innerText(),'0');
  await page.evaluate(()=>{const c=giantArena.simulation.friends.fishing.casts.get(giantArena.p.id);c.reelElapsedMs=c.reelDurationMs*.97;});await press();
  await page.waitForFunction(()=>giantArena.simulation.friends.fishing.landed(giantArena.p.id));await release();
  await page.waitForFunction(()=>document.querySelector('.friends-fishing-log header b')?.textContent==='1');
  assert.equal(await page.locator('.friends-fishing-controls button').count(),1);assert((await page.locator('.friends-fishing-controls').innerText()).includes('Release shark'));
  const landed=await page.evaluate(()=>({fish:giantArena.simulation.friends.fishing.landed(giantArena.p.id),held:giantArena.bridge.fishingVisuals.held.visible}));assert.equal(landed.held,false);assert.equal(landed.fish.ownerId,undefined);
  await page.screenshot({path:directory+'/landed-desktop.png'});await page.setViewportSize({width:360,height:740});await page.waitForTimeout(250);await page.screenshot({path:directory+'/landed-mobile.png'});
  const box=await page.locator('.friends-fishing-cast').boundingBox(),touch=await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});await page.waitForTimeout(100);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>giantArena.simulation.friends.fishing.snapshot().fish[0]?.phase==='swimming');assert.equal(await page.locator('.friends-fishing-log header b').innerText(),'1');
  assert.equal(await page.locator('.friends-fishing-controls button').count(),2);report.checks.push('real mouse hold/pause, shark fights while paused, no early catch credit, water landing with rod, one Release shark button, real touch release, normal casting controls restored');assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
}finally{await writeFile(directory+'/validation.json',JSON.stringify(report,null,2));await browser.close();}
