import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory=process.env.FRIENDS_TEST_ARTIFACTS||'artifacts/big-walk/gestures';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--disable-features=WebRtcHideLocalIpsWithMdns','--allow-loopback-in-peer-connection']}),report={errors:[],poses:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>{const server=socket.connectToServer();server.onMessage(message=>{try{if(JSON.parse(String(message)).type==='connected')socket.send(message);}catch{}});});
 await page.goto(origin+'/tools/friends-character-review.html');
 await page.waitForFunction(()=>window.friendsCharacterReview?.crew.every(c=>c.rig.avatar.getObjectByName('friends-big-walk-character'))&&window.friendsCharacterReview.gestures.model);
 await page.screenshot({path:directory+'/palettes.png'});
 for(const mode of ['signals','hands']){
  await page.evaluate(mode=>window.friendsCharacterReview.setMode(mode),mode);
  for(let mask=0;mask<16;mask++){
   await page.evaluate(mask=>window.friendsCharacterReview.setMask(mask),mask);await page.waitForTimeout(180);
   const pose=await page.evaluate(()=>{const r=window.friendsCharacterReview;return {gl:r.renderer.getContext().getError(),calls:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles};});assert.equal(pose.gl,0);report.poses.push({mode,mask,...pose});
   await page.screenshot({path:`${directory}/${mode}-${mask}.png`});
  }
 }
 report.shoulderConnections=await page.evaluate(()=>{
  const r=friendsCharacterReview,result=[],v=r.camera.position.clone();r.setMode('hands');r.setMask(3);
  for(const aspect of [16/9,2.4,9/16])for(const fov of [70,98,120]){
   r.handCamera.aspect=aspect;r.handCamera.fov=fov;r.handCamera.updateProjectionMatrix();r.render(r.time+250);r.gestures.root.updateWorldMatrix(true,true);
   for(const [index,name] of [[2,'left-upper-arm-connection'],[3,'right-upper-arm-connection']]){
    const connector=r.gestures.root.getObjectByName(name),part=r.gestures.model.parts[index],start=v.clone().set(0,-.5,0);connector.localToWorld(start);
    const shoulder=part.getWorldPosition(v.clone());const position=connector.geometry.getAttribute('position');let minY=Infinity,maxY=-Infinity;
    for(let i=0;i<position.count;i++){v.fromBufferAttribute(position,i).applyMatrix4(connector.matrixWorld).project(r.handCamera);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);}
    result.push({fov,aspect,name,gap:start.distanceTo(shoulder),minY,maxY});
   }
  }r.handCamera.aspect=innerWidth/innerHeight;r.handCamera.fov=98;r.handCamera.updateProjectionMatrix();return result;
 });
 assert(report.shoulderConnections.every(c=>c.gap<.0001&&c.minY< -1&&c.maxY> -1));
 for(const fov of [70,98,120]){await page.evaluate(fov=>{friendsCharacterReview.handCamera.fov=fov;friendsCharacterReview.handCamera.updateProjectionMatrix();},fov);await page.waitForTimeout(250);await page.screenshot({path:`${directory}/connected-hands-fov-${fov}.png`});}
 await page.evaluate(()=>{friendsCharacterReview.handCamera.fov=98;friendsCharacterReview.handCamera.updateProjectionMatrix();});
 await page.evaluate(()=>{friendsCharacterReview.setMode('demo');friendsCharacterReview.setDemoView('front');});
 for(let stage=0;stage<16;stage++){
  await page.evaluate(stage=>friendsCharacterReview.setDemoStage(stage),stage);await page.waitForTimeout(230);
  assert.equal(await page.evaluate(()=>friendsCharacterReview.renderer.getContext().getError()),0);
  if(stage===6||stage===9)await page.screenshot({path:`${directory}/third-person-${stage===6?'up':'sideways'}.png`});
 }
 await page.evaluate(()=>{friendsCharacterReview.setDemoStage(3);friendsCharacterReview.setDemoView('side');});await page.waitForTimeout(230);await page.screenshot({path:directory+'/third-person-point.png'});
 report.thirdPerson={combinations:16,shoulderHierarchy:true};
 // Real WebRTC uses the same input admission and compact snapshot path as Friends.
 report.network=await page.evaluate(async()=>{
  const {ManualWebRTCSession}=await import('/src/game/multiplayer/ManualWebRTCSession.ts');
  const {FriendsSimulation}=await import('/src/game/multiplayer/FriendsSimulation.ts');
  const {MULTIPLAYER_PROTOCOL_VERSION:version}=await import('/src/game/multiplayer/protocol.ts');
  const {quantizePitch}=await import('/src/game/multiplayer/CoopSimulation.ts');
  const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#0ff'},{id:'guest',label:'Guest',color:'#f0f'}]);
  const errors=[];let last,sequence=0,tick=0,hostMask=0;
  const input=mask=>({type:'input',version,sequence:++sequence,clientTime:Date.now(),movement:0,aimAngle:0,aimPitch:quantizePitch(.2),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,friendsTool:6,friendsArms:mask});
  const host=new ManualWebRTCSession({role:'host',friends:true,iceServers:[],onInput:(_peer,f)=>sim.setInput('guest',f),onError:e=>errors.push(e)});
  const guest=new ManualWebRTCSession({role:'guest',friends:true,iceServers:[],onState:f=>last=f.payload,onError:e=>errors.push(e)});
  const wait=async(test)=>{const end=performance.now()+12000;while(!test()){if(performance.now()>end)throw new Error('Gesture network timeout '+JSON.stringify({errors,host:host.peerInfo,guest:guest.peerInfo,players:last?.players}));await new Promise(r=>setTimeout(r,10));}};
  let timer;const checks=[];
  try{
   await host.acceptAnswer(await guest.acceptOffer(await host.createOffer()));await wait(()=>host.connectedPeerCount===1&&guest.connectedPeerCount===1);host.admitFriendsPeer(host.peerInfo[0].peerId);
   timer=setInterval(()=>{sim.setInput('host',input(hostMask));sim.tick(50);host.broadcastState({type:'state',version,tick:++tick,sentAt:Date.now(),payload:sim.createSnapshot()});},50);
   for(let mask=0;mask<16;mask++){hostMask=15-mask;guest.sendInput(input(mask));await wait(()=>last?.players.find(p=>p.id==='guest')?.friendsHands?.mask===mask&&last?.players.find(p=>p.id==='host')?.friendsHands?.mask===hostMask);checks.push(mask);}
   guest.sendInput({...input(15),friendsTool:1});await wait(()=>!last?.players.find(p=>p.id==='guest')?.friendsHands);
   guest.sendInput(input(3));await wait(()=>last?.players.find(p=>p.id==='guest')?.friendsHands?.mask===3);await wait(()=>!last?.players.find(p=>p.id==='guest')?.friendsHands);
   return {combinations:checks.length,bothDirections:true,toolChange:true,staleCleared:true,errors};
  }finally{clearInterval(timer);guest.close();host.close();}
 });
 assert.equal(report.network.combinations,16);assert.deepEqual(report.network.errors,[]);
 await page.addInitScript(()=>{
  localStorage.setItem('sunline.preferences.v1',JSON.stringify({renderScale:1,shadows:false}));localStorage.setItem('killsync.friends.menu.pause','true');
  let locked=null;Object.defineProperty(document,'pointerLockElement',{get:()=>locked});
  HTMLCanvasElement.prototype.requestPointerLock=function(){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();};
  document.exitPointerLock=()=>{locked=null;document.dispatchEvent(new Event('pointerlockchange'));};
 });
 await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s);}s.textContent=content;}export function removeStyle(id){document.getElementById(id)?.remove();}'}));
 await page.goto(origin+'/?mode=friends');await page.getByLabel('Your name',{exact:true}).fill('Gesture review');await page.getByRole('button',{name:'Play on my own',exact:true}).click({noWaitAfter:true});
 await page.locator('.coop-arena').waitFor({state:'attached',timeout:120000});await page.waitForFunction(()=>!document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'),undefined,{timeout:120000});
 await page.evaluate(()=>{
  const element=document.querySelector('.coop-arena'),key=Object.keys(element).find(k=>k.startsWith('__reactFiber'));
  let fiber=element[key],simulation,bridge,input,scheme;
  while(fiber){let hook=fiber.memoizedState;while(hook){const ref=hook.memoizedState,value=ref?.current;
   if(value?.createSnapshot&&value?.setInput)simulation=value;if(value?.getFriendsTerrain&&value?.setFriendsTool)bridge=value;
   if(value?.type==='input')input=ref;if(value==='AZERTY'||value==='QWERTY')scheme=ref;hook=hook.next;}fiber=fiber.return;}
  if(!simulation||!bridge||!input)throw new Error('Gesture arena refs unavailable');
  window.gestureGame={simulation,bridge,input,scheme,host:[...simulation.players.values()][0]};document.querySelector('.coop-arena canvas').requestPointerLock();
 });
 assert.equal(await page.evaluate(()=>gestureGame.input.current.friendsTool),6);
 await page.mouse.move(720,450);
 report.game={combinations:0};
 for(let mask=0;mask<16;mask++){
  if(mask&1)await page.keyboard.down('a');if(mask&2)await page.keyboard.down('e');if(mask&4)await page.mouse.down({button:'left'});if(mask&8)await page.mouse.down({button:'right'});
  await page.waitForFunction(mask=>gestureGame.host.friendsHands?.mask===mask,mask);report.game.combinations++;
  if(mask&1)await page.keyboard.up('a');if(mask&2)await page.keyboard.up('e');if(mask&4)await page.mouse.up({button:'left'});if(mask&8)await page.mouse.up({button:'right'});
  await page.waitForFunction(()=>gestureGame.host.friendsHands?.mask===0);
 }
 await page.evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{key:'&',code:'Digit1',bubbles:true})));assert.equal(await page.evaluate(()=>gestureGame.input.current.friendsTool),6);
 await page.mouse.down();await page.waitForFunction(()=>gestureGame.host.friendsHands?.mask===4);await page.keyboard.press('2');
 assert.equal(await page.evaluate(()=>gestureGame.input.current.friendsTool),1);await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>gestureGame.input.current.firing),false);await page.mouse.up();
 await page.keyboard.press('1');await page.keyboard.press('v');await page.waitForFunction(()=>gestureGame.bridge.frontierVisuals.flashlightShining);assert.notEqual(await page.evaluate(()=>gestureGame.input.current.friendsTool),6);
 await page.keyboard.press('1');await page.waitForFunction(()=>!gestureGame.bridge.frontierVisuals.flashlightShining);assert(await page.evaluate(()=>gestureGame.bridge.frontierVisuals.flashlightEquipped));
 await page.keyboard.press('2');await page.waitForFunction(()=>gestureGame.bridge.frontierVisuals.flashlightShining);await page.keyboard.press('1');
 await page.keyboard.down('e');await page.waitForFunction(()=>gestureGame.host.friendsHands?.mask===2);await page.evaluate(()=>dispatchEvent(new Event('blur')));await page.waitForFunction(()=>gestureGame.host.friendsHands?.mask===0);await page.keyboard.up('e');
 report.game.emptyStarts=true;report.game.azertyNumberRow=true;report.game.toolSwitchDoesNotFire=true;report.game.flashlightStowsAndRestores=true;report.game.blurClears=true;
 // Keyboard layout and controller ownership use the real arena event/poll handlers.
 const switchScheme=async name=>{await page.keyboard.press('Escape');await page.getByRole('tab',{name:'Controls',exact:true}).click();await page.getByRole('button',{name:new RegExp('^'+name)}).click();await page.getByRole('button',{name:/Back to island/}).click();};
 await switchScheme('QWERTY');await page.keyboard.down('q');await page.keyboard.down('e');await page.waitForFunction(()=>gestureGame.host.friendsHands?.mask===3);assert.equal(await page.evaluate(()=>gestureGame.input.current.movement),0);await page.keyboard.up('q');await page.keyboard.up('e');
 await page.evaluate(()=>{
  window.gesturePad={id:'test',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[gesturePad]});
 });await switchScheme('GAMEPAD');await page.evaluate(()=>{for(const i of [4,5,6,7])gesturePad.buttons[i]={pressed:true,value:1};});await page.waitForFunction(()=>gestureGame.host.friendsHands?.mask===15);
 await page.evaluate(()=>gesturePad.buttons[15]={pressed:true,value:1});await page.waitForFunction(()=>gestureGame.input.current.friendsTool===1);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>gestureGame.input.current.firing),false);
 await page.evaluate(()=>{gesturePad.buttons=gesturePad.buttons.map(()=>({pressed:false,value:0}));});await page.waitForTimeout(100);await switchScheme('AZERTY');await page.keyboard.press('1');
 report.game.qwerty=true;report.game.controllerGestures=true;report.game.controllerReleaseGate=true;
 await page.keyboard.down('a');await page.keyboard.down('e');await page.waitForTimeout(180);await page.screenshot({path:directory+'/in-game-raised-hands.png'});await page.keyboard.up('a');await page.keyboard.up('e');
 assert.equal(await page.evaluate(()=>gestureGame.bridge.renderer.renderer.getContext().getError()),0);
 assert.deepEqual(report.errors,[]);await writeFile(directory+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({poses:report.poses.length,errors:report.errors,directory}));
}finally{await browser.close();}
