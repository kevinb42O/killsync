import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import type { FishingCast } from '../multiplayer/FriendsFishing';
import { fishingRodPose, type FishingRodPose } from './FriendsFishingRodPose';

const pose=():FishingRodPose=>({pitch:0,lift:0,draw:0,flex:0});
const cast=(power=1):FishingCast=>({id:1,playerId:'test',x:0,y:0,z:26,from:{x:0,y:0,z:26},target:{x:0,y:0,z:26},phase:'casting',atMs:1000,castAt:1000,castPower:power,biteAt:0,size:0});
describe('fishing casting stroke',()=>{
  it('draws the actual shaft backward on charge, then forward beyond its ready position on release',()=>{
    const tipZ=(p:FishingRodPose)=>new THREE.Vector3(0,1.95,0).applyEuler(new THREE.Euler(p.pitch,0,0)).z;
    const idle=fishingRodPose(pose(),undefined,undefined,0),back=fishingRodPose(pose(),1200,undefined,1200),forward=fishingRodPose(pose(),undefined,cast(),1180);
    expect(tipZ(back)).toBeGreaterThan(tipZ(idle));expect(tipZ(forward)).toBeLessThan(tipZ(idle));
    expect(back.lift).toBeGreaterThan(idle.lift);expect(forward.flex).toBeCloseTo(0);
  });
  it('preserves the charged pose on release for short and full holds, even on immediate wall landing',()=>{
    for(const held of [0,100,300,600,1200]){
      const back=fishingRodPose(pose(),held,undefined,1000),c=cast(held/1200),release=fishingRodPose(pose(),undefined,c,1000);
      expect(release).toEqual(back);
      const airborne=fishingRodPose(pose(),undefined,c,1100);
      c.phase='dry';c.atMs=1100;
      expect(fishingRodPose(pose(),undefined,c,1100)).toEqual(airborne);
    }
  });
  it('settles smoothly without replaying a cast and uses less load for empty retrieval',()=>{
    const c=cast();let previous=fishingRodPose(pose(),undefined,c,1000).pitch;
    for(let now=1001;now<=1850;now++){
      const p=fishingRodPose(pose(),undefined,c,now);expect(Math.abs(p.pitch-previous)).toBeLessThan(.03);previous=p.pitch;
    }
    expect(previous).toBeCloseTo(-.48);
    c.phase='reeling';c.atMs=1900;c.empty=true;
    const empty=fishingRodPose(pose(),undefined,c,2200).flex;c.empty=false;
    expect(empty).toBeLessThan(fishingRodPose(pose(),undefined,c,2200).flex);
  });
});
