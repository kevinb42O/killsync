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
const sim=new FriendsSimulation([{id:'review',label:'River review',color:'#fff'}]),snapshot=sim.createSnapshot();
const views:Record<string,number[]>={
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
function view(name:string){const v=views[name];camera.position.set(v[0],name==='water_bridge'?v[1]:Math.max(v[1],friendsWaterGround(v[0],v[2])+300),v[2]);controls.target.set(v[3],v[4],v[5]);controls.update();}
for(const name of Object.keys(views)){const button=document.createElement('button');button.textContent=name.replaceAll('_',' ');button.onclick=()=>view(name);document.getElementById('views')!.append(button);}
for(const [label,hour] of [['Day',12],['Dusk',20],['Night',23]] as const){const button=document.createElement('button');button.textContent=label;button.onclick=()=>frontier.setEnvironment({hour,speed:0});document.getElementById('views')!.append(button);}
frontier.setEnvironment({hour:12,speed:0});view('deepmere');
let elapsed=0,frames=0,last=performance.now();const times:number[]=[];
function frame(){requestAnimationFrame(frame);const start=performance.now();elapsed+=16.67;
  controls.update();frontier.update(snapshot.friends!.frontier,camera.position.x,camera.position.z,elapsed,0);rail.update(camera,true);renderer.render(scene,camera);frames++;
  times.push(performance.now()-start);if(times.length>120)times.shift();
  if(performance.now()-last>1000){document.getElementById('stats')!.textContent=`${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString()} triangles`;last=performance.now();}
}
frame();
Object.assign(window,{riverReview:{scene,renderer,camera,frontier,rail,view,frames:()=>frames,stats:()=>({draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,terrain:frontier.terrainStats,frameMs:times.reduce((a,b)=>a+b,0)/times.length,rivers:FRIENDS_RIVERS.map(r=>({id:r.id,metres:r.length/12})),bridgeGround:baseTerrainHeight(20000,26900)}),hour:(hour:number)=>frontier.setEnvironment({hour,speed:0})}});
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h')document.querySelector('aside')!.hidden=!document.querySelector('aside')!.hidden;});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
