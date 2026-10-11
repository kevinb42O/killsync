import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createFriendsBreakwaters} from './FriendsBreakwaterVisuals';
import {FRIENDS_BREAKWATERS} from '../world/FriendsBreakwaters';
describe('batched static breakwater rendering',()=>{
  it('bounds draw calls and triangles, shares stone geometry, and culls each groyne independently',()=>{
    const group=createFriendsBreakwaters(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();let meshes=0,triangles=0,instances=0;
    expect(group.children).toHaveLength(FRIENDS_BREAKWATERS.length);
    group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;meshes++;expect(o.castShadow).toBe(false);expect(o.frustumCulled).toBe(true);geometries.add(o.geometry);materials.add(o.material as THREE.Material);
      const count=o instanceof THREE.InstancedMesh?o.count:1;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*count;
      if(o instanceof THREE.InstancedMesh){instances+=o.count;expect(o.boundingSphere?.radius).toBeGreaterThan(0);}
    });expect(meshes).toBe(45);expect(instances).toBeGreaterThan(1800);expect(geometries.size).toBe(17);expect(triangles).toBeLessThan(65000);
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  });
});
