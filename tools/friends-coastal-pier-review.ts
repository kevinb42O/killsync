import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {FriendsHUD} from '../src/components/FriendsHUD';
import {FriendsFishingBoatHelmCamera} from '../src/game/rendering/FriendsFishingBoatHelmCamera';
import {FriendsVehicleCamera} from '../src/game/rendering/FriendsVehicleCamera';
import '../src/components/multiplayer.css';
import { vehicleWorldPoint,vehicleLocalPoint } from '../src/game/multiplayer/FriendsVehiclePose';
import { createFriendsCharacterRig, placeFriendsCharacter, updateFriendsCharacter } from '../src/game/rendering/FriendsCharacterVisuals';
import { quantizeAngle,quantizePitch } from '../src/game/multiplayer/CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from '../src/game/multiplayer/protocol';
import * as THREE from 'three';
import { FriendsFrontierVisuals } from '../src/game/rendering/FriendsFrontierVisuals';
import { FriendsVehicleVisuals, createFriendsEnvironment } from '../src/game/rendering/FriendsWorldVisuals';
import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation';
import { fishingBoatHeave, fishingBoatPitch, FISHING_BOAT_DECK, FISHING_BOAT_HELM } from '../src/game/world/FriendsFishingBoat';
import { ISLAND_SEA_LEVEL } from '../src/game/world/FriendsWaterBodies';
import { FRIENDS_COASTAL_PIER } from '../src/game/world/FriendsCoastalPier';
import { FRIENDS_SEASIDE_PIER, PIER_CAFE_CHAIRS } from '../src/game/world/FriendsSeasidePier';

