import { updateFrontierSunShadow } from '../src/game/rendering/FriendsSunShadow';
import { FriendsBuildVisuals } from '../src/game/rendering/FriendsBuildVisuals';
import { FriendsExpedition } from '../src/game/multiplayer/FriendsExpedition';
import type { FriendsBuildPiece } from '../src/game/multiplayer/FriendsBuilding';
import { railSamples } from '../src/game/world/FriendsPlayerRail';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FriendsFrontierVisuals } from '../src/game/rendering/FriendsFrontierVisuals';
import { createFriendsEnvironment, FriendsVehicleVisuals } from '../src/game/rendering/FriendsWorldVisuals';
import { FriendsFrontier } from '../src/game/multiplayer/FriendsFrontier';
import { baseTerrainHeight } from '../src/game/world/FriendsTerrain';
const scene=new THREE.Scene();scene.background=new THREE.Color(0xaec4bd);scene.fog=new THREE.FogExp2(0xaec4bd,.000009);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,2,110000),controls=new OrbitControls(camera,renderer.domElement);controls.maxDistance=60000;
scene.add(new THREE.AmbientLight(0xe1f4e5,.72));const sun=new THREE.DirectionalLight(0xffe6c4,2.1);sun.position.set(7700,2300,4400);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-1700,right:1700,top:1700,bottom:-1700,near:10,far:6500});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=1.5;sun.shadow.bias=-.0003;scene.add(sun,sun.target);
scene.add(createFriendsEnvironment());const world=new FriendsFrontierVisuals(scene,new THREE.Scene(),renderer,camera),snapshot=new FriendsFrontier().snapshot();
const reviewRailHeight=512;
const railPieces:FriendsBuildPiece[]=Array.from({length:4},(_,rotation)=>({id:rotation+1,shape:'rail_curve',finish:'timber',author:'Review',revision:1,rotation,x:9000+[128,128,-128,-128][rotation],y:5500+[-128,128,128,-128][rotation],z:reviewRailHeight}));
const builds=new FriendsBuildVisuals(scene),vehicles=new FriendsVehicleVisuals(scene),expedition=new FriendsExpedition();
const railway={revision:1,guestsCanBuild:true,pieces:railPieces};expedition.setRailway(railPieces,1);expedition.placeTrain(railPieces,{id:'review',x:9000,y:5230,z:reviewRailHeight,lifeState:'alive'});expedition.controlTrain('train_depart');
const railwaySnapshot=structuredClone(snapshot);railwaySnapshot.terrain.revision++;railwaySnapshot.terrain.grades=[[9000,5500,reviewRailHeight,384]];
let railwayVisible=false,previousFrame=performance.now();
let touring=false,start=0,frames=0,last=performance.now(),shadowTime=0;
const views={valley:{x:5900,y:5630,height:1900,back:4400},cedar:{x:10700,y:4200,height:1200,back:3000},ridge:{x:15600,y:8700,height:2200,back:6800},coast:{x:28700,y:19000,height:1800,back:5000}};
function view(id:keyof typeof views){touring=false;railwayVisible=false;excavationVisible=false;const p=views[id],h=baseTerrainHeight(p.x,p.y);camera.position.set(p.x-p.back*.3,h+p.height,p.y+p.back);controls.target.set(p.x,h+150,p.y);controls.update();}
for(const id of Object.keys(views))document.getElementById(id)!.onclick=()=>view(id as keyof typeof views);
document.getElementById('railway')!.onclick=()=>{touring=false;railwayVisible=true;camera.position.set(9000,reviewRailHeight+550,6600);controls.target.set(9000,reviewRailHeight,5500);controls.update();};
const caveView=(x:number,y:number,z:number,tx:number,ty:number,tz:number)=>{touring=false;railwayVisible=false;excavationVisible=false;camera.position.set(x,z,y);controls.target.set(tx,tz,ty);controls.update();};
document.getElementById('caveEntrance')!.onclick=()=>caveView(6090,5500,900,6384,5152,400);
document.getElementById('cathedral')!.onclick=()=>caveView(8160,4880,280,8650,4800,-80);
document.getElementById('blueVault')!.onclick=()=>caveView(8992,5510,50,9300,5750,-80);
// Synthetic legacy excavation reproduces the deep pits from upgraded saves.
// It never reads or writes the user's saved world.
const excavationSnapshot=structuredClone(snapshot);excavationSnapshot.terrain.revision+=2;excavationSnapshot.terrain.grades=[[6048,5696,0,128]];
for(let vx=186;vx<=191;vx++)for(let vy=175;vy<=180;vy++)for(let vz=-4;vz<0;vz++)excavationSnapshot.terrain.edits.push([vx,vy,vz,0]);
let excavationVisible=false;
document.getElementById('excavation')!.onclick=()=>{caveView(5936,5488,240,6100,5800,96);excavationVisible=true;};
document.getElementById('normals')!.onclick=()=>{scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial&&m.normalMap)m.normalScale.setScalar(m.normalScale.x?0:.28);});};
document.getElementById('shadows')!.onclick=()=>{renderer.shadowMap.enabled=!renderer.shadowMap.enabled;renderer.shadowMap.needsUpdate=true;scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;});};
const togglePanel=()=>{const panel=document.querySelector('aside')!;panel.hidden=!panel.hidden;};document.getElementById('hide')!.onclick=togglePanel;addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h')togglePanel();});
document.getElementById('tour')!.onclick=()=>{touring=!touring;start=performance.now();};view('valley');const initialScene=new URLSearchParams(location.search).get('scene');if(initialScene&&['cathedral','blueVault','caveEntrance','excavation'].includes(initialScene))document.getElementById(initialScene)?.click();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
function frame(t:number){requestAnimationFrame(frame);const delta=Math.min(100,t-previousFrame);previousFrame=t;expedition.update(delta,t,[],new Map(),railPieces);builds.update(railwayVisible?railway:undefined);vehicles.update(expedition.snapshot(),t);if(touring){const phase=(t-start)/1000;const x=5900+phase*300,y=5630+Math.sin(phase*.17)*1500;camera.position.set(x,baseTerrainHeight(x,y)+1250,y);controls.target.set(x+1700,baseTerrainHeight(x+1700,y)+200,y-400);}controls.update();world.update(excavationVisible?excavationSnapshot:railwayVisible?railwaySnapshot:snapshot,camera.position.x,camera.position.z,t,0);
if(t-shadowTime>100){updateFrontierSunShadow(sun,new THREE.Vector3(camera.position.x,camera.position.y-30,camera.position.z));renderer.shadowMap.needsUpdate=true;shadowTime=t;}
renderer.render(scene,camera);frames++;if(t-last>1000){document.getElementById('stats')!.textContent=`${Math.round(frames*1000/(t-last))} FPS · ${renderer.info.render.calls} draws · ${Math.round(renderer.info.render.triangles/1000)}k triangles\nCamera ${Math.round(camera.position.x)}, ${Math.round(camera.position.z)} · altitude ${Math.round(camera.position.y)}\nPersistent horizon 4 × 4 km · forest detail crossfade`;last=t;frames=0;}}
requestAnimationFrame(frame);
