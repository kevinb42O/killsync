import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory='artifacts/fishing';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']}),report={errors:[],checks:[]};
try{
  const page=await browser.newPage({viewport:{width:1200,height:800}});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:.7,shadows:false}));localStorage.setItem('cinematicEffects','subtle');localStorage.setItem('killsync.friends.menu.pause','true');
    let locked=null;Object.defineProperty(document,'pointerLockElement',{get:()=>locked});HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));return Promise.resolve();};document.exitPointerLock=()=>{locked=null;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));};
  });
  await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s);}s.textContent=content;}export function removeStyle(id){document.getElementById(id)?.remove();}'}));
  await page.goto(origin+'/?mode=friends',{waitUntil:'domcontentloaded'});await page.getByLabel('Your name',{exact:true}).fill('Fishing review');await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});await page.locator('.coop-arena').waitFor();await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'));
  await page.evaluate(async()=>{
    const el=document.querySelector('.coop-arena'),key=Object.keys(el).find(k=>k.startsWith('__reactFiber'));let fiber=el[key],simulation,bridge,input;
    while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;if(value?.createSnapshot&&value?.setInput)simulation=value;if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;if(value?.type==='input')input=hook.memoizedState;hook=hook.next;}fiber=fiber.return;}
    if(!simulation||!bridge||!input)throw Error('Fishing arena refs unavailable');const p=[...simulation.players.values()][0],{friendsWaterAt}=await import('/src/game/world/FriendsWaterSurface.ts');let x=14580;
    for(let q=14580;q>13000;q-=8)if(friendsWaterAt(q,23600)){x=q+48;break;}
    Object.assign(p,{x,y:23600,z:simulation.friendsFrontier.terrain.surfaceHeight(x,23600),verticalVelocity:0,friendsDevFlight:false});bridge.renderer.yaw=Math.PI/2;bridge.renderer.pitch=-.3;
    window.fishingArena={simulation,bridge,input,p,id:p.id};
  });
  await page.keyboard.press('7');await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.equipped.includes(fishingArena.id));
  report.timing=await page.evaluate(async()=>{const m=await import('/src/game/multiplayer/FriendsFishing.ts');return {reelMs:m.FISHING_REEL_MS,waitMinMs:m.FISHING_WAIT_MIN_MS,waitMaxMs:m.FISHING_WAIT_MAX_MS};});
  assert.equal(report.timing.reelMs,2800);assert.equal(report.timing.waitMinMs,7000);assert.equal(report.timing.waitMaxMs,28000);
  assert.equal(await page.locator('.frontier-toolbelt__slots button[aria-pressed=true] span').textContent(),'Fishing rod');assert((await page.locator('.friends-fishing-controls').innerText()).length<50);
  const trigger=async(button)=>{await page.evaluate(button=>{const canvas=document.querySelector('.coop-arena canvas');canvas.dispatchEvent(new MouseEvent('mousedown',{button,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button,bubbles:true}));},button);};
  await trigger(0);await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.casts[0]?.phase==='waiting');await page.screenshot({path:directory+'/arena-waiting.png'});report.checks.push('slot 7 selects a visible rod and tiny controls; real mouse input casts into the lake');
  await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.casts[0]?.phase==='bite');await trigger(0);await page.waitForFunction(()=>fishingArena.simulation.friends.fishing.held(fishingArena.id));await page.waitForFunction(()=>fishingArena.bridge.fishingVisuals.held.visible&&fishingArena.bridge.fishingVisuals.rods.size===0);await page.screenshot({path:directory+'/arena-held.png'});report.checks.push('bite click reels automatically and equips the fish in both hands');
  await trigger(2);await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.fish[0]?.phase==='dry');await page.waitForFunction(()=>[...fishingArena.bridge.fishingVisuals.fishes.values()].some(f=>f.phase==='dry'));await page.evaluate(()=>{fishingArena.bridge.renderer.pitch=-.55;});await page.screenshot({path:directory+'/arena-dropped.png'});report.checks.push('right click gently drops a fish that flops on the shore');
  await page.keyboard.press('f');await page.waitForFunction(()=>fishingArena.simulation.friends.fishing.held(fishingArena.id));await page.evaluate(()=>{fishingArena.bridge.renderer.pitch=.05;});await trigger(0);await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.fish[0]?.phase==='swimming');await page.waitForFunction(()=>[...fishingArena.bridge.fishingVisuals.fishes.values()].some(f=>f.phase==='swimming'));await page.screenshot({path:directory+'/arena-release.png'});report.checks.push('F picks the fish up and left click throws it back to swim away');
  await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.fish.length===0);await page.keyboard.press('5');await page.waitForFunction(()=>fishingArena.input.current.friendsTool===0);await page.keyboard.press('6');await page.waitForFunction(()=>fishingArena.input.current.friendsTool===5);report.checks.push('swim-away cleanup completes and existing combat/rope shortcuts remain intact');
  report.toolbar=await page.locator('.frontier-toolbelt').evaluate(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}));assert(report.toolbar.height<80);assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await writeFile(directory+'/arena-validation.json',JSON.stringify(report,null,2));await browser.close();}
