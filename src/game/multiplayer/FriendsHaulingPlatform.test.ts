import { describe, expect, it } from 'vitest';
import { FriendsTerrain, FRIENDS_HAULING_PLATFORM as bay, FRIENDS_HAULING_PLATFORMS, FRIENDS_SPAWN_PLATFORM as arrival, TERRAIN_GENERATION } from '../world/FriendsTerrain';
import { FriendsFrontier } from './FriendsFrontier';
import { FriendsBuilding, friendsPlacementError } from './FriendsBuilding';
import { volumeChunksAround } from '../rendering/FriendsTerrainStreaming';

describe('dedicated hauling platform',()=>{
  it.each(FRIENDS_HAULING_PLATFORMS)('keeps pickup $x,$y level, protected, clear of trees, and streamed locally',p=>{
    const f=new FriendsFrontier(),terrain=f.terrain;
    for(const dx of [-96,0,96])for(const dy of [-96,0,96]){
      const x=p.x+dx,y=p.y+dy,vx=Math.floor(x/32),vy=Math.floor(y/32);
      expect(terrain.floor(x,y,6000,0)).toBe(p.top);
      expect(terrain.collide({x,y},p.top,18,50,0)).toBe(false);
      expect(f.collideTrees({x,y},p.top,20)).toBe(false);
      expect(terrain.set(vx,vy,p.top/32-1,0)).toBe(false);
    }
    expect(friendsPlacementError([],'block',{x:p.x,y:p.y,z:p.top,rotation:0})).toMatch(/hauling platform/);
    expect(volumeChunksAround(p.x,p.y,new Set(),false).has(`${Math.floor(p.x/512)},${Math.floor(p.y/512)}`)).toBe(true);
  });
  it('places a level pickup deck about 750m from arrival on the surveyed local terrain',()=>{
    const terrain=new FriendsTerrain();
    const metres=Math.hypot(bay.x-arrival.x,bay.y-arrival.y)/12;
    expect(metres).toBeGreaterThan(748);expect(metres).toBeLessThan(752);
    expect(bay.top).not.toBe(arrival.top);
    for(let x=bay.x-128;x<=bay.x+128;x+=32)for(let y=bay.y-128;y<=bay.y+128;y+=32){
      expect(terrain.floor(x,y,6000,0)).toBe(bay.top);expect(terrain.supports(x,y,bay.top)).toBe(true);
      expect(terrain.collide({x,y},bay.top,18,50,0)).toBe(false);
    }
    const exit=terrain.floor(bay.x-bay.size/2-16,bay.y,6000,0)!;
    expect(exit).toBeLessThanOrEqual(bay.top);expect(exit).toBeGreaterThanOrEqual(bay.top-96);
    const chunks=volumeChunksAround(bay.x,bay.y,new Set(),false);
    for(const x of [bay.x-128,bay.x+128])expect(chunks.has(`${Math.floor(x/512)},${Math.floor(bay.y/512)}`)).toBe(true);
    expect(volumeChunksAround(arrival.x,arrival.y,new Set(),false).has(`${Math.floor(bay.x/512)},${Math.floor(bay.y/512)}`)).toBe(false);
  });
  it('repairs old holes and soil obstructions and keeps the deck intact across reloads',()=>{
    const vx=Math.floor(bay.x/32),vy=Math.floor(bay.y/32),vz=bay.top/32;
    const terrain=new FriendsTerrain({generation:TERRAIN_GENERATION,revision:1,edits:[[vx,vy,vz-1,0],[vx,vy,vz-2,0],[vx,vy,vz,1]]});
    expect(terrain.floor(bay.x,bay.y,6000,0)).toBe(bay.top);
    expect(terrain.material(vx,vy,vz-1)).toBe(2);expect(terrain.material(vx,vy,vz)).toBe(0);
    expect(terrain.set(vx,vy,vz-1,0)).toBe(false);expect(terrain.set(vx,vy,vz,1)).toBe(false);
    expect(new FriendsTerrain(terrain.snapshot()).floor(bay.x,bay.y,6000,0)).toBe(bay.top);
  });
  it('keeps excavation, soil placement and new construction out of the hauling bay',()=>{
    const f=new FriendsFrontier(),actor={id:'host',label:'Host',x:bay.x,y:bay.y,z:bay.top,lifeState:'alive'};
    const ray={x:bay.x+64,y:bay.y,z:bay.top+26,dx:0,dy:0,dz:-1};
    for(const [i,tool]of ([2,3,4] as const).entries()){
      f.tool(actor,tool,ray,1000+i*500,[]);expect(f.snapshot().feedback.host.message).toMatch(/hauling platform/);
    }
    expect(f.snapshot().mined).toBe(0);
    const pose={x:bay.x,y:bay.y,z:bay.top,rotation:0};
    expect(friendsPlacementError([],'block',pose)).toMatch(/hauling platform/);
    // Reserving the new bay must not silently remove a pre-existing saved build.
    const building=new FriendsBuilding({pieces:[{...pose,id:1,shape:'block',finish:'stone',author:'Host',revision:1}]});
    expect(building.getPieces()).toHaveLength(1);
  });
});
