import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014',directory=process.env.FISHING_ARTIFACT_DIR||'artifacts/fishing';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--disable-background-timer-throttling','--disable-features=WebRtcHideLocalIpsWithMdns','--allow-loopback-in-peer-connection']}),report={errors:[],captures:[],framing:[],performance:{}};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});await page.routeWebSocket(/.*/,ws=>ws.close());page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('[vite] failed to connect to websocket'))report.errors.push(m.text());});
  await page.goto(origin+'/tools/friends-fishing-review.html');await page.waitForFunction(()=>window.fishingReview?.fishing.rods.get('review')?.tip);await page.waitForTimeout(1500);
  for(const stage of ['rod','waiting','bite','reeling','held','dry','swimming']){
    await page.evaluate(s=>fishingReview.setStage(s),stage);await page.waitForTimeout(450);await page.screenshot({path:`${directory}/${stage}.png`});
    const result=await page.evaluate(()=>({gl:fishingReview.renderer.getContext().getError(),calls:fishingReview.renderer.info.render.calls}));assert.equal(result.gl,0);report.captures.push({stage,...result});
  }
  for(const size of [.45,1.2,4.2]){await page.evaluate(size=>{fishingReview.setStage('held');fishingReview.setSize(size);},size);await page.waitForTimeout(500);await page.screenshot({path:`${directory}/held-${size}.png`});assert((await page.locator('.friends-fishing-log').innerText()).includes('cm'));}
  report.assets=await page.evaluate(async()=>{const source=await fishingReview.loadFishingFish();let meshes=0,bones=0,finSides=0;source.root.traverse(o=>{if(o.isSkinnedMesh){meshes++;bones=o.skeleton.bones.length;finSides=o.material.side;}});return {fishMeshes:meshes,bones,finSides,clips:source.clips.map(c=>c.name)};});assert.equal(report.assets.fishMeshes,1);assert.equal(report.assets.bones,6);assert.equal(report.assets.finSides,2);
  await page.evaluate(()=>fishingReview.setStage('waiting'));await page.waitForFunction(()=>fishingReview.fishing.rods.get('review')?.tip);await page.evaluate(()=>fishingReview.pause());
  report.audio=await page.evaluate(async()=>{
    const {FRIENDS_CUE_ASSETS}=await import('/src/game/FriendsAudio.ts'),friendsAudio=fishingReview.audio,ctx=new AudioContext(),assets=[];
    try{for(const cue of ['fishingCast','fishingSplash','fishingReel']){
      const response=await fetch(FRIENDS_CUE_ASSETS[cue][0]);if(!response.ok)throw Error('Missing fishing recording '+cue);
      const decoded=await ctx.decodeAudioData(await response.arrayBuffer());assets.push({cue,duration:decoded.duration,channels:decoded.numberOfChannels});
    }}finally{await ctx.close();}
    const r=fishingReview,events=[],original=friendsAudio.play;let stops=0;
    friendsAudio.play=(cue,...args)=>{events.push({cue,args});return {stop:()=>stops++};};
    const state=phase=>({equipped:['review'],fish:[],casts:phase?[{...r.player,id:987,playerId:'review',target:{x:r.player.x-240,y:r.player.y,z:156.5},from:{...r.player},phase,atMs:1000,biteAt:20000,size:1,lineLength:280}]:[]});
    const update=(phase,now)=>r.fishing.update(state(phase),[r.player],'review',7,r.camera,now,16,true,r.project,()=>false);
    try{update(undefined,1000);update('casting',1000);update('waiting',1650);update('bite',1800);update('reeling',1000);
      for(let i=1;i<=90;i++)update('reeling',1000+i*16);
      update(undefined,2500);
    }finally{friendsAudio.play=original;}
    return {assets,events,stops};
  });
  assert(report.audio.assets.every(a=>a.duration>0&&a.channels===1));
  assert.equal(report.audio.events.filter(e=>e.cue==='fishingReel').length,1);assert.equal(report.audio.stops,1);
  assert.deepEqual(report.audio.events.map(e=>e.cue),['fishingCast','fishingSplash','fishingBite','fishingReel']);
  report.framing=await page.evaluate(()=>{
    const r=fishingReview,v=new r.THREE.Vector3(),checks=[];
    for(const aspect of [16/9,2.4,9/16])for(const fov of [70,98,120]){
      r.camera.aspect=r.handCamera.aspect=aspect;r.handCamera.fov=fov;r.camera.updateProjectionMatrix();r.handCamera.updateProjectionMatrix();
      for(let i=0;i<20;i++)r.fishing.update(r.state(),[r.player],'review',7,r.camera,1000+i*16,16,true,r.project,()=>false);
      const rod=r.fishing.rods.get('review'),tip=rod.tip.getWorldPosition(v).project(r.handCamera),anchor=rod.line.points[0].clone().project(r.camera);
      checks.push({aspect,fov,gap:Math.hypot(tip.x-anchor.x,tip.y-anchor.y),finite:[...rod.line.geometry.getAttribute('position').array].every(Number.isFinite)});
    }r.camera.aspect=r.handCamera.aspect=innerWidth/innerHeight;r.handCamera.fov=98;r.camera.updateProjectionMatrix();r.handCamera.updateProjectionMatrix();return checks;
  });assert(report.framing.every(c=>c.finite&&c.gap<1e-6));
  report.toolbar=await page.locator('.frontier-toolbelt').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,slots:el.querySelectorAll('button').length}));assert.equal(report.toolbar.slots,8);assert(report.toolbar.height<75);
  await page.setViewportSize({width:360,height:740});await page.waitForTimeout(100);report.mobile=await page.locator('.frontier-toolbelt__slots').evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,minTarget:Math.min(...[...el.querySelectorAll('button')].map(b=>b.getBoundingClientRect().width))}));assert(report.mobile.width<=332&&report.mobile.minTarget>=44);await page.screenshot({path:directory+'/compact-mobile.png'});await page.setViewportSize({width:1440,height:900});
  report.performance=await page.evaluate(async()=>{
    const r=fishingReview,{renderer,camera,handCamera,fishing}=r,gl=renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),results={};
    const p=(a,q)=>a.length?a.sort((a,b)=>a-b)[Math.floor((a.length-1)*q)]:null;
    const draw=()=>{renderer.info.reset();renderer.autoClear=true;renderer.render(r.scene,camera);renderer.autoClear=false;renderer.clearDepth();renderer.render(r.viewmodel,handCamera);};
    for(const [name,lines,count]of [['one_cast',1,0],['five_casts',5,0],['loose_fish_cap',0,32]]){
      const players=Array.from({length:Math.max(1,lines)},(_,i)=>({...r.player,id:i?'guest'+i:'review',x:r.player.x-i*65,y:r.player.y+i*60}));
      const state={equipped:players.slice(0,lines).map(p=>p.id),casts:players.slice(0,lines).map((p,i)=>({id:i+1,playerId:p.id,phase:'waiting',atMs:0,biteAt:1e9,size:1,from:{x:p.x,y:p.y,z:p.z},target:{x:p.x-240,y:p.y,z:156.5},x:p.x-240,y:p.y,z:156.5})),fish:Array.from({length:count},(_,i)=>({id:100+i,size:1,phase:'dry',atMs:0,x:r.player.x-40-(i%8)*20,y:r.player.y+Math.floor(i/8)*20,z:r.player.z,angle:0,vx:0,vy:0,vz:0}))};
      fishing.update(state,players,'review',7,camera,1000,16,true,r.project,()=>false);await new Promise(resolve=>setTimeout(resolve,400));
      const buckets=[{cpu:[],queries:[],calls:0},{cpu:[],queries:[],calls:0}];
      for(let i=0;i<160;i++){
        const active=i%2===1,b=buckets[Number(active)],now=2000+i*16;
        const start=performance.now();if(active)fishing.update(state,players,'review',7,camera,now,16,true,r.project,()=>false);if(i>=20)b.cpu.push(performance.now()-start);
        fishing.group.visible=active;fishing.held.visible=false;for(const rod of fishing.rods.values())rod.root.visible=active;fishing.lighting.setVisible(active&&lines>0);
        let query;if(timer&&i>=20){query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);}draw();if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);b.queries.push(query);}b.calls=renderer.info.render.calls;
        await new Promise(requestAnimationFrame);
      }
      const summary=b=>{const gpu=[];if(timer&&!gl.getParameter(timer.GPU_DISJOINT_EXT))for(const q of b.queries){if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}return {cpuP50:p(b.cpu,.5),cpuP95:p(b.cpu,.95),gpuP50:p(gpu,.5),gpuP95:p(gpu,.95),calls:b.calls};};
      results[name]={baseline:summary(buckets[0]),active:summary(buckets[1]),fishPool:fishing.pool.length,activeFish:fishing.fishes.size};
      assertFinite();
    }
    function assertFinite(){if(gl.getError())throw Error('Fishing stress WebGL error');}
    const geometries=renderer.info.memory.geometries,textures=renderer.info.memory.textures;
    // Repeated identities reuse the same presentations and skeletons.
    for(let cycle=0;cycle<30;cycle++){
      fishing.update({equipped:[],casts:[],fish:[]},[r.player],'review',7,camera,10000+cycle*32,16,true,r.project,()=>false);
      fishing.update({equipped:[],casts:[],fish:Array.from({length:32},(_,i)=>({id:1000+cycle*32+i,size:1,phase:'dry',atMs:0,x:r.player.x-i,y:r.player.y,z:r.player.z,angle:0,vx:0,vy:0,vz:0}))},[r.player],'review',7,camera,10016+cycle*32,16,true,r.project,()=>false);draw();
    }
    results.memory={before:{geometries,textures},after:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},presentations:fishing.fishes.size+fishing.pool.length};return results;
  });assert(report.performance.memory.presentations<=33);assert.equal(report.performance.memory.after.geometries,report.performance.memory.before.geometries);assert.equal(report.performance.memory.after.textures,report.performance.memory.before.textures);
  report.network=await page.evaluate(async()=>{
    const {ManualWebRTCSession}=await import('/src/game/multiplayer/ManualWebRTCSession.ts'),{FriendsSimulation,}=await import('/src/game/multiplayer/FriendsSimulation.ts'),{quantizePitch}=await import('/src/game/multiplayer/CoopSimulation.ts'),{MULTIPLAYER_PROTOCOL_VERSION:version}=await import('/src/game/multiplayer/protocol.ts');
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#0ff'},{id:'guest',label:'Guest',color:'#f0f'}]);let latest,sequence=0,action=0,alt=0;const errors=[];
    const host=new ManualWebRTCSession({role:'host',friends:true,iceServers:[],onInput:(_peer,input)=>sim.setInput('guest',input),onError:e=>errors.push(e)}),guest=new ManualWebRTCSession({role:'guest',friends:true,iceServers:[],onState:f=>latest=f.payload,onError:e=>errors.push(e)});
    const wait=async(test)=>{const deadline=performance.now()+45000;while(!test()){if(performance.now()>deadline)throw Error('Fishing network timeout '+JSON.stringify({errors,fishing:latest?.friends?.fishing}));await new Promise(r=>setTimeout(r,20));}};
    let timer;
    try{
      await host.acceptAnswer(await guest.acceptOffer(await host.createOffer()));await wait(()=>host.connectedPeerCount===1&&guest.connectedPeerCount===1);host.admitFriendsPeer(host.peerInfo[0].peerId);
      const p=sim.players.get('guest');Object.assign(p,{x:12128,y:23600,z:224,verticalVelocity:0,friendsDevFlight:false});sim.friendsFrontier.terrain.set(Math.floor(p.x/32),Math.floor(p.y/32),6,2);
      timer=setInterval(()=>{guest.sendInput({type:'input',version,sequence:++sequence,clientTime:Date.now(),movement:0,aimAngle:0,aimPitch:quantizePitch(-.3),friendsTool:7,selectedSlot:0,fireActionId:action,altFireActionId:alt,firing:action>0,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});sim.tick(50);host.broadcastState({type:'state',version,tick:sequence,sentAt:Date.now(),payload:sim.createSnapshot()});},50);
      await wait(()=>latest?.friends?.fishing?.equipped.includes('guest'));action=1;await wait(()=>latest?.friends?.fishing?.casts[0]?.phase==='bite');action=2;await wait(()=>latest?.friends?.fishing?.fish.some(f=>f.ownerId==='guest'));
      const held=latest.friends.fishing.fish[0];if(!Number.isFinite(held.atMs))throw Error('Fish timestamp lost in transport');alt=1;await wait(()=>latest?.friends?.fishing?.fish[0]?.phase==='dry');
      if(sim.friends.fishing.pickup(p,7,sim.elapsedMs)!==true)throw Error('Network catch pickup failed');await wait(()=>latest?.friends?.fishing?.fish[0]?.phase==='held');action=3;await wait(()=>latest?.friends?.fishing?.fish[0]?.phase==='swimming');
      return {catch:true,drop:true,pickup:true,swimAway:true,errors};
    }finally{clearInterval(timer);host.close();guest.close();}
  });assert.deepEqual(report.network.errors,[]);assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify({assets:report.assets,toolbar:report.toolbar,mobile:report.mobile,audio:report.audio,performance:report.performance,network:report.network,errors:report.errors},null,2));
}finally{await writeFile(directory+'/validation.json',JSON.stringify(report,null,2));await browser.close();}
