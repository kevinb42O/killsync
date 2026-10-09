import { describe, expect, it } from 'vitest';
import { FRIENDS_RIVERS, RIVER_CROSSING, hydrologyTerrainHeight, riverSampleAt } from './FriendsHydrology';
import { ISLAND_LAKES, ISLAND_SEA_LEVEL, islandArchRange } from './FriendsIsland';
import { FriendsTerrain, RIVER_BRIDGE, baseTerrainHeight, ISLAND_RUINS, FRONTIER_SITES, frontierSiteElevation, frontierSiteMarkerPose } from './FriendsTerrain';
import { friendsWaterGround, friendsWaterLevel } from './FriendsWaterSurface';
import { RETREAT_SITES, RETREAT_APPROACHES } from './FriendsRetreatSites';
import { scenicRailway } from './FriendsScenicRailway';
import { sampleRailAlignment } from './FriendsRailAlignment';
import { frontierTrees } from '../multiplayer/FriendsFrontier';

describe('connected frontier rivers', () => {
  it('connects both existing lakes to Deepmere and Deepmere to the sea without upstream steps', () => {
    expect(FRIENDS_RIVERS.reduce((n,r)=>n+r.length,0)/12).toBeGreaterThan(3500);
    for (const river of FRIENDS_RIVERS) {
      const source=ISLAND_LAKES.find(l=>l.id===river.source)!;
      expect(river.points[0].z).toBe(source.level);
      expect(friendsWaterLevel(river.points[0].x,river.points[0].y)).toBe(source.level);
      for(let i=1;i<river.points.length;i++) {
        const a=river.points[i-1],b=river.points[i];
        expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeLessThan(32);
        expect(b.z).toBeLessThanOrEqual(a.z+.00001);
      }
      const last=river.points.at(-1)!;
      expect(last.z).toBe(river.source==='deepmere'?ISLAND_SEA_LEVEL:ISLAND_LAKES[2].level);
      expect(friendsWaterLevel(last.x,last.y)).toBe(last.z);
    }
  });

  it('has at least 4.5 m depth throughout the central 24 m boat lane, including both railway crossings', () => {
    for(const river of FRIENDS_RIVERS)for(const p of river.points)for(const side of [-144,-96,0,96,144]) {
      const x=p.x-p.ty*side,y=p.y+p.tx*side,water=friendsWaterLevel(x,y);
      expect(water,`${river.id} dry at ${p.distance}, ${side}`).toBeDefined();
      expect(water!-friendsWaterGround(x,y),`${river.id} shallow at ${p.distance}, ${side}`).toBeGreaterThanOrEqual(54);
    }
  });

  it('keeps the World Bridge roof and leaves dry land outside the authored water fields', () => {
    const x=14900,y=10900,arch=islandArchRange(x,y)!;
    expect(arch).toBeDefined();
    expect(arch[0]).toBeLessThan(ISLAND_LAKES[1].level-54);
    const terrain=new FriendsTerrain();
    expect(terrain.material(Math.floor(x/32),Math.floor(y/32),Math.floor((arch[1]+64)/32))).toBeGreaterThan(0);
    for(const [x,y] of [[6000,6000],[19000,13000],[27008,19456],[40000,20000]]) {
      expect(baseTerrainHeight(x,y)).toBe(baseTerrainHeight(x,y,false));
      expect(riverSampleAt(x,y)).toBeUndefined();
    }
    expect(friendsWaterLevel(12128,23600)).toBe(154.5);
    expect(friendsWaterGround(12128,23600)).toBe(-416);
    for(const id of ['deepmere','river-mouth',RIVER_CROSSING.id]){
      const site=FRONTIER_SITES.find(s=>s.id===id)!,flag=frontierSiteMarkerPose(site);
      expect(frontierSiteElevation(site)).toBe(id==='deepmere'?154.5:id==='river-mouth'?ISLAND_SEA_LEVEL:RIVER_CROSSING.z);
      if(id===RIVER_CROSSING.id)expect(flag.z).toBe(RIVER_CROSSING.z);
      else expect(friendsWaterLevel(flag.x,flag.y),'survey flag obstructs waterway').toBeUndefined();
    }
  });

  it('preserves station ground, ordinary pier foundations, tower bases, ruins and retreat approaches', () => {
    const route=scenicRailway();
    // Actual ordinary piers use these chainages; the cove towers replace them.
    for(let d=0;d<route.length;d+=512) {
      const p=sampleRailAlignment(route,d);
      if(p.chapter===10&&baseTerrainHeight(p.x,p.y,false)<ISLAND_SEA_LEVEL)continue;
      for(const side of [-80,0,80]) {
        const x=p.x-Math.sin(p.angle)*side,y=p.y+Math.cos(p.angle)*side;
        const river=riverSampleAt(x,y),original=baseTerrainHeight(x,y,false);
        // New containing banks can bury part of an existing socket. They
        // never cut it away or change the original railway generation datum.
        if(river?.riverId==='skyfalls-river'&&Math.abs(river.level-442.5)<.05)
          expect(baseTerrainHeight(x,y),`supported foundation at ${d}`).toBeGreaterThanOrEqual(original);
        else expect(baseTerrainHeight(x,y),`foundation at ${d}`).toBe(original);
      }
    }
    for(const [x,y] of [[31789.7,24988.7],[31901.7,24794.7]])for(const dx of [-96,0,96])for(const dy of [-96,0,96])
      expect(hydrologyTerrainHeight(x+dx,y+dy,-192)).toBe(-192);
    for(const site of [...ISLAND_RUINS,...RETREAT_SITES])
      expect(baseTerrainHeight(site.x,site.y)).toBe(baseTerrainHeight(site.x,site.y,false));
    for(const route of RETREAT_APPROACHES)for(const p of route.points)
      expect(baseTerrainHeight(p.x,p.y)).toBe(baseTerrainHeight(p.x,p.y,false));
  });

  it('contains the full Skyfalls water surface beneath the station with solid banks on both sides',()=>{
    const terrain=new FriendsTerrain();
    for(const p of FRIENDS_RIVERS[0].points.filter(p=>p.x>7300&&p.x<8400&&Math.abs(p.z-442.5)<.05))for(const side of [-1,1]){
      const x=p.x-p.ty*p.width*.635*side,y=p.y+p.tx*p.width*.635*side;
      expect(baseTerrainHeight(Math.floor(x/32)*32+16,Math.floor(y/32)*32+16)).toBeGreaterThan(p.z+2);
      expect(terrain.floor(x,y,480,0)).toBeGreaterThan(p.z+2);
      expect(friendsWaterLevel(x,y)).toBeUndefined();
    }
  });
});

