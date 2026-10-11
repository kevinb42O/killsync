import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {FriendsCaveDescentVisuals} from './FriendsCaveDescentVisuals';
import {CAVE_PROPS} from '../world/FriendsCaveProps';
describe('shared cave fixture rendering and cleanup',()=>{
 it('renders fixtures at the same dimensions and elevations as their physical definitions',()=>{
  const visuals=new FriendsCaveDescentVisuals(),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  for(const [material,name]of [['wood','abandoned-mine-supports'],['bronze','buried-forge-machinery'],['crystal','listening-cavern-crystals'],['stone','buried-ruin-colonnades']]){
   const props=CAVE_PROPS.filter(p=>p.material===material),mesh=visuals.getObjectByName(name) as THREE.InstancedMesh;
   expect(mesh.count).toBe(props.length);
   props.forEach((p,i)=>{mesh.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);expect(position.toArray()).toEqual([p.x,p.z+p.h/2,p.y].map(Math.fround));expect(scale.x).toBeCloseTo(p.shape==='crystal'?p.w/2:p.w,4);expect(scale.y).toBeCloseTo(p.h,4);expect(scale.z).toBeCloseTo(p.shape==='crystal'?p.d/2:p.d,4);});
  }
  visuals.dispose();
 });
 it('releases every owned geometry and material once without disposing the shared terrain material',()=>{
  const base=new THREE.MeshStandardMaterial();let baseDisposed=false;base.addEventListener('dispose',()=>baseDisposed=true);
  for(let run=0;run<3;run++){
   const visuals=new FriendsCaveDescentVisuals(base),parent=new THREE.Group();parent.add(visuals);
   const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
   visuals.traverse(o=>{if(o instanceof THREE.Mesh){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);for(const key of ['activeMaterial','inactiveMaterial'])if(o.userData[key])materials.add(o.userData[key]);}});
   let geometriesDisposed=0,materialsDisposed=0;geometry.forEach(g=>g.addEventListener('dispose',()=>geometriesDisposed++));materials.forEach(m=>m.addEventListener('dispose',()=>materialsDisposed++));
   visuals.dispose();expect(geometriesDisposed).toBe(geometry.size);expect(materialsDisposed).toBe(materials.size);expect(parent.children).toHaveLength(0);
  }
  expect(baseDisposed).toBe(false);base.dispose();
 });
});
