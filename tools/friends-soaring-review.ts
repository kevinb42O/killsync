import { friendsAudio } from '../src/game/FriendsAudio';
import { FriendsFunBar } from '../src/components/FriendsFunBar';
import { gliderEquipmentLocked } from '../src/game/multiplayer/FriendsGliderControls';
import { createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { FriendsSoaringHUD } from '../src/components/FriendsSoaringHUD';
import '../src/components/frontier.css';
import { MultiplayerRendererBridge } from '../src/game/multiplayer/MultiplayerRendererBridge';
import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation';
import { createSoaringState } from '../src/game/multiplayer/FriendsSoaring';
import { SOARING_LAUNCHES,soaringWind } from '../src/game/world/FriendsSoaringWeather';
import { quantizeAngle,quantizePitch } from '../src/game/multiplayer/CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from '../src/game/multiplayer/protocol';
const releaseAudio=friendsAudio.acquire();addEventListener('pagehide',releaseAudio,{once:true});
const sim=new FriendsSimulation([{id:'pilot',label:'You',color:'#8de6ce'},{id:'friend',label:'Amber',color:'#f4bf73'},{id:'friend2',label:'Rose',color:'#ed82a5'}]);
const bridge=new MultiplayerRendererBridge('friends_frontier');bridge.mount(document.getElementById('world')!);bridge.setFriendsTool(6,false);
const r=bridge['renderer'],terrain=sim['friendsFrontier'].terrain;
const root=createRoot(document.getElementById('hud')!);
let selectedTool=13;let view='forward',seq=0,equipped=true,live=false,aim=0,paused=false;const keys=new Set<string>();
function seedFlight(volcano=false){
  const spot=volcano?{x:33400,y:33300}:SOARING_LAUNCHES[0];
  for(const [i,p] of [...sim['players'].values()].entries()){
    const x=spot.x+i*150,y=spot.y+i*240,z=terrain.surfaceHeight(x,y)+550;
    Object.assign(p,{x,y,z,verticalVelocity:0,velocityX:0,velocityY:0,friendsSoaring:{...createSoaringState(Math.PI/2),phase:'flying',inflation:1,airspeed:9.5,message:'Gliding · search for lift',bank:i?.25:0,agl:550/12,climb:1.3,lift:2.35}});
  }
  equipped=true;selectedTool=13;live=false;aim=Math.PI/2;
}
function setView(next:string){view=next;
  if(next==='launch'){
    const p=sim['players'].get('pilot')!,spot=SOARING_LAUNCHES[0];Object.assign(p,{x:spot.x,y:spot.y,z:terrain.surfaceHeight(spot.x,spot.y),verticalVelocity:0,velocityX:0,velocityY:0,friendsSoaring:undefined});
    equipped=true;selectedTool=13;live=true;aim=soaringWind(sim.createSnapshot().elapsedMs).angle+Math.PI;
  }else if(next==='volcano')seedFlight(true);else if(!sim['players'].get('pilot').friendsSoaring||live)seedFlight();
}
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-view]'))b.onclick=()=>setView(b.dataset.view!);
function selectTool(tool:number){if(gliderEquipmentLocked(sim.createSnapshot().players[0]))return;selectedTool=tool;equipped=tool===13;bridge.setFriendsTool(tool as any,false);}
function toggle(){selectTool(equipped?8:13);}
addEventListener('keydown',e=>{if(e.target instanceof HTMLButtonElement)return;keys.add(e.code);if(e.code==='KeyL'&&!e.repeat)toggle();if(e.code==='Space')e.preventDefault();});addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
let previous=0,acc=0,frames=0;
function frame(now:number){requestAnimationFrame(frame);if(paused)return;const dt=Math.min(40,previous?now-previous:16);previous=now;
  if(live){acc+=dt;while(acc>=1000/30){acc-=1000/30;sim.setInput('pilot',{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:++seq,clientTime:now,movement:(keys.has('KeyW')?1:0)|(keys.has('KeyS')?2:0)|(keys.has('KeyA')?4:0)|(keys.has('KeyD')?8:0),aimAngle:quantizeAngle(aim),aimPitch:quantizePitch(0),selectedSlot:0,friendsTool:selectedTool as any,friendsGlider:equipped,firing:false,sprinting:keys.has('ShiftLeft'),sliding:false,reviving:false,jumpPressed:false,jetHeld:keys.has('Space'),dashPressed:false});sim.tick(1000/30);}}
  const snapshot=sim.createSnapshot(),p=snapshot.players[0];
  if(frames>0){r.yaw=-aim-Math.PI/2;r.pitch=view==='up'?1.18:view==='crew'?.12:-.16;}
  bridge.render(snapshot,view==='crew'?'friend':'pilot',dt,null,true);
  // This review opens directly in flight; the production arrival sequence is
  // separately covered by the spawn-camera browser tests.
  if(bridge['friendsWorldArrival'])bridge['friendsWorldArrival'].sequence.active=false;
  root.render(createElement(Fragment,null,
    createElement(FriendsSoaringHUD,{player:p,timeMs:snapshot.elapsedMs,equipped}),
    createElement(FriendsFunBar,{visible:selectedTool!==6,tool:selectedTool,onStone:()=>selectTool(8),onSeeds:()=>selectTool(9),onMarshmallow:()=>selectTool(10),onConfetti:()=>selectTool(11),onDynamite:()=>selectTool(12),onGlider:toggle,onClose:()=>selectTool(6),equipmentLocked:gliderEquipmentLocked(p)})));frames++;
}
seedFlight();requestAnimationFrame(frame);
(window as any).soaringReview={sim,bridge,renderer:r.renderer,camera:r.camera,scene:r.scene,audio:friendsAudio,setView,seedFlight,get frames(){return frames;},get live(){return live;},setLive:(v:boolean)=>live=v,pause:()=>paused=true};
