import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory=process.env.FISHING_ARTIFACT_DIR||'artifacts/fishing-aim-game';await mkdir(directory,{recursive:true});
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
  report.aimTrials=[];
  for(const pitch of [.8,1.35,-.8]){
    await page.evaluate(pitch=>{
      const r=fishingArena;r.bridge.renderer.pitch=pitch;
      r.simulation.friends.fishing.casts.clear();r.simulation.friends.fishing.charges.clear();
    },pitch);
    await press();await page.waitForFunction(()=>{
      const s=fishingArena.simulation.createSnapshot(),charge=s.friends.fishing.charges[0];return charge&&s.elapsedMs-charge.chargeAt>=1200;
    });
    await release();await page.waitForFunction(()=>fishingArena.simulation.createSnapshot().friends.fishing.casts.length===1);
    const initial=await page.evaluate(()=>{
      const r=fishingArena,c=r.simulation.createSnapshot().friends.fishing.casts[0];
      return {cast:c,eye:r.p.z+50,launch:fishingLaunches.at(-1)};
    });
    await page.waitForFunction(at=>fishingArena.simulation.createSnapshot().elapsedMs-at>=450,initial.cast.castAt);
    const flight=await page.evaluate(()=>fishingArena.simulation.createSnapshot().friends.fishing.casts[0]);
    const launch=initial.launch,speed=Math.hypot(launch.x,launch.y,launch.z);
    assert(Math.abs(launch.z/speed-Math.sin(pitch))<.0001);
    if(pitch>0){assert(initial.cast.from.z>initial.eye);assert(flight.z>initial.cast.from.z+40);}
    else assert(flight.z<initial.cast.from.z);
    report.aimTrials.push({pitch,from:initial.cast.from,launch,flight:{x:flight.x,y:flight.y,z:flight.z,phase:flight.phase}});
    if(pitch===.8)await page.screenshot({path:directory+'/skyward-cast.png'});
  }
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=String(error);throw error;}finally{await writeFile(directory+'/aim-validation.json',JSON.stringify(report,null,2));await browser.close();}
