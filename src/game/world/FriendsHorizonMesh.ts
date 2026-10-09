import { interpolateTerrainSurface } from './FriendsWaterBodies';
import { hydrologyWaterLevel } from './FriendsHydrology';
import { scenicTransitSurface, scenicTransitRanges } from './FriendsRailInfrastructure';
import { meshIslandVault } from './FriendsIslandVolume';
import { islandArchRange } from './FriendsIsland';
import { baseTerrainHeight, friendsFixedPlatformAt, FRONTIER_SIZE, VOXEL_SIZE, TERRAIN_BOTTOM } from './FriendsTerrain';
export type HorizonMeshData = { tx: number; ty: number; positions: Int16Array; normals: Int8Array; uv: Float32Array; colors: Uint8Array; indices: Uint32Array }; 

/** Greedy surface-only voxel mesh. All samples use the exact simulation cells:
 * distance changes neither the mountain's height nor its stair-step silhouette. */
export function meshBlockHorizon(tx: number, ty: number, tile = 4096, sampleHeight = (x: number, y: number) => friendsFixedPlatformAt(x,y)?.top ?? baseTerrainHeight(x, y)): HorizonMeshData {
  const cells = Math.ceil(tile / VOXEL_SIZE), heights = new Int16Array((cells + 2) ** 2), stride = cells + 2;
  const height = (x: number, y: number) => heights[(y + 1) * stride + x + 1];
  for (let y=-1;y<=cells;y++) for(let x=-1;x<=cells;x++) heights[(y+1)*stride+x+1]=scenicTransitSurface(tx+(x+.5)*VOXEL_SIZE,ty+(y+.5)*VOXEL_SIZE,sampleHeight(tx+(x+.5)*VOXEL_SIZE,ty+(y+.5)*VOXEL_SIZE));
  const positions:number[]=[],normals:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[];
  function quad(v:number[][],n:number[],wall=false){
    const tint=wall?[.82,.84,.85]:[1,1,1],shade=n[1]===1?1:n[0]!==0?.84:.92;
    const offset=positions.length/3;for(const i of [0,1,2,0,2,3])indices.push(offset+i);
    for(const p of v){positions.push(p[0]-tx,p[1],p[2]-ty);normals.push(Math.round(n[0]*127),Math.round(n[1]*127),Math.round(n[2]*127));uv.push((n[0]?p[2]:p[0])/160,(n[1]?p[2]:p[1])/160);colors.push(Math.round(tint[0]*shade*255),Math.round(tint[1]*shade*255),Math.round(tint[2]*shade*255));}
  }
  const ranges:[number,number][][]=Array.from({length:heights.length},()=>[]);
  for(let y=-1;y<=cells;y++)for(let x=-1;x<=cells;x++){
    const px=tx+(x+.5)*32,py=ty+(y+.5)*32,h=height(x,y),arch=islandArchRange(px,py);
    const gaps=scenicTransitRanges(px,py,h);if(arch&&h>arch[0])gaps.push([arch[0],Math.min(h,arch[1])]);
    const merged:[number,number][]=[];
    for(const gap of gaps.sort((a,b)=>a[0]-b[0])){
      if(gap[1]<=gap[0])continue;const last=merged.at(-1);
      if(last&&gap[0]<=last[1])last[1]=Math.max(last[1],gap[1]);else merged.push([...gap]);
    }
    ranges[(y+1)*stride+x+1]=merged;
  }
  const hasArch=ranges.some(r=>r.length);
  const range=(x:number,y:number)=>ranges[(y+1)*stride+x+1];
  const surface=(x:number,y:number)=>{const r=range(x,y).at(-1);return r&&r[1]===height(x,y)?r[0]:height(x,y);};
  const used=new Uint8Array(cells*cells);
  const maxX=Math.min(cells,Math.ceil((FRONTIER_SIZE-tx)/VOXEL_SIZE)),maxY=Math.min(cells,Math.ceil((FRONTIER_SIZE-ty)/VOXEL_SIZE));
  for(let y=0;y<maxY;y++)for(let x=0;x<maxX;x++){
    if(used[y*cells+x])continue;const h=surface(x,y);let w=1,d=1;
    while(x+w<maxX&&!used[y*cells+x+w]&&surface(x+w,y)===h)w++;
    outer:while(y+d<maxY){for(let k=0;k<w;k++)if(used[(y+d)*cells+x+k]||surface(x+k,y+d)!==h)break outer;d++;}
    for(let j=0;j<d;j++)used.fill(1,(y+j)*cells+x,(y+j)*cells+x+w);
    const x0=tx+x*32,x1=x0+w*32,y0=ty+y*32,y1=y0+d*32;
    quad([[x0,h,y0],[x0,h,y1],[x1,h,y1],[x1,h,y0]],[0,1,0]);
  }
  // Exposed floors and undersides of the huge natural arch use exactly the
  // same solid intervals as the near voxel mesh, even when seen from the air.
  if(hasArch)for(let tier=0;tier<Math.max(...ranges.map(r=>r.length));tier++)for(const underside of [false,true]){
    used.fill(0);
    const level=(x:number,y:number)=>{const r=range(x,y)[tier];return r&&r[1]<height(x,y)?r[underside?1:0]:undefined;};
    for(let y=0;y<maxY;y++)for(let x=0;x<maxX;x++){
      const h=level(x,y);if(h===undefined||used[y*cells+x])continue;let w=1,d=1;
      while(x+w<maxX&&!used[y*cells+x+w]&&level(x+w,y)===h)w++;
      outer:while(y+d<maxY){for(let k=0;k<w;k++)if(used[(y+d)*cells+x+k]||level(x+k,y+d)!==h)break outer;d++;}
      for(let j=0;j<d;j++)used.fill(1,(y+j)*cells+x,(y+j)*cells+x+w);
      const x0=tx+x*32,x1=x0+w*32,y0=ty+y*32,y1=y0+d*32;
      const vertices=[[x0,h,y0],[x0,h,y1],[x1,h,y1],[x1,h,y0]];
      quad(underside?vertices.reverse():vertices,[0,underside?-1:1,0],underside);
    }
  }
  // Most tiles have no volumetric landmark: retain the cheaper heightfield
  // wall merge, and reserve interval subtraction for arch tiles only.
  if(!hasArch){
    for(let direction=0;direction<4;direction++)for(let row=0;row<(direction<2?maxX:maxY);row++){
      const length=direction<2?maxY:maxX;
      for(let col=0;col<length;){
        const x=direction<2?row:col,y=direction<2?col:row,dx=direction===0?1:direction===1?-1:0,dy=direction===2?1:direction===3?-1:0;
        const h=height(x,y),low=height(x+dx,y+dy);if(h<=low){col++;continue;}
        let end=col+1;while(end<length){const a=direction<2?row:end,b=direction<2?end:row;if(height(a,b)!==h||height(a+dx,b+dy)!==low)break;end++;}
        if(direction<2){const px=tx+(row+(direction===0?1:0))*32,z0=ty+col*32,z1=ty+end*32;const v=[[px,low,z0],[px,h,z0],[px,h,z1],[px,low,z1]];quad(direction===0?v:v.reverse(),[dx,0,0],true);}
        else{const pz=ty+(row+(direction===2?1:0))*32,x0=tx+col*32,x1=tx+end*32;const v=[[x0,low,pz],[x1,low,pz],[x1,h,pz],[x0,h,pz]];quad(direction===2?v:v.reverse(),[0,0,dy],true);}
        col=end;
      }
    }
  }else{
  const solids=(x:number,y:number):number[][]=>{const h=height(x,y),spans:number[][]=[];let lo=TERRAIN_BOTTOM;for(const r of range(x,y)){if(r[0]>lo)spans.push([lo,r[0]]);lo=r[1];}if(h>lo)spans.push([lo,h]);return spans;};
  const exposed=(x:number,y:number,dx:number,dy:number)=>{
    let spans=solids(x,y);
    for(const [lo,hi] of solids(x+dx,y+dy))spans=spans.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[...(lo>a?[[a,lo]]:[]),...(hi<b?[[hi,b]]:[])]);
    return spans.filter(([a,b])=>b>a);
  };
  // Merge equal wall intervals along a row; gaps in the mountain remain gaps.
  for(let direction=0;direction<4;direction++)for(let row=0;row<(direction<2?maxX:maxY);row++){
    const length=direction<2?maxY:maxX,dx=direction===0?1:direction===1?-1:0,dy=direction===2?1:direction===3?-1:0;
    for(let col=0;col<length;){
      const x=direction<2?row:col,y=direction<2?col:row,spans=exposed(x,y,dx,dy);
      if(!spans.length){col++;continue;}let end=col+1;
      const signature=JSON.stringify(spans);
      while(end<length){const a=direction<2?row:end,b=direction<2?end:row;if(JSON.stringify(exposed(a,b,dx,dy))!==signature)break;end++;}
      for(const [low,h]of spans){
        if(direction<2){const px=tx+(row+(direction===0?1:0))*32,z0=ty+col*32,z1=ty+end*32;const v=[[px,low,z0],[px,h,z0],[px,h,z1],[px,low,z1]];quad(direction===0?v:v.reverse(),[dx,0,0],true);}
        else{const pz=ty+(row+(direction===2?1:0))*32,x0=tx+col*32,x1=tx+end*32;const v=[[x0,low,pz],[x1,low,pz],[x1,h,pz],[x0,h,pz]];quad(direction===2?v:v.reverse(),[0,0,dy],true);}
      }
      col=end;
    }
  }
  }
  return {tx,ty,positions:new Int16Array(positions),normals:new Int8Array(normals),uv:new Float32Array(uv),colors:new Uint8Array(colors),indices:new Uint32Array(indices)};
}

