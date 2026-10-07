import { describe,it,expect } from 'vitest';
import { ISLAND_SEA_LEVEL } from './FriendsIsland';
import { scenicRailway,scenicStationPoses } from './FriendsScenicRailway';
import { sampleRailAlignment,railColumns } from './FriendsRailAlignment';
import { FriendsTerrain,baseTerrainHeight,ISLAND_RUINS } from './FriendsTerrain';
import { scenicTransitProtected,scenicTransitAir,scenicRailFloor } from './FriendsRailInfrastructure';
import { scenicVehicles } from '../multiplayer/FriendsScenicService';
import { vehicleWorldPoint } from '../multiplayer/FriendsVehiclePose';

describe('Grand Traverse engineering',()=>{
  it('covers all twenty chapters, closes continuously and stays inside world bounds',()=>{
    const r=scenicRailway();expect(r.length/12000).toBeGreaterThan(11);expect(r.length/12000).toBeLessThan(14);expect(new Set(r.points.map(p=>p.chapter)).size).toBe(20);
    expect(r.points.every(p=>p.x>256&&p.y>256&&p.x<47744&&p.y<47744&&p.z<=736.001&&p.z>=64)).toBe(true);
    const a=sampleRailAlignment(r,r.length-.01),b=sampleRailAlignment(r,.01);expect(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)).toBeLessThan(.03);expect(Math.abs(a.pitch-b.pitch)).toBeLessThan(.0001);expect(Math.abs(a.angle-b.angle)).toBeLessThan(.0001);
    expect(Math.max(...r.points.map(p=>Math.abs(p.grade)))).toBeLessThan(.02501);expect(1/Math.max(...r.points.map(p=>p.curvature))).toBeGreaterThan(768);
  });
  it('limits exposed bridge decks to 40 m above land and 35 m above water',()=>{
    for(const p of scenicRailway().points){const height=baseTerrainHeight(p.x,p.y);
      expect(p.z-(height<ISLAND_SEA_LEVEL?ISLAND_SEA_LEVEL:height)).toBeLessThan((height<ISLAND_SEA_LEVEL?35:40)*12);
    }
  });
  it('has no loops, spirals or non-adjacent crossings',()=>{
    const r=scenicRailway();let crossings=0;
    for(let i=0;i<r.points.length;i+=4){const p=r.points[i];for(const q of railColumns(r,p.x,p.y,160)){
      const d=Math.abs(p.distance-q.distance);if(Math.min(d,r.length-d)<1600)continue;
      crossings++;
    }}
    expect(crossings).toBe(0);
  });
  it('reserves level station zones for the full eleven-vehicle consist',()=>{
    const r=scenicRailway();expect(scenicStationPoses()).toHaveLength(5);
    for(const s of scenicStationPoses())for(let d=-1280;d<=1280;d+=32){const p=sampleRailAlignment(r,s.distance+d);expect(Math.abs(p.z-s.z)).toBeLessThan(.001);expect(Math.abs(p.pitch)).toBeLessThan(.001);}
  });
  it('has actual mountain bores and raised spans, with clear physical train hulls throughout a complete circuit',()=>{
    const r=scenicRailway(),terrain=new FriendsTerrain();let tunnels=0,bridges=0;
    for(let d=0;d<r.length;d+=256){const p=sampleRailAlignment(r,d),h=baseTerrainHeight(p.x,p.y);if(h>p.z+224)tunnels++;if(h<p.z-96)bridges++;
      for(const v of scenicVehicles(d))for(const x of [-v.length/2,0,v.length/2])for(const y of [-60,60])for(const z of [0,64,132]){
        const p=vehicleWorldPoint(v,{x,y,z});expect(terrain.material(Math.floor(p.x/32),Math.floor(p.y/32),Math.floor(p.z/32)),`hull blocked at ${d}, ${v.id}`).toBe(0);
      }
    }
    expect(tunnels).toBeGreaterThan(40);expect(bridges).toBeGreaterThan(40);
  },60000);
  it('excludes the whole castle and approach even underground, and preserves every ruin',()=>{
    const route=scenicRailway(),clearance=172;
    // Full castle grounds and its southern approach, plus a 512-unit setback.
    for(const p of route.points)expect(p.x<16000-clearance||p.x>21408+clearance||p.y<10016-clearance||p.y>19776+clearance,`castle setback at ${p.distance}`).toBe(true);
    for(const ruin of ISLAND_RUINS)for(const x of [ruin.x-ruin.w/2+16,ruin.x,ruin.x+ruin.w/2-16])for(const y of [ruin.y-ruin.d/2+16,ruin.y,ruin.y+ruin.d/2-16])for(const z of [ruin.z+16,ruin.z+ruin.h/2,ruin.z+ruin.h-16])expect(scenicTransitAir(x,y,z),`rail excavates ruin at ${x},${y},${z}`).toBe(false);
  },30000);
  it('supports the finished maintenance shoulders in cuttings without creating invisible floors beside sea bridges',()=>{
    const route=scenicRailway(),tunnel=route.points.find(p=>baseTerrainHeight(p.x,p.y)>p.z+300)!,bridge=route.points.find(p=>p.chapter===10&&baseTerrainHeight(p.x,p.y)<ISLAND_SEA_LEVEL)!;
    for(const p of [tunnel,bridge])for(const side of [-96,96]){
      const floor=scenicRailFloor(p.x-Math.sin(p.angle)*side,p.y+Math.cos(p.angle)*side,p.z);
      if(p===tunnel)expect(floor).toBeCloseTo(p.z-24,1);else expect(floor).toBeUndefined();
    }
  });
  it('finds the corridor from outside its excavation for tunnel streaming',()=>{
    for(const station of scenicStationPoses())for(const offset of [-600,600]){
      const x=station.x-Math.sin(station.angle)*offset,y=station.y+Math.cos(station.angle)*offset;
      expect(railColumns(scenicRailway(),x,y,768).some(p=>Math.abs(p.side-600)<1)).toBe(true);
    }
  });
  it('puts station platforms at the actual surrounding ground level',()=>{
    for(const station of scenicStationPoses())expect(station.z+14).toBeCloseTo(baseTerrainHeight(station.x,station.y),5);
  });
  it('protects new edits while preserving previously saved terrain edits',()=>{
    const p=sampleRailAlignment(scenicRailway(),scenicStationPoses()[0].distance),cell=[Math.floor(p.x/32),Math.floor(p.y/32),Math.floor((p.z+64)/32)] as const;
    const terrain=new FriendsTerrain();expect(scenicTransitProtected(p.x,p.y,p.z+64)).toBe(true);expect(terrain.set(...cell,2)).toBe(false);
    const snapshot=terrain.snapshot();snapshot.edits.push([...cell,2]);snapshot.revision++;
    const restored=new FriendsTerrain(snapshot);expect(restored.material(...cell)).toBe(2);
  });
});
