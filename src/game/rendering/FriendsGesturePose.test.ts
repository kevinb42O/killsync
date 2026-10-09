import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createFriendsCharacterModel,cloneFriendsCharacterModel,type FriendsCharacterData} from './FriendsCharacterModel';
import {applyFriendsArmPose} from './FriendsGesturePose';
const data=JSON.parse(readFileSync('public/models/friends/big-walk/character.json','utf8')) as FriendsCharacterData;
const create=()=>createFriendsCharacterModel(data,new THREE.MeshStandardMaterial());
function direction(mask:number,side:number){
 const m=create();applyFriendsArmPose(m,mask,0,10000,[0,0,0,0]);m.root.updateMatrixWorld(true);
 const part=m.parts[side+2],shoulder=part.getWorldPosition(new THREE.Vector3()),hand=part.getObjectByName('arm-wrist')!.getWorldPosition(new THREE.Vector3());
 return hand.sub(shoulder).normalize();
}
describe('authored arm directions and shoulder connections',()=>{
 it('preserves the authored hands-down rest and rotates every gesture around the real shoulder without splitting cuboids',()=>{
  const m=create(),blend=[0,0,0,0];
  applyFriendsArmPose(m,0,0,10000,blend);
  for(const index of [2,3]){
   expect(m.parts[index].position.distanceTo(m.basePositions[index])).toBeLessThan(1e-10);
   expect(m.parts[index].rotation.toArray()).toEqual(m.baseRotations[index].toArray());
  }
  for(let mask=0;mask<16;mask++)for(const yaw of [-.6,0,.6])for(const pitch of [-.6,0,.6]){
   const attachments=[2,3].map(index=>{
    const part=m.parts[index];part.position.copy(m.basePositions[index]);part.rotation.copy(m.baseRotations[index]);
    return new THREE.Vector3().fromArray(part.userData.shoulderPivot).applyQuaternion(part.quaternion).add(part.position);
   });
   applyFriendsArmPose(m,mask,pitch,16.666,blend,false,yaw);m.root.updateMatrixWorld(true);
   for(let side=0;side<2;side++){
    const part=m.parts[side+2],mesh=part.children[0] as THREE.SkinnedMesh;
    const attachment=new THREE.Vector3().fromArray(part.userData.shoulderPivot).applyQuaternion(part.quaternion).add(part.position);
    expect(attachment.distanceTo(attachments[side]),`shoulder moved at mask ${mask}`).toBeLessThan(1e-10);
    const positions=mesh.geometry.getAttribute('position');
    // Every cuboid remains rigid in the authored limb, including its contacts
    // at the elbow and palm; inspect skinned vertices, not just named joints.
    for(let i=0;i<positions.count;i++)expect(mesh.getVertexPosition(i,new THREE.Vector3()).distanceTo(new THREE.Vector3().fromBufferAttribute(positions,i))).toBeLessThan(1e-5);
   }
  }
 });
 it('raises BOTH hands above their own shoulders, points forward, and extends outward on the correct side',()=>{
  for(let side=0;side<2;side++){
   const up=direction(side===0?1:2,side),point=direction(side===0?4:8,side),out=direction(side===0?5:10,side),rest=direction(0,side);
   expect(up.y).toBeGreaterThan(.7);expect(rest.y).toBeLessThan(-.7);
   expect(point.z).toBeGreaterThan(.8);
   expect(side===0?out.x:-out.x).toBeGreaterThan(.85);
  }
 });
 it('keeps raised hand cuboids outside the head throughout the raise, including mixed gestures',()=>{
  for(const mask of [1,2,3,7,11]){
   const m=create(),blend=[0,0,0,0];
   for(let frame=0;frame<30;frame++){
    for(let i=0;i<6;i++){m.parts[i].position.copy(m.basePositions[i]);m.parts[i].rotation.copy(m.baseRotations[i]);}
    applyFriendsArmPose(m,mask,0,16.666,blend);m.root.updateMatrixWorld(true);
    const head=new THREE.Box3().setFromObject(m.parts[0],true);
    for(let side=0;side<2;side++){
     if(!(mask&(1<<side)))continue;
     const mesh=m.parts[side+2].children[0] as THREE.SkinnedMesh,vertices=mesh.geometry.getAttribute('position'),hand=new THREE.Box3();
     for(let i=vertices.count-36;i<vertices.count;i++)hand.expandByPoint(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
     expect(hand.intersectsBox(head),`mask ${mask}, side ${side}, frame ${frame}`).toBe(false);
    }
   }
  }
 });
 it('keeps independently cloned skeletons with shoulder → elbow → wrist hierarchy, shared buffers, and finite sixteen-state poses',()=>{
  const source=create(),a=cloneFriendsCharacterModel(source),b=cloneFriendsCharacterModel(source);
  for(const index of [2,3]){
   const mesh=a.parts[index].children[0] as THREE.SkinnedMesh,other=b.parts[index].children[0] as THREE.SkinnedMesh;
   expect(mesh.geometry).toBe(other.geometry);expect(mesh.skeleton).not.toBe(other.skeleton);
   expect(mesh.skeleton.bones[1].parent).toBe(mesh.skeleton.bones[0]);expect(mesh.skeleton.bones[2].parent).toBe(mesh.skeleton.bones[1]);
   mesh.skeleton.bones[1].rotation.x=.8;expect(other.skeleton.bones[1].rotation.x).toBeCloseTo(0);
  }
  for(let mask=0;mask<16;mask++){
   const m=create();applyFriendsArmPose(m,mask,.6,10000,[0,0,0,0]);m.root.updateMatrixWorld(true);
   for(const i of [2,3]){const mesh=m.parts[i].children[0] as THREE.SkinnedMesh;mesh.skeleton.update();expect([...mesh.skeleton.boneMatrices].every(Number.isFinite)).toBe(true);}
  }
 });
});
