import { describe, expect, it } from 'vitest';
import { ISLAND_ARCH, ISLAND_SEA_LEVEL, ISLAND_VOLCANO, ISLAND_LAKES, islandArchRange, islandCoastDistance, islandSurfaceBiome } from './FriendsIsland';
import { baseTerrainHeight, FriendsTerrain, ISLAND_RUINS, TERRAIN_GENERATION, previousTerrainHeight, FRIENDS_CAVE_HEIGHT } from './FriendsTerrain';
import { CAVE_ROOMS, CAVE_ENTRANCE } from './FriendsCave';
import { meshBlockHorizon } from './FriendsHorizonMesh';
import { meshTerrainChunk } from './FriendsTerrainMesh';

describe('the alpine ocean island',()=>{
  it('has ocean around every edge, with a dry interior and peaks above the cloud deck',()=>{
    for(let n=0;n<=48000;n+=256)for(const [x,y]of[[n,0],[n,47999],[0,n],[47999,n]])expect(baseTerrainHeight(x,y)).toBeLessThan(ISLAND_SEA_LEVEL);
    expect(baseTerrainHeight(5904,5712)).toBeGreaterThan(ISLAND_SEA_LEVEL);
    expect(baseTerrainHeight(15488,9600)).toBeGreaterThan(4400);
    expect(baseTerrainHeight(23680,15552)).toBeGreaterThan(4400);
  });
  it('keeps all authored underground rooms and the cave mouth accessible',()=>{
    const terrain=new FriendsTerrain();
    for(const room of CAVE_ROOMS){
      const vx=Math.floor(room.x/32),vy=Math.floor(room.y/32);
      expect(terrain.material(vx,vy,room.floor/32+1),room.name).toBe(0);
      expect(terrain.floor(room.x,room.y,room.floor,0),room.name).toBe(room.floor);
      expect(terrain.ceiling(room.x,room.y,room.floor),room.name).toBeGreaterThan(room.floor);
    }
    expect(baseTerrainHeight(CAVE_ENTRANCE.x,CAVE_ENTRANCE.y)).toBe(96);
    expect(terrain.ceiling(6512,6192,FRIENDS_CAVE_HEIGHT)).toBe(FRIENDS_CAVE_HEIGHT+96);
  });
  it('cuts a real fly-through arch with a solid floor and roof, also visible at horizon distance',()=>{
    const t=new FriendsTerrain(),a=ISLAND_ARCH,vx=Math.floor(a.x/32),vy=Math.floor(a.y/32),range=islandArchRange(vx*32+16,vy*32+16)!;
    expect(t.material(vx,vy,range[0]/32-1)).not.toBe(0);
    expect(t.material(vx,vy,range[0]/32)).toBe(0);
    expect(t.material(vx,vy,Math.floor((range[1]-32)/32))).toBe(0);
    expect(t.material(vx,vy,range[1]/32)).not.toBe(0);
    expect(t.floor(a.x,a.y,2000,0)).toBe(range[0]);
    for(let y=a.y-a.depth+256;y<a.y+a.depth-256;y+=32)expect(t.material(vx,Math.floor(y/32),48)).toBe(0);
    const horizon=meshBlockHorizon(15360,10240,512),near=meshTerrainChunk(t,30,20);
    expect(Array.from(horizon.normals).some((n,i)=>i%3===1&&n===-127)).toBe(true);
    expect(Array.from(near.normals).some((n,i)=>i%3===1&&n===-127)).toBe(true);
    for(let i=0;i<horizon.indices.length;i+=3){
      const ids=Array.from(horizon.indices.slice(i,i+3));
      if(horizon.normals[ids[0]*3+1]!==-127)continue;
      const x=horizon.tx+ids.reduce((n,j)=>n+horizon.positions[j*3],0)/3,y=horizon.ty+ids.reduce((n,j)=>n+horizon.positions[j*3+2],0)/3;
      expect(horizon.positions[ids[0]*3+1]).toBe(islandArchRange(Math.floor(x/32)*32+16,Math.floor(y/32)*32+16)![1]);
    }
  });
  it('makes the monuments solid, mineable and persistent using the same voxel-aligned boxes as their distant silhouettes',()=>{
    const t=new FriendsTerrain();
    for(const b of ISLAND_RUINS){
      expect([b.x-b.w/2,b.y-b.d/2,b.z,b.w,b.d,b.h].every(n=>n%32===0)).toBe(true);
      const vx=Math.floor(b.x/32),vy=Math.floor(b.y/32),vz=Math.floor((b.z+b.h-16)/32);
      expect(t.material(vx,vy,vz)).not.toBe(0);
    }
    const b=ISLAND_RUINS.find(b=>b.tint==='glow')!,vx=Math.floor(b.x/32),vy=Math.floor(b.y/32),vz=b.z/32;
    t.set(vx,vy,vz,0);expect(new FriendsTerrain(t.snapshot()).material(vx,vy,vz)).toBe(0);
  });
  it('retires old flat grading while preserving new excavations across saves',()=>{
    const x=24336,y=24016,vx=Math.floor(x/32),vy=Math.floor(y/32),old=previousTerrainHeight(x,y);
    const t=new FriendsTerrain({generation:3,revision:1,grades:[[x,y,0,512]],edits:[[vx,vy,old/32-1,0]]});
    expect(t.surfaceHeight(x,y)).toBe(baseTerrainHeight(x,y));
    expect(t.snapshot().grades).toEqual([]);expect(t.snapshot().edits).toEqual([]);
    const vz=t.height(vx,vy)/32-1;t.set(vx,vy,vz,0);
    expect(new FriendsTerrain(t.snapshot()).material(vx,vy,vz)).toBe(0);
    expect(t.snapshot().generation).toBe(TERRAIN_GENERATION);
  });
  it('has shallow beach transects with no abrupt perimeter cliff',()=>{
    let samples=0;
    for(let x=1024;x<47000;x+=192)for(let y=10048;y<47000;y+=192){
      const d=islandCoastDistance(x,y);
      if(Math.abs(d)>120)continue;
      samples++;
      expect(Math.abs(baseTerrainHeight(x+32,y)-baseTerrainHeight(x-32,y))).toBeLessThanOrEqual(64);
      expect(Math.abs(baseTerrainHeight(x,y+32)-baseTerrainHeight(x,y-32))).toBeLessThanOrEqual(64);
      expect(baseTerrainHeight(x,y)).toBeLessThanOrEqual(0);
    }
    expect(samples).toBeGreaterThan(500);
  });
  it('differentiates seven land biomes and carves submerged lakebeds and a molten crater',()=>{
    const biomes=new Set<string>();
    for(let x=1500;x<46500;x+=512)for(let y=1500;y<46500;y+=512){const h=baseTerrainHeight(x,y);if(h>ISLAND_SEA_LEVEL)biomes.add(islandSurfaceBiome(x,y,h));}
    for(const biome of ['grass','sand','mud','stone','ice','snow','basalt','lava'])expect(biomes.has(biome),biome).toBe(true);
    expect(baseTerrainHeight(ISLAND_VOLCANO.x,ISLAND_VOLCANO.y)).toBeLessThan(ISLAND_VOLCANO.lavaLevel);
    const lake=ISLAND_LAKES[0];expect(baseTerrainHeight(lake.x,lake.y)).toBeLessThan(lake.level-96);
    const floors=new Set<number>(),roofs=new Set<number>();
    for(let y=ISLAND_ARCH.y-2800;y<ISLAND_ARCH.y+2800;y+=128){const r=islandArchRange(ISLAND_ARCH.x,y)!;floors.add(r[0]);roofs.add(r[1]);}
    expect(floors.size).toBeGreaterThan(7);expect(roofs.size).toBeGreaterThan(10);
  });
});
