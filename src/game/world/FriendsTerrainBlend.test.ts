import { describe, expect, it } from 'vitest';
import { FriendsTerrain, baseTerrainHeight, legacyTerrainHeight, TERRAIN_GENERATION, FRIENDS_AIRFIELD_HEIGHT, FRIENDS_ARRIVAL_HEIGHT, type TerrainEdit } from './FriendsTerrain';
import { FriendsSimulation } from '../multiplayer/FriendsSimulation';
import { FriendsFrontier, isFrontierSave } from '../multiplayer/FriendsFrontier';
import type { FriendsBuildPiece } from '../multiplayer/FriendsBuilding';
import { meshBlockHorizon } from './FriendsHorizonMesh';

const seeds=[{id:'host',label:'Explorer',color:'#8de6ce'}];
describe('former settlement terrain integration',()=>{
  it('fills the former rectangle with varied terrain and keeps all four boundaries continuous',()=>{
    const heights=new Set<number>();
    for(let x=2000;x<=10000;x+=512)for(let y=2800;y<=10400;y+=512){const h=baseTerrainHeight(x,y);heights.add(h);expect(h).toBeGreaterThan(64);}
    expect(heights.size).toBeGreaterThan(15);
    for(const edge of [1600,10500])for(let y=2800;y<=10400;y+=512)expect(Math.abs(baseTerrainHeight(edge-16,y)-baseTerrainHeight(edge+16,y))).toBeLessThanOrEqual(32);
    for(const edge of [2400,11000])for(let x=2000;x<=10000;x+=512)expect(Math.abs(baseTerrainHeight(x,edge-16)-baseTerrainHeight(x,edge+16))).toBeLessThanOrEqual(32);
    for(const [x,y] of [[15000,4000],[20000,12000],[30000,22000]])expect(baseTerrainHeight(x,y)).toBe(legacyTerrainHeight(x,y));
  });
  it('grounds arrivals and the helicopter at their native terrain elevation',()=>{
    const sim=new FriendsSimulation(seeds);for(let i=0;i<40;i++)sim.tick(50);
    const frame=sim.createSnapshot(),p=frame.players[0],air=frame.friends!.vehicles.find(v=>v.kind==='aircraft')!;
    expect(p.z).toBe(FRIENDS_ARRIVAL_HEIGHT);expect(air.z).toBe(FRIENDS_AIRFIELD_HEIGHT+14);
    expect(sim['friendsFrontier']!.terrain.floor(air.x,air.y,6000,0)).toBe(air.z-14);
    expect(frame.friends!.frontier!.terrain.grades).toEqual([]);
  });
  it('preserves a legacy excavation locally without bringing back the rectangular plain',()=>{
    const edits:TerrainEdit[]=[[250,250,-1,0],[250,250,-2,0]],t=new FriendsTerrain({revision:8,edits});
    expect(t.floor(8016,8016,6000,0)).toBe(-64);expect(t.surfaceHeight(8016,8016)).toBe(0);
    expect(t.surfaceHeight(9000,8000)).toBe(baseTerrainHeight(9000,8000));
    const saved=t.snapshot();expect(saved.generation).toBe(TERRAIN_GENERATION);expect(saved.edits).toEqual(edits);expect(saved.grades).toHaveLength(1);
    expect(new FriendsTerrain(saved).snapshot()).toEqual(saved);
  });
  it('keeps old player builds above ground and persists their smoothly blended footprint exactly once',()=>{
    const frontier=new FriendsFrontier().snapshot();delete frontier.terrain.generation;delete frontier.terrain.grades;
    const piece:FriendsBuildPiece={id:1,shape:'workbench',finish:'timber',author:'Explorer',revision:1,x:8000,y:8000,z:0,rotation:0};
    const sim=new FriendsSimulation(seeds,1,undefined,{revision:1,guestsCanBuild:true,pieces:[piece]},undefined,frontier);
    const saved=sim.createSnapshot().friends!;expect(saved.building!.pieces).toEqual([piece]);
    expect(sim['friendsFrontier']!.terrain.floor(8000,8000,6000,0)).toBe(0);
    expect(sim['friendsFrontier']!.terrain.surfaceHeight(9000,8000)).toBe(baseTerrainHeight(9000,8000));
    const restored=new FriendsSimulation(seeds,1,saved.progress,saved.building,undefined,saved.frontier,saved.transport);
    expect(restored.createSnapshot().friends!.frontier!.terrain.grades).toEqual(saved.frontier!.terrain.grades);
  });
  it('matches horizon top faces to migrated ground, and rejects malformed saved grading',()=>{
    const t=new FriendsTerrain({revision:1,generation:TERRAIN_GENERATION,edits:[],grades:[[8016,8016,0,64]]});
    const mesh=meshBlockHorizon(7680,7680,512,(x,y)=>t.surfaceHeight(x,y));let found=false;
    for(let i=0;i<mesh.indices.length;i+=3){const a=mesh.indices[i],b=mesh.indices[i+1],c=mesh.indices[i+2];if(mesh.normals[a*3+1]!==127)continue;
      const x=mesh.tx+(mesh.positions[a*3]+mesh.positions[b*3]+mesh.positions[c*3])/3,y=mesh.ty+(mesh.positions[a*3+2]+mesh.positions[b*3+2]+mesh.positions[c*3+2])/3;
      expect(mesh.positions[a*3+1]).toBe(t.surfaceHeight(Math.floor(x/32)*32+16,Math.floor(y/32)*32+16));if(mesh.positions[a*3+1]===0)found=true;
    }
    expect(found).toBe(true);
    const saved=new FriendsFrontier().snapshot();expect(isFrontierSave({...saved,terrain:{...saved.terrain,grades:[[8000,8000,NaN,48]]}})).toBe(false);
    expect(isFrontierSave({...saved,terrain:{...saved.terrain,generation:999}})).toBe(false);
  });
});
