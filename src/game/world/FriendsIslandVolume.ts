import { scenicTransitRanges, scenicTransitSurface, scenicTunnelCoverLimit } from './FriendsRailInfrastructure';
import { islandArchRange } from './FriendsIsland';
import { baseTerrainHeight, FRONTIER_SIZE } from './FriendsTerrain';
import type { HorizonMeshData } from './FriendsHorizonMesh';

/** Continuous rock surface around the mountain vault. Marching tetrahedra
 * joins the hillside, banks, ceiling and mouth without planar cut walls or
 * cracks between independently shifted voxel faces. Collision stays editable. */
export function meshIslandVault(tx:number,ty:number,tile:number,sampleHeight=baseTerrainHeight):HorizonMeshData {
  const step=64,vertical=128,cells=Math.ceil(tile/step),stride=cells+3;
  const heights=new Float32Array(stride*stride),ranges:[number,number][][]=new Array(stride*stride);
  const id=(x:number,y:number)=>(y+1)*stride+x+1;
  let maximum=0;
  for(let y=-1;y<=cells+1;y++)for(let x=-1;x<=cells+1;x++){
    const px=tx+x*step,py=ty+y*step;
    const carved=(x:number,y:number)=>scenicTransitSurface(x,y,sampleHeight(x,y));
    const height=(carved(px-16,py-16)+carved(px+16,py-16)+carved(px-16,py+16)+carved(px+16,py+16))/4;
    heights[id(x,y)]=height;maximum=Math.max(maximum,height);const arch=islandArchRange(px,py);ranges[id(x,y)]=scenicTransitRanges(px,py,height);if(arch)ranges[id(x,y)].push(arch);
  }
  const density=(x:number,y:number,z:number)=>{
    const index=id(x,y),r=ranges[index],ground=heights[index]-z;
    return r.reduce((d,gap)=>Math.min(d,Math.max(gap[0]-z,z-gap[1])),ground);
  };
  const gradient=(x:number,y:number,z:number)=>{
    const n=[density(x-1,y,z)-density(x+1,y,z), (density(x,y,z-32)-density(x,y,z+32))*2, density(x,y-1,z)-density(x,y+1,z)];
    const length=Math.hypot(...n)||1;return n.map(v=>v/length);
  };
  const positions:number[]=[],normals:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[],cache=new Map<string,number>();
  type Point={p:number[];n:number[]};
  const vertex=(point:Point)=>{
    const p=point.p.map(Math.round),key=p.join(',');let index=cache.get(key);if(index!==undefined)return index;
    index=positions.length/3;cache.set(key,index);positions.push(...p);
    const length=Math.hypot(...point.n)||1;normals.push(...point.n.map(n=>Math.round(n/length*127)));
    uv.push((tx+p[0])/160,(ty+p[2])/160);colors.push(255,255,255);return index;
  };
  const triangle=(a:Point,b:Point,c:Point)=>{
    const u=b.p.map((n,i)=>n-a.p[i]),v=c.p.map((n,i)=>n-a.p[i]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(Math.hypot(...cross)<.01)return;
    const dot=cross.reduce((sum,n,i)=>sum+n*(a.n[i]+b.n[i]+c.n[i]),0);
    const ia=vertex(a),ib=vertex(b),ic=vertex(c);if(dot>0)indices.push(ia,ib,ic);else indices.push(ia,ic,ib);
  };
  const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  const tetrahedra=[[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6],[0,5,1,6]];
  for(let y=0;y<cells&&ty+y*step<FRONTIER_SIZE;y++)for(let x=0;x<cells&&tx+x*step<FRONTIER_SIZE;x++){
    const high=Math.max(heights[id(x,y)],heights[id(x+1,y)],heights[id(x,y+1)],heights[id(x+1,y+1)]);
    if(high<-192)continue;
    const levels=new Set<number>();
    for(let z=-256;z<=Math.min(maximum,high)+vertical;z+=vertical)levels.add(z);
    // A 64-unit cover slab can lie entirely between the ordinary 128-unit
    // samples. Sample its interior and both boundaries so the smooth vault
    // cannot lose the roof when the distant terrain becomes visible.
    for(const [dx,dy]of [[0,0],[1,0],[0,1],[1,1]]){
      const h=heights[id(x+dx,y+dy)],cover=scenicTunnelCoverLimit(tx+(x+dx)*step,ty+(y+dy)*step,h);
      if(cover<h)for(const z of [cover,h-32,h,h+32])levels.add(z);
    }
    const slices=[...levels].sort((a,b)=>a-b);
    for(let slice=0;slice<slices.length-1;slice++){
      const z=slices[slice],span=slices[slice+1]-z;
      const values=corners.map(([dx,dy,dz])=>density(x+dx,y+dy,z+dz*span));
      if(values.every(v=>v>=0)||values.every(v=>v<0))continue;
      const grads=corners.map(([dx,dy,dz])=>gradient(x+dx,y+dy,z+dz*span));
      const crossing=(a:number,b:number):Point=>{
        const t=values[a]/(values[a]-values[b]),ca=corners[a],cb=corners[b];
        return {p:[(x+ca[0]+(cb[0]-ca[0])*t)*step,z+(ca[2]+(cb[2]-ca[2])*t)*span,(y+ca[1]+(cb[1]-ca[1])*t)*step],n:grads[a].map((v,i)=>v+(grads[b][i]-v)*t)};
      };
      for(const tetra of tetrahedra){
        const inside=tetra.filter(i=>values[i]>=0),outside=tetra.filter(i=>values[i]<0);
        if(!inside.length||!outside.length)continue;
        if(inside.length===1){const a=inside[0];triangle(crossing(a,outside[0]),crossing(a,outside[1]),crossing(a,outside[2]));}
        else if(outside.length===1){const a=outside[0];triangle(crossing(a,inside[0]),crossing(a,inside[1]),crossing(a,inside[2]));}
        else{const [a,b]=inside,[c,d]=outside,ac=crossing(a,c),ad=crossing(a,d),bc=crossing(b,c),bd=crossing(b,d);triangle(ac,ad,bc);triangle(ad,bd,bc);}
      }
    }
  }
  return {tx,ty,positions:new Int16Array(positions),normals:new Int8Array(normals),uv:new Float32Array(uv),colors:new Uint8Array(colors),indices:new Uint32Array(indices)};
}
