import { FriendsFrontier, frontierTrees } from '../multiplayer/FriendsFrontier';
import { FriendsRetreats } from '../multiplayer/FriendsRetreats';
import { RETREAT_SITES,retreatPoint,emberRetreatTreeClearance,EMBER_RETREAT_TREE_RADIUS } from './FriendsRetreatSites';
import { describe,it,expect } from 'vitest';
import { LAVA_RIVER_POINTS,lavaRiverAt,LAVA_SEA_ENTRY,LAVA_TREE_CLEARANCE,lavaRiverTreeClearance } from './FriendsLavaRiver';
import { baseTerrainHeight } from './FriendsTerrain';
import { islandCoastDistance,ISLAND_SEA_LEVEL,ISLAND_VOLCANO } from './FriendsIsland';
describe('Ember river terrain containment',()=>{
  it('introduces the lookout to older saves and preserves subsequent site choices',()=>{
    const retreats=new FriendsRetreats({version:1,active:['saltwind-camp'],lightsOn:false});
    expect(retreats.state.active).toEqual(['saltwind-camp','ember-lookout','ember-camp']);
    retreats.state.active=['saltwind-camp'];expect(new FriendsRetreats(retreats.save()).state.active).toEqual(['saltwind-camp']);
  });
  it('keeps the lookout and campfire platforms clear of terrain and lava',()=>{
    for(const s of RETREAT_SITES.filter(s=>s.id.startsWith('ember'))){
      for(const u of [-s.w/2,0,s.w/2])for(const v of [-s.d/2,0,s.d/2]){
        const p=retreatPoint(s,u,v);expect(baseTerrainHeight(p.x,p.y)).toBeLessThan(s.z-16);
        const river=lavaRiverAt(p.x,p.y);if(river)expect(river.side).toBeGreaterThan(river.width/2+40);
      }
    }
  });
  it('runs continuously downhill from the molten crater into the sea',()=>{
    expect(LAVA_RIVER_POINTS[0].z).toBe(ISLAND_VOLCANO.lavaLevel);
    for(let i=1;i<LAVA_RIVER_POINTS.length;i++)expect(LAVA_RIVER_POINTS[i].z).toBeLessThanOrEqual(LAVA_RIVER_POINTS[i-1].z);
    expect(islandCoastDistance(LAVA_SEA_ENTRY.x,LAVA_SEA_ENTRY.y)).toBeLessThan(0);
    expect(LAVA_RIVER_POINTS.at(-1)!.z).toBeLessThan(ISLAND_SEA_LEVEL);
  });
  it('keeps the solid voxel field below the entire ribbon, including its edges',()=>{
    for(let i=1;i<152;i++){
      const p=LAVA_RIVER_POINTS[i],next=LAVA_RIVER_POINTS[i+1],a=Math.atan2(next.y-p.y,next.x-p.x);
      for(const side of [-1,0,1]){
        const x=p.x-Math.sin(a)*side*p.width/2,y=p.y+Math.cos(a)*side*p.width/2;
        expect(lavaRiverAt(x,y)).toBeDefined();expect(baseTerrainHeight(x,y)).toBeLessThan(p.z-20);
      }
    }
  });
});

