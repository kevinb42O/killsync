import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadFriendsAsset } from './FriendsAssets';
import { groundedFishClip } from './FriendsFishGroundAnimation';
import { heldFishClip } from './FriendsFishingPresentation';

import { FISH_SPECIES, type FishSpecies } from '../multiplayer/FriendsFishSpecies';

const fishTemplates=new Map<FishSpecies,Promise<{root:THREE.Group;clips:THREE.AnimationClip[]}>>();
let rodTemplate:Promise<THREE.Group>|undefined;
/** Downloaded meshes retain their skeletons. Adaptations are cached once per
 * species, with shared geometry/materials and only per-catch animation state. */
export function loadFishingFish(species:FishSpecies='koi'){
  let template=fishTemplates.get(species);if(template)return template;
  template=new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/friends/fishing/${FISH_SPECIES[species].model}.glb`).then(gltf=>{
    const adapted=['perch','zander','pike','mackerel','cod'].includes(species);
    const shape=new THREE.Group();shape.add(gltf.scene);
    // The Google trout faces +Z; the animated pack faces -Z.
    if(FISH_SPECIES[species].model==='trout')shape.rotation.y=Math.PI;
    if(species==='pike')shape.scale.set(.85,.62,1.3);
    if(species==='zander')shape.scale.set(.86,.78,1.25);
    if(species==='mackerel')shape.scale.set(.72,.72,1.22);
    if(species==='cod')shape.scale.set(.9,.85,1.12);
    shape.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(shape),extent=bounds.getSize(new THREE.Vector3());
    const point=new THREE.Vector3(),color=new THREE.Color();
    const meshes:THREE.Mesh[]=[];gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
    // Preserve dark eye/mouth palettes and original colours on exact models.
    for(const m of meshes){
      const geometry=m.geometry.clone(),position=geometry.getAttribute('position'),base=(m.material as THREE.MeshStandardMaterial).color;
      const colors=new Float32Array(position.count*3);
      for(let i=0;i<position.count;i++){
        color.copy(base);point.fromBufferAttribute(position,i).applyMatrix4(m.matrixWorld);
        if(adapted&&(base.r+base.g+base.b)>.035){
          const dorsal=(point.y-bounds.min.y)/extent.y,longitudinal=(point.z-bounds.min.z)/extent.z;
          const belly=dorsal<.38;
          color.set(belly?'#c9c5a3':species==='mackerel'?'#3d7380':species==='cod'?'#787b55':species==='pike'?'#5a743e':species==='zander'?'#89936b':'#8f9b48');
          if(species==='perch'){
            if(m.name.endsWith('_1'))color.set('#cf693a');
            else if(!belly&&Math.sin(longitudinal*Math.PI*12)>.55)color.multiplyScalar(.43);
          }
          if(species==='zander'&&!belly&&Math.sin(longitudinal*Math.PI*14)>.65)color.multiplyScalar(.65);
          if(species==='mackerel'&&dorsal>.52&&Math.sin(longitudinal*Math.PI*26+point.x*3)>.3)color.multiplyScalar(.4);
          if(species==='pike'&&!belly&&Math.sin(longitudinal*87+point.x*.14)*Math.sin(dorsal*65)>.65)color.set('#b5ba77');
          if(species==='cod'&&!belly&&Math.sin(longitudinal*113+point.x*12)*Math.sin(dorsal*81)>.6)color.multiplyScalar(.5);
        }
        color.toArray(colors,i*3);
      }
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));m.geometry.dispose();m.geometry=geometry;
    }
    const first=meshes[0];
    const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
    if(first instanceof THREE.SkinnedMesh&&meshes.every(m=>m instanceof THREE.SkinnedMesh&&m.parent===first.parent&&m.matrix.equals(first.matrix))){
      const geometry=mergeGeometries(meshes.map(m=>m.geometry));
      const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name=`fishing-${species}`;mesh.bind(first.skeleton,first.bindMatrix);mesh.position.copy(first.position);mesh.quaternion.copy(first.quaternion);mesh.scale.copy(first.scale);first.parent!.add(mesh);
      for(const m of meshes){m.removeFromParent();m.geometry.dispose();(m.material as THREE.Material).dispose();}
    }else for(const m of meshes){(m.material as THREE.Material).dispose();m.material=material;}
    shape.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=o.receiveShadow=false;o.frustumCulled=false;}});
    const root=new THREE.Group();root.add(shape);shape.position.sub(bounds.getCenter(new THREE.Vector3()));root.scale.setScalar(34/extent.z);
    const clips=gltf.animations.map(clip=>clip.name.endsWith('|Out_Of_Water')?groundedFishClip(clip):clip);
    const swim=clips.find(clip=>clip.name.endsWith('|Swimming_Normal'));
    if(swim)clips.push(heldFishClip(swim,root));
    return {root,clips};
  });
  fishTemplates.set(species,template);return template;
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
    let geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());geometry.computeBoundingBox();
    const bounds=geometry.boundingBox!,size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=1.95/size.y;
    // Artist-space spool outlet and guide centers. Bake the short strand into
    // the existing shared mesh: no new draw, rope nodes, or per-frame uploads.
    const anchors=[[0,.80,-.25],...[1.743,2.392,3.042,3.691,4.340,4.989,5.639,6.288,6.955].map(y=>[0,y,-.106])];
    const path=new THREE.CurvePath<THREE.Vector3>();
    for(let i=1;i<anchors.length;i++)path.add(new THREE.LineCurve3(new THREE.Vector3(...anchors[i-1] as [number,number,number]),new THREE.Vector3(...anchors[i] as [number,number,number])));
    const strand=new THREE.TubeGeometry(path,12,.0025/scale,3,false);strand.deleteAttribute('uv');
    const colors=new Float32Array(strand.getAttribute('position').count*3),color=new THREE.Color('#fff1cc');
    for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
    strand.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const body=geometry;geometry=mergeGeometries([body,strand]);body.dispose();strand.dispose();
    geometry.translate(-center.x,-bounds.min.y,-center.z);geometry.scale(scale,scale,scale);
    const bent=geometry.getAttribute('position').clone();for(let i=0;i<bent.count;i++)bent.setZ(i,bent.getZ(i)-.2*Math.pow(Math.max(0,Math.min(1,bent.getY(i)/1.95)),3));geometry.morphAttributes.position=[bent];geometry.computeBoundingSphere();
    const root=new THREE.Group(),model=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.48,metalness:.2}));model.name='flexible-fishing-rod';root.add(model);
    const tip=new THREE.Object3D();tip.name='fishing-rod-tip';tip.position.set(-center.x*scale,(6.955-bounds.min.y)*scale,(-.106-center.z)*scale);tip.userData.restZ=tip.position.z;tip.userData.bendZ=-.2*Math.pow(tip.position.y/1.95,3);root.add(tip);return root;
  });return rodTemplate;
}