/** The distant landscape uses shared corner samples and slope normals instead
 * of extruding a vertical wall at every height step. Editable near cells and
 * the arch's volumetric opening still use the authoritative voxel field. */
export function meshOrganicHorizon(tx:number,ty:number,tile=4096,sampleHeight=baseTerrainHeight):HorizonMeshData {
  // The vault needs floors, walls and undersides, not a heightfield cap.
  const hasGate=tx<18080 && tx+tile>12992 && ty<16384 && ty+tile>4992;
  if(hasGate)return meshIslandVault(tx,ty,tile,sampleHeight);
  const step=64,cells=Math.ceil(tile/step),stride=cells+3;
  const heights=new Int16Array(stride*stride);
  const carved=(x:number,y:number)=>scenicTransitSurface(x,y,sampleHeight(x,y));
  const corner=(x:number,y:number)=>Math.round((carved(x-16,y-16)+carved(x+16,y-16)+carved(x-16,y+16)+carved(x+16,y+16))/4);
  for(let y=-1;y<=cells+1;y++)for(let x=-1;x<=cells+1;x++)heights[(y+1)*stride+x+1]=corner(tx+x*step,ty+y*step);
  const h=(x:number,y:number)=>heights[(y+1)*stride+x+1];
  const positions:number[]=[],normals:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[],vertices=new Map<number,number>();
  const vertex=(x:number,y:number)=>{
    const key=y*(cells+1)+x;let index=vertices.get(key);if(index!==undefined)return index;
    index=positions.length/3;vertices.set(key,index);
    positions.push(x*step,h(x,y),y*step);uv.push((tx+x*step)/160,(ty+y*step)/160);colors.push(255,255,255);
    const nx=(h(x-1,y)-h(x+1,y))/(step*2),nz=(h(x,y-1)-h(x,y+1))/(step*2),length=Math.hypot(nx,1,nz);
    normals.push(Math.round(nx/length*127),Math.round(127/length),Math.round(nz/length*127));return index;
  };
  for(let y=0;y<cells&&ty+y*step<FRONTIER_SIZE;y++)for(let x=0;x<cells&&tx+x*step<FRONTIER_SIZE;x++){
    // Hidden sea floor is represented by bathymetry, not millions of triangles.
    if(Math.max(h(x,y),h(x+1,y),h(x,y+1),h(x+1,y+1))<-192){
      const water=hydrologyWaterLevel(tx+(x+.5)*step,ty+(y+.5)*step);
      if(water===undefined||water<=-168.5)continue;
    }
    const a=vertex(x,y),b=vertex(x,y+1),c=vertex(x+1,y+1),d=vertex(x+1,y);
    // Alternating diagonals avoid a visible single-direction triangulation.
    if((x+y)%2)indices.push(a,b,d,b,c,d);else indices.push(a,b,c,a,c,d);
  }
  return {tx,ty,positions:new Int16Array(positions),normals:new Int8Array(normals),uv:new Float32Array(uv),colors:new Uint8Array(colors),indices:new Uint32Array(indices)};
}

/** The exact triangle surface used by the ordinary 64-unit horizon. Decorative
 * cascades conform to it rather than hovering above an averaged height. */
export function organicHorizonHeightAt(x:number,y:number){return interpolateTerrainSurface(x,y,baseTerrainHeight);}
