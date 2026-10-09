import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { islandWater } from '../src/game/rendering/FriendsIslandVisuals';

// Controlled shoreline fixture isolates the water shader from terrain streaming.
const scene=new THREE.Scene();scene.background=new THREE.Color('#9bbcca');
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,1,16000),controls=new OrbitControls(camera,renderer.domElement);
scene.add(new THREE.HemisphereLight(0xd7eafa,0x6d6041,2.5));
const sun=new THREE.DirectionalLight(0xffe6bd,2);sun.position.set(-500,700,-350);scene.add(sun);
const depthAt=(x:number,z:number)=>Math.max(-30,Math.min(800,(z+700)*.34+Math.sin(x*.006)*12));
const floor=new THREE.PlaneGeometry(5000,5000,110,110);floor.rotateX(-Math.PI/2);
const pos=floor.getAttribute('position'),colours=[];
for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),z=pos.getZ(i),d=depthAt(x,z);pos.setY(i,-d);
  const bands=.9+.1*Math.sin(x*.055+z*.022)*Math.sin(z*.035);
  const c=new THREE.Color(d<0?'#718044':'#c3b38b').multiplyScalar(bands);colours.push(c.r,c.g,c.b);
}
floor.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));floor.computeVertexNormals();
scene.add(new THREE.Mesh(floor,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));
const stones=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:'#847d68',roughness:.9}),45),matrix=new THREE.Matrix4();
for(let i=0;i<45;i++){const x=(i%9-4)*140+Math.sin(i*17)*25,z=-640+Math.floor(i/9)*110,scale=8+(i%4)*5;matrix.compose(new THREE.Vector3(x,-depthAt(x,z)+scale*.4,z),new THREE.Quaternion(),new THREE.Vector3(scale,scale*.7,scale));stones.setMatrixAt(i,matrix);}scene.add(stones);
const lake=islandWater(0,0,4800,4800,0,depthAt),sea=islandWater(0,0,4800,4800,0,depthAt,true);
// The production ocean uses a bounded camera-following 128x128 grid.
sea.geometry.dispose();sea.geometry=new THREE.PlaneGeometry(4800,4800,128,128);
sea.material.uniforms.wavePatch.value=1;sea.material.uniforms.waterOrigin.value.set(-2500,-2500);sea.material.uniforms.waterExtent.value.set(5000,5000);
const tex=sea.material.uniforms.bathymetry.value as THREE.DataTexture,depths=tex.image.data as Float32Array;
for(let y=0;y<tex.image.height;y++)for(let x=0;x<tex.image.width;x++){
  const wx=-2500+(x+.5)/tex.image.width*5000,wz=-2500+(y+.5)/tex.image.height*5000,d=depthAt(wx,wz);
  const dx=(depthAt(wx+1,wz)-depthAt(wx-1,wz))/2,dz=(depthAt(wx,wz+1)-depthAt(wx,wz-1))/2;
  depths.set([d,Math.max(0,Math.min(2000,d/Math.max(.04,Math.hypot(dx,dz)))),dx,dz],(y*tex.image.width+x)*4);
}tex.needsUpdate=true;
scene.add(lake,sea);sea.visible=false;
const original=new Map([lake,sea].map(mesh=>[mesh.material,{vertexShader:mesh.material.vertexShader,fragmentShader:mesh.material.fragmentShader}]));
const baseline=await fetch('/artifacts/water-polish/source/baseline-shaders.json').then(r=>r.json());
const beforeShore=await fetch('/artifacts/shorebreak/source/baseline-shaders.json').then(r=>r.json());
function shoreVersion(before:boolean){for(const [m,shaders]of original){Object.assign(m,before?beforeShore:shaders);m.needsUpdate=true;}}
let mode='lake',time=12,animated=true;
function version(before:boolean){for(const [m,shaders]of original){Object.assign(m,before?baseline:shaders);m.needsUpdate=true;}}
function view(name:string){mode=name;lake.visible=name!=='sea'&&name!=='shorebreak';sea.visible=!lake.visible;camera.position.set(400,name==='overhead'?1250:170,name==='overhead'?-250:-1000);controls.target.set(0,0,name==='overhead'?-250:350);if(name==='shorebreak'){camera.position.set(650,650,-1550);controls.target.set(0,0,-430);}controls.update();}
function hour(night:boolean){scene.background=new THREE.Color(night?'#111f35':'#9bbcca');for(const m of original.keys()){m.uniforms.waterTint.value.set(night?'#263f59':'#ffffff');m.uniforms.waterHorizon.value.set(night?'#192d47':'#a3cad1');m.uniforms.waterZenith.value.set(night?'#071124':'#4785b0');m.uniforms.waterDirectStrength.value=night?0:1;}sun.intensity=night?0:2;(scene.children.find(o=>o instanceof THREE.HemisphereLight) as THREE.HemisphereLight).intensity=night?.15:2.5;}
for(const name of ['lake','overhead','sea','shorebreak']){const b=document.createElement('button');b.textContent=name;b.onclick=()=>view(name);document.getElementById('controls')!.append(b);}
for(const [name,fn]of [['Before',()=>version(true)],['After',()=>version(false)],['Day',()=>hour(false)],['Night',()=>hour(true)],['Previous coast',()=>shoreVersion(true)],['Shorebreak',()=>shoreVersion(false)]] as const){const b=document.createElement('button');b.textContent=name;b.onclick=fn;document.getElementById('controls')!.append(b);}
function draw(){renderer.render(scene,camera);}
function frame(){requestAnimationFrame(frame);if(animated){time+=1/60;for(const m of original.keys())m.uniforms.time.value=time;controls.update();draw();}}
view(new URLSearchParams(location.search).get('view')||'lake');frame();
Object.assign(window,{waterReview:{scene,renderer,camera,view,version,shoreVersion,hour,draw,pause:()=>{animated=false;},setTime:(t:number)=>{time=t;for(const m of original.keys())m.uniforms.time.value=t;},mode:()=>mode}});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
