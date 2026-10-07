import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsCargoBeacon, CARGO_BEACON_HEIGHT } from './FriendsCargoBeacon';
import { SALVAGE_CORE_SPAWN, type PhysicalCargo } from '../multiplayer/FriendsHauling';
import { FRIENDS_DELIVERY_BAY } from '../world/FriendsHaulingGoal';

const core:PhysicalCargo={id:'lantern-core',...SALVAGE_CORE_SPAWN,angle:0,vx:0,vy:0,vz:0,spin:0};
describe('global cargo light column',()=>{
  it('keeps a readable projected width at high FOV and from the far side of the island',()=>{
    const beacon=new FriendsCargoBeacon();beacon.update(core,0);
    const column=beacon.getObjectByName('cargo-light-column') as THREE.Mesh;
    const camera=new THREE.PerspectiveCamera(70,16/9,2,110000);
    let firstWidth=0;
    for(const [fov,x,y] of [[70,FRIENDS_DELIVERY_BAY.x,FRIENDS_DELIVERY_BAY.y],[110,1000,1000],[145,46000,46000]]){
      camera.fov=fov;camera.updateProjectionMatrix();camera.position.set(x,beacon.position.y+2000,y);
      camera.lookAt(beacon.position.x,beacon.position.y+2000,beacon.position.z);camera.updateMatrixWorld(true);
      beacon.updateMatrixWorld(true);beacon.faceCamera(camera);
      const a=column.localToWorld(new THREE.Vector3(-.5,-CARGO_BEACON_HEIGHT/2+2000,0)).project(camera);
      const b=column.localToWorld(new THREE.Vector3(.5,-CARGO_BEACON_HEIGHT/2+2000,0)).project(camera);
      const width=Math.abs(a.x-b.x);expect(width).toBeGreaterThan(.03);
      if(firstWidth)expect(width).toBeCloseTo(firstWidth,5);else firstWidth=width;
    }
    beacon.dispose();
  });
  it('follows the real cargo, respects terrain depth and scales for distant viewers',()=>{
    const beacon=new FriendsCargoBeacon();beacon.update(core,1000);
    expect(beacon.position.toArray()).toEqual([core.x,core.z+50,core.y]);
    const mesh=beacon.getObjectByName('cargo-light-column') as THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
    expect(mesh.material.depthTest).toBe(true);expect(mesh.material.depthWrite).toBe(false);expect(mesh.material.fog).toBe(false);expect(mesh.material.toneMapped).toBe(false);
    expect(mesh.frustumCulled).toBe(false);expect(CARGO_BEACON_HEIGHT).toBeGreaterThan(6000);
    const camera=new THREE.PerspectiveCamera(110,16/9,2,110000);camera.position.set(FRIENDS_DELIVERY_BAY.x,FRIENDS_DELIVERY_BAY.z+26,FRIENDS_DELIVERY_BAY.y);
    beacon.faceCamera(camera);expect(mesh.scale.x).toBeGreaterThan(64);expect(mesh.rotation.x).toBe(0);expect(mesh.rotation.z).toBe(0);
    const homeWidth=mesh.scale.x;camera.position.set(46000,1000,46000);beacon.faceCamera(camera);expect(mesh.scale.x).toBeGreaterThan(homeWidth*4);
    beacon.update({...core,x:core.x+240,z:core.z+64},2000);
    expect(beacon.position.x).toBe(core.x+240);expect(beacon.position.y).toBe(core.z+114);beacon.dispose();
  });
  it('keeps the delivered core findable, hides missing cargo and releases its owned GPU resources',()=>{
    const scene=new THREE.Scene(),beacon=new FriendsCargoBeacon();scene.add(beacon);beacon.update(core,0,true);expect(beacon.visible).toBe(true);
    const mesh=beacon.getObjectByName('cargo-light-column') as THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
    expect(mesh.material.uniforms.tint.value.getHexString()).toBe('a5f279');
    beacon.update(undefined,0);expect(beacon.visible).toBe(false);
    const geometry=vi.spyOn(mesh.geometry,'dispose'),material=vi.spyOn(mesh.material,'dispose');beacon.dispose();
    expect(beacon.parent).toBeNull();expect(geometry).toHaveBeenCalledOnce();expect(material).toHaveBeenCalledOnce();
  });
});
