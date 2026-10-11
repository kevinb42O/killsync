import { describe, expect, it } from 'vitest';
import { FriendsTerrain, baseTerrainHeight } from './FriendsTerrain';
import { createTidalSanctum, TIDAL_SANCTUM, sanctumTerrainHeight } from './FriendsSanctum';
import { FRIENDS_HAULING_JOBS } from './FriendsHaulingGoal';
import { FriendsHauling, cargoInDeliveryBay } from '../multiplayer/FriendsHauling';

describe('Tidal Sanctum mission terrace',()=>{
  it('keeps the full saved delivery bay supported with room for the core and operator',()=>{
    const terrain=new FriendsTerrain(),goal=FRIENDS_HAULING_JOBS[2].goal;
    expect(goal).toMatchObject({x:27008,y:19568,z:352});
    for(let dx=-64;dx<64;dx+=16)for(let dy=-64;dy<64;dy+=16){
      expect(terrain.floor(goal.x+dx,goal.y+dy,goal.z,0)).toBe(goal.z);
      expect(terrain.collide({x:goal.x+dx,y:goal.y+dy},goal.z,12,128,0)).toBe(false);
    }
    const hauling=new FriendsHauling(),cargo=hauling.getCargo()[2];
    Object.assign(cargo,{x:goal.x,y:goal.y,z:goal.z});
    expect(cargoInDeliveryBay(cargo)).toBe(true);
    const env={revision:'sanctum',floor:(x:number,y:number,z:number)=>terrain.floor(x,y,z,0),collide:()=>false,blocked:()=>false,vehicles:[]};
    expect(hauling.interact({id:'host',x:goal.x+80,y:goal.y,z:goal.z,lifeState:'alive'},env,100)).toBe(true);
    expect(new FriendsHauling(hauling.save()).save().completedCargoIds).toContain('sanctum-core');
  });
  it('supports every south stair tread and leaves a continuous cargo-width lane to the bay',()=>{
    const terrain=new FriendsTerrain(),s=TIDAL_SANCTUM;
    for(let i=0;i<7;i++)for(const dx of [-96,0,96]){
      const y=s.y+864-i*64,top=160+i*32;
      expect(terrain.floor(s.x+dx,y,top,0)).toBe(top);
      expect(terrain.collide({x:s.x+dx,y},top,20,96,0)).toBe(false);
    }
    for(let dy=400;dy>=48;dy-=16){
      expect(terrain.floor(s.x,s.y+dy,352,0)).toBe(352);
      expect(terrain.collide({x:s.x,y:s.y+dy},352,72,96,0)).toBe(false);
    }
  });
  it('keeps the gateway hollow, prevents hillside intrusion, and uses mineable voxel geometry',()=>{
    const s=TIDAL_SANCTUM,terrain=new FriendsTerrain();
    expect(terrain.collide({x:s.x,y:s.y-224},352,48,448,0)).toBe(false);
    expect(baseTerrainHeight(s.x-480,s.y)).toBeLessThan(352);
    expect(sanctumTerrainHeight(s.x+3000,s.y,768)).toBe(768);
    for(const b of createTidalSanctum())expect([b.x-b.w/2,b.y-b.d/2,b.z,b.w,b.d,b.h].every(n=>n%32===0)).toBe(true);
    const rune=createTidalSanctum().find(b=>b.tint==='glow')!;
    const vx=Math.floor(rune.x/32),vy=Math.floor(rune.y/32),vz=rune.z/32;
    expect(terrain.material(vx,vy,vz)).not.toBe(0);terrain.set(vx,vy,vz,0);
    expect(new FriendsTerrain(terrain.snapshot()).material(vx,vy,vz)).toBe(0);
  });
});
