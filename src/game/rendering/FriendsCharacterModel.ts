import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Triple = [number, number, number];
export type FriendsCharacterColour = 'red' | 'orange' | 'yellow' | 'lime' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'grey' | 'dark grey' | 'black' | 'brown';
type Cube = { id:number; parent:number; size:Triple; position:Triple; offset:Triple; rotation:Triple; textureSize:number; uv?:[number,number]; color?:Triple; visible:boolean; meshScale:Triple; inflate:number; item?:boolean; extraRoot?:number; faces?:Record<string,number[]> };
type Track = { position?:Triple[]; rotation?:Triple[]; visible?:boolean[] };
export type FriendsCharacterClip = { name:string; add:boolean; frames:number; duration:number; group?:string; default?:number; tracks:Record<string,Track> };
export type FriendsCharacterData = { name:string; author:string; textureSize:[number,number]; roots:{id:number;position:Triple;rotation:Triple}[]; cubes:Cube[]; animations:FriendsCharacterClip[] };
export type FriendsCharacterModel = { root:THREE.Group; basis:THREE.Group; parts:THREE.Group[]; basePositions:THREE.Vector3[]; baseRotations:THREE.Euler[]; data:FriendsCharacterData; scale:number };

const PALETTE:Record<FriendsCharacterColour,string> = {
  red:'#d94137', orange:'#de823a', yellow:'#e7c64d', lime:'#adc949', green:'#5d9e56', teal:'#479a96', blue:'#5283bb', purple:'#8e65ad', pink:'#d38caf', grey:'#b5b5b5', 'dark grey':'#555b61', black:'#25282d', brown:'#8c694c',
};
export const FRIENDS_CHARACTER_COLOURS = Object.keys(PALETTE) as FriendsCharacterColour[];

/** Use existing replicated crew colours; no new network state or random IDs. */
export function friendsCharacterColour(color:string):FriendsCharacterColour {
  const target=new THREE.Color(color);let closest:FriendsCharacterColour='yellow',distance=Infinity;
  for(const name of FRIENDS_CHARACTER_COLOURS){const swatch=new THREE.Color(PALETTE[name]),d=(target.r-swatch.r)**2+(target.g-swatch.g)**2+(target.b-swatch.b)**2;if(d<distance){distance=d;closest=name;}}
  return closest;
}

/** CPM uses clockwise image coordinates and ZYX joint rotations. Retain the
 * artist's cuboids and UVs, including both faces of the paper-thin eyes. */
