import { FriendsVehicleVisuals } from '../src/game/rendering/FriendsWorldVisuals';
import { FriendsUnderwaterVisuals } from '../src/game/rendering/FriendsUnderwaterVisuals';
import { createCoopOperatorRig, updateCoopOperatorRig } from '../src/game/rendering/coopOperatorVisuals';
import { mountFriendsCharacter, updateFriendsCharacter } from '../src/game/rendering/FriendsCharacterVisuals';
import { ROWBOAT_ID, rowboatStrokePhase } from '../src/game/multiplayer/FriendsRowboat';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from '../src/game/multiplayer/protocol';
import type { CoopPlayerSnapshot } from '../src/game/multiplayer/CoopSimulation';
import type { PlayerMotionState } from '../src/game/multiplayer/playerMovement';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FriendsFrontierVisuals } from '../src/game/rendering/FriendsFrontierVisuals';
import { FriendsScenicRailwayVisuals } from '../src/game/rendering/FriendsScenicRailwayVisuals';
import { FriendsSimulation } from '../src/game/multiplayer/FriendsSimulation';
import { FRIENDS_RIVERS, RIVER_CROSSING } from '../src/game/world/FriendsHydrology';
import { friendsWaterGround } from '../src/game/world/FriendsWaterSurface';
import { baseTerrainHeight } from '../src/game/world/FriendsTerrain';
console.info('River review: modules loaded');
const scene=new THREE.Scene();scene.background=new THREE.Color('#b5cccf');scene.fog=new THREE.FogExp2('#b5cccf',.000015);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,2,110000),controls=new OrbitControls(camera,renderer.domElement);
const ambient=new THREE.AmbientLight(0xe1f4e5,.65),fill=new THREE.HemisphereLight(0xc7e9ff,0x778361,.6),sun=new THREE.DirectionalLight(0xffe6c4,1.85);
sun.position.set(7700,2300,4400);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-1700,right:1700,top:1700,bottom:-1700,near:10,far:6500});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=1.5;sun.shadow.bias=-.0003;scene.add(ambient,fill,sun,sun.target);
const frontier=new FriendsFrontierVisuals(scene,new THREE.Scene(),renderer,camera),rail=new FriendsScenicRailwayVisuals(scene);
console.info('River review: visuals ready');
const sim=new FriendsSimulation([{id:'review',label:'LEFT OAR',color:'#8ad8d1'},{id:'review-right',label:'RIGHT OAR',color:'#e6bd86'}]);
let snapshot=sim.createSnapshot(),boatMode=false,activeView='deepmere';
const boats=new FriendsVehicleVisuals(scene),underwater=new FriendsUnderwaterVisuals(scene);
const rigs=snapshot.players.map(p=>{const rig=createCoopOperatorRig(p.color,p.label,p.skinId,'friends');mountFriendsCharacter(rig,p.color);rig.root.visible=false;scene.add(rig.root);return rig;});
const commands=new Map<string,MultiplayerInputFrame>(snapshot.players.map(p=>[p.id,{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:0,aimPitch:32768,selectedSlot:0,friendsTool:6,firing:false,fireActionId:0,altFireActionId:0,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false}]));
function crewBoat(){
  const v=snapshot.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!;
  const actors=(sim as unknown as {players:Map<string,CoopPlayerSnapshot&PlayerMotionState>}).players;
  for(const [index,p]of [...actors.values()].entries()){
    if(p.friendsSeat?.vehicleId===ROWBOAT_ID)continue;
    p.x=v.x;p.y=v.y+(index===0?25:-25);p.z=v.z;p.friendsDevFlight=false;
    const command=commands.get(p.id)!;command.interactActionId=(command.interactActionId??0)+1;command.reviving=true;sim.setInput(p.id,command);
  }
  sim.tick(16.67);snapshot=sim.createSnapshot();for(const command of commands.values())command.reviving=false;
}
function row(side:'left'|'right',reverse=false){
  if(!boatMode)view('boat');const id=side==='left'?'review':'review-right',command=commands.get(id)!;
  if(reverse)command.altFireActionId=(command.altFireActionId??0)+1;else command.fireActionId=(command.fireActionId??0)+1;
}

