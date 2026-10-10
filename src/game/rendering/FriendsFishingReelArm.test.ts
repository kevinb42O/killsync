import { readFileSync } from 'node:fs';
import { describe,expect,it,vi } from 'vitest';
import * as THREE from 'three';
import { createFriendsCharacterGrip,createFriendsCharacterModel } from './FriendsCharacterModel';
import { frameHeldEquipment } from './FriendsHeldEquipment';
import { FriendsFishingReelArm } from './FriendsFishingReelArm';

function fixture(){
  const data=JSON.parse(readFileSync('public/models/friends/big-walk/character.json','utf8'));
  const source=createFriendsCharacterGrip(createFriendsCharacterModel(data,new THREE.MeshStandardMaterial()),'left','tool');
  const camera=new THREE.PerspectiveCamera(98,16/9,.025,1000),rod=new THREE.Group(),arm=new FriendsFishingReelArm(source);
  camera.position.set(35,80,-120);camera.rotation.set(.3,1.4,.1);camera.add(rod);rod.add(arm.mesh);
  return {source,camera,rod,arm};
}

describe('fishing left reel arm',()=>{
  it('routes the actual limb to the fixed left shoulder through a full crank cycle, rod motion and framing changes',()=>{
    const {source,camera,rod,arm}=fixture(),rest=source.geometry.getAttribute('position');
    for(const aspect of [16/9,2.4,9/16])for(const fov of [70,98,120]){
      camera.aspect=aspect;camera.fov=fov;camera.updateProjectionMatrix();
      const tangent=Math.tan(THREE.MathUtils.degToRad(fov/2)),anchor=new THREE.Vector3(-.65*tangent*aspect,-.20*tangent,.25);
      for(let now=0;now<270;now+=16){
        frameHeldEquipment(rod,camera);rod.rotation.set(-.58-.035*Math.sin(now*.017),0,-.12);arm.update(rod,camera,now);
        const positions=arm.mesh.geometry.getAttribute('position');
        // Check the actual shoulder surface, rather than an unattached joint
        // marker: all of the authored shoulder block stays on the left.
        const centre=new THREE.Vector3();
        for(let i=0;i<36;i++){
          const routed=camera.worldToLocal(arm.mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(positions,i)));
          centre.add(routed);
          expect(routed.distanceTo(anchor)).toBeLessThan(.35);expect(routed.x).toBeLessThan(0);
        }
        expect(centre.divideScalar(36).distanceTo(anchor)).toBeLessThan(1e-6);
        for(let i=108;i<144;i++)expect(new THREE.Vector3().fromBufferAttribute(positions,i).distanceTo(new THREE.Vector3().fromBufferAttribute(rest,i))).toBeLessThan(1e-6);
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        const palm=camera.worldToLocal(arm.mesh.localToWorld(new THREE.Vector3()));
        // At the lower screen boundary the arm must enter from the left.
        const edge=palm.clone().lerp(anchor,(-tangent*palm.z+palm.y)/((anchor.z-palm.z)*tangent-(anchor.y-palm.y)));
        expect(edge.project(new THREE.PerspectiveCamera(fov,aspect,.025,1000)).x).toBeLessThan(-.25);
      }
    }
    arm.dispose();
  });
  it('owns its deforming geometry and releases it without changing the cached grip',()=>{
    const {source,arm}=fixture(),rest=Array.from(source.geometry.attributes.position.array),dispose=vi.spyOn(arm.mesh.geometry,'dispose'),sharedDispose=vi.spyOn(source.geometry,'dispose');
    expect(arm.mesh.geometry).not.toBe(source.geometry);expect(arm.mesh.material).toBe(source.material);expect(arm.mesh.visible).toBe(false);
    arm.dispose();expect(dispose).toHaveBeenCalledOnce();expect(sharedDispose).not.toHaveBeenCalled();expect(Array.from(source.geometry.attributes.position.array)).toEqual(rest);
  });
});
