import { describe,it,expect } from 'vitest';
import { FriendsFloodWater, friendsFloodWater, friendsLiveWaterAt, friendsLiveWaterSurface, type FloodSource, type FloodTerrain } from './FriendsFloodWater';
import { FriendsTerrain, TERRAIN_GENERATION, type TerrainEdit } from './FriendsTerrain';
import { ISLAND_LAKES } from './FriendsIsland';
import { friendsWaterAt, friendsWaterGround } from './FriendsWaterSurface';
class TestTerrain implements FloodTerrain {
  waterEpoch=0;
  edits=new Map<string,TerrainEdit>();
  naturalAir=new Set<string>(['-1,0,0','-1,0,1']);
  floodEdits(){return this.edits.values();}
  material(x:number,y:number,z:number){return this.edits.get(`${x},${y},${z}`)?.[3]??(this.naturalAir.has(`${x},${y},${z}`)?0:1);}
  set(x:number,y:number,z:number,m:0|1=0){this.edits.set(`${x},${y},${z}`,[x,y,z,m]);this.waterEpoch++;}
}
const source:FloodSource=(x,y)=>x<0&&y===16?{level:45.5,bed:0,depth:45.5,bodyId:'lake'}:undefined;
function fixture(){const t=new TestTerrain(),f=new FriendsFloodWater(t,source);return {t,f};}
describe('connected excavation flooding',()=>{
  it('fills only face connected cells below the exact head, with edited depth',()=>{
    const {t,f}=fixture();t.set(0,0,0);t.set(1,0,0);t.set(1,0,-1);t.set(1,0,1);t.set(1,0,2);t.set(4,0,0);t.set(2,1,0);
    expect(f.sample(48,16,-16)).toEqual({level:45.5,bodyId:'lake',depth:77.5});
    expect(f.sample(48,16,45)).toBeDefined();expect(f.sample(48,16,45.5)).toBeUndefined();expect(f.sample(48,16,65)).toBeUndefined();
    expect(f.surface(48,16)?.depth).toBe(77.5);expect(f.sample(144,16,16)).toBeUndefined();expect(f.sample(80,48,16)).toBeUndefined();
  });
  it('dries a sealed bridge and restores the same flood after reopening',()=>{
    const {t,f}=fixture();for(let x=0;x<5;x++)t.set(x,0,0);expect([...f.cells()]).toHaveLength(5);
    t.set(1,0,0,1);expect(f.sample(80,16,16)).toBeUndefined();t.set(1,0,0);expect([...f.cells()]).toHaveLength(5);
    t.naturalAir.add('4,-1,0');const two=new FriendsFloodWater(t,(x,y)=>source(x,y)??(x===144&&y===-16?{level:45.5,bed:0,depth:45.5,bodyId:'lake'}:undefined));
    t.set(1,0,0,1);expect(two.sample(80,16,16)).toBeDefined();
  });
  it('does not cross an above-water sill or use natural caves as shortcuts',()=>{
    const {t,f}=fixture();t.set(0,0,0);t.set(0,0,1);t.set(0,0,2);t.set(1,0,2);t.set(2,0,2);t.set(2,0,1);t.set(2,0,0);
    expect(f.sample(80,16,16)).toBeUndefined();t.naturalAir.add('1,0,0');t.waterEpoch++;expect(f.sample(80,16,16)).toBeUndefined();
  });
  it('cannot source through a solid lake bed, wall, or ceiling',()=>{
    const {t,f}=fixture();t.set(0,0,-1);expect([...f.cells()]).toHaveLength(0);t.set(0,1,-1);expect([...f.cells()]).toHaveLength(0);
    t.set(0,0,0);expect(f.sample(16,16,-16)).toBeDefined();
  });
  it('chooses highest reachable head and stable ownership, independent of edit order',()=>{
    const run=(reverse:boolean)=>{const t=new TestTerrain();t.naturalAir.add('3,0,0');const cells=[0,1,2];for(const x of reverse?cells.reverse():cells)t.set(x,0,0);
      const f=new FriendsFloodWater(t,(x,y)=>source(x,y)??(x===112&&y===16?{level:60,bed:0,depth:60,bodyId:'higher'}:undefined));return [...f.cells()].sort((a,b)=>a.vx-b.vx);};
    expect(run(false)).toEqual(run(true));expect(run(false).every(c=>c.level===60&&c.bodyId==='higher')).toBe(true);
    const {t}=fixture();t.naturalAir.add('1,0,0');t.set(0,0,0);const f=new FriendsFloodWater(t,(x,y)=>source(x,y)??(x===48&&y===16?{level:45.5,bed:0,depth:45.5,bodyId:'aaa'}:undefined));expect(f.sample(16,16,16)?.bodyId).toBe('aaa');
  });
  it('batches changes and performs no graph work during steady-state samples',()=>{
    const {t,f}=fixture();for(let x=0;x<100;x++)t.set(x,0,0);f.refresh();expect(f.rebuilds).toBe(1);for(let i=0;i<100;i++)f.sample(16,16,16);expect(f.rebuilds).toBe(1);
  });
  it('deepens the exposed sea bed without moving its natural source level',()=>{
    const t=new FriendsTerrain(),x=32016,y=16,s=friendsWaterAt(x,y)!;
    expect(s.bodyId).toBe('sea');const vx=Math.floor(x/32),vy=Math.floor(y/32),bed=friendsWaterGround(x,y),vz=bed/32-1;
    expect(t.set(vx,vy,vz,0)).toBe(true);
    expect(friendsLiveWaterSurface(t,x,y)).toEqual({...s,depth:s.depth+32});
    expect(friendsLiveWaterAt(t,x,y,bed-16)?.level).toBe(s.level);
    expect(friendsLiveWaterAt(t,x,y,s.level-2)?.depth).toBe(s.depth+32);
  });
  it('incremental neighbourhood updates agree with a full solver after every edit',()=>{
    class IncrementalTerrain extends TestTerrain {
      changes:{epoch:number;edit:TerrainEdit}[]=[];
      override set(x:number,y:number,z:number,m:0|1=0){super.set(x,y,z,m);this.changes.push({epoch:this.waterEpoch,edit:[x,y,z,m]});}
      floodChanges(after:number){return this.changes.filter(c=>c.epoch>after).map(c=>c.edit);}
    }
    const t=new IncrementalTerrain(),f=new FriendsFloodWater(t,source);let random=31;
    for(let i=0;i<300;i++){
      random=(Math.imul(random,1664525)+1013904223)>>>0;const x=random%8,y=(random>>>8)%3,z=(random>>>16)%4-1;
      t.set(x,y,z,random%5===0?1:0);
      const order=(a:{vx:number;vy:number;vz:number},b:{vx:number;vy:number;vz:number})=>a.vx-b.vx||a.vy-b.vy||a.vz-b.vz;
      expect([...f.cells()].sort(order)).toEqual([...new FriendsFloodWater(t,source).cells()].sort(order));
    }
  });
  it('reconstructs real bank excavations on save, late join and same-revision repair',()=>{
    const t=new FriendsTerrain();let bank:TerrainEdit|undefined;
    for(let y=18300;y<20500&&!bank;y+=32)for(let x=5600;x<8300&&!bank;x+=32){
      const vx=Math.floor(x/32),vy=Math.floor(y/32);
      for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const s=friendsWaterAt((vx+dx+.5)*32,(vy+dy+.5)*32);if(!s||!ISLAND_LAKES.some(l=>l.id===s.bodyId))continue;const vz=Math.ceil(s.level/32)-1;if(t.material(vx,vy,vz)&&!t.material(vx+dx,vy+dy,vz)){bank=[vx,vy,vz,0];break;}}
    }
    expect(bank).toBeDefined();const [vx,vy,vz]=bank!;expect(t.set(vx,vy,vz,0)).toBe(true);const f=friendsFloodWater(t),wet=[...f.cells()];expect(wet).toHaveLength(1);
    const saved=t.snapshot(),client=new FriendsTerrain(saved);expect([...friendsFloodWater(client).cells()]).toEqual(wet);
    expect(friendsLiveWaterAt(t,(vx+.5)*32,(vy+.5)*32,vz*32+1)).toBeDefined();
    t.restore({...saved,edits:[],generation:TERRAIN_GENERATION});expect([...f.cells()]).toHaveLength(0);t.restore(saved);expect([...f.cells()]).toEqual(wet);
  });
});