function cubeGeometry(c:Cube, atlas:[number,number]) {
  const [x,y,z]=c.offset.map(n=>n-c.inflate),[ex,ey,ez]=c.offset.map((n,i)=>n+c.size[i]*c.meshScale[i]+c.inflate);
  const vertices=[[x,y,z],[ex,y,z],[ex,ey,z],[x,ey,z],[x,y,ez],[ex,y,ez],[ex,ey,ez],[x,ey,ez]];
  const quads=[[5,4,0,1],[2,3,7,6],[1,0,3,2],[4,5,6,7],[5,1,2,6],[0,4,7,3]];
  const ts=Math.abs(c.textureSize)||1,[u,v]=(c.uv??[0,0]).map(n=>n*ts),[dx,dy,dz]=c.size.map(n=>Math.ceil(n*ts));
  const rects=[[u+dz,v,u+dz+dx,v+dz],[u+dz+dx,v+dz,u+dz+dx*2,v],[u+dz,v+dz,u+dz+dx,v+dz+dy],[u+dz+dx+dz,v+dz,u+dz+dx+dz+dx,v+dz+dy],[u+dz+dx,v+dz,u+dz+dx+dz,v+dz+dy],[u,v+dz,u+dz,v+dz+dy]];
  const positions:number[]=[],uvs:number[]=[],colors:number[]=[],normal=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
  const color=new THREE.Color(c.color?`rgb(${c.color.join(',')})`:'#ffffff');
  for(let face=0;face<6;face++){
    const ids=quads[face],points=ids.map(id=>vertices[id]);
    normal.crossVectors(a.fromArray(points[1]).sub(b.fromArray(points[0])),b.fromArray(points[2]).sub(new THREE.Vector3().fromArray(points[0])));
    if(normal.lengthSq()<1e-12)continue;
    const custom=c.faces?.[face];if(c.faces&&!custom)continue;
    const [u1,v1,u2,v2]=custom??rects[face];
    const quadUvs=custom?ids.map((_,i)=>{const j=(i+custom[4]+3)%4;return [j===0||j===1?u1:u2,j===0||j===3?v1:v2];}):[[u2,v1],[u1,v1],[u1,v2],[u2,v2]];
    for(const index of [0,1,2,0,2,3]){positions.push(...points[index]);uvs.push(quadUvs[index][0]/atlas[0],1-quadUvs[index][1]/atlas[1]);colors.push(color.r,color.g,color.b);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}

const VANILLA_ROOTS:Triple[]=[[0,0,0],[0,0,0],[5,2,0],[-5,2,0],[1.9,12,0],[-1.9,12,0]];
const PART_NAMES=['head','body','left-arm','right-arm','left-leg','right-leg'];

/** Bake each rigid limb to one draw. The selected colour layers are resolved
 * before batching, so hidden Minecraft accessories never enter the GPU mesh. */
export function createFriendsCharacterModel(data:FriendsCharacterData, material:THREE.MeshStandardMaterial, head:FriendsCharacterColour='yellow'):FriendsCharacterModel {
  const root=new THREE.Group(),basis=new THREE.Group();root.name='friends-big-walk-character';root.add(basis);
  const visible=new Map(data.cubes.map(c=>[c.id,c.visible]));
  for(const clip of data.animations){
    const selected=clip.group==='head'?clip.name===`$layer$${head}`:clip.group==='upper'?clip.name==='$layer$yellowupper':clip.group==='lower'?clip.name==='$layer$bluelower':false;
    if(selected)for(const [id,track]of Object.entries(clip.tracks))if(track.visible)visible.set(Number(id),track.visible[0]);
  }
  const nodes=new Map<number,THREE.Group>(),parts=VANILLA_ROOTS.map((position,id)=>{
    const part=new THREE.Group();part.name=`big-walk-${PART_NAMES[id]}`;part.position.fromArray(position);
    const authored=data.roots.find(r=>r.id===id);if(authored){part.position.add(new THREE.Vector3().fromArray(authored.position));part.rotation.set(...authored.rotation,'ZYX');}
    nodes.set(id,part);basis.add(part);return part;
  });
  for(const c of data.cubes){const node=new THREE.Group();node.name=`cpm-${c.id}`;node.position.fromArray(c.position);node.rotation.set(...c.rotation,'ZYX');node.visible=visible.get(c.id)??true;nodes.set(c.id,node);}
  for(const c of data.cubes){
    const parent=nodes.get(c.parent),node=nodes.get(c.id)!;if(!parent||c.extraRoot!==undefined||c.item)continue;parent.add(node);
    if(c.size.some(n=>n>0)){const mesh=new THREE.Mesh(cubeGeometry(c,data.textureSize),material);mesh.userData.cpmCube=c.id;node.add(mesh);}
  }
  basis.updateMatrixWorld(true);
  for(const part of parts){
    const geometries:THREE.BufferGeometry[]=[],inverse=part.matrixWorld.clone().invert();let palm:THREE.Vector3|undefined;
    part.traverseVisible(o=>{if(!(o instanceof THREE.Mesh))return;const g=o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));geometries.push(g);
      // The last authored 3×3×3 block is the character's hand.
      const cube=data.cubes.find(c=>c.id===o.userData.cpmCube);if(cube&&cube.size.every(n=>n===3))palm=new THREE.Vector3().fromArray(cube.offset).addScalar(1.5).applyMatrix4(inverse.clone().multiply(o.matrixWorld));
    });
    part.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});part.clear();
    if(geometries.length){const geometry=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());geometry.computeBoundingSphere();geometry.userData.friendsShared=true;geometry.userData.coopOperatorShared=true;
      const arm=parts.indexOf(part)===2||parts.indexOf(part)===3;
      let mesh:THREE.Mesh;
      if(arm&&palm){
        // The authored shoulder cuboid is offset from the CPM part origin.
        // Gestures rotate at this attachment, not around an arbitrary root.
        const attachment=new THREE.Box3(),vertices=geometry.getAttribute('position');
        for(let i=0;i<36;i++)attachment.expandByPoint(new THREE.Vector3().fromBufferAttribute(vertices,i));
        part.userData.shoulderPivot=attachment.getCenter(new THREE.Vector3()).toArray();
        const shoulder=new THREE.Bone(),elbow=new THREE.Bone(),wrist=new THREE.Bone();
        shoulder.name='arm-shoulder';elbow.name='arm-elbow';wrist.name='arm-wrist';
        elbow.position.copy(palm).multiplyScalar(.5);wrist.position.copy(palm).multiplyScalar(.5);
        shoulder.add(elbow);elbow.add(wrist);
        const positions=geometry.getAttribute('position'),indices:number[]=[],weights:number[]=[],axis=palm.clone().normalize(),length=palm.length(),v=new THREE.Vector3();
        for(let i=0;i<positions.count;i++){
          const hand=i>=positions.count-36,depth=v.fromBufferAttribute(positions,i).dot(axis)/length;
          // The hand is rigid on its wrist; the thin limb blends across the elbow.
          const t=THREE.MathUtils.clamp((depth-.35)/.3,0,1);
          indices.push(hand?2:0,hand?2:1,0,0);weights.push(hand?1:1-t,hand?0:t,0,0);
        }
        geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
        const skinned=new THREE.SkinnedMesh(geometry,material);skinned.add(shoulder);skinned.bind(new THREE.Skeleton([shoulder,elbow,wrist]));mesh=skinned;
      }else mesh=new THREE.Mesh(geometry,material);
      mesh.name=`big-walk-${PART_NAMES[parts.indexOf(part)]}-mesh`;mesh.castShadow=mesh.receiveShadow=true;mesh.userData.friendsShared=true;part.add(mesh);}
    if(palm)part.userData.palm=palm.toArray();
  }
  basis.rotation.x=Math.PI;basis.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(basis),scale=54/(bounds.max.y-bounds.min.y);
  basis.scale.setScalar(scale);basis.position.y=-bounds.min.y*scale;
  return {root,basis,parts,basePositions:parts.map(p=>p.position.clone()),baseRotations:parts.map(p=>p.rotation.clone()),data,scale};
}

