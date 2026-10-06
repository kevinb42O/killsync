import * as THREE from 'three';
import { describe,expect,it } from 'vitest';
import { batchFriendsStatic } from './FriendsStaticBatch';
describe('spatial static architecture batches',()=>{
  it('reduces draw objects while preserving transformed geometry and tile culling',()=>{
    const root=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:0x778899});
    for(const x of [100,200,2200,2300]){const parent=new THREE.Group();parent.position.set(x,30,50);parent.rotation.y=.4;const mesh=new THREE.Mesh(new THREE.BoxGeometry(20,40,30),material);parent.add(mesh);root.add(parent);}
    const before=new THREE.Box3().setFromObject(root);batchFriendsStatic(root);const meshes:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
    expect(meshes).toHaveLength(2);expect(meshes.every(m=>m.geometry.boundingSphere)).toBe(true);
    const after=new THREE.Box3().setFromObject(root);expect(after.min.distanceTo(before.min)).toBeLessThan(.001);expect(after.max.distanceTo(before.max)).toBeLessThan(.001);
  });
  it('retains hidden replacements and instanced vegetation without baking them',()=>{
    const root=new THREE.Group(),m=new THREE.MeshStandardMaterial(),hidden=new THREE.Mesh(new THREE.BoxGeometry(),m);hidden.visible=false;root.add(hidden);
    const trees=new THREE.InstancedMesh(new THREE.BoxGeometry(),m,4);root.add(trees);batchFriendsStatic(root);expect(hidden.parent).toBe(root);expect(trees.parent).toBe(root);
  });
});
