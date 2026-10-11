import {describe,it,expect} from 'vitest';
import {FriendsTerrain} from './FriendsTerrain';
import {meshTerrainChunk,meshTerrainChunkFull,terrainChunkMeshBands,type TerrainMeshData} from './FriendsTerrainMesh';

// Triangle order can change when bands are concatenated; compare every
// material and vertex attribute, retaining winding and duplicate triangles.
function triangles(mesh:TerrainMeshData){
 const out:string[]=[];
 for(const group of mesh.groups)for(let i=group.start;i<group.start+group.count;i+=3){
  const vertices=[];for(let j=i;j<i+3;j++)vertices.push([...mesh.positions.subarray(j*3,j*3+3),...mesh.normals.subarray(j*3,j*3+3),...mesh.uv.subarray(j*2,j*2+2),...mesh.colors.subarray(j*3,j*3+3),...mesh.glow.subarray(j*3,j*3+3)]);
  out.push(JSON.stringify([group.materialIndex,vertices]));
 }return out.sort();
}
describe('sparse dungeon terrain sections',()=>{
 it('retains every material, surface, normal, UV, shade and glow across separated cave levels',()=>{
  const terrain=new FriendsTerrain();
  for(const [cx,cy]of [[18,12],[26,14],[31,14],[30,9],[29,7],[12,9],[13,10],[17,9],[22,7],[35,15],[46,46],[85,46]]){
   expect(triangles(meshTerrainChunk(terrain,cx,cy)),`${cx},${cy}`).toEqual(triangles(meshTerrainChunkFull(terrain,cx,cy)));
  }
 },15000);
 it('promotes previously sealed gaps and border neighbors for excavation, filling and reloads',()=>{
  const t=new FriendsTerrain(),cx=31,cy=14,vx=cx*16,vy=cy*16+8,vz=-40;
  expect(t.set(vx,vy,vz,0)).toBe(true);expect(t.set(vx-1,vy,vz,0)).toBe(true);
  for(const terrain of [t,new FriendsTerrain(t.snapshot())])for(const x of [cx-1,cx]){
   expect(terrainChunkMeshBands(terrain,x,cy).some(b=>b.bottom<=vz-1&&b.top>=vz+1)).toBe(true);
   expect(triangles(meshTerrainChunk(terrain,x,cy))).toEqual(triangles(meshTerrainChunkFull(terrain,x,cy)));
  }
  t.set(vx,vy,vz,2);t.set(vx-1,vy,vz,2);
  expect(triangles(meshTerrainChunk(t,cx,cy))).toEqual(triangles(meshTerrainChunkFull(t,cx,cy)));
 },15000);
 it('preserves graded cliffs and added blocks above the natural surface',()=>{
  const t=new FriendsTerrain(),cx=31,cy=14,x=cx*512+256,y=cy*512+256,h=t.surfaceHeight(x,y);
  t.addGrade([x,y,h+128,64]);t.set(cx*16+8,cy*16+8,h/32+8,2);
  expect(triangles(meshTerrainChunk(t,cx,cy))).toEqual(triangles(meshTerrainChunkFull(t,cx,cy)));
 },15000);
 it('reduces deep scan ranges without adding material draw groups or fake caps at section cuts',()=>{
  const t=new FriendsTerrain(),cx=31,cy=14,bands=terrainChunkMeshBands(t,cx,cy);let bottom=Infinity,top=-Infinity;
  for(let x=-1;x<=16;x++)for(let y=-1;y<=16;y++){const r=t.columnRange(cx*16+x,cy*16+y);bottom=Math.min(bottom,r.bottom);top=Math.max(top,r.top);}
  expect(bands.reduce((n,b)=>n+b.top-b.bottom+1,0)).toBeLessThan((top-bottom+1)*.7);
  expect(meshTerrainChunk(t,cx,cy).groups.map(g=>g.materialIndex)).toEqual(meshTerrainChunkFull(t,cx,cy).groups.map(g=>g.materialIndex));
  expect(meshTerrainChunkFull(t,cx,cy,{bottom:-56,top:-16}).positions).toHaveLength(0);
 });
});