const scene=new THREE.Scene();scene.background=new THREE.Color('#aec4bd');scene.fog=new THREE.FogExp2('#aec4bd',.000009);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,2,32000),viewmodel=new THREE.Scene();
const sun=new THREE.DirectionalLight('#ffe6c4',1.85),ambient=new THREE.AmbientLight('#e1f4e5',.65),fill=new THREE.HemisphereLight('#c7e9ff','#778361',.6);sun.position.set(7700,2300,4400);scene.add(sun,sun.target,ambient,fill,createFriendsEnvironment());
const vehicles=new FriendsVehicleVisuals(scene);
const world=new FriendsFrontierVisuals(scene,viewmodel,renderer,camera,{sun,ambient,fill});
const sim=new FriendsSimulation([{id:'review',label:'Review',color:'#78cabc'}]),snapshot=sim.createSnapshot(),p=FRIENDS_SEASIDE_PIER;
const seat=PIER_CAFE_CHAIRS[3],guest=sim['players'].get('review')!;
Object.assign(guest,{x:seat.x,y:seat.y,z:seat.exit.z,angle:seat.angle});
sim.setInput(guest.id,{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:50,movement:0,aimAngle:quantizeAngle(seat.angle),aimPitch:quantizePitch(0),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,interactActionId:1});sim.tick(50);
const rig=createFriendsCharacterRig('#78cabc','Café guest');scene.add(rig.root);
const seated=sim.createSnapshot().players[0];
function point(along:number,across:number,height:number){return new THREE.Vector3(p.x+Math.cos(p.angle)*along-Math.sin(p.angle)*across,p.deck+height,p.y+Math.sin(p.angle)*along+Math.cos(p.angle)*across);}
function setView(view:string){
  if(view==='entrance'){camera.position.copy(point(p.length-510,0,52));camera.lookAt(point(p.length+100,0,40));}
  else if(view==='seated'){camera.position.copy(point(seat.along-70,seat.across-80,42));camera.lookAt(point(seat.along,seat.across,30));}
  else if(view==='supports'){camera.position.copy(point(p.length-650,850,-1650));camera.lookAt(point(p.length,400,-1900));}
  else if(view==='deck'){camera.position.copy(point(600,0,52));camera.lookAt(point(p.length,0,130));}
  else if(view==='landing'){camera.position.copy(point(-140,300,-30));camera.lookAt(point(700,0,0));}
  else if(view==='pavilion'){camera.position.copy(point(p.length-700,850,320));camera.lookAt(point(p.length,0,150));}
  else if(view==='inside'){camera.position.copy(point(p.length-250,0,52));camera.lookAt(point(p.length+300,160,80));}
  else if(view==='dock-entry'){camera.position.set(2800,120,6090);camera.lookAt(2660,-50,5800);}
  else if(view==='dock-walking'){camera.position.set(2912,52,5800);camera.lookAt(2160,-46,5800);}
  else if(view==='mooring'){camera.position.set(1860,-20,6120);camera.lookAt(1760,-108,5970);}
  else if(view==='boat'){const d=FRIENDS_COASTAL_PIER;camera.position.set(d.x-1412,80,d.y-450);camera.lookAt(d.x-1002,-55,d.y);}
  else if(view==='dock'){const d=FRIENDS_COASTAL_PIER;camera.position.set(d.x-550,d.deck+560,d.y-860);camera.lookAt(d.x-600,d.deck,d.y);}
  else{camera.position.copy(point(1600,3100,1700));camera.lookAt(point(1900,0,90));}
}
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-view]'))b.onclick=()=>setView(b.dataset.view!);
let paused=false,boatLive=false,boatSequence=2,boatAim=Math.PI;
const helmCamera=new FriendsFishingBoatHelmCamera(),chaseCamera=new FriendsVehicleCamera(),helmLook={yaw:0,pitch:0};
let boatThirdPerson=false;
const hudContainer=document.createElement('div');document.body.append(hudContainer);const hud=createRoot(hudContainer);
function updateBoatHUD(){const snapshot=sim.createSnapshot();hud.render(boatLive?createElement(FriendsHUD,{snapshot,player:snapshot.players[0],interactionLabel:'F',boatThirdPerson,onToggleBoatView:toggleBoatView}):null);}
function toggleBoatView(){boatThirdPerson=helmCamera.toggle();helmView();updateBoatHUD();}
function boatCommand(movement:number,interactActionId:number,tool:6|7=6,firing=false,fireActionId=0){
  sim.setInput('review',{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:++boatSequence,clientTime:boatSequence*50,movement,aimAngle:quantizeAngle(boatAim),aimPitch:quantizePitch(-.3),selectedSlot:0,friendsTool:tool,firing,fireActionId,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,interactActionId});sim.tick(50);
}
function helmView(){
  const v=sim.createSnapshot().friends!.vehicles.find(v=>v.kind==='fishingBoat')!;
  boatThirdPerson=helmCamera.update(helmLook,v.pilotId?v:undefined);
  if(boatThirdPerson){chaseCamera.update(camera,v,helmLook.yaw,helmLook.pitch,16);rig.root.visible=true;return;}
  chaseCamera.reset();
  const ahead=vehicleWorldPoint(v,{...vehicleLocalPoint(v,guest),x:vehicleLocalPoint(v,guest).x+150});
  camera.position.set(guest.x,guest.z+50,guest.y);camera.lookAt(ahead.x,guest.z+43,ahead.y);rig.root.visible=false;
}
function sailBoat(){
  boatLive=true;guest.friendsSeat=undefined;
  // Discard the presentation-only wave pose before placing the simulated sailor.
  sim.tick(50);
  Object.assign(guest,vehicleWorldPoint(sim.createSnapshot().friends!.vehicles.find(v=>v.kind==='fishingBoat')!,FISHING_BOAT_HELM),{verticalVelocity:0,swimming:false});
  boatCommand(0,2);for(let i=0;i<100;i++)boatCommand(5,2);helmView();updateBoatHUD();
}
function steerBoat(movement:number){for(let i=0;i<15;i++)boatCommand(movement,2);helmView();}
function stopBoat(){const v=sim.createSnapshot().friends!.vehicles.find(v=>v.kind==='fishingBoat')!,before=vehicleLocalPoint(v,guest);boatCommand(0,3);helmView();updateBoatHUD();return {before,after:vehicleLocalPoint(sim.createSnapshot().friends!.vehicles.find(v=>v.kind==='fishingBoat')!,guest)};}
function castFromBoat(){
  for(const waypoint of [{x:32,y:0,z:0},{x:-50,y:0,z:0},{x:-50,y:42,z:0},{x:-165,y:42,z:0}])for(let n=0;n<180;n++){
    const v=sim.createSnapshot().friends!.vehicles.find(v=>v.kind==='fishingBoat')!,target=vehicleWorldPoint(v,waypoint);
    if(Math.hypot(target.x-guest.x,target.y-guest.y)<5)break;
    boatAim=Math.atan2(target.y-guest.y,target.x-guest.x);boatCommand(1,3,7);
  }
  const v=sim.createSnapshot().friends!.vehicles.find(v=>v.kind==='fishingBoat')!;boatAim=v.angle+Math.PI/2;
  for(let i=0;i<25;i++)boatCommand(0,3,7,true,1);boatCommand(0,3,7,false,1);
  camera.position.set(guest.x,guest.z+50,guest.y);camera.lookAt(guest.x+Math.cos(boatAim)*300,guest.z+5,guest.y+Math.sin(boatAim)*300);
}

function frame(now:number){requestAnimationFrame(frame);if(paused)return;const state=sim.createSnapshot().friends!;const boat=state.vehicles.find(v=>v.kind==='fishingBoat')!;if(!boatLive){boat.z=ISLAND_SEA_LEVEL+FISHING_BOAT_DECK+fishingBoatHeave(boat.x,boat.y,now/1000);boat.pitch=fishingBoatPitch(now/1000);}vehicles.update(state,now,camera.position);world.setSeagullVehicles(state.vehicles);world.update(snapshot.friends!.frontier,camera.position.x,camera.position.z,now,0,false,[],180000,false);const character=boatLive?sim.createSnapshot().players[0]:seated;placeFriendsCharacter(rig,character);updateFriendsCharacter(rig,character,now);rig.root.visible=!boatLive||boatThirdPerson;renderer.render(scene,camera);}
setView('overview');requestAnimationFrame(frame);
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
(window as any).coastalPierReview={scene,renderer,camera,world,sim,rig,p,setView,sailBoat,toggleBoatView,steerBoat,stopBoat,castFromBoat,boatCommand,helmView,pause:()=>paused=true};
