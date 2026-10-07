import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Renderer3D } from '../Renderer3D';
import { FriendsSimulation } from '../multiplayer/FriendsSimulation';
import { FriendsHaulingVisuals } from './FriendsHaulingVisuals';
import { FriendsRopeMesh } from './FriendsRopeMesh';
import { FRIENDS_DELIVERY_BAY } from '../world/FriendsHaulingGoal';

function fixture(){
  const scene=new THREE.Scene(),viewmodel=new THREE.Scene(),camera=new THREE.PerspectiveCamera(120,16/9,2,10000),handCamera=new THREE.PerspectiveCamera(98,16/9,.025,1000);
  viewmodel.add(handCamera);const visuals=new FriendsHaulingVisuals(scene,viewmodel);
  const snapshot=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot();
  snapshot.friends!.hauling!.ropes=[{id:'host',cargoId:'lantern-core',anchorX:0,anchorY:0,anchorZ:30,length:200,tension:.8,blocked:false}];
  // Exercise the production projector without constructing a WebGL renderer in Node.
  const projectionContext={camera,viewmodelCamera:handCamera,tempMuzzlePos:new THREE.Vector3(),tempMuzzleNdc:new THREE.Vector3(),tempMuzzleNdc2:new THREE.Vector2(),tempRaycaster:new THREE.Raycaster()} as unknown as Renderer3D;
  const project=(point:THREE.Object3D)=>Renderer3D.prototype.projectViewmodelPointToWorld.call(projectionContext,point);
  return {scene,viewmodel,camera,handCamera,visuals,snapshot,project};
}
describe('held hauling rope attachment',()=>{
  it('marks the physical delivery bay and shares the crew completion state',()=>{
    const {scene,visuals,snapshot,project}=fixture(),g=FRIENDS_DELIVERY_BAY;
    visuals.update(snapshot,'host',0,0,project);
    expect(scene.getObjectByName('hauling-delivery-goal')!.position.toArray()).toEqual([g.x,g.z,g.y]);
    expect(scene.getObjectByName('delivery-beacon')!.visible).toBe(true);
    expect(scene.getObjectByName('delivery-complete-check')!.visible).toBe(false);
    snapshot.friends!.hauling!.delivered=true;visuals.update(snapshot,'host',0,16,project);
    expect(scene.getObjectByName('delivery-beacon')!.visible).toBe(false);
    expect(scene.getObjectByName('delivery-complete-check')!.visible).toBe(true);visuals.dispose();
  });
  it('belongs to the moving equipment camera and meets the muzzle at high FOV and steep pitch',()=>{
    const {scene,viewmodel,camera,handCamera,visuals,snapshot,project}=fixture();
    const gun=viewmodel.getObjectByName('rope-launcher')!,muzzle=viewmodel.getObjectByName('rope-muzzle')!;
    expect(gun.parent).toBe(handCamera);
    for(const [fov,pitch,yaw,aspect] of [[70,0,0,16/9],[120,1.4,.8,16/9],[145,-1.4,-2.2,9/16],[110,.3,3.1,2.4]]){
      camera.fov=fov;camera.aspect=aspect;camera.updateProjectionMatrix();handCamera.aspect=aspect;handCamera.updateProjectionMatrix();
      camera.position.set(12000+fov,640+pitch*80,5500);camera.rotation.set(pitch,yaw,.06,'YXZ');handCamera.position.copy(camera.position);handCamera.quaternion.copy(camera.quaternion);
      visuals.update(snapshot,'host',5,1000,project);
      const rope=scene.getObjectByName('braided-hauling-rope') as FriendsRopeMesh,p=rope.geometry.getAttribute('position'),centre=new THREE.Vector3();
      // The three circular strand rings average to the exact centreline endpoint.
      for(let strand=0;strand<3;strand++)for(let side=0;side<8;side++)centre.add(new THREE.Vector3().fromBufferAttribute(p,strand*9+side));centre.divideScalar(24);
      const expected=muzzle.getWorldPosition(new THREE.Vector3()).project(handCamera),actual=centre.project(camera);
      expect(actual.x).toBeCloseTo(expected.x,3);expect(actual.y).toBeCloseTo(expected.y,3);expect(gun.visible).toBe(true);
    }
    visuals.update(snapshot,'host',5,1100,project,false);expect(gun.visible).toBe(false);
    visuals.update(snapshot,'host',0,1100,project);expect(gun.visible).toBe(false);visuals.dispose();
  });
  it('reuses live rope geometry, removes detached ropes and releases owned resources',()=>{
    const {scene,viewmodel,visuals,snapshot,project}=fixture();visuals.update(snapshot,'host',5,0,project);
    const mesh=scene.getObjectByName('braided-hauling-rope') as FriendsRopeMesh;let disposed=false;mesh.geometry.addEventListener('dispose',()=>disposed=true);
    visuals.update(snapshot,'host',5,16,project);expect(scene.getObjectByName('braided-hauling-rope')).toBe(mesh);
    snapshot.friends!.hauling!.ropes=[];visuals.update(snapshot,'host',5,32,project);expect(mesh.parent).toBeNull();expect(disposed).toBe(true);
    visuals.dispose();expect(scene.getObjectByName('friends-hauling')).toBeUndefined();expect(viewmodel.getObjectByName('rope-launcher')).toBeUndefined();
  });
});
