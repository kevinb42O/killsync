import * as THREE from 'three';
import type { FriendsArmHold } from './FriendsArmPose';
import { createFriendsCharacterGrip, loadFriendsCharacterModel } from './FriendsCharacterModel';
import { fitFriendsAsset, loadFriendsAsset, type FriendsAssetId } from './FriendsAssets';

/** The same artist-authored Big Walk limbs as the Friends crew avatars. */
const armTemplates = new Map<string, Promise<THREE.Mesh>>();
export function loadFriendsGrip(side: 'right' | 'left', hold: FriendsArmHold = 'tool') {
  const key = side + ':' + hold;
  let pending = armTemplates.get(key);
  if (!pending) {
    pending = loadFriendsCharacterModel().then(source => createFriendsCharacterGrip(source, side, hold))
      .catch(error => { armTemplates.delete(key); throw error; });
    armTemplates.set(key, pending);
  }
  return pending;
}

/** Preserve the shipped CC0 tools, their silhouettes and upgraded models.
 * Their small palette texture becomes vertex color so wood and steel can have
 * different PBR responses while remaining one draw and the same triangle count. */
const toolTemplates=new Map<FriendsAssetId,Promise<THREE.Group>>();
export function loadFinishedFriendsTool(asset:FriendsAssetId) {
  let pending=toolTemplates.get(asset);
  if(!pending){pending=loadFriendsAsset(asset).then(source=>{
    const model=fitFriendsAsset(source,{x:.48,y:.86,z:.26},0,'contain');model.children[0].position.x=0;model.rotation.y=asset.startsWith('toolShovel')?0:-Math.PI/2;model.position.y=-.264;model.scale.multiplyScalar(1.2);model.name=asset;
    model.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      const material=o.material as THREE.MeshStandardMaterial,texture=material.map;
      if(texture) {
        const image=texture.image as HTMLImageElement,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const context=canvas.getContext('2d')!;context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
        const positions=o.geometry.getAttribute('position'),uv=o.geometry.getAttribute('uv'),colors=new Float32Array(positions.count*3),finish=new Float32Array(positions.count);
        for(let i=0;i<positions.count;i++) {
          const x=Math.min(canvas.width-1,Math.floor(uv.getX(i)*canvas.width)),y=Math.min(canvas.height-1,Math.floor(uv.getY(i)*canvas.height)),offset=(y*canvas.width+x)*4;
          const r=pixels[offset]/255,g=pixels[offset+1]/255,b=pixels[offset+2]/255,warm=r>g*1.18&&r>b*1.3;
          const head=positions.getY(i)>.19,brass=warm&&head&&asset.endsWith('Upgraded');
          const c=new THREE.Color(brass?'#bb975b':warm?'#76513a':'#61777e');
          c.multiplyScalar(.72+Math.max(r,g,b)*.50);colors.set([c.r,c.g,c.b],i*3);finish[i]=warm&&!brass?0:1;
        }
        o.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));o.geometry.setAttribute('equipmentMetal',new THREE.BufferAttribute(finish,1));
        // Drop only this fitted clone's atlas, never the immutable source texture.
        texture.dispose();material.map=null;material.vertexColors=true;material.color.set('#ffffff');
        material.onBeforeCompile=shader=>{
          shader.vertexShader='attribute float equipmentMetal;varying float equipmentFinish;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nequipmentFinish=equipmentMetal;');
          shader.fragmentShader='varying float equipmentFinish;\n'+shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.86,.38,equipmentFinish);').replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(0.,.48,equipmentFinish);');
        };
        material.customProgramCacheKey=()=> 'friends-existing-tool-finish-v1';material.needsUpdate=true;
      }
      material.side=THREE.FrontSide;o.castShadow=o.receiveShadow=false;o.userData.friendsShared=true;
    });return model;
  });toolTemplates.set(asset,pending);}
  return pending;
}

export function frameHeldEquipment(root:THREE.Group,camera:THREE.PerspectiveCamera|undefined,left=false) {
  const aspect=camera?.aspect??16/9,fov=camera?.fov??98,tangent=Math.tan(THREE.MathUtils.degToRad(fov/2));
  const depth=left ? .78 : .94,narrow=Math.min(1,aspect/1.25),scale=tangent/Math.tan(THREE.MathUtils.degToRad(49));
  root.position.set((left?-.52:.46)*depth*tangent*aspect,-.60*depth*tangent,-depth);
  root.scale.set(scale*narrow,scale*narrow,1);
}

export function acquireEquipmentLighting(viewmodel:THREE.Scene) {
  const parent=viewmodel.getObjectByProperty('type','PerspectiveCamera')||viewmodel;
  let rig=parent.getObjectByName('friends-equipment-lighting') as THREE.Group|undefined;
  if(!rig){rig=new THREE.Group();rig.visible=false;rig.name='friends-equipment-lighting';rig.userData.owners=0;rig.userData.active=new Set<object>();
    const key=new THREE.DirectionalLight('#ffecd4',1.7);key.position.set(-1,2,2);key.target.position.set(0,0,-1);
    rig.add(new THREE.HemisphereLight('#e8f0df','#637b79',2),key,key.target);parent.add(rig);}
  rig.userData.owners++;const token={},shared=rig;let released=false;
  return {setVisible(visible:boolean){if(released)return;if(visible)shared.userData.active.add(token);else shared.userData.active.delete(token);shared.visible=shared.userData.active.size>0;},
    dispose(){if(released)return;released=true;shared.userData.active.delete(token);shared.userData.owners--;shared.visible=shared.userData.active.size>0;if(!shared.userData.owners)shared.removeFromParent();}};
}
