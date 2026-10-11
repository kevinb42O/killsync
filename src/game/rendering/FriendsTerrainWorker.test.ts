import {afterEach,describe,it,expect,vi} from 'vitest';
import {FriendsTerrain,type TerrainSnapshot} from '../world/FriendsTerrain';
import type {TerrainMeshData} from '../world/FriendsTerrainMesh';
afterEach(()=>vi.unstubAllGlobals());
describe('section meshing worker updates',()=>{
 it('applies snapshot edits at both sides of a chunk boundary and transfers the existing mesh payload',async()=>{
  type Request={snapshot?:TerrainSnapshot;cx?:number;cy?:number;epoch:number};
  const messages:{data:{cx:number;cy:number;epoch:number;mesh:TerrainMeshData};transfer:{transfer:ArrayBuffer[]}}[]=[];
  const scope={onmessage:undefined as undefined|((event:{data:Request})=>void),postMessage:(data:typeof messages[number]['data'],transfer:typeof messages[number]['transfer'])=>messages.push({data,transfer})};
  vi.stubGlobal('self',scope);await import('./friendsTerrain.worker');
  const t=new FriendsTerrain(),cx=31,cy=14;
  scope.onmessage!({data:{snapshot:t.snapshot(),epoch:1}});
  for(const x of [cx-1,cx])scope.onmessage!({data:{cx:x,cy,epoch:1}});
  const counts=messages.map(m=>m.data.mesh.positions.length);expect(messages).toHaveLength(2);
  expect(t.set(cx*16,cy*16+8,-40,0)).toBe(true);expect(t.set(cx*16-1,cy*16+8,-40,0)).toBe(true);
  scope.onmessage!({data:{snapshot:t.snapshot(),epoch:2}});
  for(const x of [cx-1,cx])scope.onmessage!({data:{cx:x,cy,epoch:2}});
  expect(messages).toHaveLength(4);
  for(let i=2;i<4;i++){
   const m=messages[i];expect(m.data.epoch).toBe(2);expect(m.data.mesh.positions.length).toBeGreaterThan(counts[i-2]);
   expect(m.transfer.transfer).toEqual([m.data.mesh.positions.buffer,m.data.mesh.normals.buffer,m.data.mesh.uv.buffer,m.data.mesh.colors.buffer,m.data.mesh.glow.buffer]);
  }
 });
});
