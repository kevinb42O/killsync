import { RETREAT_SEATS,RETREAT_SITES } from '../world/FriendsRetreatSites';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsMarshmallowVisuals } from './FriendsMarshmallowVisuals';
import { marshmallowReachTip, type CampfireSnapshot } from '../multiplayer/FriendsCampfireSimulation';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import { CAMPFIRE_SEATS } from '../multiplayer/FriendsCampfireSeats';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';

vi.mock('./FriendsAssets',()=>({loadFriendsAsset:()=>Promise.resolve(new THREE.Group())}));
vi.mock('./FriendsHeldEquipment',()=>({loadFriendsGrip:()=>Promise.resolve(new THREE.Mesh()),acquireEquipmentLighting:()=>({setVisible(){},dispose(){}})}));

function fixture(seated=false){
  const scene=new THREE.Scene(),visuals=new FriendsMarshmallowVisuals(scene);
  const player={id:'host',lifeState:'alive',angle:Math.PI,...(seated?CAMPFIRE_SEATS[0]:{x:FRIENDS_CAMPFIRE.x+124,y:FRIENDS_CAMPFIRE.y,z:FRIENDS_CAMPFIRE.z}),friendsSeat:seated?{vehicleId:FRIENDS_CAMPFIRE.id,index:0}:undefined} as CoopPlayerSnapshot;
  const camera=new THREE.PerspectiveCamera(110,1.5,2,1000);camera.position.set(player.x,player.z+50,player.y);
  camera.lookAt(FRIENDS_CAMPFIRE.x,FRIENDS_CAMPFIRE.z+48,FRIENDS_CAMPFIRE.y);camera.updateMatrixWorld(true);
  const state:CampfireSnapshot={equipped:['host'],fuelSeconds:0,roasts:{host:{toast:0,heat:0,roasting:false,burningMs:0,charred:false,serial:1}}};
  const update=(held:boolean,local=true)=>{visuals.update([player],state,local?'host':'observer',camera,0,2000,true,undefined,held);scene.updateMatrixWorld(true);};
  const grip=()=>scene.getObjectByName('marshmallow-stick-host')!.getWorldPosition(new THREE.Vector3());
  const tip=()=>scene.getObjectByName('toasting-marshmallow')!.getWorldPosition(new THREE.Vector3());
  return {scene,visuals,player,camera,state,update,grip,tip};
}

describe('standing marshmallow reach',()=>{
  it('moves the hand forward on LMB and puts the visible tip at the authoritative cooking point',async()=>{
    const f=fixture();f.update(false);await Promise.resolve();
    const rest=f.grip(),direction=f.camera.getWorldDirection(new THREE.Vector3());
    f.update(true);
    expect(f.grip().clone().sub(rest).dot(direction)).toBeCloseTo(12,4);
    const pitch=Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
    const expected=marshmallowReachTip(f.player,Math.atan2(direction.z,direction.x),pitch);
    expect(f.tip().distanceTo(new THREE.Vector3(expected.x,expected.z,expected.y))).toBeLessThan(.001);
    const arm=f.scene.getObjectByName('marshmallow-holding-hand')!;
    expect(arm.getWorldPosition(new THREE.Vector3()).distanceTo(f.grip())).toBeLessThan(.001);
    expect(arm.getWorldQuaternion(new THREE.Quaternion()).angleTo(f.camera.quaternion)).toBeLessThan(.001);
    f.update(false);expect(f.grip().distanceTo(rest)).toBeLessThan(.001);f.visuals.dispose();
  });
  it('follows the view away from the fire without snapping or stretching across the world',()=>{
    const f=fixture();f.player.x+=1000;f.camera.position.x+=1000;f.camera.lookAt(f.camera.position.clone().add(new THREE.Vector3(1,0,0)));f.camera.updateMatrixWorld(true);
    f.update(true);expect(f.tip().distanceTo(f.camera.position)).toBeCloseTo(124,4);
    expect(f.tip().x-f.camera.position.x).toBeCloseTo(124,4);f.visuals.dispose();
  });
  it('shows peers extending even when their tip is away from the fire and roasting is false',()=>{
    const f=fixture(),tip=marshmallowReachTip(f.player,0,.3);f.state.roasts.host.reach=tip;
    f.update(false,false);expect(f.tip().distanceTo(new THREE.Vector3(tip.x,tip.z,tip.y))).toBeLessThan(.001);f.visuals.dispose();
  });
  it('preserves the seated hand and assigned roasting spot',()=>{
    const f=fixture(true);f.update(false);const grip=f.grip();f.update(true);
    expect(f.grip().distanceTo(grip)).toBe(0);
    const angle=CAMPFIRE_SEATS[0].angle;
    expect(f.tip().distanceTo(new THREE.Vector3(FRIENDS_CAMPFIRE.x+Math.cos(angle)*23,FRIENDS_CAMPFIRE.z+48,FRIENDS_CAMPFIRE.y+Math.sin(angle)*23))).toBeLessThan(.001);f.visuals.dispose();
  });
});

it('places seated Ember roasting sticks over Ember flames instead of the commons',()=>{
  const f=fixture(true),camp=RETREAT_SITES.find(s=>s.id==='ember-camp')!,seat=RETREAT_SEATS.find(s=>s.siteId===camp.id)!;
  Object.assign(f.player,seat,{friendsSeat:{vehicleId:camp.id,index:seat.index}});f.camera.position.set(seat.x,seat.z+50,seat.y);f.camera.lookAt(camp.x,camp.z+48*.27,camp.y);f.camera.updateMatrixWorld(true);
  f.update(true);expect(f.tip().distanceTo(new THREE.Vector3(camp.x,camp.z+48*.27,camp.y))).toBeCloseTo(6,3);expect(f.grip().distanceTo(f.tip())).toBeLessThan(200);f.visuals.dispose();
});
