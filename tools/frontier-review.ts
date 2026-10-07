import { FriendsNightVision } from '../src/game/rendering/FriendsNightVision';
import { CAVE_TREASURES } from '../src/game/world/FriendsCave';
import { sampleFrontierDayNight } from '../src/game/world/FriendsDayNight';
import { FriendsBuildVisuals } from '../src/game/rendering/FriendsBuildVisuals';
import { FriendsExpedition } from '../src/game/multiplayer/FriendsExpedition';
import { FriendsHaulingVisuals } from '../src/game/rendering/FriendsHaulingVisuals';
import type { CoopSnapshot } from '../src/game/multiplayer/CoopSimulation';
import type { FriendsBuildPiece } from '../src/game/multiplayer/FriendsBuilding';
import { railSamples } from '../src/game/world/FriendsPlayerRail';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FriendsFrontierVisuals } from '../src/game/rendering/FriendsFrontierVisuals';
import { createFriendsEnvironment, FriendsVehicleVisuals } from '../src/game/rendering/FriendsWorldVisuals';
import { FriendsFrontier } from '../src/game/multiplayer/FriendsFrontier';
import { FriendsTerrain, baseTerrainHeight, FRIENDS_HAULING_PLATFORM } from '../src/game/world/FriendsTerrain';
import { FRIENDS_DELIVERY_BAY } from '../src/game/world/FriendsHaulingGoal';
const scene=new THREE.Scene();scene.background=new THREE.Color(0xaec4bd);scene.fog=new THREE.FogExp2(0xaec4bd,.000009);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.90;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,2,110000),controls=new OrbitControls(camera,renderer.domElement);controls.maxDistance=60000;
scene.add(new THREE.AmbientLight(0xe1f4e5,.65),new THREE.HemisphereLight(0xc7e9ff,0x778361,.60));const sun=new THREE.DirectionalLight(0xffe6c4,1.85);sun.position.set(7700,2300,4400);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-1700,right:1700,top:1700,bottom:-1700,near:10,far:6500});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=1.5;sun.shadow.bias=-.0003;scene.add(sun,sun.target);
const viewmodel=new THREE.Scene(),handCamera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.01,10);viewmodel.add(handCamera,new THREE.HemisphereLight(0xffeed0,0x3d4b46,2));
let flashlightReview=false,openedTreasures:string[]=[];
scene.add(createFriendsEnvironment());const world=new FriendsFrontierVisuals(scene,viewmodel,renderer,camera),snapshot=new FriendsFrontier().snapshot();
const nightVision=new FriendsNightVision(scene);
const toggleNightVision=()=>{const equipped=nightVision.toggle();document.getElementById('nightVision')!.textContent=equipped?'Night vision ON · N':'Night vision OFF · N';};
document.getElementById('nightVision')!.onclick=toggleNightVision;
const reviewRailHeight=512;
const railPieces:FriendsBuildPiece[]=Array.from({length:4},(_,rotation)=>({id:rotation+1,shape:'rail_curve',finish:'timber',author:'Review',revision:1,rotation,x:9000+[128,128,-128,-128][rotation],y:5500+[-128,128,128,-128][rotation],z:reviewRailHeight}));
const builds=new FriendsBuildVisuals(scene),vehicles=new FriendsVehicleVisuals(scene),expedition=new FriendsExpedition();
const hauling=new FriendsHaulingVisuals(scene,viewmodel);
hauling.update({friends:expedition.snapshot(),players:[]} as unknown as CoopSnapshot,'review',0,0,()=>({x:0,y:0,z:0}),false);
const railway={revision:1,guestsCanBuild:true,pieces:railPieces};expedition.setRailway(railPieces,1);expedition.placeTrain(railPieces,{id:'review',x:9000,y:5230,z:reviewRailHeight,lifeState:'alive'});expedition.controlTrain('train_depart');
const railwaySnapshot=structuredClone(snapshot);railwaySnapshot.terrain.revision++;railwaySnapshot.terrain.grades=[[9000,5500,reviewRailHeight,384]];
let railwayVisible=false,previousFrame=performance.now();
let touring=false,start=0,frames=0,last=performance.now(),reviewElapsedMs=0;
let cyclePlaying=false;
const timeSlider=document.getElementById('worldTime') as HTMLInputElement;
function setReviewHour(hour:number){reviewElapsedMs=((hour-9+24)%24)*60000;timeSlider.value=String(hour);}
setReviewHour(Number(new URLSearchParams(location.search).get('hour')??9));
timeSlider.oninput=()=>setReviewHour(Number(timeSlider.value));
for(const [id,hour] of [['dawn',6],['noon',12],['dusk',18],['midnight',0]] as const)document.getElementById(id)!.onclick=()=>setReviewHour(hour);
document.getElementById('playCycle')!.onclick=()=>{cyclePlaying=!cyclePlaying;document.getElementById('playCycle')!.textContent=cyclePlaying?'Pause cycle':'Play cycle ×60';};
const views={volcano:{x:34240,y:33792,height:2400,back:4500},beach:{x:24000,y:39000,height:700,back:2800},arch:{x:15520,y:10560,height:400,back:7900},citadel:{x:18304,y:12416,height:2100,back:5600},sanctum:{x:27008,y:19456,height:1100,back:3500},skyfalls:{x:6912,y:19900,height:1100,back:5000},island:{x:24000,y:22000,height:28000,back:32000},valley:{x:5900,y:5630,height:1900,back:4400},cedar:{x:10700,y:4200,height:1200,back:3000},ridge:{x:15600,y:8700,height:2200,back:6800},coast:{x:27600,y:19000,height:1800,back:5000}};
function view(id:keyof typeof views){flashlightReview=false;touring=false;railwayVisible=false;excavationVisible=false;surfaceReview=false;const p=views[id],h=baseTerrainHeight(p.x,p.y);camera.position.set(p.x-p.back*.3,h+p.height,p.y+p.back);controls.target.set(p.x,h+150,p.y);if(id==='citadel'){camera.position.set(22000,6800,17600);controls.target.set(18500,4900,12800);}if(id==='arch'){camera.position.set(14900,1900,8000);controls.target.set(15520,1150,11200);}if(id==='coast'){camera.position.set(31500,1450,23500);controls.target.set(27300,100,20800);}if(id==='beach'){camera.position.set(24200,1300,42100);controls.target.set(24000,180,39000);}if(id==='skyfalls'){camera.position.set(4900,3300,22900);controls.target.set(6912,1750,19392);}if(id==='sanctum'){camera.position.set(30300,1300,22300);controls.target.set(27008,450,19456);}if(id==='island'){camera.position.set(-4000,36000,65000);controls.target.set(23000,0,22000);}controls.update();}
for(const id of Object.keys(views))document.getElementById(id)!.onclick=()=>view(id as keyof typeof views);
const castleDetail=(position:number[],target:number[])=>{view('citadel');camera.position.set(position[0],position[1],position[2]);controls.target.set(target[0],target[1],target[2]);controls.update();};
document.getElementById('castleApproach')!.onclick=()=>castleDetail([23400,7400,21100],[18600,3100,15300]);
document.getElementById('castleCourt')!.onclick=()=>castleDetail([18620,5130,13550],[19040,4710,12992]);
document.getElementById('castleWard')!.onclick=()=>castleDetail([18304,4512,13360],[18304,4680,11680]);
document.getElementById('castlePlan')!.onclick=()=>castleDetail([18500,8650,14400],[18304,4460,12160]);
document.getElementById('castleSpiral')!.onclick=()=>castleDetail([17580,6230,12280],[18304,5020,11744]);

