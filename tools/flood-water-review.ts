import * as THREE from 'three';
import { FriendsTerrain } from '../src/game/world/FriendsTerrain';
import { ISLAND_LAKES } from '../src/game/world/FriendsIsland';
import { friendsWaterAt, friendsWaterRenderDepth } from '../src/game/world/FriendsWaterSurface';
import { friendsFloodWater } from '../src/game/world/FriendsFloodWater';
import { FriendsFloodWaterVisuals } from '../src/game/rendering/FriendsFloodWaterVisuals';
import { islandWater } from '../src/game/rendering/FriendsIslandVisuals';
import type { FriendsDayNightCycle } from '../src/game/rendering/FriendsDayNightCycle';
const terrain=new FriendsTerrain();let bank:{vx:number;vy:number;vz:number;dx:number;dy:number;level:number;bodyId:string}|undefined;
for(let y=18300;y<20500&&!bank;y+=32)for(let x=5600;x<8300&&!bank;x+=32){const vx=Math.floor(x/32),vy=Math.floor(y/32);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const s=friendsWaterAt((vx+dx+.5)*32,(vy+dy+.5)*32);if(!s||!ISLAND_LAKES.some(l=>l.id===s.bodyId))continue;const vz=Math.ceil(s.level/32)-1;if(terrain.material(vx,vy,vz)&&!terrain.material(vx+dx,vy+dy,vz)){bank={vx,vy,vz,dx,dy,level:s.level,bodyId:s.bodyId};break;}}}
if(!bank)throw Error('No review bank');
const b=bank,x=(b.vx+.5)*32,y=(b.vy+.5)*32;
const scene=new THREE.Scene();scene.background=new THREE.Color('#9bbcca');const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.5,6000);camera.position.set(x+220,b.level+210,y+300);camera.lookAt(x,b.level-25,y);
scene.add(new THREE.HemisphereLight('#d0eaff','#716e55',2.5));const sun=new THREE.DirectionalLight('#fff0d5',2);sun.position.set(x+100,b.level+400,y+200);scene.add(sun);
const atmosphere={lightDirection:{value:new THREE.Vector3(.55,.36,-.45).normalize()},lightColor:{value:new THREE.Color(1,.85,.62)},directStrength:{value:1},surfaceTint:{value:new THREE.Color(1,1,1)},horizon:new THREE.Color('#a3cad1'),zenith:new THREE.Color('#4785b0')} as unknown as FriendsDayNightCycle;
const natural=islandWater(x,y,1024,1024,b.level,(x,y)=>friendsWaterRenderDepth(x,y,b.bodyId));scene.add(natural);
for(const [name,value]of Object.entries({waterLightDirection:atmosphere.lightDirection,waterLightColor:atmosphere.lightColor,waterDirectStrength:atmosphere.directStrength,waterTint:atmosphere.surfaceTint,waterHorizon:{value:atmosphere.horizon},waterZenith:{value:atmosphere.zenith}}))natural.material.uniforms[name]=value;
const visual=new FriendsFloodWaterVisuals(terrain,atmosphere);visual.bindNatural(natural);scene.add(visual);
const ground=new THREE.Group();scene.add(ground);const mat=new THREE.MeshStandardMaterial({color:'#8e9870',roughness:1});const box=new THREE.BoxGeometry(32,32,32);
function rebuildGround(){for(const o of [...ground.children])ground.remove(o);for(let vx=b.vx-12;vx<=b.vx+12;vx++)for(let vy=b.vy-12;vy<=b.vy+12;vy++)for(let vz=b.vz-5;vz<=b.vz+4;vz++){if(!terrain.material(vx,vy,vz))continue;if([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].every(([dx,dy,dz])=>terrain.material(vx+dx,vy+dy,vz+dz)))continue;const m=new THREE.Mesh(box,mat);m.position.set((vx+.5)*32,(vz+.5)*32,(vy+.5)*32);ground.add(m);}}
function dig(){for(let i=0;i<6;i++)for(let z=b.vz-2;z<=b.vz+1;z++)for(let w=-1;w<=1;w++)terrain.set(b.vx-i*b.dx+w*b.dy,b.vy-i*b.dy+w*b.dx,z,0);visual.sync();rebuildGround();}
function seal(){for(let z=b.vz-2;z<=b.vz;z++)for(let w=-1;w<=1;w++)terrain.set(b.vx+w*b.dy,b.vy+w*b.dx,z,1);visual.sync();rebuildGround();}
function draw(){visual.update(12);renderer.render(scene,camera);}
function view(name:string){if(name==='inside'){camera.position.set(x-b.dx*95,b.level-25,y-b.dy*95);camera.lookAt(x,b.level-10,y);}else{camera.position.set(x+220,b.level+210,y+300);camera.lookAt(x-b.dx*70,b.level-25,y-b.dy*70);}draw();}
function night(on:boolean){scene.background=new THREE.Color(on?'#101e30':'#9bbcca');atmosphere.surfaceTint.value.set(on?'#34506a':'#ffffff');atmosphere.directStrength.value=on?0:1;sun.intensity=on?.05:2;draw();}
dig();draw();Object.assign(window,{floodReview:{terrain,visual,scene,renderer,camera,bank:b,dig,seal,draw,view,night,field:friendsFloodWater(terrain)}});
