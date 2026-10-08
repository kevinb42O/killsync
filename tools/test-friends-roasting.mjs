import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',directory=process.env.FRIENDS_TEST_ARTIFACTS||'artifacts/friends-roasting';await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-features=LocalNetworkAccessChecks']});
const report={errors:[],checks:[]};
let page;
try{
 page=await browser.newPage({viewport:{width:1200,height:800}});page.setDefaultTimeout(90000);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.addInitScript(()=>{
  localStorage.setItem('cinematicEffects','off');localStorage.setItem('killsync.friends.menu.pause','true');
  let locked=null;Object.defineProperty(document,'pointerLockElement',{get:()=>locked});
  HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();};
  document.exitPointerLock=()=>{locked=null;document.dispatchEvent(new Event('pointerlockchange'));};
 });
 await page.route('**/src/game/multiplayer/FriendsSimulation.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\n{const original=FriendsSimulation.prototype.tick;FriendsSimulation.prototype.tick=function(...args){window.sim=this;return original.apply(this,args);};}\n`});});
 await page.route('**/src/game/multiplayer/CoopSimulation.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\n{const original=CoopSimulation.prototype.friendsAction;CoopSimulation.prototype.friendsAction=function(player,request){const result=original.call(this,player,request);if(request.action==='campfire_eat'){(window.eatRequests??=[]).push({result,state:this.createSnapshot().friends?.campfire?.roasts[player]});}return result;};}\n`});});
 await page.route('**/src/game/multiplayer/MultiplayerRendererBridge.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\n{const original=MultiplayerRendererBridge.prototype.render;MultiplayerRendererBridge.prototype.render=function(...args){window.bridge=this;return original.apply(this,args);};}\n`});});
 await page.route('**/src/game/FriendsAudio.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\n{const original=FriendsAudio.prototype.play;FriendsAudio.prototype.play=function(cue,...args){const source=original.call(this,cue,...args);if(cue==='eat'){(window.eatingSounds??=[]).push({played:Boolean(source),duration:source?.buffer?.duration});}return source;};}\n`});});
 // Drop dev-server hot reloads so parallel workspace edits do not reset the island mid-test.
 await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>{
   const server=socket.connectToServer();server.onMessage(message=>{try{if(JSON.parse(String(message)).type==='connected')socket.send(message);}catch{}});
 });
 await page.goto(`${origin}/?mode=friends`);await page.getByLabel('Your name',{exact:true}).fill('Roasting review');await page.getByRole('button',{name:'Open my island',exact:true}).click();await page.getByRole('button',{name:'Head into the island',exact:true}).click();
 report.stage='arrival';await page.waitForFunction(()=>window.sim&&window.bridge&&!bridge.friendsWorldArrival.sequence.active&&bridge.frontierVisuals.forestLOD.arrivalReady);console.log('Arena ready');
 await page.evaluate(async()=>{
  const {CAMPFIRE_SEATS}=await import('/src/game/multiplayer/FriendsCampfireSeats.ts'),{FRIENDS_CAMPFIRE}=await import('/src/game/world/FriendsRegion.ts');
  window.campPlayer=[...sim.players.values()][0];const seat=CAMPFIRE_SEATS[2];
  Object.assign(campPlayer,seat,{z:FRIENDS_CAMPFIRE.z,angle:seat.angle+Math.PI});
  bridge.renderer.yaw=Math.atan2(-Math.cos(campPlayer.angle),-Math.sin(campPlayer.angle));bridge.renderer.pitch=.02;bridge.setFriendsEnvironment({hour:22,speed:0});
 });
 report.stage='sit';await page.waitForTimeout(600);await page.locator('.coop-arena canvas').first().click();await page.evaluate(()=>{bridge.renderer.yaw=Math.atan2(-Math.cos(Math.atan2(5552-campPlayer.y,6608-campPlayer.x)),-Math.sin(Math.atan2(5552-campPlayer.y,6608-campPlayer.x)));bridge.renderer.pitch=.02;});await page.keyboard.press('f');
 await page.waitForFunction(()=>campPlayer.friendsSeat?.vehicleId==='commons-campfire');
 await page.waitForFunction(()=>document.querySelector('.friends-campfire-hint'));
 assert.equal(await page.locator('.friends-campfire-panel, .hauling-compass, .coop-minimap, .frontier-toolbelt, .coop-reticle, .coop-objective').count(),0);
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.friends-campfire-hint')).visibility==='hidden');
 await page.screenshot({path:`${directory}/seated-clean-view.png`});
 report.checks.push('Seating removes mission compass, minimap, reticle, tools HUD and campfire panel; the tiny controls hint fades completely');
 // A teammate finishing a mission must not open a modal or interrupt looking
 // around/roasting during the campfire gathering.
 await page.evaluate(()=>sim.friends.hauling.completedCargoIds.add(sim.friends.hauling.cargo[0].id));
 await page.waitForTimeout(700);
 assert.equal(await page.locator('.hauling-dispatch-overlay').count(),0);
 assert(await page.evaluate(()=>Boolean(document.pointerLockElement)));
 report.checks.push('A shared mission completion does not open a briefing or release camera control while seated');
 assert(await page.evaluate(()=>bridge.marshmallows.group.getObjectByName(`marshmallow-stick-${campPlayer.id}`)?.visible));
 assert(await page.evaluate(()=>!bridge.frontierVisuals.tools.root.visible&&!bridge.localFirearm.group.visible));
 report.checks.push('F sits, equips a long marshmallow stick and hides the previous held tool');
 const seatedTool=await page.evaluate(()=>bridge.friendsTool);
 for(const delta of [100,-100])for(let i=0;i<6;i++){
  await page.mouse.wheel(0,delta);await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>bridge.friendsTool),seatedTool,'Scrolling while seated must preserve the original equipped tool');
  assert(await page.evaluate(()=>!bridge.frontierVisuals.tools.root.visible&&!bridge.localFirearm.group.visible&&!bridge.renderer.fpsWeaponGroup.visible&&!bridge.renderer.viewmodelScene.getObjectByName('rope-launcher').visible));
  assert(await page.evaluate(()=>bridge.marshmallows.group.getObjectByName(`marshmallow-stick-${campPlayer.id}`)?.visible));
 }
 for(const key of ['1','2','3','4','5']){
  await page.keyboard.press(key);await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>bridge.friendsTool),seatedTool,'Tool hotkeys while seated must preserve the original equipped tool');
 }
 report.checks.push('Scrolling in both directions and tool hotkeys keep only the marshmallow stick visible and preserve the tool for standing up');
 // Rendering must also suppress stale tool selections independently of input.
 await page.evaluate(()=>{
  window.originalSetFriendsTool=bridge.setFriendsTool;
  bridge.setFriendsTool=function(tool,...args){return originalSetFriendsTool.call(this,window.forcedCampfireTool??tool,...args);};
 });
 for(const tool of [0,5,1,2,3]){
  await page.evaluate(tool=>{window.forcedCampfireTool=tool;},tool);
  await page.waitForFunction(tool=>bridge.friendsTool===tool,tool);
  await page.waitForTimeout(100);
  assert(await page.evaluate(()=>!bridge.frontierVisuals.tools.root.visible&&!bridge.localFirearm.group.visible&&!bridge.renderer.fpsWeaponGroup.visible&&!bridge.renderer.viewmodelScene.getObjectByName('rope-launcher').visible));
 }
 await page.evaluate(()=>{bridge.setFriendsTool=originalSetFriendsTool;delete window.forcedCampfireTool;});
 await page.waitForFunction(tool=>bridge.friendsTool===tool,seatedTool);
 report.checks.push('All five stale tool selections remain hidden through the full render frame while seated');
 const eat=async(method)=>{
  const serial=await page.evaluate(()=>sim.friends.campfire.snapshot().roasts[campPlayer.id].serial);
  const sounds=await page.evaluate(()=>window.eatingSounds?.length??0);
  const requests=await page.evaluate(()=>window.eatRequests?.length??0);
  if(method==='button')await page.getByRole('button',{name:'Eat marshmallow',exact:true}).click();
  else await page.keyboard.press('t');
  await page.waitForFunction(before=>(window.eatRequests?.length??0)>before,requests);
  const accepted=await page.evaluate(()=>window.eatRequests.at(-1));
  assert(accepted.result.ok,accepted.result.message);assert.equal(accepted.state.eatingMs,1000);
  await page.waitForFunction(()=>!bridge.marshmallows.group.getObjectByName(`marshmallow-stick-${campPlayer.id}`).getObjectByName('toasting-marshmallow').visible);
  await page.waitForFunction(()=>sim.friends.campfire.snapshot().roasts[campPlayer.id].refillMs>0);
  const refillStarted=await page.evaluate(()=>({elapsedMs:sim.elapsedMs,remainingMs:sim.friends.campfire.snapshot().roasts[campPlayer.id].refillMs}));
  assert(await page.getByRole('button',{name:'Eat marshmallow',exact:true}).isDisabled());
  await page.waitForTimeout(Math.min(3000,refillStarted.remainingMs-500));
  assert.equal(await page.evaluate(()=>sim.friends.campfire.snapshot().roasts[campPlayer.id].serial),serial);
  assert(await page.evaluate(()=>!bridge.marshmallows.group.getObjectByName(`marshmallow-stick-${campPlayer.id}`).getObjectByName('toasting-marshmallow').visible));
  await page.waitForFunction(before=>sim.friends.campfire.snapshot().roasts[campPlayer.id].serial===before+1,serial);
  assert(await page.evaluate(start=>sim.elapsedMs-start.elapsedMs>=start.remainingMs,refillStarted),'The refill must finish its full five-second countdown');
  const audio=await page.evaluate(()=>window.eatingSounds??[]);
  assert.equal(audio.length,sounds+1,'Each bite must play exactly one eating sound');
  assert(audio.at(-1).played&&audio.at(-1).duration>1&&audio.at(-1).duration<2,'The bundled short chewing sound must decode and play');
  assert.equal(await page.evaluate(()=>sim.friends.campfire.snapshot().roasts[campPlayer.id].toast),0);
  console.log(`Eating via ${method}: sound played once; full refill delay verified`);
  assert(await page.evaluate(()=>!bridge.renderer.fpsWeaponGroup.visible&&!bridge.renderer.viewmodelScene.getObjectByName('rope-launcher').visible));
  // The pointer-lock shim lets Playwright move a cursor onto the UI button;
  // return it to the canvas and aim back at the fire before roasting again.
  await page.mouse.move(600,400);
  await page.evaluate(()=>{
   const angle=Math.atan2(5552-campPlayer.y,6608-campPlayer.x);
   bridge.renderer.yaw=Math.atan2(-Math.cos(angle),-Math.sin(angle));bridge.renderer.pitch=.02;
  });
 };
 await eat('button');report.checks.push('The Eat button plays one short downloaded chewing sound, keeps the stick empty for five seconds and then supplies a fresh marshmallow');
 report.stage='fuel';const wood=await page.evaluate(()=>sim.friendsFrontier.pack(campPlayer).wood);
 await page.keyboard.press('e');await page.waitForFunction(before=>sim.friendsFrontier.pack(campPlayer).wood===before-1,wood);
 assert(await page.evaluate(()=>sim.friends.campfire.fuelSeconds>28));
 for(let i=0;i<5;i++)await page.keyboard.press('e');
 await page.waitForFunction(()=>sim.friends.campfire.fuelSeconds>170);
 await page.waitForTimeout(1100);await page.screenshot({path:`${directory}/wood-fed-fire.png`});
 report.checks.push('E spends pack timber and grows the shared fire');
 report.stage='roast';const ammo=await page.evaluate(()=>campPlayer.weaponStates[0].magazineAmmo);
 await page.mouse.down();await page.waitForFunction(()=>sim.friends.campfire.snapshot().roasts[campPlayer.id]?.roasting);
 await page.evaluate(()=>{const input=sim.inputByPlayer.get(campPlayer.id);for(let i=0;i<130;i++){sim.setInput(campPlayer.id,input);sim.tick(50);}});
 await page.waitForFunction(()=>sim.friends.campfire.snapshot().roasts[campPlayer.id]?.toast>.4);
 await page.mouse.up();await page.waitForFunction(()=>!sim.friends.campfire.snapshot().roasts[campPlayer.id].roasting);await page.waitForTimeout(500);
 await page.screenshot({path:`${directory}/golden-marshmallow.png`});
 console.log('Golden');const golden=await page.evaluate(()=>sim.friends.campfire.snapshot().roasts[campPlayer.id]);report.golden=golden;
 assert(golden.toast>.4&&golden.toast<.9&&golden.burningMs===0);assert.equal(await page.evaluate(()=>campPlayer.weaponStates[0].magazineAmmo),ammo);
 report.checks.push('Hold left click roasts to golden brown; releasing withdraws the stick; no weapon fires');
 await eat('keyboard');report.checks.push('T eats a golden marshmallow with the bite animation and a fresh replacement');
 await page.mouse.down();await page.waitForFunction(()=>sim.friends.campfire.snapshot().roasts[campPlayer.id].roasting);
 await page.evaluate(()=>{const input=sim.inputByPlayer.get(campPlayer.id);for(let i=0;i<450;i++){sim.setInput(campPlayer.id,input);sim.tick(50);if(sim.friends.campfire.snapshot().roasts[campPlayer.id].burningMs>0)break;}});
 await page.mouse.up();await page.waitForFunction(()=>sim.friends.campfire.snapshot().roasts[campPlayer.id]?.burningMs>0);await page.waitForTimeout(500);
 await page.screenshot({path:`${directory}/burning-marshmallow.png`});
 assert(await page.evaluate(()=>bridge.marshmallows.group.getObjectByName(`marshmallow-stick-${campPlayer.id}`).getObjectByName('burning-marshmallow-flames').visible));
 report.checks.push('Over-roasting ignites the marshmallow with visible flames');
 await eat('button');report.checks.push('The Eat button also consumes a burning marshmallow and clears its flames');
 await page.keyboard.press('r');await page.waitForFunction(()=>sim.friends.campfire.snapshot().roasts[campPlayer.id].toast===0);
 await page.keyboard.press('f');await page.waitForFunction(()=>!campPlayer.friendsSeat);await page.waitForTimeout(200);
 assert(await page.evaluate(()=>!bridge.marshmallows.group.getObjectByName(`marshmallow-stick-${campPlayer.id}`)&&bridge.frontierVisuals.tools.root.visible));
 assert(await page.locator('.hauling-compass').count()>0);
 report.checks.push('R supplies a fresh marshmallow; standing restores the original tool and removes the stick');
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=String(error);if(page){report.text=await page.locator('body').innerText().catch(()=>null);report.eating=await page.evaluate(()=>({requests:window.eatRequests,sounds:window.eatingSounds,state:window.sim?.createSnapshot().friends?.campfire})).catch(()=>null);await page.screenshot({path:`${directory}/failure.png`}).catch(()=>{});}throw error;}
finally{await writeFile(`${directory}/checks.json`,JSON.stringify(report,null,2));await browser.close();}