let asset:Promise<{data:FriendsCharacterData;material:THREE.MeshStandardMaterial}>|undefined;
const models=new Map<FriendsCharacterColour,Promise<FriendsCharacterModel>>();
export function loadFriendsCharacterModel(head:FriendsCharacterColour='yellow') {
  let pending=models.get(head);if(pending)return pending;
  if(!asset){
    const base=`${import.meta.env.BASE_URL}models/friends/big-walk/`;
    asset=Promise.all([fetch(base+'character.json').then(response=>{if(!response.ok)throw new Error('Big Walk character could not load');return response.json() as Promise<FriendsCharacterData>;}),new THREE.TextureLoader().loadAsync(base+'atlas.png')]).then(([data,map])=>{
      map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.NearestFilter;map.minFilter=THREE.NearestMipmapLinearFilter;
      const material=new THREE.MeshStandardMaterial({map,roughness:.94,metalness:0,alphaTest:.5,vertexColors:true});material.userData.friendsSharedTextures=true;
      return {data,material};
    }).catch(error=>{asset=undefined;throw error;});
  }
  pending=asset.then(({data,material})=>createFriendsCharacterModel(data,material,head)).catch(error=>{models.delete(head);throw error;});models.set(head,pending);return pending;
}

/** Instances share immutable geometry/atlas, but every animated joint is local. */
export function cloneFriendsCharacterModel(source:FriendsCharacterModel):FriendsCharacterModel {
  const root=cloneSkeleton(source.root) as THREE.Group,basis=root.children[0] as THREE.Group;
  return {...source,root,basis,parts:basis.children as THREE.Group[]};
}

/** Reuse the pack's real hand and connected limb in the existing grip frame.
 * Axial fitting routes its shoulder behind the camera without widening the
 * character's deliberately thin arms. No human WRAD mesh is loaded. */
export function createFriendsCharacterGrip(source:FriendsCharacterModel, side:'left'|'right', hold:'tool'|'inward'|'flashlight') {
  const part=source.parts[side==='left'?2:3],geometry=(part.children[0] as THREE.Mesh).geometry.clone();
  const palm=new THREE.Vector3().fromArray(part.userData.palm),oldAxis=palm.clone().negate().normalize();
  const target=hold==='flashlight'?new THREE.Vector3(-.24,1.30,.55):new THREE.Vector3(hold==='inward'?.28:.34,-.55,1.35);
  const nextAxis=target.clone().normalize(),turn=new THREE.Quaternion().setFromUnitVectors(oldAxis,nextAxis),positions=geometry.getAttribute('position'),point=new THREE.Vector3();
  // Preserve the 3×3×3 hand. Only the connected limb behind its wrist is
  // lengthened; a whole-mesh stretch would turn the palm into a long plank.
  let wrist=0;
  for(let i=positions.count-36;i<positions.count;i++)wrist=Math.max(wrist,point.fromBufferAttribute(positions,i).sub(palm).dot(oldAxis));
  const axialScale=(target.length()-wrist*.065)/Math.max(.001,palm.length()-wrist);
  for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i).sub(palm);const depth=point.dot(oldAxis);
    point.multiplyScalar(.065);
    if(depth>wrist)point.addScaledVector(oldAxis,(depth-wrist)*(axialScale-.065));
    point.applyQuaternion(turn);positions.setXYZ(i,point.x,point.y,point.z);
  }
  geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.userData.friendsShared=true;
  const mesh=new THREE.Mesh(geometry,(part.children[0] as THREE.Mesh).material);mesh.name=`premade-${side}-arm`;mesh.userData.friendsShared=true;mesh.userData.friendsCharacter='Big Walk';
  mesh.userData.friendsArmJoints={shoulder:target.toArray(),wrist:[0,0,0],socket:[0,0,0]};return mesh;
}