describe('Reedwater stone crossing', () => {
  it('shares a continuous walkable approach and deck with the terrain controller', () => {
    const terrain=new FriendsTerrain();
    expect(RIVER_BRIDGE.boxes.every(b=>b.h>0&&b.w>0&&b.d>0)).toBe(true);
    let previous=RIVER_BRIDGE.path[0];
    for(const p of RIVER_BRIDGE.path) {
      expect(Math.abs(p.z-previous.z)).toBeLessThanOrEqual(8);
      expect(terrain.floor(p.x,p.y,p.z)).toBe(p.z);
      expect(terrain.supports(p.x,p.y,p.z)).toBe(true);
      const actor={x:p.x,y:p.y};terrain.collide(actor,p.z,12);
      expect(Math.hypot(actor.x-p.x,actor.y-p.y)).toBeLessThan(.001);
      previous=p;
    }
  });
  it('blocks parapets, permits passage below the arch and protects its masonry from digging', () => {
    const b=RIVER_CROSSING,c=Math.cos(b.angle),s=Math.sin(b.angle),terrain=new FriendsTerrain();
    const actor={x:b.x-s*52,y:b.y+c*52};
    expect(terrain.collide(actor,b.z,12)).toBe(true);
    expect(RIVER_BRIDGE.floor(b.x,b.y,60)).toBeUndefined();
    const boat={x:b.x,y:b.y};
    expect(terrain.collide(boat,50,24)).toBe(false);
    expect(RIVER_BRIDGE.ceiling(b.x,b.y,50)).toBe(b.z-20);
    expect(terrain.set(Math.floor(b.x/32),Math.floor(b.y/32),Math.floor((b.z-8)/32),0)).toBe(false);
    const hit=terrain.raycast({x:b.x,y:b.y,z:b.z+80,dx:0,dy:0,dz:-1});
    expect(hit?.z).toBe(b.z);expect(hit?.nz).toBe(1);expect(hit?.material).toBe(2);
    for(let x=36;x<43;x++)for(let y=48;y<57;y++)for(const tree of frontierTrees(x,y))
      expect(RIVER_BRIDGE.clearing(tree.x,tree.y),'tree blocks the stone crossing').toBe(false);
  });
});
