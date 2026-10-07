import { describe, expect, it } from 'vitest';
import { meshBlockHorizon, meshOrganicHorizon, type HorizonMeshData } from './FriendsHorizonMesh';
import { islandArchRange } from './FriendsIsland';
import { baseTerrainHeight } from './FriendsTerrain';

function unpack(mesh:HorizonMeshData){
 const positions:number[]=[],normals:number[]=[];
 for(const i of mesh.indices){positions.push(mesh.positions[i*3]+mesh.tx,mesh.positions[i*3+1],mesh.positions[i*3+2]+mesh.ty);normals.push(mesh.normals[i*3]/127,mesh.normals[i*3+1]/127,mesh.normals[i*3+2]/127);}
 return {positions:new Float32Array(positions),normals:new Float32Array(normals)};
}
describe('persistent block horizon',()=>{
  it('keeps mountain terraces on the exact simulation voxel grid with axis-aligned faces',()=>{
    const mesh=unpack(meshBlockHorizon(14336,8192,512));
    expect(mesh.positions.length).toBeGreaterThan(36);
    for(let i=0;i<mesh.positions.length;i+=3){
      expect(mesh.positions[i]%32).toBe(0);expect(mesh.positions[i+1]%32).toBe(0);expect(mesh.positions[i+2]%32).toBe(0);
      const n=Array.from(mesh.normals.slice(i,i+3));expect(n.filter(v=>v!==0)).toHaveLength(1);expect(Math.abs(n.reduce((a,b)=>a+b,0))).toBe(1);
    }
    for(let i=0;i<mesh.positions.length;i+=9){
      if(mesh.normals[i+1]!==1)continue;
      const x=(mesh.positions[i]+mesh.positions[i+3]+mesh.positions[i+6])/3,z=(mesh.positions[i+2]+mesh.positions[i+5]+mesh.positions[i+8])/3;
      const sx=Math.floor(x/32)*32+16,sy=Math.floor(z/32)*32+16,opening=islandArchRange(sx,sy);
      expect([baseTerrainHeight(sx,sy),...(opening?[opening[0]]:[])]).toContain(mesh.positions[i+1]);
    }
  });
  it('merges flat surfaces and winds every triangle toward its stated normal',()=>{
    const flat=unpack(meshBlockHorizon(8192,8192,512,()=>0));expect(flat.positions.length).toBe(18);
    const mountain=unpack(meshBlockHorizon(15360,8192,512));
    for(let i=0;i<mountain.positions.length;i+=9){
      const p=mountain.positions,n=mountain.normals,a=[p[i+3]-p[i],p[i+4]-p[i+1],p[i+5]-p[i+2]],b=[p[i+6]-p[i],p[i+7]-p[i+1],p[i+8]-p[i+2]];
      const dot=(a[1]*b[2]-a[2]*b[1])*n[i]+(a[2]*b[0]-a[0]*b[2])*n[i+1]+(a[0]*b[1]-a[1]*b[0])*n[i+2];expect(dot).toBeGreaterThan(0);
    }
  });
  it('emits a continuous boundary cliff once across adjacent tiles',()=>{
    const left=unpack(meshBlockHorizon(24064,15360,512)),right=unpack(meshBlockHorizon(24576,15360,512)),edge=24576;
    for(let y=15360;y<15872;y+=32){
      const lh=baseTerrainHeight(edge-16,y+16),rh=baseTerrainHeight(edge+16,y+16);
      const count=(mesh:typeof left)=>{let hits=0;for(let i=0;i<mesh.positions.length;i+=18){if(Math.abs(mesh.normals[i])!==1||mesh.positions[i]!==edge)continue;const z=Array.from(mesh.positions.slice(i,i+18)).filter((_,j)=>j%3===2);if(Math.min(...z)<=y&&Math.max(...z)>=y+32)hits++;}return hits;};
      expect(count(left)+count(right)).toBe(lh===rh?0:1);
    }
  });
});

describe('organic island horizon',()=>{
  it('joins adjacent terrain tiles without a seam and has slope normals',()=>{
    const left=meshOrganicHorizon(24064,15360,512),right=meshOrganicHorizon(24576,15360,512);
    const edge=(mesh:HorizonMeshData,x:number)=>{const result=new Map<number,number[]>();for(let i=0;i<mesh.positions.length;i+=3)if(mesh.positions[i]+mesh.tx===x)result.set(mesh.positions[i+2]+mesh.ty,[mesh.positions[i+1],...mesh.normals.slice(i,i+3)]);return result;};
    expect(edge(left,24576)).toEqual(edge(right,24576));
    expect(Array.from(left.normals).some((v,i)=>i%3!==1&&v!==0)).toBe(true);
    expect(left.indices.length).toBeGreaterThan(0);
  });
  it('omits hidden ocean bed while preserving the volumetric gate roof',()=>{
    expect(meshOrganicHorizon(0,44032,512).indices.length).toBe(0);
    const gate=meshOrganicHorizon(15360,10240,512);
    expect(Array.from(gate.normals).some((v,i)=>i%3===1&&v<0)).toBe(true);
  });
});
