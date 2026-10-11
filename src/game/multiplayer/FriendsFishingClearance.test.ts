import {describe,it,expect,vi} from 'vitest';
import {FriendsFishingClearance} from './FriendsFishingClearance';
import {FriendsTerrain} from '../world/FriendsTerrain';
import {sharkWaterPose} from './FriendsGiantShark';

describe('cached shark terrain clearance',()=>{
  it('reuses conservative empty volumes and invalidates them when terrain changes',()=>{
    const terrain=new FriendsTerrain(),cache=new FriendsFishingClearance(),collide=vi.spyOn(terrain,'collide');
    expect(cache.clear(terrain,1000,23600,-350,-100,40)).toBe(true);
    const calls=collide.mock.calls.length;
    expect(cache.clear(terrain,1004,23604,-350,-100,40)).toBe(true);expect(collide.mock.calls).toHaveLength(calls);
    terrain.set(Math.floor(1000/32),Math.floor(23600/32),-7,2);
    expect(cache.clear(terrain,1000,23600,-350,-100,40)).toBe(false);
    terrain.set(Math.floor(1000/32),Math.floor(23600/32),-7,0);
    expect(cache.clear(terrain,1000,23600,-350,-100,40)).toBe(true);
  });
  it('uses volume clearance instead of repeated floor searches and rays, and checks changes each query',()=>{
    const floor=vi.fn(()=>-400),blocked=vi.fn(()=>false),clear=vi.fn(()=>true);
    const env={water:()=>({level:0,depth:400,bodyId:'sea'}),floor,blocked,waterClearance:clear};
    expect(sharkWaterPose(env,{x:0,y:0,z:0},10,0)).toBeDefined();expect(clear).toHaveBeenCalledTimes(45);
    expect(floor).not.toHaveBeenCalled();expect(blocked).not.toHaveBeenCalled();
    clear.mockReturnValue(false);expect(sharkWaterPose(env,{x:0,y:0,z:0},10,0)).toBeUndefined();
  });
});