// Independent exhaustive segment scan verifies the bounded production query.
function bankDistance(x:number,y:number) {
  let gap=Infinity;
  for(let i=0;i<LAVA_RIVER_POINTS.length-1;i++) {
    const a=LAVA_RIVER_POINTS[i],b=LAVA_RIVER_POINTS[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
    gap=Math.min(gap,Math.hypot(x-a.x-dx*t,y-a.y-dy*t)-(a.width+(b.width-a.width)*t)/2);
  }
  return gap;
}
describe('lava river forest clearance',()=>{
  it('protects both banks, bends and end caps across the full route',()=>{
    for(const p of LAVA_RIVER_POINTS) {
      expect(lavaRiverTreeClearance(p.x,p.y)).toBe(true);
      for(const offset of [-900,-700,-450,450,700,900]) {
        for(const axis of [0,1]) {
          const x=p.x+(axis===0?offset:0),y=p.y+(axis===1?offset:0);
          expect(lavaRiverTreeClearance(x,y)).toBe(bankDistance(x,y)<=LAVA_TREE_CLEARANCE);
        }
      }
    }
    expect(lavaRiverTreeClearance(8000,8000)).toBe(false);
  });
  it('leaves no natural trees inside the flow or its broad bank buffer',()=>{
    let surviving=0;
    for(let cx=65;cx<=79;cx++)for(let cy=65;cy<=85;cy++)for(const tree of frontierTrees(cx,cy)) {
      expect(bankDistance(tree.x,tree.y),tree.id).toBeGreaterThan(LAVA_TREE_CLEARANCE);
      surviving++;
    }
    expect(surviving).toBeGreaterThan(100);
  });
  it('cleans old planted trees out of the river while preserving other saved trees',()=>{
    const saved=new FriendsFrontier().snapshot();
    saved.planted=[...LAVA_RIVER_POINTS.filter((_,i)=>i%30===0).map((p,i)=>({id:`planted:${i}`,x:p.x,y:p.y,z:p.z,kind:'pine' as const,scale:.75})),{id:'planted:99',x:8000,y:8000,z:0,kind:'oak',scale:1}];
    const restored=new FriendsFrontier(saved).snapshot();
    expect(restored.planted).toEqual([saved.planted.at(-1)]);
    expect(saved.planted.length).toBeGreaterThan(1);
    expect(restored.revision).toBeGreaterThan(saved.revision);
    expect(new FriendsFrontier(restored).snapshot().planted).toEqual(restored.planted);
  });
  it('rejects planting on the river banks without spending a sapling',()=>{
    const p=LAVA_RIVER_POINTS[95],f=new FriendsFrontier(undefined,false);
    const actor={id:'host',label:'Explorer',x:p.x-100+400,y:p.y,z:p.z,lifeState:'alive'};
    const before=f.pack(actor).saplings;
    const result=f.request(actor,{requestId:1,action:'plant'},0,[],[]);
    expect(result.ok).toBe(false);
    expect(f.pack(actor).saplings).toBe(before);
    expect(f.snapshot().planted).toHaveLength(0);
    expect(f.snapshot().feedback.host.message).toContain('lava river');
  });
});

describe('Ember lookout tree clearance',()=>{
  const sites=RETREAT_SITES.filter(s=>s.id.startsWith('ember'));
  it('keeps a wide opening around the bench, campfire and their approaches',()=>{
    for(const site of sites)for(let i=0;i<24;i++) {
      const a=i*Math.PI/12,x=site.x+Math.cos(a)*(EMBER_RETREAT_TREE_RADIUS-1),y=site.y+Math.sin(a)*(EMBER_RETREAT_TREE_RADIUS-1);
      expect(emberRetreatTreeClearance(x,y)).toBe(true);
    }
    let surviving=0;
    for(let cx=70;cx<=76;cx++)for(let cy=75;cy<=81;cy++)for(const tree of frontierTrees(cx,cy)) {
      for(const site of sites)expect(Math.hypot(tree.x-site.x,tree.y-site.y)).toBeGreaterThan(EMBER_RETREAT_TREE_RADIUS);
      surviving++;
    }
    expect(surviving).toBeGreaterThan(0);
    expect(emberRetreatTreeClearance(8000,8000)).toBe(false);
  });
  it('removes saved trees behind the lookout and prevents planting there',()=>{
    const site=sites[0],x=site.x-800,y=site.y;
    expect(lavaRiverTreeClearance(x,y)).toBe(false);
    const saved=new FriendsFrontier().snapshot();
    saved.planted=[{id:'planted:1',x,y,z:448,kind:'oak',scale:1}];
    const f=new FriendsFrontier(saved,false);
    expect(f.snapshot().planted).toHaveLength(0);
    const actor={id:'host',label:'Explorer',x:x-100,y,z:448,lifeState:'alive'},before=f.pack(actor).saplings;
    expect(f.request(actor,{requestId:1,action:'plant'},0,[],[]).ok).toBe(false);
    expect(f.pack(actor).saplings).toBe(before);
    expect(f.snapshot().feedback.host.message).toContain('lookout');
  });
});
