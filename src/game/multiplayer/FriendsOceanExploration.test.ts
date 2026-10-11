import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { FriendsTerrain, TERRAIN_BOTTOM } from '../world/FriendsTerrain';
import { friendsLiveWaterAt } from '../world/FriendsFloodWater';
import { DISTANT_ISLANDS, OUTER_ISLAND_MASONRY } from '../world/FriendsOuterIslands';
import { meshOrganicHorizon, meshBlockHorizon } from '../world/FriendsHorizonMesh';
import { surfaceTilesAround, volumeChunksAround } from '../rendering/FriendsTerrainStreaming';
import { terrainCoverageIndex } from '../rendering/FriendsTerrainCoverage';
import { ISLAND_SEA_LEVEL } from '../world/FriendsIsland';

const seed={id:'host',label:'Host',color:'#8de6ce'};
const input=(sequence:number,angle=0):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:1,aimAngle:angle,aimPitch:32768,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});
const edges=[[-32,24000],[48032,24000],[24000,-32],[24000,48032]];
describe('continuous explorable ocean',()=>{
  it.each(edges)('has rendered and solid seabed beyond the former boundary at %i,%i',(x,y)=>{
    const terrain=new FriendsTerrain(),bed=terrain.surfaceHeight(x,y);
    expect(bed).toBeLessThan(-600);
    expect(terrain.supports(x,y,bed)).toBe(true);
    expect(terrain.floor(x,y,bed+64,0)).toBe(bed);
    expect(friendsLiveWaterAt(terrain,x,y,bed+64)?.bodyId).toBe('sea');
    const tx=Math.floor(x/2048)*2048,ty=Math.floor(y/2048)*2048;
    for(const mesh of [meshOrganicHorizon(tx,ty,2048),meshBlockHorizon(tx,ty,2048)]){
      expect(mesh.indices.length).toBeGreaterThan(0);
      const xs=Array.from(mesh.positions).filter((_,i)=>i%3===0);
      expect(Math.min(...xs)).toBe(0);expect(Math.max(...xs)).toBe(2048);
    }
    expect(surfaceTilesAround(x,y).some(t=>t.x===tx&&t.y===ty)).toBe(true);
    expect(volumeChunksAround(x,y,new Set(),true).has(`${Math.floor(x/512)},${Math.floor(y/512)}`)).toBe(true);
    expect(terrainCoverageIndex(Math.floor(x/512),Math.floor(y/512),512)).toBeGreaterThanOrEqual(0);
  });
  it.each([[1,24000,32768,-1],[47999,24000,0,48000],[24000,1,49151,-1],[24000,47999,16384,48000]])('lets swimmers cross the old edge without a home reset or injury at %i,%i',(x,y,angle,target)=>{
    const simulation=new FriendsSimulation([seed]),player=simulation['players'].get(seed.id)!;
    Object.assign(player,{x,y,z:-800,verticalVelocity:0});
    for(let i=1;i<=40;i++){simulation.setInput(seed.id,input(i,angle));simulation.tick(50);}
    const coordinate=angle===0||angle===32768?player.x:player.y;
    if(target===-1)expect(coordinate).toBeLessThan(0);else expect(coordinate).toBeGreaterThan(48000);
    expect(player.z).toBeLessThan(-600);expect(player.swimming).toBe(true);
    expect(player.lifeState).toBe('alive');expect(player.health).toBe(player.maxHealth);
  });
  it('keeps seabed contact below the old recovery plane and repairs a true escaped fall locally',()=>{
    const simulation=new FriendsSimulation([seed]),player=simulation['players'].get(seed.id)!,terrain=simulation['friendsFrontier']!.terrain;
    const x=-40000,y=24000,bed=terrain.surfaceHeight(x,y);
    Object.assign(player,{x,y,z:bed,verticalVelocity:0});
    for(let i=0;i<40;i++)simulation.tick(50);
    expect(player.x).toBe(x);expect(player.y).toBe(y);expect(player.health).toBe(player.maxHealth);
    Object.assign(player,{z:TERRAIN_BOTTOM-256,verticalVelocity:-900,fallPeakZ:5000});simulation.tick(50);
    expect(player.x).toBe(x);expect(player.y).toBe(y);expect(player.z).toBe(bed);
    expect(player.verticalVelocity).toBe(0);expect(player.fallPeakZ).toBeUndefined();
    for(let i=0;i<40;i++)simulation.tick(50);
    expect(player.health).toBe(player.maxHealth);expect(player.lifeState).toBe('alive');
  });
  it('gives the visible outer islands solid land and their castle solid masonry',()=>{
    const terrain=new FriendsTerrain();
    for(const island of DISTANT_ISLANDS){
      const x=Math.floor((island.x+island.rx*.55)/32)*32+16,y=Math.floor(island.z/32)*32+16,top=terrain.surfaceHeight(x,y);
      expect(top,island.name).toBeGreaterThan(ISLAND_SEA_LEVEL);expect(terrain.supports(x,y,top)).toBe(true);
      expect(friendsLiveWaterAt(terrain,x,y,top+10)).toBeUndefined();
    }
    const tower=OUTER_ISLAND_MASONRY.at(-1)!;
    expect(terrain.material(Math.floor(tower.x/32),Math.floor(tower.y/32),Math.floor((tower.z+tower.h-48)/32))).toBe(2);
  });
  it('keeps offshore excavations editable and persistent across reloads',()=>{
    const terrain=new FriendsTerrain(),vx=-100,vy=1600,bed=terrain.height(vx,vy),vz=bed/32-1;
    expect(terrain.material(vx,vy,vz)).toBeGreaterThan(0);
    expect(terrain.set(vx,vy,vz,0)).toBe(true);
    expect(new FriendsTerrain(terrain.snapshot()).material(vx,vy,vz)).toBe(0);
    terrain.addGrade([-3200,51200,bed,64]);
    expect(terrain.snapshot().grades?.[0]?.slice(0,2)).toEqual([-3200,51200]);
  });
});
