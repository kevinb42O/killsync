import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const directory='artifacts/giant-shark',origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-features=WebRtcHideLocalIpsWithMdns','--allow-loopback-in-peer-connection']}),report={errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/tools/friends-fishing-review.html');await page.waitForFunction(()=>window.fishingReview);
 await page.evaluate(async()=>{
  const {FriendsSimulation}=await import('/src/game/multiplayer/FriendsSimulation.ts'),{MULTIPLAYER_PROTOCOL_VERSION:version}=await import('/src/game/multiplayer/protocol.ts');
  const r=fishingReview,sim=new FriendsSimulation([{id:'review',label:'Review',color:'#78cabc'}]),p=sim.players.get('review');
  Object.assign(p,{x:2800,y:23600,z:-160,friendsDevFlight:false});Object.assign(r.player,p);sim.friends.fishing.random=()=>.999;
  const point={x:2350,y:23600,z:-166.5};sim.friends.fishing.casts.set('review',{id:900,playerId:'review',phase:'bite',...point,target:{...point},from:{...point},size:0,atMs:0,biteAt:0,lineLength:500});
  let action=1,holding=true,alt=0,sequence=0;const timings=[];
  const step=(milliseconds)=>{for(let t=0;t<milliseconds;t+=50){sim.setInput('review',{type:'input',version,sequence:++sequence,clientTime:0,movement:0,aimAngle:32767,aimPitch:32767,friendsTool:7,selectedSlot:0,fireActionId:action,altFireActionId:alt,firing:holding,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});const start=performance.now();sim.tick(50);timings.push(performance.now()-start);}};
  const draw=()=>{
   const state=sim.friends.fishing.snapshot(),fish=state.casts[0]??state.fish[0];r.setSnapshot(state);
   r.camera.position.set(p.x,p.z+32,p.y);if(fish)r.camera.lookAt(fish.x,-160,fish.y);r.camera.updateProjectionMatrix();r.handCamera.position.copy(r.camera.position);r.handCamera.quaternion.copy(r.camera.quaternion);
   r.world.update(sim.createSnapshot().friends.frontier,p.x,p.y,sim.elapsedMs,7,false,[],180000,false);
   r.fishing.update(state,[p],'review',7,r.camera,sim.elapsedMs,16,true,r.project,()=>false);
   r.renderer.info.reset();r.renderer.autoClear=true;r.renderer.render(r.scene,r.camera);r.renderer.autoClear=false;r.renderer.clearDepth();r.renderer.render(r.viewmodel,r.handCamera);
   return {held:r.fishing.held.visible,fishParent:r.fishing.fishes.get(900)?.root.parent?.name,clip:r.fishing.fishes.get(900)?.clip,rod:r.fishing.rods.has('review'),gl:r.renderer.getContext().getError(),state};
  };
  r.pause();await r.loadFishingFish('shark');step(2000);window.sharkReview={sim,step,draw,timings,pause:()=>holding=false,resume:()=>holding=true,release:()=>{alt++;holding=false;}};draw();
 });
 await page.waitForTimeout(1000);report.fighting=await page.evaluate(()=>sharkReview.draw());await page.screenshot({path:`${directory}/fighting.png`});
 assert.equal(report.fighting.held,false);assert.equal(report.fighting.clip,'Swimming_Fast');assert.equal(report.fighting.gl,0);
 report.paused=await page.evaluate(()=>{sharkReview.pause();sharkReview.step(50);const before=sharkReview.sim.friends.fishing.snapshot().casts[0];sharkReview.step(2000);const after=sharkReview.sim.friends.fishing.snapshot().casts[0];return {before,after,...sharkReview.draw()};});
 assert.equal(report.paused.after.reelElapsedMs,report.paused.before.reelElapsedMs);assert.equal(report.paused.after.sharkFatigue,report.paused.before.sharkFatigue);assert.notDeepEqual([report.paused.before.x,report.paused.before.y],[report.paused.after.x,report.paused.after.y]);
 await page.evaluate(()=>{sharkReview.resume();sharkReview.step(18000);sharkReview.draw();});await page.waitForTimeout(100);report.landed=await page.evaluate(()=>sharkReview.draw());
 assert.equal(report.landed.held,false);assert.equal(report.landed.fishParent,'friends-fishing');assert.equal(report.landed.clip,'Swimming_Normal');assert(report.landed.rod);assert.equal(report.landed.state.fish[0].phase,'landed');assert.equal(report.landed.state.fish[0].ownerId,undefined);
 assert.equal(await page.locator('.friends-fishing-log header b').innerText(),'1');await page.screenshot({path:`${directory}/landed-desktop.png`});
 await page.setViewportSize({width:360,height:740});await page.evaluate(()=>sharkReview.draw());await page.screenshot({path:`${directory}/landed-mobile.png`});await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>{sharkReview.release();sharkReview.step(1500);sharkReview.draw();});await page.waitForTimeout(50);report.released=await page.evaluate(()=>sharkReview.draw());assert.equal(report.released.state.fish[0].phase,'swimming');assert.equal(report.released.state.casts.length,0);assert.equal(report.released.held,false);assert.equal(await page.locator('.friends-fishing-log header b').innerText(),'1');await page.screenshot({path:`${directory}/released.png`});
 report.performance=await page.evaluate(()=>{const t=sharkReview.timings.sort((a,b)=>a-b);return {hostTickP50:t[Math.floor(t.length*.5)],hostTickP95:t[Math.floor(t.length*.95)]};});
 report.network=await page.evaluate(async()=>{
  const {ManualWebRTCSession}=await import('/src/game/multiplayer/ManualWebRTCSession.ts'),{FriendsSimulation}=await import('/src/game/multiplayer/FriendsSimulation.ts'),{MULTIPLAYER_PROTOCOL_VERSION:version}=await import('/src/game/multiplayer/protocol.ts');
  const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#0ff'},{id:'guest',label:'Guest',color:'#f0f'}]);let latest,sequence=0,transportTick=0,holding=true,alt=0;const errors=[];
  const host=new ManualWebRTCSession({role:'host',friends:true,iceServers:[],onInput:(_peer,input)=>sim.setInput('guest',input),onError:e=>errors.push(e)}),guest=new ManualWebRTCSession({role:'guest',friends:true,iceServers:[],onState:f=>latest=f.payload,onError:e=>errors.push(e)});
  const wait=async(test)=>{const deadline=performance.now()+30000;while(!test()){if(performance.now()>deadline)throw Error('Shark network timeout '+JSON.stringify({errors,sequence,transportTick,received:sim.inputByPlayer.get('guest')?.sequence,latestElapsed:latest?.elapsedMs,hostElapsed:sim.elapsedMs,peers:host.peerInfo}));await new Promise(r=>setTimeout(r,5));}};
  const run=async(ms)=>{for(let t=0;t<ms;t+=200){guest.sendInput({type:'input',version,sequence:++sequence,clientTime:Date.now(),movement:0,aimAngle:32767,aimPitch:32767,friendsTool:7,selectedSlot:0,fireActionId:1,altFireActionId:alt,firing:holding,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});await wait(()=>sim.inputByPlayer.get('guest')?.sequence===sequence);for(let i=0;i<4;i++)sim.tick(50);let sentAt=-Infinity;const payload=sim.createSnapshot();await wait(()=>{if(latest?.elapsedMs===sim.elapsedMs)return true;if(performance.now()-sentAt>=25){sentAt=performance.now();host.broadcastState({type:'state',version,tick:++transportTick,sentAt:Date.now(),payload});}return false;});}};
  try{
   await host.acceptAnswer(await guest.acceptOffer(await host.createOffer()));await wait(()=>host.connectedPeerCount===1&&guest.connectedPeerCount===1);host.admitFriendsPeer(host.peerInfo[0].peerId);
   Object.assign(sim.players.get('guest'),{x:2800,y:23600,z:-160,friendsDevFlight:false});sim.friends.fishing.random=()=>.999;
   const point={x:2350,y:23600,z:-166.5};sim.friends.fishing.casts.set('guest',{id:901,playerId:'guest',phase:'bite',...point,target:{...point},from:{...point},size:0,atMs:0,biteAt:0,lineLength:500});
   await run(2000);holding=false;await run(200);const paused=latest.friends.fishing.casts[0];await run(2000);const after=latest.friends.fishing.casts[0];
   if(after.reelElapsedMs!==paused.reelElapsedMs||after.sharkFatigue!==paused.sharkFatigue)throw Error('Paused shark exhausted over network');
   if(after.x===paused.x&&after.y===paused.y)throw Error('Paused shark stopped swimming');
   holding=true;await run(20000);const landed=latest.friends.fishing.fish[0];
   if(landed?.phase!=='landed'||landed.tetheredBy!=='guest'||landed.ownerId!==undefined||sim.friends.fishing.held('guest'))throw Error('Network shark was not water-landed');
   holding=false;alt=1;await run(200);const released=latest.friends.fishing.fish[0];if(released?.phase!=='swimming'||released.landedAt!==landed.landedAt||released.id!==landed.id||released.tetheredBy!==undefined)throw Error('Network shark release lost catch identity');
   await run(9000);if(latest.friends.fishing.fish.length)throw Error('Network shark leaked');
   return {version,pausedFight:true,landed:true,released:true,cleaned:true,lengthCm:Math.round(landed.size*85),errors};
  }finally{host.close();guest.close();}
 });
 assert.deepEqual(report.network.errors,[]);assert.deepEqual(report.errors,[]);console.log(JSON.stringify({fight:report.fighting.state.casts[0].sharkFatigue,landed:report.landed.state.fish[0],performance:report.performance,network:report.network,errors:report.errors},null,2));
}finally{await writeFile(`${directory}/validation.json`,JSON.stringify(report,null,2));await browser.close();}
