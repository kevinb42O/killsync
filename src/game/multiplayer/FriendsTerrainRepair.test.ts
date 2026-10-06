import { describe, expect, it } from 'vitest';
import { FriendsFrontier } from './FriendsFrontier';
import { sampleWorldSurface } from '../world/WorldDefinitions';
import { baseTerrainHeight } from '../world/FriendsTerrain';
import type { FriendsBuildPiece } from './FriendsBuilding';
const actor={id:'host',label:'Explorer',x:5904,y:5712,z:672,lifeState:'alive'};
const dig=(f:FriendsFrontier,x:number,y:number,pieces:FriendsBuildPiece[]=[])=>{
  const z=f.terrain.floor(x,y,6000,0)!;
  f.tool({...actor,x,y,z},3,{x,y,z:z+26,dx:0,dy:0,dz:-1},1000,pieces);
  return z;
};
describe('former spawn area terrain repair',()=>{
  it('allows excavation at arrival, the aircraft spawn and beneath their old reserve',()=>{
    for(const [x,y] of [[5904,5712],[4704,5728],[5904,5648]]){
      const f=new FriendsFrontier(),z=dig(f,x,y);
      expect(f.terrain.floor(x,y,z,0)).toBe(z-32);
      expect(f.snapshot().feedback.host.message).toContain('+1 soil');
      expect(new FriendsFrontier(f.snapshot()).terrain.floor(x,y,z,0)).toBe(z-32);
    }
  });
  it('still protects a block supporting an actual saved build',()=>{
    const f=new FriendsFrontier(),z=f.terrain.floor(5904,5712,6000,0)!;
    const piece:FriendsBuildPiece={id:1,shape:'block',finish:'grass',author:'Host',revision:1,x:5904,y:5712,z,rotation:0};
    dig(f,5904,5712,[piece]);expect(f.snapshot().mined).toBe(0);
    expect(f.snapshot().feedback.host.message).toContain('saved build');
  });
  it('lets players dig beside a build and below its immediate foundation',()=>{
    const f=new FriendsFrontier(),z=f.terrain.floor(5904,5712,6000,0)!;
    const piece:FriendsBuildPiece={id:1,shape:'block',finish:'grass',author:'Host',revision:1,x:5904,y:5712,z,rotation:0};
    dig(f,5968,5712,[piece]);expect(f.snapshot().mined).toBe(1);
    const vx=Math.floor(5904/32),vy=Math.floor(5712/32),vz=z/32-2;
    f.tool({...actor,z:z-32},3,{x:5904,y:5712,z:z-33,dx:0,dy:0,dz:-1},1400,[piece]);
    expect(f.terrain.material(vx,vy,vz)).toBe(0);expect(f.snapshot().mined).toBe(2);
  });
  it('permits free earthwork inside the former spawn reserve',()=>{
    const f=new FriendsFrontier(),z=dig(f,5904,5712);
    f.tool(actor,4,{x:5904,y:5712,z:z+26,dx:0,dy:0,dz:-1},1400,[]);
    expect(f.terrain.floor(5904,5712,z,0)).toBe(z);expect(f.pack(actor).soil).toBe(1);
  });
  it('treats the former lake and the ground below it as dry terrain',()=>{
    for(const [x,y] of [[7440,6520],[6800,6300],[8000,6800]]){
      expect(sampleWorldSurface('friends_frontier',x,y).movementMultiplier).toBe(1);
      expect(baseTerrainHeight(x,y)).toBeGreaterThan(400);
    }
  });
});
