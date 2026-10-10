import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory=process.env.FISHING_ARTIFACT_DIR||'artifacts/fishing';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']}),report={errors:[],checks:[]};
let page;
try{
  page=await browser.newPage({viewport:{width:1200,height:800}});page.setDefaultTimeout(60000);await page.routeWebSocket(/.*/,ws=>ws.close());page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:.7,shadows:false}));localStorage.setItem('cinematicEffects','subtle');localStorage.setItem('killsync.friends.menu.pause','true');
    let locked=null;Object.defineProperty(document,'pointerLockElement',{get:()=>locked});HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));return Promise.resolve();};document.exitPointerLock=()=>{locked=null;queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));};
  });
  await page.goto(origin+'/?mode=friends',{waitUntil:'domcontentloaded'});await page.getByLabel('Your name',{exact:true}).fill('Fishing review');await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});await page.locator('.coop-arena').waitFor();await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'));
  await page.evaluate(async()=>{
    const el=document.querySelector('.coop-arena'),key=Object.keys(el).find(k=>k.startsWith('__reactFiber'));let fiber=el[key],simulation,bridge,input;
    while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;if(value?.createSnapshot&&value?.setInput)simulation=value;if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;if(value?.type==='input')input=hook.memoizedState;hook=hook.next;}fiber=fiber.return;}
    if(!simulation||!bridge||!input)throw Error('Fishing arena refs unavailable');const p=[...simulation.players.values()][0],{friendsWaterAt}=await import('/src/game/world/FriendsWaterSurface.ts');let x=14580;
    for(let q=14580;q>13000;q-=8)if(friendsWaterAt(q,23600)){x=q+48;break;}
    Object.assign(p,{x,y:23600,z:simulation.friendsFrontier.terrain.surfaceHeight(x,23600),verticalVelocity:0,friendsDevFlight:false});bridge.renderer.yaw=Math.PI/2;bridge.renderer.pitch=-.3;
    window.fishingArena={simulation,bridge,input,p,id:p.id};window.fishingLaunches=[];
    const fishing=simulation.friends.fishing,start=fishing.start.bind(fishing);
    fishing.start=(...args)=>{start(...args);const cast=fishing.snapshot().casts.find(c=>c.playerId===args[0].id);if(cast)window.fishingLaunches.push({...cast.velocity});};
  });
  await page.keyboard.press('7');await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.equipped.includes(fishingArena.id));
  report.timing=await page.evaluate(async()=>{const m=await import('/src/game/multiplayer/FriendsFishing.ts');return {reelMs:m.FISHING_REEL_MS,waitMinMs:m.FISHING_WAIT_MIN_MS,waitMaxMs:m.FISHING_WAIT_MAX_MS};});
  assert.equal(report.timing.reelMs,2800);assert.equal(report.timing.waitMinMs,7000);assert.equal(report.timing.waitMaxMs,28000);
  assert.equal(await page.locator('.frontier-toolbelt__slots button[aria-pressed=true] span').textContent(),'Fishing rod');assert((await page.locator('.friends-fishing-controls').innerText()).length<65);
  const trigger=async(button)=>{await page.evaluate(button=>{const canvas=document.querySelector('.coop-arena canvas');canvas.dispatchEvent(new MouseEvent('mousedown',{button,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button,bubbles:true}));},button);};
  const press=()=>page.evaluate(()=>document.querySelector('.coop-arena canvas').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true})));
  const release=()=>page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true})));
  await press();await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.charges?.length===1);
  await page.waitForTimeout(1600);assert.equal(await page.evaluate(()=>fishingArena.simulation.createSnapshot().friends.fishing.casts.length),0);
  assert.equal(await page.getByRole('progressbar',{name:'Casting power'}).count(),1);
  await page.screenshot({path:directory+'/arena-charging.png'});await release();await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.casts[0]?.phase==='waiting');await page.screenshot({path:directory+'/arena-waiting.png'});report.checks.push('slot 7 selects a visible rod and tiny controls; real mouse hold caps without throwing; release casts into the lake');
  await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.casts[0]?.phase==='bite');await trigger(0);await page.waitForFunction(()=>fishingArena.simulation.friends.fishing.held(fishingArena.id));await page.waitForFunction(()=>fishingArena.bridge.fishingVisuals.held.visible&&fishingArena.bridge.fishingVisuals.rods.size===0);assert((await page.locator('.friends-fishing-log').innerText()).includes('cm'));report.catchLog=await page.locator('.friends-fishing-log').innerText();await page.screenshot({path:directory+'/arena-held.png'});report.checks.push('bite click reels automatically and equips the fish in both hands');
  await trigger(2);await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.fish[0]?.phase==='dry');await page.waitForFunction(()=>[...fishingArena.bridge.fishingVisuals.fishes.values()].some(f=>f.phase==='dry'));await page.evaluate(()=>{fishingArena.bridge.renderer.pitch=-.55;});await page.screenshot({path:directory+'/arena-dropped.png'});report.checks.push('right click gently drops a fish that flops on the shore');
  await page.keyboard.press('f');await page.waitForFunction(()=>fishingArena.simulation.friends.fishing.held(fishingArena.id));await page.evaluate(()=>{fishingArena.bridge.renderer.pitch=.05;});await trigger(0);await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.fish[0]?.phase==='swimming');await page.waitForFunction(()=>[...fishingArena.bridge.fishingVisuals.fishes.values()].some(f=>f.phase==='swimming'));await page.screenshot({path:directory+'/arena-release.png'});report.checks.push('F picks the fish up and left click throws it back to swim away');
  await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.fish.length===0);await page.evaluate(()=>{fishingArena.bridge.renderer.yaw=-Math.PI/2;fishingArena.bridge.renderer.pitch=-.3;});
  await page.waitForFunction(()=>fishingArena.input.current.aimAngle<100||fishingArena.input.current.aimAngle>65435);
  await trigger(0);await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.casts[0]?.phase==='dry');
  const short=await page.evaluate(()=>{const c=fishingArena.simulation.createSnapshot().friends.fishing.casts[0];return Math.hypot(c.x-c.from.x,c.y-c.from.y);});
  const shortLaunchSpeed=await page.evaluate(()=>Math.hypot(fishingLaunches.at(-1).x,fishingLaunches.at(-1).y));
  await page.screenshot({path:directory+'/arena-dry-cast.png'});await trigger(2);await page.waitForFunction(()=>!fishingArena.simulation.createSnapshot().friends.fishing.casts.length);
  const castButton=page.locator('.friends-fishing-cast'),touch=await page.context().newCDPSession(page);
  const touchDown=async()=>{const box=await castButton.boundingBox();await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});};
  await touchDown();
  await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.charges?.length===1);
  await page.waitForFunction(()=>{const state=fishingArena.simulation.createSnapshot(),charge=state.friends.fishing.charges?.[0];return charge&&state.elapsedMs-charge.chargeAt>=1200;});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:10,y:10,id:1}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.casts[0]?.phase==='dry');
  const long=await page.evaluate(()=>{const c=fishingArena.simulation.createSnapshot().friends.fishing.casts[0];return Math.hypot(c.x-c.from.x,c.y-c.from.y);});
  const longLaunchSpeed=await page.evaluate(()=>Math.hypot(fishingLaunches.at(-1).x,fishingLaunches.at(-1).y));assert(longLaunchSpeed>shortLaunchSpeed*2);
  await trigger(2);await page.waitForFunction(()=>!fishingArena.simulation.createSnapshot().friends.fishing.casts.length);
  await touchDown();
  await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.charges?.length===1);
  await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await page.waitForFunction(()=>!fishingArena.simulation.createSnapshot().friends.fishing.charges?.length);
  assert.equal(await page.evaluate(()=>fishingArena.simulation.createSnapshot().friends.fishing.casts.length),0);
  report.castDistances={short,long};report.launchSpeeds={short:shortLaunchSpeed,long:longLaunchSpeed};report.checks.push('dry casts stay visible, touch holds reach full launch power and release off-button, and touch cancellation does not launch');
  await press();await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.charges?.length===1);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForFunction(()=>!fishingArena.simulation.createSnapshot().friends.fishing.charges?.length);
  assert.equal(await page.evaluate(()=>fishingArena.simulation.createSnapshot().friends.fishing.casts.length),0);report.checks.push('focus loss cancels a prepared cast');
  await page.keyboard.press('5');await page.waitForFunction(()=>fishingArena.input.current.friendsTool===0);await page.keyboard.press('6');await page.waitForFunction(()=>fishingArena.input.current.friendsTool===5);report.checks.push('swim-away cleanup completes and existing combat/rope shortcuts remain intact');
  report.toolbar=await page.locator('.frontier-toolbelt').evaluate(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}));assert(report.toolbar.height<80);assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=String(error);report.state=await page.evaluate(()=>({fishing:fishingArena?.simulation.createSnapshot().friends.fishing,input:fishingArena?.input.current,player:fishingArena?.p,text:document.body.innerText.slice(-800)})).catch(()=>null);throw error;}finally{await writeFile(directory+'/arena-validation.json',JSON.stringify(report,null,2));await browser.close();}
