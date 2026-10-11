import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { FriendsSeagulls,SEAGULL_LIMIT,seagullCallVolume,sampleSeagull } from './FriendsSeagulls';
import type { FriendsVehicle } from '../multiplayer/FriendsExpedition';
import { FRIENDS_SEASIDE_PIER,seasidePierPoint } from '../world/FriendsSeasidePier';
const boat:FriendsVehicle={id:'boat',kind:'fishingBoat',x:1680,y:5800,z:-141,angle:0,length:480,width:200};
function cameraAt(x:number,y:number,z:number){const c=new THREE.PerspectiveCamera(90,1,.1,5000);c.position.set(x,z,y);return c;}
describe('bounded coastal seagulls',()=>{
  it('uses one opaque untextured mesh and a tiny fixed geometry budget',()=>{
    const gulls=new FriendsSeagulls();expect(gulls.mesh.geometry.attributes.position.count/3).toBeLessThanOrEqual(32);
    expect(gulls.mesh.instanceMatrix.count).toBe(SEAGULL_LIMIT);expect(gulls.mesh.material.transparent).toBe(false);
    expect(gulls.mesh.material.map).toBeNull();expect(gulls.mesh.castShadow).toBe(false);gulls.dispose();
  });
  it('renders near piers and moving boats, with at most six poses and no distant flock',()=>{
    const gulls=new FriendsSeagulls(),c=cameraAt(1680,5800,-90);gulls.setVehicles([boat]);gulls.update(c,10,1,false);
    expect(gulls.mesh.count).toBeGreaterThan(0);expect(gulls.mesh.count).toBeLessThanOrEqual(6);
    const version=gulls.mesh.instanceMatrix.version;gulls.update(c,10.01,1,false);expect(gulls.mesh.instanceMatrix.version).toBe(version);
    gulls.setVehicles([{...boat,x:boat.x+100}]);gulls.update(c,10.1,1,false);
    expect((gulls as any).boatAnchor.x).toBeGreaterThan(boat.x);expect((gulls as any).boatAnchor.x).toBeLessThan(boat.x+100);
    const farBoat={...boat,x:20000,y:20000};gulls.setVehicles([farBoat]);c.position.set(20000,-90,20000);gulls.update(c,13,1,false);expect(gulls.mesh.count).toBe(2);
    c.position.set(40000,0,40000);gulls.update(c,14,1,false);expect(gulls.mesh.visible).toBe(false);gulls.dispose();
  });
  it('samples one flock ambience independent of view, bird motion and mesh visibility',()=>{
    const gulls=new FriendsSeagulls(),c=cameraAt(1680,5800,-90);gulls.setVehicles([boat]);gulls.update(c,10,1,false);
    const first=gulls.flockSound(c,0,1);expect(first.volume).toBeGreaterThan(.25);expect(Math.abs(first.pan)).toBeLessThanOrEqual(.25);
    c.lookAt(c.position.clone().add(new THREE.Vector3(0,0,80)));
    expect(gulls.flockSound(c,0,1)).toEqual(first);
    gulls.update(c,20,1,false);expect(gulls.flockSound(c,0,1)).toEqual(first);
    gulls.mesh.visible=false;gulls.mesh.count=0;expect(gulls.flockSound(c,0,1)).toEqual(first);
    c.position.y+=2000;expect(gulls.flockSound(c,0,1).volume).toBe(0);
    gulls.update(c,21,0,false);expect(gulls.flockSound(c,0,0).volume).toBe(0);
    gulls.update(c,22,1,true);expect(gulls.flockSound(c,0,1).volume).toBe(0);
    expect(seagullCallVolume(600,1)).toBeCloseTo(.16);
    expect(seagullCallVolume(1200,1)).toBe(0);expect(seagullCallVolume(0,0)).toBe(0);gulls.dispose();
  });
  it('keeps deterministic flight above the pier pavilion roof',()=>{
    const anchor={...seasidePierPoint(FRIENDS_SEASIDE_PIER.length-500),z:FRIENDS_SEASIDE_PIER.deck+190};
    for(let t=0;t<100;t++){const pose=sampleSeagull(anchor,2,t);expect(pose).toEqual(sampleSeagull(anchor,2,t));expect(pose.z).toBeGreaterThan(FRIENDS_SEASIDE_PIER.deck+FRIENDS_SEASIDE_PIER.pavilionHeight);}
  });
});
