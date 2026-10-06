import { describe,expect,it } from 'vitest';
import { CAVE_ENTRANCE,CAVE_ROOMS,CAVE_ROUTES,CAVE_TORCHES,caveColumn } from './FriendsCave';
import { FriendsTerrain,baseTerrainHeight } from './FriendsTerrain';
import { meshTerrainChunk } from './FriendsTerrainMesh';

describe('Lantern Descent exploration cave',()=>{
  it('opens a real sinkhole near arrival, with a deep centre and a stepped northern rim',()=>{
    const t=new FriendsTerrain();expect(Math.hypot(CAVE_ENTRANCE.x-5900,CAVE_ENTRANCE.y-5620)).toBeLessThan(800);
    expect(t.floor(CAVE_ENTRANCE.x,CAVE_ENTRANCE.y,6000,0)).toBe(96);expect(t.ceiling(CAVE_ENTRANCE.x,CAVE_ENTRANCE.y,96)).toBeUndefined();
    const upper=t.floor(6256,5104,6000,0)!,lower=t.floor(6496,5104,6000,0)!;expect(upper-lower).toBeGreaterThanOrEqual(160);
    expect(baseTerrainHeight(5904,5712)).toBe(672);
  });
  it('provides tall rooms, a suspended stone crossing, and a deep floor below it',()=>{
    const t=new FriendsTerrain();
    for(const room of CAVE_ROOMS){const z=room.id==='cathedral'?32:caveColumn(room.x,room.y).at(-1)![0];expect(t.floor(room.x,room.y,z,0)).toBe(z);expect(t.ceiling(room.x,room.y,z)!-z).toBeGreaterThanOrEqual(192);}
    expect(t.floor(8608,4800,32,0)).toBe(32);expect(t.floor(8608,4800,-64,0)).toBe(-416);
    expect(t.ceiling(8608,4800,-416)).toBe(-32);expect(t.floor(8608,4896,32,0)).toBe(-416);
    expect(t.ceiling(8608,4896,-416)!+416).toBeGreaterThan(850);
  });
  it('connects the entrance and all room floors through walkable cells with jump-sized steps',()=>{
    const queue:[[number,number,number]]=[[Math.floor(CAVE_ENTRANCE.x/32),Math.floor(CAVE_ENTRANCE.y/32),96]],seen=new Set<string>();
    for(let i=0;i<queue.length;i++){const [vx,vy,z]=queue[i],key=`${vx},${vy},${z}`;if(seen.has(key))continue;seen.add(key);
      for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]])for(const [floor,roof]of caveColumn((vx+dx)*32+16,(vy+dy)*32+16)){if(roof-floor<64||Math.abs(floor-z)>32)continue;const k=`${vx+dx},${vy+dy},${floor}`;if(!seen.has(k))queue.push([vx+dx,vy+dy,floor]);}
      if(seen.size>20000)throw new Error('Unexpected unbounded cave traversal');
    }
    for(const room of CAVE_ROOMS)expect([...seen].some(k=>{const [vx,vy,z]=k.split(',').map(Number);return Math.hypot(vx*32+16-room.x,vy*32+16-room.y)<96&&Math.abs(z-room.floor)<=32;}),room.name).toBe(true);
  });
  it('grounds every route torch and preserves edited cave floors through saves',()=>{
    const t=new FriendsTerrain();expect(CAVE_TORCHES.length).toBeGreaterThan(25);expect(CAVE_ROUTES.length).toBeGreaterThan(5);
    for(const p of CAVE_TORCHES){expect(t.supports(p.x,p.y,p.z),`${p.x},${p.y},${p.z}`).toBe(true);expect((t.ceiling(p.x,p.y,p.z)??10000)-p.z).toBeGreaterThanOrEqual(96);}
    t.set(269,152,-14,0);const restored=new FriendsTerrain(t.snapshot());expect(restored.material(269,152,-14)).toBe(0);
  });
  it('meshes underground walls and ceilings with correct winding and merged planar faces',()=>{
    const t=new FriendsTerrain(),m=meshTerrainChunk(t,16,9);expect(m.positions.length).toBeGreaterThan(0);expect(m.glow.some(value=>value>0)).toBe(true);expect(m.groups.some(g=>g.materialIndex>=5)).toBe(true);
    for(let i=0;i<m.positions.length;i+=9){const p=m.positions,n=m.normals,a=[p[i+3]-p[i],p[i+4]-p[i+1],p[i+5]-p[i+2]],b=[p[i+6]-p[i],p[i+7]-p[i+1],p[i+8]-p[i+2]];expect((a[1]*b[2]-a[2]*b[1])*n[i]+(a[2]*b[0]-a[0]*b[2])*n[i+1]+(a[0]*b[1]-a[1]*b[0])*n[i+2]).toBeGreaterThan(0);}
    expect(m.positions.length/9).toBeLessThan(6000);
  });
});
