import { describe, expect, it } from 'vitest';
import { FriendsTerrain, baseTerrainHeight } from './FriendsTerrain';
import { scenicRailway } from './FriendsScenicRailway';
import { sampleRailAlignment } from './FriendsRailAlignment';
import { scenicRailColumns, scenicTransitAir, scenicTransitRanges, scenicTunnelAt, scenicTunnelRoof, scenicTunnelSections } from './FriendsRailInfrastructure';
import { meshTerrainChunk } from './FriendsTerrainMesh';
import { meshBlockHorizon, meshOrganicHorizon } from './FriendsHorizonMesh';
import { islandArchRange } from './FriendsIsland';

// Record the highest upward face over each authoritative voxel. Greedy quads
// are axis aligned, so either triangle's bounds cover the same rectangle.
function topFaces(positions:ArrayLike<number>, normals:ArrayLike<number>, cx:number, cy:number, indices?:ArrayLike<number>){
  const tops=new Map<string,number>();
  for(let j=0;j<(indices?.length??positions.length/3);j+=3){
    const ids=[0,1,2].map(k=>indices?indices[j+k]:j+k);
    if(ids.some(i=>normals[i*3+1]!==127))continue;
    const xs=ids.map(i=>positions[i*3]+cx*512),ys=ids.map(i=>positions[i*3+2]+cy*512),h=positions[ids[0]*3+1];
    for(let x=Math.floor(Math.min(...xs)/32);(x+.5)*32<Math.max(...xs);x++)for(let y=Math.floor(Math.min(...ys)/32);(y+.5)*32<Math.max(...ys);y++){
      const key=`${x},${y}`;tops.set(key,Math.max(tops.get(key)??-Infinity,h));
    }
  }
  return tops;
}

describe('sealed railway tunnel landscape',()=>{
  it('retains two solid cover layers across every authored bore, including merged terrace gaps',()=>{
    const terrain=new FriendsTerrain(),route=scenicRailway(),seen=new Set<string>();let solidRoofs=0,filledGaps=0;
    for(const section of scenicTunnelSections())for(let d=section.start+32;d<section.end-32;d+=64){
      const p=sampleRailAlignment(route,d);
      for(let side=-128;side<=128;side+=32){
        const vx=Math.floor((p.x-Math.sin(p.angle)*side)/32),vy=Math.floor((p.y+Math.cos(p.angle)*side)/32),key=`${vx},${vy}`;
        if(seen.has(key))continue;seen.add(key);
        const x=(vx+.5)*32,y=(vy+.5)*32,columns=scenicRailColumns(x,y);
        if(!columns.some(c=>scenicTunnelAt(c.distance)))continue;
        const h=terrain.height(vx,vy),roof=Math.max(...columns.map(c=>c.z+scenicTunnelRoof(c.side)));
        const arch=islandArchRange(x,y);if(arch&&baseTerrainHeight(x,y)<arch[1]+64)continue;
        expect(h-roof,`thin roof at ${key}`).toBeGreaterThanOrEqual(48);
        expect(scenicTransitAir(x,y,h-16)).toBe(false);
        expect(scenicTransitAir(x,y,h-48)).toBe(false);
        expect(scenicTransitRanges(x,y,h).every(r=>r[1]<h)).toBe(true);
        expect(terrain.material(vx,vy,h/32-1)).not.toBe(0);
        expect(terrain.material(vx,vy,h/32-2)).not.toBe(0);
        expect(terrain.floor(x,y,h)).toBe(h);
        solidRoofs++;if(h>baseTerrainHeight(x,y))filledGaps++;
      }
    }
    expect(solidRoofs).toBeGreaterThan(500);expect(filledGaps).toBeGreaterThan(100);
  },60000);

  it('uses the same voxel-centre cutout boundaries as collision, including thin surviving roofs',()=>{
    const route=scenicRailway();let tested=0;
    for(let d=0;d<route.length;d+=256){const p=sampleRailAlignment(route,d),x=Math.floor(p.x/32)*32+16,y=Math.floor(p.y/32)*32+16;
      const ranges=scenicTransitRanges(x,y,10000);
      for(let z=Math.floor((p.z-96)/32)*32+16;z<p.z+320;z+=32){
        expect(ranges.some(([lo,hi])=>z>=lo&&z<hi),`LOD cutout disagrees at ${x},${y},${z}`).toBe(scenicTransitAir(x,y,z));tested++;
      }
    }
    expect(tested).toBeGreaterThan(5000);
  },60000);

  it('keeps outdoor roof faces in both detailed and block terrain for shallow and deep tunnels',()=>{
    const terrain=new FriendsTerrain(),route=scenicRailway();
    for(const chapter of [4,6,8,11]){
      const p=route.points.filter(p=>p.chapter===chapter&&scenicTunnelAt(p.distance)).reduce((a,b)=>baseTerrainHeight(a.x,a.y)-a.z>baseTerrainHeight(b.x,b.y)-b.z?a:b);
      const cx=Math.floor(p.x/512),cy=Math.floor(p.y/512),near=meshTerrainChunk(terrain,cx,cy),shell=meshBlockHorizon(cx*512,cy*512,512,(x,y)=>terrain.surfaceHeight(x,y));
      const nearTops=topFaces(near.positions,near.normals,cx,cy),shellTops=topFaces(shell.positions,shell.normals,cx,cy,shell.indices);
      let count=0;
      for(let vx=cx*16;vx<(cx+1)*16;vx++)for(let vy=cy*16;vy<(cy+1)*16;vy++){
        const x=(vx+.5)*32,y=(vy+.5)*32,h=terrain.height(vx,vy);
        if(!scenicRailColumns(x,y).some(c=>scenicTunnelAt(c.distance)))continue;
        const arch=islandArchRange(x,y);if(arch&&baseTerrainHeight(x,y)<arch[1]+64)continue;
        expect(nearTops.get(`${vx},${vy}`)).toBe(h);expect(shellTops.get(`${vx},${vy}`)).toBe(h);count++;
      }
      expect(count).toBeGreaterThan(0);
      for(const g of near.groups.filter(g=>g.materialIndex>=5&&g.materialIndex<10))for(let i=g.start;i<g.start+g.count;i+=3){
        if(near.normals[i*3+1]!==127)continue;
        const vx=cx*16+Math.floor((near.positions[i*3]+near.positions[(i+1)*3]+near.positions[(i+2)*3])/96),vy=cy*16+Math.floor((near.positions[i*3+2]+near.positions[(i+1)*3+2]+near.positions[(i+2)*3+2])/96);
        expect(near.positions[i*3+1]).toBeLessThan(terrain.height(vx,vy));
      }
      const distant=meshOrganicHorizon(cx*512,cy*512,512);
      expect(distant.indices.length).toBeGreaterThan(0);
    }
  },60000);
});
