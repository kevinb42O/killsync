import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Renderer3D } from '../Renderer3D';
import { FriendsSimulation } from '../multiplayer/FriendsSimulation';
import { FriendsHaulingVisuals } from './FriendsHaulingVisuals';
import { FriendsRopeMesh } from './FriendsRopeMesh';
import { FRIENDS_DELIVERY_BAY } from '../world/FriendsHaulingGoal';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';

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
  it('keeps a stowed player tether below the first-person view and tapers both local attachment ends',()=>{
    const {scene,visuals,snapshot,project,camera,handCamera}=fixture(),host=snapshot.players[0];
    const passenger={...host,id:'guest',label:'Friend',x:host.x+120,y:host.y,z:host.z};snapshot.players.push(passenger);
    snapshot.friends!.hauling!.ropes=[];snapshot.friends!.hauling!.playerRopes=[{id:host.id,playerId:passenger.id,length:120,bends:[]}];
    for(const [local,yaw,end]of [[host,-Math.PI/2,false],[passenger,Math.PI/2,true]] as const){
      camera.position.set(local.x,local.z+40,local.y);camera.rotation.set(0,yaw,0,'YXZ');handCamera.position.copy(camera.position);handCamera.quaternion.copy(camera.quaternion);
      visuals.update(snapshot,local.id,0,0,project);
      const mesh=scene.getObjectByName('braided-hauling-rope') as FriendsRopeMesh,p=mesh.geometry.getAttribute('position'),segment=end?mesh.geometry.drawRange.count/(3*8*6):0,centre=new THREE.Vector3(),points=[];
      for(let strand=0;strand<3;strand++)for(let side=0;side<8;side++){const point=new THREE.Vector3().fromBufferAttribute(p,(segment*3+strand)*9+side);points.push(point);centre.add(point);}
      centre.multiplyScalar(1/24);
      expect(centre.clone().project(camera).y).toBeLessThan(-.75);
      expect(Math.max(...points.map(point=>point.distanceTo(centre)))).toBeLessThan(.12);
    }
    visuals.dispose();
  });
  it('draws a player rope to the passenger body and removes it when released',()=>{
    const {scene,visuals,snapshot,project}=fixture(),host=snapshot.players[0];
    const passenger={...host,id:'guest',label:'Friend',x:host.x+120,y:host.y+40,z:host.z+50};
    snapshot.players.push(passenger);
    snapshot.friends!.hauling!.ropes=[];
    snapshot.friends!.hauling!.playerRopes=[{id:host.id,playerId:passenger.id,length:180,bends:[]}];
    visuals.update(snapshot,'host',5,0,project);
    const rope=scene.getObjectByName('braided-hauling-rope') as FriendsRopeMesh;
    expect(rope).toBeDefined();
    const positions=rope.geometry.getAttribute('position'),end=new THREE.Vector3();
    // Average the three strand rings at the live draw range's endpoint.
    const segments=rope.geometry.drawRange.count/(3*8*6);
    for(let strand=0;strand<3;strand++)for(let side=0;side<8;side++)end.add(new THREE.Vector3().fromBufferAttribute(positions,(segments*3+strand)*9+side));
    end.multiplyScalar(1/24);
    expect(end.x).toBeCloseTo(passenger.x,1);expect(end.y).toBeCloseTo(passenger.z+26,1);expect(end.z).toBeCloseTo(passenger.y,1);
    snapshot.friends!.hauling!.playerRopes=[];visuals.update(snapshot,'host',5,16,project);
    expect(rope.parent).toBeNull();visuals.dispose();
  });
  it('hides the rope tool throughout campfire seating and restores it on standing',()=>{
    const {viewmodel,visuals,snapshot,project}=fixture(),player=snapshot.players[0],gun=viewmodel.getObjectByName('rope-launcher')!;
    visuals.update(snapshot,'host',5,0,project);expect(gun.visible).toBe(true);
    player.friendsSeat={vehicleId:FRIENDS_CAMPFIRE.id,index:0};
    for(const [i,tool]of [5,0,1,2,3,5].entries()){
      visuals.update(snapshot,'host',tool,16*(i+1),project);expect(gun.visible).toBe(false);
    }
    delete player.friendsSeat;
    visuals.update(snapshot,'host',5,128,project);expect(gun.visible).toBe(true);visuals.dispose();
  });
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
