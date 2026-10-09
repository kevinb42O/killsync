import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const out='artifacts/friends-retreats',origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000';
await mkdir(out,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-features=LocalNetworkAccessChecks']});
const report={errors:[],failedTextures:[]};
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>{const server=socket.connectToServer();server.onMessage(message=>{try{if(JSON.parse(String(message)).type==='connected')socket.send(message);}catch{}});});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 page.on('response',r=>{if(r.url().includes('/textures/friends-retreat/')&&!r.ok())report.failedTextures.push(r.url());});
 await page.route('**/__retreat_review',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0;background:#080c13"><div id="world" style="width:100vw;height:100vh"></div></body></html>'}));
 await page.goto(`${origin}/__retreat_review`);
 await page.evaluate(async()=>{
  const {FriendsSimulation}=await import('/src/game/multiplayer/FriendsSimulation.ts');
  const {MultiplayerRendererBridge}=await import('/src/game/multiplayer/MultiplayerRendererBridge.ts');
  const sites=await import('/src/game/world/FriendsRetreatSites.ts');Object.assign(window,sites);
  window.sim=new FriendsSimulation(['review','friend','third','fourth','fifth'].map((id,i)=>({id,label:['Explorer','Teammate','Cedar','Fern','Robin'][i],color:['#8de6ce','#ffd494','#a5bafa','#f2b3ce','#cef3ac'][i]})));
  window.bridge=new MultiplayerRendererBridge('friends_frontier');bridge.mount(document.getElementById('world'));
  const p=sim.players.get('review');Object.assign(p,retreatPoint(STILLWATER,0,-3),{angle:STILLWATER.angle-Math.PI/2});
  for(const [id,index]of [['friend',0],['third',2]]){
    const s=RETREAT_SEATS.find(s=>s.siteId===STILLWATER.id&&s.index===index);Object.assign(sim.players.get(id),s,{friendsSeat:{vehicleId:s.siteId,index:s.index},crouching:true});
  }
  for(const [id,u]of [['fourth',-42],['fifth',42]])Object.assign(sim.players.get(id),{x:5900+u,y:5620,z:800});
  bridge.renderer.yaw=Math.atan2(-Math.cos(p.angle),-Math.sin(p.angle));bridge.renderer.pitch=-.035;
  bridge.setFriendsEnvironment({hour:22,speed:0});window.frames=0;
  function frame(){if(window.stopFrames)return;sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);window.frames++;requestAnimationFrame(frame);}frame();
 });
 await page.waitForFunction(()=>frames>150&&!bridge.friendsWorldArrival.sequence.active,undefined,{timeout:90000});
 await page.waitForTimeout(1000);
 await page.evaluate(()=>window.stopFrames=true);
 const render=async(label,hour,on,u=0,v=-3,angle=STILLWATER=>STILLWATER.angle-Math.PI/2)=>{
  await page.evaluate(({hour,on,u,v,face})=>{
    sim.friends.retreats.state.lightsOn=on;const p=sim.players.get('review');delete p.friendsSeat;
    if(face==='window'){const seat=RETREAT_SEATS.find(s=>s.siteId===STILLWATER.id&&s.index===1);p.friendsSeat={vehicleId:seat.siteId,index:seat.index};}
    Object.assign(p,retreatPoint(STILLWATER,u,v),{angle:face==='couch'?STILLWATER.angle+Math.PI/2:STILLWATER.angle-Math.PI/2});
    bridge.renderer.yaw=Math.atan2(-Math.cos(p.angle),-Math.sin(p.angle));bridge.renderer.pitch=-.05;bridge.setFriendsEnvironment({hour,speed:0});
    for(let i=0;i<30;i++){sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);}
  },{hour,on,u,v,face:label.includes('couch')?'couch':'window'});
  await page.screenshot({path:`${out}/${label}.png`});
 };
 await page.evaluate(()=>{const p=sim.players.get('review'),s=RETREAT_SEATS.find(s=>s.siteId===STILLWATER.id&&s.index===1);p.friendsSeat={vehicleId:s.siteId,index:s.index};Object.assign(p,s);});
 await render('night-on',22,true,0,0);
 await render('night-off',22,false,0,0);
 await render('day-window',12,false,0,0);
 await render('night-couch',22,true,0,-22);
 await page.evaluate(()=>{for(const id of ['friend','third']){const p=sim.players.get(id);delete p.friendsSeat;Object.assign(p,{x:5900,y:5620,z:800});}});
 for(const on of [true,false]){
  await page.evaluate(on=>{
    const p=sim.players.get('review');delete p.friendsSeat;Object.assign(p,retreatPoint(STILLWATER,-50,-24),{angle:STILLWATER.angle+.63});
    bridge.renderer.yaw=Math.atan2(-Math.cos(p.angle),-Math.sin(p.angle));bridge.renderer.pitch=-.10;bridge.setFriendsEnvironment({hour:20,speed:0});sim.friends.retreats.state.lightsOn=on;
    for(let i=0;i<30;i++){sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);}
    // Clean room photo after the gameplay views above; hide the photo's held axe.
    bridge.frontierVisuals.hideHeldTool();bridge.localFirearm.group.visible=false;bridge.renderer.fpsWeaponGroup.visible=false;bridge.renderer.renderer.render(bridge.renderer.scene,bridge.renderer.camera);
  },on);await page.screenshot({path:`${out}/room-${on?'on':'off'}.png`});
  if(on){
   report.ceiling=await page.evaluate(()=>{
    const r=bridge.renderer.renderer,gl=r.getContext(),pixels=new Uint8Array(80*40*4);r.render(bridge.renderer.scene,bridge.renderer.camera);
    gl.readPixels(400,gl.drawingBufferHeight-120,80,40,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let dark=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])<45)dark++;
    return {darkFraction:dark/(80*40),glError:gl.getError()};
   });
   assert.ok(report.ceiling.darkFraction<.01,'The lit ceiling must not contain clipped black stripes');assert.equal(report.ceiling.glError,0);
  }
 }
 for(const [label,u,v,height]of [['house-entry',-126,-12,46],['house-exterior',-180,-110,72],['house-approach',-210,105,70]]){
  await page.evaluate(({u,v,height})=>{
   const p=sim.players.get('review');Object.assign(p,retreatPoint(STILLWATER,-112,-12,30));bridge.setFriendsEnvironment({hour:12,speed:0});
   for(let i=0;i<5;i++){sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);}
   const camera=bridge.renderer.camera,a=retreatPoint(STILLWATER,u,v,height),b=retreatPoint(STILLWATER,-70,-12,27);
   camera.position.set(a.x,a.z,a.y);camera.lookAt(b.x,b.z,b.y);
   bridge.frontierVisuals.hideHeldTool();bridge.localFirearm.group.visible=false;bridge.renderer.fpsWeaponGroup.visible=false;bridge.renderer.renderer.render(bridge.renderer.scene,camera);
  },{u,v,height});await page.screenshot({path:`${out}/${label}.png`});
 }
 // Exercise the real switch input and capture the palm touching the rocker.
 report.switchHand=await page.evaluate(async()=>{
   const {quantizeAngle,quantizePitch}=await import('/src/game/multiplayer/CoopSimulation.ts');const {MULTIPLAYER_PROTOCOL_VERSION}=await import('/src/game/multiplayer/protocol.ts');
   const p=sim.players.get('review');delete p.friendsSeat;Object.assign(p,retreatPoint(STILLWATER,-50,0));const angle=Math.atan2(RETREAT_SWITCH.y-p.y,RETREAT_SWITCH.x-p.x);
   p.angle=angle;bridge.renderer.yaw=Math.atan2(-Math.cos(angle),-Math.sin(angle));bridge.renderer.pitch=.04;bridge.setFriendsEnvironment({hour:22,speed:0});sim.friends.retreats.state.lightsOn=false;
   for(let i=0;i<15;i++){sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);}
   sim.setInput('review',{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:5000,clientTime:sim.createSnapshot().elapsedMs,movement:0,aimAngle:quantizeAngle(angle),aimPitch:quantizePitch(.04),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,interactActionId:5000});
   for(let i=0;i<7;i++){sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);}
   const hand=bridge.switchReach.group.children[0];return {lightsOn:sim.friends.retreats.state.lightsOn,by:sim.friends.retreats.state.switchBy,visible:bridge.switchReach.group.visible,palm:hand?.position.toArray(),bulbLoaded:Boolean(bridge.frontierVisuals.retreats.house.getObjectByName('stillwater-online-lightbulb'))};
 });
 assert.equal(report.switchHand.lightsOn,true);assert.equal(report.switchHand.visible,true);assert.equal(report.switchHand.bulbLoaded,true);
 const target=await page.evaluate(()=>[RETREAT_SWITCH.x,RETREAT_SWITCH.z,RETREAT_SWITCH.y]);assert.ok(Math.hypot(...target.map((v,i)=>v-report.switchHand.palm[i]))<.01,'Palm must contact the visible rocker');
 await page.screenshot({path:`${out}/switch-reach.png`});
 for(let i=0;i<20;i++)await page.evaluate(()=>{sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);});
 // Return all five crew members to fixed seats for the lighting stress check.
 await page.evaluate(()=>{for(const [id,index]of [['review',1],['friend',0],['third',2]]){const seat=RETREAT_SEATS.find(s=>s.siteId===STILLWATER.id&&s.index===index);Object.assign(sim.players.get(id),seat,{friendsSeat:{vehicleId:seat.siteId,index:seat.index},crouching:true});}});
 Object.assign(report,await page.evaluate(()=>{
  const r=bridge.renderer.renderer,scene=bridge.renderer.scene,retreat=bridge.frontierVisuals.retreats;
  const programsBefore=r.info.programs.length;
  const near={calls:r.info.render.calls,triangles:r.info.render.triangles,textures:r.info.memory.textures,geometries:r.info.memory.geometries};
  for(let i=0;i<20;i++){sim.friends.retreats.state.lightsOn=i%2===0;sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);}
  const programsAfter=r.info.programs.length;
  const samples={on:[],off:[]};
  for(let pass=0;pass<4;pass++)for(const on of [false,true]){
    sim.friends.retreats.state.lightsOn=on;
    for(let i=0;i<12;i++){sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);}
    for(let i=0;i<12;i++){const start=performance.now();bridge.render(sim.createSnapshot(),'review',33);r.getContext().finish();samples[on?'on':'off'].push(performance.now()-start);}
  }
  const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
  const frameMs={on:median(samples.on),off:median(samples.off)};
  const glError=r.getContext().getError();
  return {near,programsBefore,programsAfter,glError,frameMs,active:sim.friends.retreats.state.active,seatClaims:sim.createSnapshot().players.filter(p=>p.friendsSeat).map(p=>p.friendsSeat)};
 }));
 console.log('Room and lighting checks complete');
 for(const id of ['skyfalls-bench','gatewater-bench','saltwind-camp']){
  await page.evaluate(id=>{
    for(const p of sim.players.values()){delete p.friendsSeat;Object.assign(p,{x:5900,y:5620,z:800});}
    const s=RETREAT_SEATS.find(s=>s.siteId===id&&s.index===0),p=sim.players.get('review');Object.assign(p,s,{friendsSeat:{vehicleId:id,index:0},crouching:true,angle:s.angle});
    const t=RETREAT_SEATS.find(s=>s.siteId===id&&s.index===1);Object.assign(sim.players.get('friend'),t,{friendsSeat:{vehicleId:id,index:1},crouching:true,angle:t.angle});
    if(id==='saltwind-camp')for(const [index,id]of ['review','friend','third','fourth','fifth'].entries()){const seat=RETREAT_SEATS.find(s=>s.siteId==='saltwind-camp'&&s.index===index);Object.assign(sim.players.get(id),seat,{friendsSeat:{vehicleId:seat.siteId,index:seat.index},crouching:true,angle:seat.angle});}
    bridge.renderer.yaw=Math.atan2(-Math.cos(p.angle),-Math.sin(p.angle));bridge.renderer.pitch=-.07;bridge.setFriendsEnvironment({hour:id==='saltwind-camp'?20:12,speed:0});
    window.stopFrames=false;window.frames=0;
    function frame(){if(window.stopFrames)return;sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);window.frames++;requestAnimationFrame(frame);}frame();
  },id);
  await page.waitForFunction(()=>frames>80);await page.evaluate(()=>window.stopFrames=true);
  if(id==='saltwind-camp'){report.fullCrew=await page.evaluate(()=>sim.createSnapshot().players.map(p=>p.friendsSeat));assert.equal(new Set(report.fullCrew.map(s=>s.index)).size,5);}await page.screenshot({path:`${out}/${id}.png`});
 }
 console.log('Outdoor captures complete');
 // A second renderer consumes the real world baseline + motion codec.
 const baseline=await page.evaluate(async()=>{
  const {FriendsWorldHost}=await import('/src/game/multiplayer/FriendsWorldReplication.ts');window.replicaHost=new FriendsWorldHost();
  for(const [id,index]of [['review',1],['friend',0],['third',2]]){const seat=RETREAT_SEATS.find(s=>s.siteId===STILLWATER.id&&s.index===index);Object.assign(sim.players.get(id),seat,{friendsSeat:{vehicleId:seat.siteId,index:seat.index},crouching:true});}
  const p=sim.players.get('review');bridge.renderer.yaw=Math.atan2(-Math.cos(p.angle),-Math.sin(p.angle));bridge.renderer.pitch=-.08;bridge.setFriendsEnvironment({hour:22,speed:0});
  sim.friends.retreats.state.lightsOn=true;const snapshot=sim.createSnapshot(),packets=[];replicaHost.update(snapshot);replicaHost.pump(['visual-guest'],0,(_id,p)=>{packets.push(Array.from(new Uint8Array(p)));return true;},message=>{throw Error(message);});return {packets,snapshot};
 });
 const guest=await browser.newPage({viewport:{width:1280,height:900}});
 guest.on('pageerror',e=>report.errors.push('guest: '+e.message));guest.on('console',m=>{if(m.type()==='error')report.errors.push('guest: '+m.text());});
 await guest.routeWebSocket(url=>url.searchParams.has('token'),socket=>{const server=socket.connectToServer();server.onMessage(message=>{try{if(JSON.parse(String(message)).type==='connected')socket.send(message);}catch{}});});
 await guest.route('**/__retreat_review',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><div id="world" style="width:100vw;height:100vh"></div></body></html>'}));
 await guest.goto(`${origin}/__retreat_review`);
 const acknowledgement=await guest.evaluate(async({packets,snapshot})=>{
  const {FriendsWorldGuest}=await import('/src/game/multiplayer/FriendsWorldReplication.ts');const {MultiplayerRendererBridge}=await import('/src/game/multiplayer/MultiplayerRendererBridge.ts');window.worldGuest=new FriendsWorldGuest(m=>window.ack=m,()=>{});for(const p of packets)worldGuest.receive(new Uint8Array(p).buffer,0);
  window.bridge=new MultiplayerRendererBridge('friends_frontier');bridge.mount(document.getElementById('world'));const p=snapshot.players.find(p=>p.id==='friend');bridge.renderer.yaw=Math.atan2(-Math.cos(p.angle),-Math.sin(p.angle));bridge.renderer.pitch=-.08;bridge.setFriendsEnvironment({hour:22,speed:0});return window.ack;
 },baseline);
 await page.evaluate(ack=>replicaHost.acknowledge('visual-guest',ack.epoch,ack.revision),acknowledgement);
 for(const on of [true,false]){
  const motion=await page.evaluate(on=>{sim.friends.retreats.state.lightsOn=on;sim.friends.retreats.state.switchBy=undefined;sim.friends.retreats.state.switchSerial++;for(let i=0;i<30;i++){sim.tick(50);bridge.render(sim.createSnapshot(),'review',33);}const motions=[];for(let i=0;i<80;i++){sim.tick(50);motions.push(replicaHost.motion('visual-guest',sim.createSnapshot()));}return motions;},on);
  const state=await guest.evaluate(async motions=>{let snapshot;for(const motion of motions){snapshot=worldGuest.decode(motion);window.guestSnapshot=snapshot;bridge.render(snapshot,'friend',50);await new Promise(requestAnimationFrame);}return {lightsOn:snapshot.friends.retreats.lightsOn,seat:snapshot.players.find(p=>p.id==='friend').friendsSeat,warm:bridge.frontierVisuals.retreats.warm.value,glError:bridge.renderer.renderer.getContext().getError()};},motion);
  assert.equal(state.lightsOn,on);assert.ok(Math.abs(state.warm-Number(on))<.001);assert.equal(state.glError,0);report.secondClient=state;
  await guest.screenshot({path:`${out}/guest-${on?'on':'off'}.png`});
 }
 await guest.close();
 console.log('Second-client replication checks complete');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedTextures,[]);assert.equal(report.glError,0);assert.equal(report.programsAfter,report.programsBefore,'Switches must not recompile shaders');
 console.log(JSON.stringify(report,null,2));
}finally{await writeFile(`${out}/checks.json`,JSON.stringify(report,null,2));await browser.close();}