const launch=snapshot.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!;
const views:Record<string,number[]>={
  boat:[launch.x+150,launch.z+110,launch.y+130,launch.x,launch.z+12,launch.y],
  underwater:[12128,-285,23600,12450,-400,23650],
  underwater_sea:[40000,-620,23852,40350,-780,23980],
  underwater_up:[12128,85,23600,12330,235,23650],
  underwater_station:[8000,385,24348,8190,540,24348],
  island:[-2000,27000,52000,22500,0,22500],
  deepmere:[15100,1700,26100,12128,154,23600],
  skyfalls:[8500,1700,22400,6850,666,21000],
  skyfalls_underpass:[8670,600,24770,8000,442,24348],
  world_gate:[14200,860,14600,14900,603,13000],
  gate_run:[13900,850,16400,12800,330,17800],
  bridge:[21500,1800,28100,20000,480,26900],
  water_bridge:[19900,78,26300,20000,75,26900],
  gorge:[25100,640,28100,24600,-40,27500],
  mouth:[30000,650,26600,31170,-168,24502],
};
const crossingPoint=FRIENDS_RIVERS[2].points.reduce((a,p)=>Math.hypot(p.x-RIVER_CROSSING.x,p.y-RIVER_CROSSING.y)<Math.hypot(a.x-RIVER_CROSSING.x,a.y-RIVER_CROSSING.y)?p:a);
const waterEye=FRIENDS_RIVERS[2].points.find(p=>p.distance>crossingPoint.distance-550)!;
views.water_bridge=[waterEye.x,waterEye.z+34,waterEye.y,20000,170,26900];
const gorgePoint=FRIENDS_RIVERS[2].points.reduce((a,p)=>Math.hypot(p.x-24800,p.y-27500)<Math.hypot(a.x-24800,a.y-27500)?p:a);
const gorgeEye=FRIENDS_RIVERS[2].points.find(p=>p.distance>gorgePoint.distance-550)!,gorgeTarget=FRIENDS_RIVERS[2].points.find(p=>p.distance>gorgePoint.distance+650)!;
views.gorge=[gorgeEye.x,gorgeEye.z+1100,gorgeEye.y,gorgeTarget.x,gorgeTarget.z+140,gorgeTarget.y];
function view(name:string){const v=views[name];activeView=name;boatMode=name==='boat';if(boatMode)crewBoat();camera.position.set(v[0],name==='water_bridge'||name==='boat'||name.startsWith('underwater')?v[1]:Math.max(v[1],friendsWaterGround(v[0],v[2])+300),v[2]);controls.target.set(v[3],v[4],v[5]);controls.update();}
for(const name of Object.keys(views)){const button=document.createElement('button');button.textContent=name.replaceAll('_',' ');button.onclick=()=>view(name);document.getElementById('views')!.append(button);}
for(const [label,hour] of [['Day',12],['Dusk',20],['Night',23]] as const){const button=document.createElement('button');button.textContent=label;button.onclick=()=>frontier.setEnvironment({hour,speed:0});document.getElementById('views')!.append(button);}
for(const [label,side,reverse]of [['Left stroke','left',false],['Right stroke','right',false],['Back left','left',true],['Back right','right',true]] as const){const button=document.createElement('button');button.textContent=label;button.onclick=()=>row(side,reverse);document.getElementById('views')!.append(button);}
frontier.setEnvironment({hour:12,speed:0});view(new URLSearchParams(location.search).get('view')||'deepmere');
let elapsed=0,frames=0,last=performance.now();const times:number[]=[];
function frame(){requestAnimationFrame(frame);const start=performance.now();elapsed+=16.67;
  underwater.beginFrame();
  if(boatMode){
    const before=snapshot.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!;
    for(const [id,command]of commands){command.sequence++;sim.setInput(id,command);}
    sim.tick(16.67);snapshot=sim.createSnapshot();const after=snapshot.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!;
    camera.position.x+=after.x-before.x;camera.position.z+=after.y-before.y;controls.target.x+=after.x-before.x;controls.target.z+=after.y-before.y;
  }
  boats.update(snapshot.friends,snapshot.elapsedMs);
  rigs.forEach((rig,i)=>{const p=snapshot.players[i],stroke=p.friendsSeat?.index===0?snapshot.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!.rowing!.left:snapshot.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!.rowing!.right;rig.root.visible=Boolean(p.friendsSeat);if(rig.root.visible){updateCoopOperatorRig(rig,p,snapshot.elapsedMs,16.67);updateFriendsCharacter(rig,p,snapshot.elapsedMs,undefined,false,rowboatStrokePhase(stroke,snapshot.elapsedMs));rig.firearm.group.visible=false;}});
  controls.update();frontier.update(snapshot.friends!.frontier,camera.position.x,camera.position.z,elapsed,0);rail.update(camera,true);underwater.update(camera,elapsed,true,frontier.soundscapeEnvironment.daylight,frontier.terrain);renderer.render(scene,camera);frames++;
  times.push(performance.now()-start);if(times.length>120)times.shift();
  if(performance.now()-last>1000){document.getElementById('stats')!.textContent=`${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString()} triangles`;last=performance.now();}
}
frame();
Object.assign(window,{riverReview:{scene,renderer,camera,frontier,rail,underwater,view,row,snapshot:()=>snapshot,frames:()=>frames,stats:()=>({draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,terrain:frontier.terrainStats,frameMs:times.reduce((a,b)=>a+b,0)/times.length,rivers:FRIENDS_RIVERS.map(r=>({id:r.id,metres:r.length/12})),bridgeGround:baseTerrainHeight(20000,26900)}),hour:(hour:number)=>frontier.setEnvironment({hour,speed:0})}});
addEventListener('keydown',e=>{if(e.code==='Digit1'||e.code==='Digit2')row(e.code==='Digit1'?'left':'right',e.shiftKey);if(e.key.toLowerCase()==='h')document.querySelector('aside')!.hidden=!document.querySelector('aside')!.hidden;});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
