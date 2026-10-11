import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({headless:true,args:['--disable-features=WebRtcHideLocalIpsWithMdns','--allow-loopback-in-peer-connection']});
try{
  const page=await browser.newPage(),origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3014';
  await page.route('**/__soaring_network',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));await page.goto(origin+'/__soaring_network');
  const report=await page.evaluate(async()=>{
    const {ManualWebRTCSession}=await import('/src/game/multiplayer/ManualWebRTCSession.ts');
    const {FriendsSimulation}=await import('/src/game/multiplayer/FriendsSimulation.ts');
    const {FriendsTerrain}=await import('/src/game/world/FriendsTerrain.ts');
    const {SOARING_LAUNCHES,soaringWind}=await import('/src/game/world/FriendsSoaringWeather.ts');
    const {quantizeAngle,quantizePitch}=await import('/src/game/multiplayer/CoopSimulation.ts');
    const {MULTIPLAYER_PROTOCOL_VERSION}=await import('/src/game/multiplayer/protocol.ts');
    const errors=[],checks=[],states=[],clients=[];
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#8de6ce'},{id:'guest',label:'Pilot',color:'#ff8899'}]);
    const p=sim['players'].get('guest'),spot=SOARING_LAUNCHES[0],terrain=new FriendsTerrain();Object.assign(p,{x:spot.x,y:spot.y,z:terrain.surfaceHeight(spot.x,spot.y),verticalVelocity:0});
    const host=new ManualWebRTCSession({role:'host',friends:true,iceServers:[],onInput:(_,frame)=>sim.setInput('guest',frame),onError:e=>errors.push(e)});
    let sequence=0,tick=0,mask=0,send=true;
    const wait=async(fn)=>{const until=performance.now()+15000;while(!fn()){if(performance.now()>until)throw new Error('Soaring network timeout '+JSON.stringify({checks,errors,phase:p.friendsSoaring?.phase,message:p.friendsSoaring?.message}));await new Promise(r=>setTimeout(r,20));}};
    const connect=async(index)=>{const guest=new ManualWebRTCSession({role:'guest',friends:true,iceServers:[],onState:f=>states[index]=f.payload,onError:e=>errors.push(e)});clients.push(guest);await host.acceptAnswer(await guest.acceptOffer(await host.createOffer()));await wait(()=>host.connectedPeerCount===index+1&&guest.connectedPeerCount===1);for(const peer of host.peerInfo)host.admitFriendsPeer(peer.peerId);await wait(()=>states[index]?.players.length===2);};
    const timer=setInterval(()=>{
      if(clients[0]?.connectedPeerCount&&send)clients[0].sendInput({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:++sequence,clientTime:Date.now(),movement:mask,aimAngle:quantizeAngle(soaringWind(0).angle+Math.PI),aimPitch:quantizePitch(0),selectedSlot:0,friendsTool:13,friendsGlider:true,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});
      sim.tick(1000/30);host.broadcastState({type:'state',version:MULTIPLAYER_PROTOCOL_VERSION,tick:++tick,sentAt:Date.now(),payload:sim.createSnapshot()});
    },1000/30);
    try{
      await connect(0);await wait(()=>states[0].players[1].friendsSoaring?.phase==='ready');checks.push('Guest equipment intent inflates on the authoritative host');
      mask=1;await wait(()=>states[0].players[1].friendsSoaring?.phase==='flying');mask=0;checks.push('Guest performs a real mountain foot launch through WebRTC input');
      const oldY=p.y;await wait(()=>Math.hypot(p.y-oldY,p.x-spot.x)>100);checks.push('Trimmed flight continues without held forward input');
      await connect(1);await wait(()=>states[1].players[1].friendsSoaring?.phase==='flying');checks.push('Late joiner receives the airborne wing and complete flight pose');
      await wait(()=>p.friendsSoaring.agl>=12);
      mask=8;await wait(()=>states[0].players[1].friendsSoaring?.bank>.4);checks.push('Bank and wing heading replicate independently of camera look');
      send=false;await wait(()=>Math.abs(p.friendsSoaring.bank)<.08);checks.push('Stale network input returns to trimmed flight without cutting the wing');
      return {checks,errors,protocol:MULTIPLAYER_PROTOCOL_VERSION,receivedTicks:states.map(s=>s.tick),transport:'actual local WebRTC + Friends world baseline + motion deltas'};
    }finally{clearInterval(timer);clients.forEach(c=>c.close());host.close();}
  });
  assert.deepEqual(report.errors,[]);assert.equal(report.checks.length,6);await writeFile('artifacts/soaring-polish/network-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
