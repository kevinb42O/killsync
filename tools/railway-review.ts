import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { FriendsTrainControls } from '../src/components/FriendsTrainControls';
import { FriendsBuildVisuals } from '../src/game/rendering/FriendsBuildVisuals';
import { SCENIC_STOP_OFFSET } from '../src/game/world/FriendsTrainLayout';
import '../src/components/frontier.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FriendsFrontierVisuals } from '../src/game/rendering/FriendsFrontierVisuals';
import { FriendsScenicRailwayVisuals } from '../src/game/rendering/FriendsScenicRailwayVisuals';
import { FriendsVehicleVisuals } from '../src/game/rendering/FriendsWorldVisuals';
import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation';
import { scenicRailway,scenicStationPoses } from '../src/game/world/FriendsScenicRailway';
import { sampleRailAlignment } from '../src/game/world/FriendsRailAlignment';
import { vehicleWorldPoint } from '../src/game/multiplayer/FriendsVehiclePose';
import { baseTerrainHeight } from '../src/game/world/FriendsTerrain';
const scene=new THREE.Scene();scene.background=new THREE.Color(0xaec4bd);scene.fog=new THREE.FogExp2(0xaec4bd,.000015);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,2,110000),controls=new OrbitControls(camera,renderer.domElement);controls.maxDistance=60000;
scene.add(new THREE.AmbientLight(0xe1f4e5,.65),new THREE.HemisphereLight(0xc7e9ff,0x778361,.60));const sun=new THREE.DirectionalLight(0xffe6c4,1.85);sun.position.set(7700,2300,4400);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-1700,right:1700,top:1700,bottom:-1700,near:10,far:6500});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=1.5;sun.shadow.bias=-.0003;scene.add(sun,sun.target);
const hand=new THREE.Scene(),frontier=new FriendsFrontierVisuals(scene,hand,renderer,camera),rail=new FriendsScenicRailwayVisuals(scene),vehicles=new FriendsVehicleVisuals(scene),simulation=new FriendsSimulation([{id:'review',label:'Review',color:'#fff'}]),snapshot=simulation.createSnapshot(),service=simulation['friends']!.scenic!,route=scenicRailway();
const ui=document.createElement('div');document.body.append(ui);const uiRoot=createRoot(ui),buildVisuals=new FriendsBuildVisuals(scene);
let showTrainControls=false,frontView=false,requestId=100,uiAt=0;
const renderTrainUI=()=>uiRoot.render(showTrainControls?createElement(FriendsTrainControls,{service:service.snapshot(),onRequest:r=>{const result=simulation.friendsAction('review',{...r,requestId:++requestId});document.getElementById('stats')!.textContent=result.message;},onClose:()=>{showTrainControls=false;renderTrainUI();}}):null);
let roofMaterialPreview=false,riding=false,previous=performance.now(),elapsed=0,frames=0,last=performance.now();
const view=(distance:number,inside=false)=>{roofMaterialPreview=false;riding=false;frontView=false;showTrainControls=false;renderTrainUI();service.distance=distance;const p=sampleRailAlignment(route,distance);if(inside){const v=service.vehicles()[1],eye=vehicleWorldPoint(v,{x:-50,y:38,z:49}),target=vehicleWorldPoint(v,{x:300,y:240,z:70});camera.position.set(eye.x,eye.z,eye.y);controls.target.set(target.x,target.z,target.y);}else{camera.position.set(p.x-500,p.z+240,p.y+600);controls.target.set(p.x,p.z+50,p.y);}controls.update();};
const button=(name:string,action:()=>void)=>{const b=document.createElement('button');b.textContent=name;b.onclick=action;document.getElementById('buttons')!.append(b);};
for(const p of scenicStationPoses())button(p.name,()=>view(p.distance+SCENIC_STOP_OFFSET));
const bridge=route.points.find(p=>p.chapter===10&&baseTerrainHeight(p.x,p.y)<-168.5)!;
const buried=(distance:number)=>{const p=sampleRailAlignment(route,distance);return baseTerrainHeight(p.x,p.y)>p.z+224;};
const tunnel=route.points.find(p=>p.chapter===6&&baseTerrainHeight(p.x,p.y)>p.z+300&&buried(p.distance-512)&&buried(p.distance+1024))!;
let portal=tunnel;for(let i=0;i<route.points.length-1;i++){const a=route.points[i],b=route.points[i+1];if(a.chapter===6&&baseTerrainHeight(a.x,a.y)<a.z+224&&baseTerrainHeight(b.x,b.y)>=b.z+224&&buried(b.distance+1024)&&buried(b.distance+3072)){portal=a;break;}}
button('Cove bridge',()=>view(bridge.distance+600));button('Tunnel entrance',()=>{view(portal.distance-160);const p=sampleRailAlignment(route,portal.distance-1050),q=sampleRailAlignment(route,portal.distance+120);camera.position.set(p.x,p.z+180,p.y);controls.target.set(q.x,q.z+80,q.y);controls.update();});button('Portal detail',()=>{view(portal.distance+900);const p=sampleRailAlignment(route,portal.distance-520),q=sampleRailAlignment(route,portal.distance);camera.position.set(p.x+Math.sin(p.angle)*70,p.z+160,p.y-Math.cos(p.angle)*70);controls.target.set(q.x,q.z+95,q.y);controls.update();});button('Inside mountain',()=>view(tunnel.distance+600,true));button('Ride',()=>{riding=true;service.dwell=0;});
button('Whole train',()=>{view(scenicStationPoses()[0].distance+SCENIC_STOP_OFFSET);const s=scenicStationPoses()[0];camera.position.set(s.x-700,s.z+1400,s.y-2100);controls.target.set(s.x,s.z+40,s.y);controls.update();});
button('Empty flatbed',()=>{view(service.distance);const v=service.vehicles()[4],eye=vehicleWorldPoint(v,{x:170,y:-230,z:160});camera.position.set(eye.x,eye.z,eye.y);controls.target.set(v.x,v.z+15,v.y);controls.update();});
button('Front carriage',()=>{view(service.distance);frontView=true;const v=service.vehicles()[1],eye=vehicleWorldPoint(v,{x:36,y:0,z:52}),target=vehicleWorldPoint(v,{x:80,y:0,z:32});camera.position.set(eye.x,eye.z,eye.y);controls.target.set(target.x,target.z,target.y);controls.update();});
button('Train controls',()=>{frontView=true;showTrainControls=true;renderTrainUI();});
button('Place test cargo',()=>{const v=service.vehicles()[4],p=simulation['players'].get('review')!;Object.assign(p,vehicleWorldPoint(v,{x:0,y:0,z:0}));for(const x of [-56,56])simulation['friendsBuilding']!.request(p,{requestId:++requestId,action:'place',shape:'storage',finish:'timber',pose:{...vehicleWorldPoint(v,{x,y:0,z:0}),rotation:0,attachment:{vehicleId:v.id,x,y:0,z:0}}},'review',[]);});
button('Island view',()=>{roofMaterialPreview=false;riding=false;camera.position.set(-4000,32000,58000);controls.target.set(23500,0,22500);controls.update();});
button('Roof material preview',()=>{view(tunnel.distance+600);roofMaterialPreview=true;const p=sampleRailAlignment(route,tunnel.distance+600);camera.position.set(p.x-160,p.z+400,p.y+300);controls.target.set(p.x,p.z+175,p.y);controls.update();});
for(const chapter of [4,6,7,8,11]){
  const candidates=route.points.filter(p=>p.chapter===chapter&&baseTerrainHeight(p.x,p.y)>p.z+256);
  if(!candidates.length)continue;
  const p=candidates.reduce((a,b)=>baseTerrainHeight(a.x,a.y)-a.z>baseTerrainHeight(b.x,b.y)-b.z?a:b);
  button(`Above tunnel ${chapter}`,()=>{view(p.distance);const h=baseTerrainHeight(p.x,p.y);camera.position.set(p.x+260,h+420,p.y+480);controls.target.set(p.x,h,p.y);controls.update();});
}
addEventListener('keydown',event=>{if(event.key.toLowerCase()==='f'&&frontView){showTrainControls=!showTrainControls;renderTrainUI();}if(event.key==='Escape'){showTrainControls=false;renderTrainUI();}if(event.key.toLowerCase()==='h'){const panel=document.querySelector('aside')!;panel.hidden=!panel.hidden;}});
button('Daylight',()=>frontier.setEnvironment({hour:12,speed:0}));button('Dusk',()=>frontier.setEnvironment({hour:20,speed:0}));
view(scenicStationPoses()[0].distance+SCENIC_STOP_OFFSET);
function frame(){requestAnimationFrame(frame);const now=performance.now(),dt=Math.min(50,now-previous);previous=now;elapsed+=dt;
  if(riding){service.update(dt,[],new Set());const v=service.vehicles()[1];const eye=vehicleWorldPoint(v,{x:-50,y:38,z:49}),target=vehicleWorldPoint(v,{x:300,y:240,z:70});camera.position.set(eye.x,eye.z,eye.y);controls.target.set(target.x,target.z,target.y);}
  if(frontView){const v=service.vehicles()[1],p=simulation['players'].get('review')!;Object.assign(p,vehicleWorldPoint(v,{x:52,y:0,z:0}));}
  if(showTrainControls||riding)service.update(showTrainControls?dt:0,[],new Set());
  if(showTrainControls&&now-uiAt>100){uiAt=now;renderTrainUI();}
  buildVisuals.update(simulation['friendsBuilding']!.snapshot());
  controls.update();snapshot.friends!.vehicles=service.vehicles();vehicles.update(snapshot.friends,elapsed);frontier.update(snapshot.friends!.frontier,camera.position.x,camera.position.z,elapsed,0);frontier['group'].visible=!roofMaterialPreview;rail.update(camera,true);renderer.render(scene,camera);
  frames++;if(now-last>1000){document.getElementById('stats')!.textContent=`${(frames*1000/(now-last)).toFixed(0)} FPS · ${(route.length/12000).toFixed(1)} km · ${(Math.max(...route.points.map(p=>p.z))/12).toFixed(1)} m maximum · ${(service.speed/12*3.6).toFixed(0)} km/h`;frames=0;last=now;}
}
frame();addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
