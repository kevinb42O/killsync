import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FriendsUnderwaterVisuals } from '../src/game/rendering/FriendsUnderwaterVisuals';
import { FriendsUnderwaterBaselineReview } from './underwater-baseline';
import { islandWater } from '../src/game/rendering/FriendsIslandVisuals';
import { FriendsTerrain } from '../src/game/world/FriendsTerrain';

const x=12128,z=23600,level=154.5;
const scene=new THREE.Scene();scene.background=new THREE.Color('#99bec9');scene.fog=new THREE.FogExp2('#99bec9',.000015);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,1,15000),controls=new OrbitControls(camera,renderer.domElement);
const terrain=new FriendsTerrain();
scene.add(new THREE.HemisphereLight(0xcbe6f0,0x4c5341,1.5));const sun=new THREE.DirectionalLight(0xffebc9,2.4);sun.position.set(x-400,level+800,z-300);sun.target.position.set(x,0,z);scene.add(sun,sun.target);
const depthAt=(wx:number,wz:number)=>Math.max(40,240+(wz-z)*.12+Math.sin((wx-x)*.003)*50);
const floor=new THREE.PlaneGeometry(2400,2400,96,96);floor.rotateX(-Math.PI/2);const p=floor.getAttribute('position'),colours=[];
for(let i=0;i<p.count;i++){const wx=p.getX(i)+x,wz=p.getZ(i)+z,d=depthAt(wx,wz);p.setXYZ(i,wx,level-d,wz);const c=new THREE.Color('#b6a782').multiplyScalar(.85+.15*Math.sin(wx*.047+wz*.023)*Math.sin(wz*.039));colours.push(c.r,c.g,c.b);}
floor.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));floor.computeVertexNormals();scene.add(new THREE.Mesh(floor,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));
const rocks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:'#7e897d',roughness:.95}),70),matrix=new THREE.Matrix4();
for(let i=0;i<70;i++){const wx=x+(i%10-4.5)*95+Math.sin(i*11)*35,wz=z-170+Math.floor(i/10)*115,size=12+(i%7)*7;matrix.compose(new THREE.Vector3(wx,level-depthAt(wx,wz)+size*.38,wz),new THREE.Quaternion().setFromEuler(new THREE.Euler(i*.2,i*.5,0)),new THREE.Vector3(size,size*.7,size));rocks.setMatrixAt(i,matrix);}scene.add(rocks);
const pillars=new THREE.InstancedMesh(new THREE.CylinderGeometry(13,18,170,10),new THREE.MeshStandardMaterial({color:'#778b80',roughness:.9}),8);
for(let i=0;i<8;i++){const wx=x+(i%4-1.5)*160,wz=z+260+Math.floor(i/4)*200;matrix.makeTranslation(wx,level-depthAt(wx,wz)+85,wz);pillars.setMatrixAt(i,matrix);}scene.add(pillars);
const weedGeo=new THREE.PlaneGeometry(14,65,1,3),weedMat=new THREE.MeshStandardMaterial({color:'#476b46',side:THREE.DoubleSide,roughness:1}),weeds=new THREE.InstancedMesh(weedGeo,weedMat,110);
for(let i=0;i<110;i++){const wx=x+Math.sin(i*127.1)*520,wz=z+Math.sin(i*311.7)*540;matrix.compose(new THREE.Vector3(wx,level-depthAt(wx,wz)+32,wz),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),i*2.4),new THREE.Vector3(1,.5+(i%5)*.22,1));weeds.setMatrixAt(i,matrix);}scene.add(weeds);
const surface=islandWater(x,z,2500,2500,level,depthAt);scene.add(surface);
const roof=new THREE.Mesh(new THREE.BoxGeometry(320,40,320),new THREE.MeshStandardMaterial({color:'#4b5b52',roughness:1}));roof.position.set(x,208,z);roof.visible=false;scene.add(roof);
const previousSurface=await fetch('/artifacts/underwater-polish/source/baseline-surface.json').then(r=>r.json()),newSurface={vertexShader:surface.material.vertexShader,fragmentShader:surface.material.fragmentShader};
const enhanced=new FriendsUnderwaterVisuals(scene),baseline=new FriendsUnderwaterBaselineReview(scene);
let before=false,mode='shallow',time=12000,animated=true,night=false,roofed=false;
const views:Record<string,number[]>={shallow:[x-180,level-38,z-280,x+40,level-175,z+230],bottom:[x-220,level-105,z-330,x+80,level-220,z+230],up:[x,level-95,z,x+40,level+150,z+10],deep:[x,level-480,z-230,x+100,level-490,z+230],roof:[x,level-45,z,x+80,level-80,z+120],surface:[x-150,level+150,z-300,x+80,level-70,z+250]};
function view(name:string){mode=name;for(const o of [rocks,pillars,weeds])o.position.y=name==='deep'?-300:0;const floorMesh=scene.children.find(o=>o instanceof THREE.Mesh&&o.geometry===floor)!;floorMesh.position.y=name==='deep'?-300:0;const v=views[name];camera.position.set(v[0],v[1],v[2]);controls.target.set(v[3],v[4],v[5]);controls.update();const covered=name==='roof';roof.visible=covered;
 if(roofed!==covered){const vx=Math.floor(x/32),vy=Math.floor(z/32);for(let a=-5;a<=5;a++)for(let b=-5;b<=5;b++)terrain.set(vx+a,vy+b,6,covered?1:0);roofed=covered;}
}
function hour(dark:boolean){night=dark;sun.intensity=dark?0:2.4;(scene.children.find(o=>o instanceof THREE.HemisphereLight) as THREE.HemisphereLight).intensity=dark?.10:1.5;scene.background=new THREE.Color(dark?'#0b1d30':'#99bec9');surface.material.uniforms.waterDirectStrength.value=dark?0:1;surface.material.uniforms.waterTint.value.set(dark?'#284758':'#ffffff');surface.material.uniforms.waterHorizon.value.set(dark?'#14273d':'#9fbfc8');surface.material.uniforms.waterZenith.value.set(dark?'#071423':'#447ba7');}
function version(value:boolean){enhanced.beginFrame();baseline.beginFrame();before=value;Object.assign(surface.material,value?previousSurface:newSurface);surface.material.needsUpdate=true;}
function draw(){enhanced.beginFrame();baseline.beginFrame();surface.material.uniforms.time.value=time/1000;if(before)baseline.update(camera,time,true,night?0:1,terrain);else enhanced.update(camera,time,true,night?0:1,terrain);renderer.render(scene,camera);}
for(const name of Object.keys(views)){const b=document.createElement('button');b.textContent=name;b.onclick=()=>view(name);document.getElementById('controls')!.append(b);}
for(const [label,fn]of [['Before',()=>version(true)],['After',()=>version(false)],['Day',()=>{enhanced.beginFrame();baseline.beginFrame();hour(false);}],['Night',()=>{enhanced.beginFrame();baseline.beginFrame();hour(true);}]] as const){const b=document.createElement('button');b.textContent=label;b.onclick=fn;document.getElementById('controls')!.append(b);}
function frame(){requestAnimationFrame(frame);if(animated){time+=16.67;controls.update();draw();}}
view(new URLSearchParams(location.search).get('view')||'bottom');frame();
Object.assign(window,{underwaterReview:{scene,renderer,camera,terrain,enhanced,baseline,view,version,hour:(n:boolean)=>{enhanced.beginFrame();baseline.beginFrame();hour(n);},draw,pause:()=>{animated=false;},setTime:(t:number)=>{time=t;},mode:()=>mode}});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h')document.querySelector('aside')!.hidden=!document.querySelector('aside')!.hidden;});
