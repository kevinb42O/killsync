import { CAVE_PROPS } from '../world/FriendsCaveProps';
import * as THREE from 'three';
import { CAVE_LAVA, CAVE_STAIRS, CAVE_LIFTS } from '../world/FriendsCaveDescent';
import { LAVA_SURFACE_GLSL } from './FriendsLavaSurface';
import { applyFriendsCaveLighting } from './FriendsCaveLighting';

/** Bounded lights and instanced masonry keep the descent cheap to revisit. */
export class FriendsCaveDescentVisuals extends THREE.Group {
 private lavaMaterial:THREE.ShaderMaterial;
 private lights:THREE.PointLight[]=[];
 private liftMarkers:{mesh:THREE.Mesh;claim:string}[]=[];
 private relic:THREE.Group;
 constructor(stoneBase?:THREE.MeshStandardMaterial){
  super();this.name='lantern-descent-expedition';
  const stone=stoneBase?.clone()??new THREE.MeshStandardMaterial();stone.vertexColors=false;stone.color.setHex(0x909b99);stone.roughness=.85;applyFriendsCaveLighting(stone);
  const wood=applyFriendsCaveLighting(new THREE.MeshStandardMaterial({color:0x624431,roughness:.92}));
  const bronze=applyFriendsCaveLighting(new THREE.MeshStandardMaterial({color:0x8f6540,metalness:.65,roughness:.6}));
  const crystal=applyFriendsCaveLighting(new THREE.MeshStandardMaterial({color:0x729ba8,emissive:0x204d66,emissiveIntensity:.22,roughness:.25,metalness:.2}));
  const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion();
  const road=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),stone,CAVE_STAIRS.length);road.name='eight-unit-dungeon-stairs';
  CAVE_STAIRS.forEach((s,i)=>{rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.atan2(s.dy,s.dx));matrix.compose(new THREE.Vector3((s.a.x+s.b.x)/2,s.z-8,(s.a.y+s.b.y)/2),rotation,new THREE.Vector3(s.length+.1,16,s.width));road.setMatrixAt(i,matrix);});
  road.computeBoundingSphere();road.castShadow=road.receiveShadow=true;this.add(road);
  for(const [name,material]of [['stone',stone],['wood',wood],['bronze',bronze],['crystal',crystal]] as const){
   const batch=CAVE_PROPS.filter(p=>p.material===name);
   const mesh=new THREE.InstancedMesh(name==='crystal'?new THREE.CylinderGeometry(.08,1,1,5):new THREE.BoxGeometry(1,1,1),material,batch.length);
   mesh.name=name==='wood'?'abandoned-mine-supports':name==='bronze'?'buried-forge-machinery':name==='crystal'?'listening-cavern-crystals':'buried-ruin-colonnades';
   batch.forEach((p,i)=>mesh.setMatrixAt(i,matrix.compose(new THREE.Vector3(p.x,p.z+p.h/2,p.y),new THREE.Quaternion(),new THREE.Vector3(name==='crystal'?p.w/2:p.w,p.h,name==='crystal'?p.d/2:p.d))));
   mesh.computeBoundingSphere();mesh.castShadow=mesh.receiveShadow=true;this.add(mesh);
  }
  this.lavaMaterial=new THREE.ShaderMaterial({fog:true,uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{time:{value:0}}]),vertexShader:`varying vec2 world;#include <fog_pars_vertex>
   void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xz;vec4 mvPosition=viewMatrix*p;gl_Position=projectionMatrix*mvPosition;#include <fog_vertex>}`,fragmentShader:`varying vec2 world;uniform float time;#include <fog_pars_fragment>
   ${LAVA_SURFACE_GLSL}
   void main(){gl_FragColor=vec4(lavaSurface(world,time,.04,0.)*.95,1.);#include <tonemapping_fragment>
   #include <colorspace_fragment>
   #include <fog_fragment>}`});
  // Preprocessor directives must start on their own line.
  this.lavaMaterial.vertexShader=this.lavaMaterial.vertexShader.replace(/(#include <[^>]+>)/g,'\n$1\n');this.lavaMaterial.fragmentShader=this.lavaMaterial.fragmentShader.replace(/(#include <[^>]+>)/g,'\n$1\n');
  for(const l of CAVE_LAVA){const pool=new THREE.Mesh(new THREE.CircleGeometry(1,64),this.lavaMaterial);pool.name=`dungeon-lava-${l.id}`;pool.rotation.x=-Math.PI/2;pool.scale.set(l.rx,l.ry,1);pool.position.set(l.x,l.z,l.y);this.add(pool);}
  for(let i=0;i<2;i++){const light=new THREE.PointLight(0xff7836,0,640,2);this.lights.push(light);this.add(light);}
  const inactive=applyFriendsCaveLighting(new THREE.MeshStandardMaterial({color:0x6b5340,metalness:.6,roughness:.6}));
  const active=applyFriendsCaveLighting(new THREE.MeshStandardMaterial({color:0xaacac1,emissive:0x64b9aa,emissiveIntensity:.75,metalness:.5,roughness:.4}));
  for(const l of CAVE_LIFTS){
   const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(18,22,8,8),stone);pedestal.position.set(l.x,l.z+4,l.y);this.add(pedestal);
   const marker=new THREE.Mesh(new THREE.TorusGeometry(17,3,6,16),inactive);marker.position.set(l.x,l.z+42,l.y);marker.userData.activeMaterial=active;marker.userData.inactiveMaterial=inactive;this.add(marker);this.liftMarkers.push({mesh:marker,claim:l.claim});
  }
  this.relic=new THREE.Group();this.relic.name='sunline-expedition-home-relic';this.relic.position.set(6480,704,5552);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(20,24,16,8),new THREE.MeshStandardMaterial({color:0x666b63,roughness:.9}));base.position.y=8;this.relic.add(base);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(17,3,8,24),new THREE.MeshStandardMaterial({color:0xe9ba68,emissive:0xc27c28,emissiveIntensity:.25,metalness:.7,roughness:.3}));ring.position.y=40;this.relic.add(ring);this.add(this.relic);
 }
 update(time:number,camera:THREE.Camera,claims:readonly string[]=[]){
  this.lavaMaterial.uniforms.time.value=time;
  const nearest=CAVE_LAVA.map(l=>({l,d:camera.position.distanceTo(new THREE.Vector3(l.x,l.z+32,l.y))})).sort((a,b)=>a.d-b.d);
  this.lights.forEach((light,i)=>{const p=nearest[i];if(!p){light.intensity=0;return;}light.position.set(p.l.x,p.l.z+32,p.l.y);light.intensity=p.d<800?42000*(1+.04*Math.sin(time*2+p.l.x)):0;});
  for(const marker of this.liftMarkers){marker.mesh.material=marker.mesh.userData[claims.includes(marker.claim)?'activeMaterial':'inactiveMaterial'];}
  this.relic.visible=claims.includes('descent-vault-cache');
 }
 dispose(){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);for(const key of ['activeMaterial','inactiveMaterial'])if(o.userData[key])materials.add(o.userData[key]);if(o instanceof THREE.InstancedMesh)o.dispose();}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.removeFromParent();}
}
