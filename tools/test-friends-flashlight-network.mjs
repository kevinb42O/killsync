import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const origin=process.env.FRIENDS_TEST_ORIGIN||'http://localhost:3000',directory='artifacts/shared-flashlights';
await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--disable-features=WebRtcHideLocalIpsWithMdns','--allow-loopback-in-peer-connection']});const report={errors:[]};
try{
  const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/__flashlight_network',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto(origin+'/__flashlight_network');
  report.network=await page.evaluate(async()=>{
    const {ManualWebRTCSession}=await import('/src/game/multiplayer/ManualWebRTCSession.ts');
    const {FriendsSimulation}=await import('/src/game/multiplayer/FriendsSimulation.ts');
    const {MULTIPLAYER_PROTOCOL_VERSION}=await import('/src/game/multiplayer/protocol.ts');
    const {quantizePitch}=await import('/src/game/multiplayer/CoopSimulation.ts');
    const seeds=[{id:'host',label:'Host',color:'#0ff'},{id:'guest',label:'Guest',color:'#f0f'}],sim=new FriendsSimulation(seeds);
    const errors=[],inputs=[],states=[];let tick=0,sequence=0,last,hostOn=false;
    const frame=(on,pitch=0)=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:++sequence,clientTime:Date.now(),
      movement:0,aimAngle:16384,aimPitch:quantizePitch(pitch),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,
      friendsFlashlight:on,friendsFlashlightCone:219});
    const host=new ManualWebRTCSession({role:'host',friends:true,iceServers:[],onInput:(_peer,input)=>{inputs.push(input);sim.setInput('guest',input);},onError:e=>errors.push(e)});
    const guest=new ManualWebRTCSession({role:'guest',friends:true,iceServers:[],onState:f=>{last=f.payload;states.push(f.tick);},onError:e=>errors.push(e)});
    let timer;
    const wait=async(test)=>{const deadline=performance.now()+12000;while(!test()){if(performance.now()>deadline)throw new Error('Timed out waiting for flashlight transport '+JSON.stringify({host:host.peerInfo,guest:guest.peerInfo,errors,states:states.length,inputs:inputs.length}));await new Promise(r=>setTimeout(r,20));}};
    try{
      await host.acceptAnswer(await guest.acceptOffer(await host.createOffer()));
      await wait(()=>host.connectedPeerCount===1&&guest.connectedPeerCount===1);
      host.admitFriendsPeer(host.peerInfo[0].peerId);
      timer=setInterval(()=>{
        sim.setInput('host',frame(hostOn,-.2));sim.tick(50);
        host.broadcastState({type:'state',version:MULTIPLAYER_PROTOCOL_VERSION,tick:++tick,sentAt:Date.now(),payload:sim.createSnapshot()});
      },50);
      await wait(()=>last?.players.length===2);
      guest.sendInput(frame(true,.4));await wait(()=>last?.players.find(p=>p.id==='guest')?.friendsFlashlight);
      const guestOn=last.players.find(p=>p.id==='guest').friendsFlashlight;
      guest.sendInput(frame(false));await wait(()=>!last?.players.find(p=>p.id==='guest')?.friendsFlashlight);
      const guestOff=!last.players.find(p=>p.id==='guest').friendsFlashlight;
      hostOn=true;await wait(()=>last?.players.find(p=>p.id==='host')?.friendsFlashlight);
      const hostBeam=last.players.find(p=>p.id==='host').friendsFlashlight;
      hostOn=false;await wait(()=>!last?.players.find(p=>p.id==='host')?.friendsFlashlight);
      return {guestOn,guestOff,hostBeam,hostOff:!last.players.find(p=>p.id==='host').friendsFlashlight,
        receivedInputs:inputs.length,receivedSnapshots:states.length,errors,transport:'actual local WebRTC + Friends world sync + compact snapshot deltas'};
    }finally{clearInterval(timer);guest.close();host.close();}
  });
  assert(report.network.guestOff&&report.network.hostOff);assert(Math.abs(report.network.guestOn.pitch-.4)<.001);assert(Math.abs(report.network.hostBeam.pitch+.2)<.001);
  assert.deepEqual(report.network.errors,[]);assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=String(error);throw error;}
finally{await writeFile(directory+'/network-checks.json',JSON.stringify(report,null,2));await browser.close();}
