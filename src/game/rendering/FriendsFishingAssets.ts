import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadFriendsAsset } from './FriendsAssets';
import { groundedFishClip } from './FriendsFishGroundAnimation';
import { heldFishClip } from './FriendsFishingPresentation';

let fishTemplate:Promise<{root:THREE.Group;clips:THREE.AnimationClip[]}>|undefined;
let rodTemplate:Promise<THREE.Group>|undefined;
/** Collapse the downloaded fish's five palette submeshes into one skinned draw.
 * Every clone shares the finished geometry/material and owns only its skeleton. */
export function loadFishingFish(){
  fishTemplate??=new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/friends/fishing/koi.glb`).then(gltf=>{
    const meshes:THREE.SkinnedMesh[]=[];gltf.scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh)meshes.push(o);});
    const first=meshes[0];
    if(first&&meshes.every(m=>m.parent===first.parent&&m.matrix.equals(first.matrix))){
      const parts=meshes.map(m=>{
        const g=m.geometry.clone(),count=g.getAttribute('position').count,color=(m.material as THREE.MeshStandardMaterial).color;
        const colors=new Float32Array(count*3);for(let i=0;i<count;i++)colors.set([color.r,color.g,color.b],i*3);
        g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
      });
      const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
      // Thin fins must remain visible from either side while a catch is held.
      const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
      const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='fishing-koi';mesh.bind(first.skeleton,first.bindMatrix);mesh.position.copy(first.position);mesh.quaternion.copy(first.quaternion);mesh.scale.copy(first.scale);first.parent!.add(mesh);
      for(const m of meshes){m.removeFromParent();m.geometry.dispose();(m.material as THREE.Material).dispose();}
    }
    gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=o.receiveShadow=false;o.frustumCulled=false;}});
    gltf.scene.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const root=new THREE.Group();root.add(gltf.scene);gltf.scene.position.sub(center);root.scale.setScalar(34/Math.max(size.x,size.y,size.z));
    const clips=gltf.animations.map(clip=>clip.name.endsWith('|Out_Of_Water')?groundedFishClip(clip):clip);
    const swim=clips.find(clip=>clip.name.endsWith('|Swimming_Normal'));
    if(swim)clips.push(heldFishClip(swim,root));
    return {root,clips};
  });
  return fishTemplate;
}
export function createFishingFish(source:Awaited<ReturnType<typeof loadFishingFish>>){
  const root=clone(source.root) as THREE.Group,mixer=new THREE.AnimationMixer(root);
  return {root,mixer,clips:source.clips};
}
/** Bake the artist rod's basis and palette once, including a bend morph. The
 * cached original geometry supplies the silhouette; each rod owns its flex. */
export function loadFishingRod(){
  rodTemplate??=loadFriendsAsset('fishingRod').then(source=>{
    source.updateMatrixWorld(true);const parts:THREE.BufferGeometry[]=[];
    source.traverse(o=>{if(o instanceof THREE.Mesh){const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);const count=g.getAttribute('position').count,c=(o.material as THREE.MeshStandardMaterial).color,colors=new Float32Array(count*3);for(let i=0;i<count;i++)colors.set([c.r,c.g,c.b],i*3);g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(g);}});
    const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());geometry.computeBoundingBox();
    const bounds=geometry.boundingBox!,size=bounds.getSize(new THREE.Vector3());geometry.translate(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2);geometry.scale(1.95/size.y,1.95/size.y,1.95/size.y);
    const bent=geometry.getAttribute('position').clone();for(let i=0;i<bent.count;i++)bent.setZ(i,bent.getZ(i)-.2*Math.pow(Math.max(0,Math.min(1,bent.getY(i)/1.95)),3));geometry.morphAttributes.position=[bent];geometry.computeBoundingSphere();
    const root=new THREE.Group(),model=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.48,metalness:.2}));model.name='flexible-fishing-rod';root.add(model);
    const tip=new THREE.Object3D();tip.name='fishing-rod-tip';tip.position.set(0,1.95,0);root.add(tip);return root;
  });return rodTemplate;
}
