import * as THREE from 'three';
import { createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/components/frontier.css';
import { FriendsFishingCatchLog } from '../src/components/FriendsFishingCatchLog';
import { FriendsToolbelt } from '../src/components/FriendsFieldPack';
import { friendsAudio } from '../src/game/FriendsAudio';
import { FriendsFishingVisuals } from '../src/game/rendering/FriendsFishingVisuals';
import { loadFishingFish } from '../src/game/rendering/FriendsFishingAssets';
import { FriendsFrontierVisuals } from '../src/game/rendering/FriendsFrontierVisuals';
import { createFriendsEnvironment } from '../src/game/rendering/FriendsWorldVisuals';
import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation';
import { Renderer3D } from '../src/game/Renderer3D';
import type { FishingSnapshot } from '../src/game/multiplayer/FriendsFishing';
import { friendsWaterAt } from '../src/game/world/FriendsWaterSurface';
import { FriendsTerrain } from '../src/game/world/FriendsTerrain';

const scene=new THREE.Scene();scene.background=new THREE.Color('#aec4bd');scene.fog=new THREE.FogExp2('#aec4bd',.000009);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(85,innerWidth/innerHeight,2,32000),handCamera=new THREE.PerspectiveCamera(98,innerWidth/innerHeight,.025,1000),viewmodel=new THREE.Scene();viewmodel.add(handCamera);
const sun=new THREE.DirectionalLight('#ffe6c4',1.85),ambient=new THREE.AmbientLight('#e1f4e5',.65),fill=new THREE.HemisphereLight('#c7e9ff','#778361',.6);sun.position.set(7700,2300,4400);scene.add(sun,sun.target,ambient,fill,createFriendsEnvironment());
const terrain=new FriendsTerrain(),p={x:14580,y:23600,z:terrain.surfaceHeight(14580,23600)};
const world=new FriendsFrontierVisuals(scene,viewmodel,renderer,camera,{sun,ambient,fill}),sim=new FriendsSimulation([{id:'review',label:'Review',color:'#78cabc'}]),snapshot=sim.createSnapshot();
const player=snapshot.players[0];Object.assign(player,{...p,angle:Math.PI});
const fishing=new FriendsFishingVisuals(scene,viewmodel),root=createRoot(document.getElementById('toolbar')!);
const target={x:p.x-240,y:p.y,z:(friendsWaterAt(p.x-240,p.y)?.level??154.5)+2};
let stage='rod',time=0,state:FishingSnapshot={equipped:['review'],casts:[],fish:[]};
const projector={camera,viewmodelCamera:handCamera,tempMuzzlePos:new THREE.Vector3(),tempMuzzleNdc:new THREE.Vector3(),tempMuzzleNdc2:new THREE.Vector2(),tempRaycaster:new THREE.Raycaster()} as unknown as Renderer3D;
function setStage(value:string){
  stage=value;camera.fov=85;camera.position.set(p.x,p.z+32,p.y);camera.lookAt(target.x,target.z,target.y);camera.updateProjectionMatrix();
  state={equipped:['review'],casts:[],fish:[]};
  if(['waiting','bite','reeling'].includes(value))state.casts=[{id:1,playerId:'review',...target,target:{...target},from:{...target},phase:value as 'waiting'|'bite'|'reeling',atMs:time,biteAt:time+10000,size:1.2,lineLength:Math.hypot(p.x-target.x,p.z+26-target.z)+24}];
  if(['held','dry','swimming'].includes(value)){
    state.equipped=[];state.fish=[{id:1,size:1.2,phase:value as 'held'|'dry'|'swimming',ownerId:value==='held'?'review':undefined,caughtBy:'review',x:value==='dry'?p.x-35:target.x,y:p.y,z:value==='dry'?terrain.surfaceHeight(p.x-35,p.y)+9.6:target.z+3.6,angle:Math.PI,atMs:time,vx:0,vy:0,vz:0}];
    if(value==='dry'){camera.position.set(p.x+20,p.z+50,p.y+45);camera.lookAt(p.x-35,terrain.surfaceHeight(p.x-35,p.y)+3,p.y);camera.fov=60;camera.updateProjectionMatrix();}
    if(value==='swimming'){camera.position.set(target.x+65,target.z+60,target.y+60);camera.lookAt(target.x,target.z-6,target.y);camera.fov=60;camera.updateProjectionMatrix();}
  }
  renderOverlay();
}
function renderOverlay(){root.render(createElement(Fragment,null,createElement(FriendsToolbelt,{frontier:snapshot.friends!.frontier!,player,tool:7,onTool:()=>{},onPack:()=>{},elapsed:0}),createElement(FriendsFishingCatchLog,{fish:state.fish,localId:'review',visible:true})));}
function setSize(size:number){for(const f of state.fish)f.size=size;for(const c of state.casts)c.size=size;renderOverlay();}
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-stage]'))b.onclick=()=>setStage(b.dataset.stage!);
let previous=0,paused=false;
function frame(now:number){requestAnimationFrame(frame);if(paused)return;const dt=Math.min(50,now-previous);previous=now;time=now;
  world.update(snapshot.friends!.frontier,camera.position.x,camera.position.z,now,7,false,[],180000,false);
  handCamera.position.copy(camera.position);handCamera.quaternion.copy(camera.quaternion);
  fishing.update(state,[player],'review',7,camera,now,dt,true,point=>Renderer3D.prototype.projectViewmodelPointToWorld.call(projector,point),()=>false);
  renderer.info.autoReset=false;renderer.info.reset();renderer.autoClear=true;renderer.render(scene,camera);renderer.autoClear=false;renderer.clearDepth();renderer.render(viewmodel,handCamera);
}
setStage('rod');requestAnimationFrame(frame);
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=handCamera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();handCamera.updateProjectionMatrix();});
(window as any).fishingReview={audio:friendsAudio,THREE,scene,viewmodel,renderer,camera,handCamera,world,fishing,project:(point:THREE.Object3D)=>Renderer3D.prototype.projectViewmodelPointToWorld.call(projector,point),pause:()=>paused=true,state:()=>state,setStage,setSize,player,loadFishingFish};
