import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createFriendsSeasidePier,updateFriendsSeasidePier} from './FriendsSeasidePierVisuals';
import {friendsAssetsReady} from './FriendsAssets';
import {FriendsTerrain} from '../world/FriendsTerrain';
import {seasidePierPoint,PIER_CAFE_CHAIRS} from '../world/FriendsSeasidePier';

describe('pier rendering and furniture budgets',()=>{
  it('uses one upward-facing walking surface at the promenade/terrace join and inside',async()=>{
    const source=new THREE.Group();source.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));
    const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:source} as never);
    try{
      const group=createFriendsSeasidePier(new FriendsTerrain());await friendsAssetsReady();await new Promise(resolve=>setTimeout(resolve,0));group.updateMatrixWorld(true);
      const floors:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&o.material.name==='pier-walking-floor')floors.push(o);});
      expect(floors).toHaveLength(1);const normals=floors[0].geometry.attributes.normal;
      for(let i=0;i<normals.count;i++)expect(normals.getY(i)).toBeGreaterThan(.99);
      for(const [along,across] of [[1200,13],[2990,37],[3500,21],[3800,-250]]){
        const point=seasidePierPoint(along,across),ray=new THREE.Raycaster(new THREE.Vector3(point.x,200,point.y),new THREE.Vector3(0,-1,0));
        const hits=ray.intersectObject(floors[0]);expect(hits).toHaveLength(1);expect(hits[0].point.y).toBeCloseTo(96);
      }
      const camera=new THREE.PerspectiveCamera();camera.position.set(0,5000,0);updateFriendsSeasidePier(group,camera);
      const detail=group.getObjectByName('pier-chairs-detailed')!.children[0] as THREE.InstancedMesh;
      const lod=group.getObjectByName('pier-chairs-distant')!.children[0] as THREE.InstancedMesh;
      expect(detail.count).toBe(0);expect(lod.count).toBe(22);
      const seat=PIER_CAFE_CHAIRS[0];camera.position.set(seat.x,seat.z+40,seat.y);updateFriendsSeasidePier(group,camera);
      expect(detail.count).toBeGreaterThan(0);expect(detail.count+lod.count).toBe(22);
      let meshes=0;group.traverse(o=>{if(o instanceof THREE.Mesh)meshes++;});expect(meshes).toBeLessThanOrEqual(32);
    }finally{loader.mockRestore();}
  });
});
