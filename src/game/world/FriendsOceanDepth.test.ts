import {describe,it,expect} from 'vitest';
import {FriendsTerrain,baseTerrainHeight,TERRAIN_BOTTOM,validTerrainEdit} from './FriendsTerrain';
import {friendsWaterAt,friendsWaterGround} from './FriendsWaterSurface';
import {friendsLiveWaterAt} from './FriendsFloodWater';
import {meshTerrainChunk} from './FriendsTerrainMesh';
import {meshOrganicHorizon,meshBlockHorizon} from './FriendsHorizonMesh';
import {ISLAND_SEA_LEVEL} from './FriendsIsland';
describe('offshore continental slope and deep ocean collision',()=>{
 it('deepens offshore while preserving lake depths and sea surface level',()=>{
  const near=friendsWaterAt(32500,23852)!,slope=friendsWaterAt(40000,23852)!,abyss=friendsWaterAt(44000,23852)!;
  expect(near.bodyId).toBe('sea');expect(near.depth).toBeLessThan(200);expect(slope.depth).toBeGreaterThan(500);expect(abyss.depth).toBeGreaterThan(3300);expect(abyss.depth).toBeLessThan(3600);expect(abyss.level).toBe(ISLAND_SEA_LEVEL);expect(friendsWaterGround(12128,23600)).toBe(-416);
 });
 it('provides a real floor and water column well below the old world bottom',()=>{
  const t=new FriendsTerrain(),x=44016,y=23856,bed=t.floor(x,y,ISLAND_SEA_LEVEL,0)!;expect(bed).toBeLessThan(-3400);expect(bed).toBeGreaterThan(TERRAIN_BOTTOM);
  expect(friendsLiveWaterAt(t,x,y,bed+32)?.bodyId).toBe('sea');expect(friendsLiveWaterAt(t,x,y,bed-16)).toBeUndefined();expect(t.material(Math.floor(x/32),Math.floor(y/32),Math.floor(bed/32)-1)).toBeTruthy();expect(validTerrainEdit([Math.floor(x/32),Math.floor(y/32),Math.floor(bed/32)-1,0])).toBe(true);
 });
 it('meshes the seabed at its actual depth without tall empty chunk bounds',()=>{
  const t=new FriendsTerrain(),cx=Math.floor(44000/512),cy=Math.floor(23852/512),r=t.columnRange(cx*16+8,cy*16+8);expect(r.top).toBeLessThan(-100);expect(r.top-r.bottom).toBeLessThan(8);
  const mesh=meshTerrainChunk(t,cx,cy);expect(mesh.positions.length).toBeGreaterThan(0);expect([...mesh.positions].filter((_,i)=>i%3===1).some(v=>v<-3400)).toBe(true);
  expect(meshOrganicHorizon(cx*512,cy*512,512,baseTerrainHeight).indices.length).toBe(0);
  const horizon=meshBlockHorizon(cx*512,cy*512,512,baseTerrainHeight);expect([...horizon.positions].filter((_,i)=>i%3===1).some(v=>v<-3400)).toBe(true);
 });
});
