import { describe, expect, it } from 'vitest';
import { FriendsHauling, cargoInDeliveryBay } from './FriendsHauling';
import { FRIENDS_HAULING_JOBS, haulingGoal, haulingJob, haulingPickup } from '../world/FriendsHaulingGoal';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { cargoBounds } from './FriendsCargoPose';

describe('multiple hauling jobs',()=>{
  it('starts three geographically separate loads on their own protected staging areas with supported goals',()=>{
    const h=new FriendsHauling(),terrain=new FriendsTerrain();
    expect(h.getCargo()).toHaveLength(3);
    for(const c of h.getCargo()){
      const b=cargoBounds(c),goal=haulingGoal(c),pickup=haulingJob(c).pickup;
      expect(c).toMatchObject(haulingPickup(c));
      expect(b.minX).toBeGreaterThan(pickup.x-144);
      expect(b.maxX).toBeLessThan(pickup.x+144);
      for(const dx of [-36,0,36])for(const dy of [-28,0,28])expect(terrain.floor(c.x+dx,c.y+dy,6000,0)).toBe(c.z);
      expect(terrain.collide({x:c.x,y:c.y},c.z,36,48,0)).toBe(false);
      for(const dx of [-36,0,36])for(const dy of [-28,0,28])expect(terrain.floor(goal.x+dx,goal.y+dy,goal.z,0)).toBe(goal.z);
      expect(terrain.collide({x:goal.x,y:goal.y},goal.z,36,48,0)).toBe(false);
    }
    for(const a of h.getCargo())for(const b of h.getCargo())if(a!==b)expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeGreaterThan(5000);
    // The castle job starts below its courtyard and climbs the winding viaduct.
    expect(h.getCargo()[1].z).toBeLessThan(haulingGoal(h.getCargo()[1]).z-3000);
    expect(h.getCargo().map(c=>c.id)).toEqual(FRIENDS_HAULING_JOBS.map(job=>job.id));
  });
  it('recovers a lost load at its own pickup without relocating its operator',()=>{
    const h=new FriendsHauling(),cargo=h.getCargo()[2];Object.assign(cargo,{z:-1000,vz:-512});
    h.update(50,50,[],new Map(),{revision:'1',floor:()=>undefined,collide:()=>false,blocked:()=>false,vehicles:[]});
    expect(cargo).toMatchObject({...haulingPickup(cargo),vx:0,vy:0,vz:0,spin:0});
  });
  it('delivers each load only at its own bay, retains all blocks, and saves independent progress',()=>{
    const h=new FriendsHauling();
    const env={revision:'1',floor:(x:number,y:number,z:number)=>FRIENDS_HAULING_JOBS.find(job=>job.goal.x===x&&job.goal.y===y)?.goal.z,collide:()=>false,blocked:()=>false,vehicles:[]};
    const first=FRIENDS_HAULING_JOBS[0].goal,second=h.getCargo()[1];
    Object.assign(second,{x:first.x,y:first.y,z:first.z});expect(cargoInDeliveryBay(second)).toBe(false);
    for(const [i,c] of h.getCargo().entries()){
      const goal=haulingGoal(c);Object.assign(c,{x:goal.x,y:goal.y,z:goal.z});
      expect(h.interact({id:'host',x:c.x+80,y:c.y,z:c.z,lifeState:'alive'},env,100*i)).toBe(true);
      const saved=h.save();expect(saved.completedCargoIds).toHaveLength(i+1);expect(saved.delivered).toBe(i===2);
      expect(new FriendsHauling(saved).save()).toEqual(saved);
    }
    expect(h.getCargo()).toHaveLength(3);
    const reset=new FriendsHauling(h.save(),undefined,true).snapshot();
    expect(reset.completedCargoIds).toEqual([]);expect(reset.delivered).toBe(false);expect(reset.ropes).toEqual([]);
  });
});
