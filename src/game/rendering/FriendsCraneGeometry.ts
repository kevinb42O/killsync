import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { friendsShapeBoxes } from '../multiplayer/FriendsBuilding';

function builder() {
  const parts:THREE.BufferGeometry[]=[];
  const add=(geometry:THREE.BufferGeometry,color:string)=>{
    const c=new THREE.Color(color),n=geometry.getAttribute('position').count,colors=new Float32Array(n*3);
    for(let i=0;i<n;i++)colors.set([c.r,c.g,c.b],i*3);
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(geometry);
  };
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,color:string)=>add(new THREE.BoxGeometry(w,h,d).translate(x,y,z),color);
  const finish=()=>{const geometry=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());geometry.clearGroups();return geometry;};
  return {add,box,finish};
}
/** Authored steel, brass, drum and bracing share one vertex-coloured geometry.
 * No textures, dynamic lights, separate bolts or per-device scene objects. */
export function createCraneGeometry() {
  const {add,box,finish}=builder();
  for(const b of friendsShapeBoxes('crane'))box(b.w,b.h,b.d,b.x,b.z+b.h/2,b.y,'#497c77');
  box(76,3,76,-64,9.5,0,'#2b4142');
  for(const x of [-96,-32])for(const z of [-32,32])box(5,4,5,x,12,z,'#e4b879');
  box(24,6,26,-64,137,0,'#e4b879');
  box(20,26,3,-64,43,-33.5,'#20383a');
  box(13,8,2,-64,49,-35.5,'#a7d9b6');
  for(const x of [-71,-57])box(4,4,2,x,37,-35.5,'#e4b879');
  // Side braces read as a lightweight truss from either direction.
  for(const z of [-12,12]) {
    const a=new THREE.Vector3(-64,68,z),b=new THREE.Vector3(42,140,z),delta=b.clone().sub(a);
    add(new THREE.BoxGeometry(6,delta.length(),5).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize())).translate((a.x+b.x)/2,(a.y+b.y)/2,z),'#b8bca3');
  }
  for(const x of [-84,-44])add(new THREE.CylinderGeometry(18,18,4,12).rotateX(Math.PI/2).translate(x,84,0),'#e4b879');
  add(new THREE.CylinderGeometry(13,13,36,12).rotateZ(Math.PI/2).translate(-64,84,0),'#35494a');
  for(const x of [-76,-68,-60,-52])add(new THREE.TorusGeometry(13,1.5,4,12).rotateY(Math.PI/2).translate(x,84,0),'#d5bea0');
  box(30,4,24,120,142,0,'#263f41');
  add(new THREE.CylinderGeometry(10,10,18,12).rotateX(Math.PI/2).translate(120,136,0),'#e4b879');
  for(const x of [-12,28,68,108])box(18,2,20,x,161,0,'#e4b879');
  return finish();
}
export function createCraneHookGeometry() {
  const {add,box,finish}=builder();
  add(new THREE.CylinderGeometry(3,5,9,8).translate(0,-4.5,0),'#d8b77a');
  box(12,8,9,0,-11,0,'#355c5c');
  add(new THREE.TorusGeometry(6,2,5,12,Math.PI*1.65).rotateZ(Math.PI*.35).translate(0,-21,0),'#e4b879');
  box(2,9,2,4,-19,0,'#758f89');
  return finish();
}
/** Socket kit uses the same metal palette as the original crane, one draw per
 * instanced part type. Truss voids are geometry rather than transparent textures. */
export function createCranePartGeometry(shape:string) {
  const {add,box,finish}=builder(),steel='#497c77',dark='#263f41',brass='#e4b879';
  if(shape==='crane_boom') {
    for(const y of [3,21])for(const z of [-8,8])box(96,6,4,0,y,z,steel);
    for(const x of [-46,46])box(4,24,20,x,12,0,dark);
    for(const z of [-9,9])for(let i=0;i<4;i++){
      const a=new THREE.Vector3(-46+i*23,i%2?21:3,z),b=new THREE.Vector3(-23+i*23,i%2?3:21,z),delta=b.clone().sub(a);
      add(new THREE.BoxGeometry(3,delta.length(),3).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize())).translate((a.x+b.x)/2,(a.y+b.y)/2,z),brass);
    }
    for(const x of [-46,46])for(const z of [-11,11])box(5,5,2,x,12,z,brass);
  }else if(shape==='crane_joint') {
    box(80,8,80,0,4,0,steel);box(18,86,18,0,51,0,steel);
    for(const x of [-32,32])for(const z of [-32,32])box(5,3,5,x,9.5,z,brass);
    add(new THREE.CylinderGeometry(24,24,20,16).translate(0,118,0),steel);
    for(const y of [98,106,127])add(new THREE.CylinderGeometry(24,24,3,16).translate(0,y,0),brass);
    box(25,26,18,19,88,0,dark);box(6,18,20,32,88,0,brass);
    for(const z of [-23,23])box(14,18,2,0,119,z,dark);
    // Local controls are readable even when no separate console is built.
    box(20,21,3,0,42,-13,dark);box(12,7,2,0,46,-15,'#a7d9b6');
  }else if(shape==='crane_winch') {
    box(32,5,40,0,29.5,0,steel);for(const z of [-18,18])box(26,26,4,0,13,z,steel);
    add(new THREE.CylinderGeometry(10,10,30,12).rotateX(Math.PI/2).translate(0,13,0),dark);
    for(const z of [-12,-6,0,6,12])add(new THREE.TorusGeometry(10,1.4,4,12).translate(0,13,z),brass);
    box(10,5,12,0,2.5,0,dark);
  }else {
    box(32,4,24,0,2,0,steel);box(8,22,8,0,15,0,steel);box(32,16,18,0,32,0,steel);
    box(27,11,2,0,32,-10,dark);box(13,7,1,-5,33,-11,'#a7d9b6');for(const x of [6,11])box(3,3,1,x,32,-11,brass);
  }
  return finish();
}