document.getElementById('railway')!.onclick=()=>{touring=false;railwayVisible=true;camera.position.set(9000,reviewRailHeight+550,6600);controls.target.set(9000,reviewRailHeight,5500);controls.update();};
document.getElementById('haulingBay')!.onclick=()=>{view('valley');const p=FRIENDS_HAULING_PLATFORM;camera.position.set(p.x+240,p.top+260,p.y+340);controls.target.set(p.x,p.top+36,p.y);controls.update();};
document.getElementById('cargoFromSpawn')!.onclick=()=>{view('valley');const p=FRIENDS_HAULING_PLATFORM,g=FRIENDS_DELIVERY_BAY;camera.position.set(g.x,g.z+36,g.y+68);controls.target.set(p.x,p.top+48,p.y);controls.update();};
document.getElementById('deliveryBay')!.onclick=()=>{view('valley');const g=FRIENDS_DELIVERY_BAY;camera.position.set(g.x+240,g.z+260,g.y-360);controls.target.set(g.x,g.z+36,g.y);controls.update();};
const caveView=(x:number,y:number,z:number,tx:number,ty:number,tz:number)=>{flashlightReview=true;touring=false;railwayVisible=false;excavationVisible=false;surfaceReview=false;camera.position.set(x,z,y);controls.target.set(tx,tz,ty);controls.update();};
document.getElementById('caveEntrance')!.onclick=()=>caveView(6090,5500,900,6384,5152,400);
document.getElementById('tunnelSky')!.onclick=()=>caveView(6384,5152,160,6385,5152,900);
document.getElementById('cathedral')!.onclick=()=>caveView(8160,4880,280,8650,4800,-80);
document.getElementById('blueVault')!.onclick=()=>caveView(8992,5510,50,9300,5750,-80);
document.getElementById('treasury')!.onclick=()=>{const t=CAVE_TREASURES.find(t=>t.id==='reliquary-4-0')!;caveView(t.x-150,t.y+130,t.z+62,t.x,t.y,t.z+22);};
document.getElementById('flashlight')!.onclick=()=>{flashlightReview=true;world.toggleFlashlight();};
document.getElementById('openTreasures')!.onclick=()=>{openedTreasures=openedTreasures.length?[]:CAVE_TREASURES.map(t=>t.id);};
// Real terrain fixture: switching snapshots verifies block shells, excavation
// promotion and restoration without touching the user's saved world.
const pit={x:22304,y:27584},pitHeight=new FriendsTerrain().surfaceHeight(pit.x,pit.y);
const excavationSnapshot=structuredClone(snapshot);excavationSnapshot.terrain.revision+=2;
for(let vx=Math.floor(pit.x/32)-2;vx<=Math.floor(pit.x/32)+2;vx++)for(let vy=Math.floor(pit.y/32)-2;vy<=Math.floor(pit.y/32)+2;vy++){
  const top=Math.floor(new FriendsTerrain().surfaceHeight(vx*32+16,vy*32+16)/32);
  for(let vz=top-4;vz<top;vz++)excavationSnapshot.terrain.edits.push([vx,vy,vz,0]);
}
let excavationVisible=false,surfaceReview=false;
const blockView=()=>{flashlightReview=false;touring=false;railwayVisible=false;surfaceReview=true;camera.position.set(pit.x-210,pitHeight+160,pit.y+250);controls.target.set(pit.x,pitHeight-64,pit.y);controls.update();};
document.getElementById('surface')!.onclick=()=>{excavationVisible=false;blockView();};
document.getElementById('excavation')!.onclick=()=>{excavationVisible=!excavationVisible;blockView();};
const forestView=(back:number)=>{view('valley');camera.position.set(6400,baseTerrainHeight(6400,5400)+350,5400+back);controls.target.set(6400,baseTerrainHeight(6400,5400)+240,5400);controls.update();};
document.getElementById('forestNear')!.onclick=()=>forestView(1000);
document.getElementById('forestFar')!.onclick=()=>forestView(3000);
document.getElementById('normals')!.onclick=()=>{scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial&&m.normalMap)m.normalScale.setScalar(m.normalScale.x?0:.28);});};
document.getElementById('shadows')!.onclick=()=>{renderer.shadowMap.enabled=!renderer.shadowMap.enabled;renderer.shadowMap.needsUpdate=true;scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;});};
const togglePanel=()=>{const panel=document.querySelector('aside')!;panel.hidden=!panel.hidden;};document.getElementById('hide')!.onclick=togglePanel;addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h')togglePanel();if(e.code==='KeyV'&&!e.repeat){flashlightReview=true;world.toggleFlashlight();}if(e.code==='KeyN'&&!e.repeat){e.preventDefault();toggleNightVision();}});
document.getElementById('tour')!.onclick=()=>{touring=!touring;start=performance.now();};view('arch');const initialScene=new URLSearchParams(location.search).get('scene');if(initialScene&&document.getElementById(initialScene))document.getElementById(initialScene)?.click();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);handCamera.aspect=camera.aspect;handCamera.updateProjectionMatrix();});
function frame(t:number){requestAnimationFrame(frame);const delta=Math.min(100,t-previousFrame);previousFrame=t;if(cyclePlaying){reviewElapsedMs+=delta*60;timeSlider.value=String(sampleFrontierDayNight(reviewElapsedMs).hour);}const skyTime=sampleFrontierDayNight(reviewElapsedMs);document.getElementById('clock')!.textContent=`${skyTime.clock} · ${skyTime.phase} · Day ${skyTime.day}`;expedition.update(delta,t,[],new Map(),railPieces);builds.update(railwayVisible?railway:undefined);vehicles.update(expedition.snapshot(),t);if(touring){const phase=(t-start)/1000;const x=5900+phase*300,y=5630+Math.sin(phase*.17)*1500;camera.position.set(x,baseTerrainHeight(x,y)+1250,y);controls.target.set(x+1700,baseTerrainHeight(x+1700,y)+200,y-400);}controls.update();world.update(excavationVisible?excavationSnapshot:railwayVisible?railwaySnapshot:snapshot,camera.position.x,camera.position.z,t,flashlightReview?1:0,false,openedTreasures,reviewElapsedMs);

renderer.autoClear=true;const nightVisionPass=nightVision.beginFrame(renderer,camera,delta);renderer.render(scene,camera);if(flashlightReview){renderer.autoClear=false;renderer.clearDepth();renderer.render(viewmodel,handCamera);}if(nightVisionPass)nightVision.endFrame(renderer);frames++;if(t-last>1000){document.getElementById('stats')!.textContent=`${Math.round(frames*1000/(t-last))} FPS · ${renderer.info.render.calls} draws · ${Math.round(renderer.info.render.triangles/1000)}k triangles\nCamera ${Math.round(camera.position.x)}, ${Math.round(camera.position.z)} · altitude ${Math.round(camera.position.y)}\n${surfaceReview ? excavationVisible ? "Excavated block terrain" : "Untouched block terrain" : "Ocean island · shared voxel landmarks"}\nBlocks: ${world.terrainStats.surfaceTiles} surface tiles · ${world.terrainStats.volumeActive}/${world.terrainStats.volumeChunks} active/cached volumes · ${(world.terrainStats.surfaceBytes/1024/1024).toFixed(1)} MiB · ${world.terrainStats.surfaceJobs + world.terrainStats.volumeJobs} jobs\nTrees: ${world.forestStats.trees} 3D · ${world.forestStats.draws} batches · ${Math.round(world.forestStats.triangles/1000)}k triangles\nClouds: ${world.cloudStats.visible}/${world.cloudStats.total} visible · ${world.cloudStats.shadowPasses} atlas bakes`;last=t;frames=0;}}
requestAnimationFrame(frame);
