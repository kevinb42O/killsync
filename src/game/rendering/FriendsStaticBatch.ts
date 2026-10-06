import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
/** Bake immutable architecture into spatial material batches after assets load.
 * Each tile retains independent frustum culling, instead of hundreds of draws
 * for windows, chairs, roof beams and station furniture. */
export function batchFriendsStatic(root:THREE.Group) {
  root.updateMatrixWorld(true);
  const buckets=new Map<string,{material:THREE.Material;geometries:THREE.BufferGeometry[];meshes:THREE.Mesh[]}>();
  const inverse=root.matrixWorld.clone().invert();
  root.traverseVisible(o=>{
    if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||Array.isArray(o.material))return;
    const m=o.material as THREE.MeshStandardMaterial,p=new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    const key=[Math.floor(p.x/1024),Math.floor(p.z/1024),m.type,m.color?.getHex(),m.emissive?.getHex(),m.roughness,m.metalness,m.opacity,m.transparent,m.alphaTest,m.emissiveIntensity,m.side,m.vertexColors,m.map?.source.uuid,m.normalMap?.source.uuid,o.castShadow,o.receiveShadow,Boolean(o.geometry.index),Object.keys(o.geometry.attributes).sort().join(',')].join(':');
    const bucket=buckets.get(key)||{material:m,geometries:[],meshes:[]};
    const geometry=o.geometry.clone();geometry.clearGroups();geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));bucket.geometries.push(geometry);bucket.meshes.push(o);buckets.set(key,bucket);
  });
  const oldGeometries=new Set<THREE.BufferGeometry>(),oldMaterials=new Set<THREE.Material>();
  for(const bucket of buckets.values()){
    if(bucket.meshes.length<2){bucket.geometries.forEach(g=>g.dispose());continue;}
    const geometry=mergeGeometries(bucket.geometries,false);bucket.geometries.forEach(g=>g.dispose());if(!geometry)continue;
    const mesh=new THREE.Mesh(geometry,bucket.material);mesh.name='spatial-static-batch';mesh.castShadow=bucket.meshes[0].castShadow;mesh.receiveShadow=bucket.meshes[0].receiveShadow;geometry.computeBoundingSphere();root.add(mesh);
    for(const old of bucket.meshes){oldGeometries.add(old.geometry);oldMaterials.add(old.material as THREE.Material);old.removeFromParent();}
  }
  // Source geometries can be shared with an instanced mesh, which stays live.
  const liveTextures=new Set<THREE.Texture>();
  root.traverse(o=>{if(o instanceof THREE.Mesh){oldGeometries.delete(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){oldMaterials.delete(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)liveTextures.add(v);}}});oldGeometries.forEach(g=>g.dispose());
  for(const m of oldMaterials){if(!m.userData.friendsSharedTextures)for(const v of Object.values(m))if(v instanceof THREE.Texture&&!liveTextures.has(v))v.dispose();m.dispose();}
}
