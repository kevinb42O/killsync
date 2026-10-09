import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {FriendsTerrain} from '../src/game/world/FriendsTerrain';
import {friendsWaterAt,friendsWaterGround} from '../src/game/world/FriendsWaterSurface';
import {FriendsUnderwaterVisuals} from '../src/game/rendering/FriendsUnderwaterVisuals';
import {islandWater} from '../src/game/rendering/FriendsIslandVisuals';
const scene=new THREE.Scene(),terrain=new FriendsTerrain(),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.body.append(renderer.domElement);
scene.background=new THREE.Color('#99bec9');scene.fog=new THREE.FogExp2('#99bec9',.000015);
scene.add(new THREE.HemisphereLight(0xcbe6f0,0x718365,1.5));const sun=new THREE.DirectionalLight(0xffebc9,2.4);scene.add(sun,sun.target);
const camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,1,12000),controls=new OrbitControls(camera,renderer.domElement),effect=new FriendsUnderwaterVisuals(scene),bed=new THREE.Group();scene.add(bed);
let elapsed=20000,paused=false,scenery=true,swimming=false,current='lake';
const floorMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
const sites:Record<string,[number,number]>={lake:[12128,23600],sea:[40000,23852],abyss:[44000,23852]};
function view(name:string){effect.beginFrame();current=name;swimming=name==='swimming';const [x,z]=sites[name]??sites.lake,water=friendsWaterAt(x,z)!,sea=water.bodyId==='sea',floor=terrain.floor(x,z,water.level,0)!;
 for(const child of [...bed.children]){bed.remove(child);if(child instanceof THREE.Mesh){child.geometry.dispose();if(child.material!==floorMaterial)(child.material as THREE.Material).dispose();}}
 const geometry=new THREE.PlaneGeometry(2400,2400,75,75);geometry.rotateX(-Math.PI/2);const p=geometry.getAttribute('position'),colours=[];
 for(let i=0;i<p.count;i++){const wx=x+p.getX(i),wz=z+p.getZ(i),ground=friendsWaterGround(wx,wz);p.setXYZ(i,wx,ground,wz);const c=new THREE.Color(sea?'#999b8d':'#a6ae88').multiplyScalar(.88+.12*Math.sin(wx*.037+wz*.025));colours.push(c.r,c.g,c.b);}
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geometry.computeVertexNormals();bed.add(new THREE.Mesh(geometry,floorMaterial));
 bed.add(islandWater(x,z,2400,2400,water.level,(wx,wz)=>friendsWaterAt(wx,wz)?.depth??-32));
 camera.position.set(x,swimming?water.level+14:floor+140,z);controls.target.set(x+180,floor+20,z+250);controls.update();sun.position.set(x-400,water.level+850,z-300);sun.target.position.set(x,floor,z);sun.updateMatrixWorld();sun.target.updateMatrixWorld();
 document.getElementById('stats')!.textContent=`Water depth: ${Math.round(water.depth/12)} m`;
}
function draw(){effect.beginFrame();effect.update(camera,elapsed,true,1,terrain,swimming);const root=scene.getObjectByName('submerged-bed-dressing');if(root&&!scenery)root.visible=false;renderer.render(scene,camera);}
for(const name of ['lake','sea','abyss','swimming']){const b=document.createElement('button');b.textContent=name;b.onclick=()=>view(name);document.getElementById('views')!.append(b);}
const toggle=document.createElement('button');toggle.textContent='Scenery on / off';toggle.onclick=()=>{scenery=!scenery;};document.getElementById('views')!.append(toggle);
function frame(){requestAnimationFrame(frame);if(!paused){elapsed+=16.67;controls.update();draw();}}view(new URLSearchParams(location.search).get('view')??'lake');frame();
Object.assign(window,{submergedReview:{scene,renderer,camera,terrain,effect,view,draw,pause:()=>{paused=true;},scenery:(v:boolean)=>{scenery=v;},mode:()=>current}});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h')document.querySelector('aside')!.hidden=!document.querySelector('aside')!.hidden;});
