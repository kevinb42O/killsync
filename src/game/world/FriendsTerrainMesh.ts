import { scenicTransitAir } from './FriendsRailInfrastructure';
import { baseTerrainHeight } from './FriendsTerrain';
import { FriendsTerrain, TERRAIN_CHUNK, VOXEL_SIZE, islandRuinsAt } from './FriendsTerrain';
import { CAVE_BOUNDS, explorationCave, caveGlow, caveOpenToSky } from './FriendsCave';
export type TerrainMeshData = { positions: Int16Array; normals: Int8Array; uv: Float32Array; colors: Uint8Array; glow:Float32Array; groups: { start: number; count: number; materialIndex: number }[] };
/** Greedy volumetric meshing preserves every simulation voxel while merging
 * coplanar faces. Large vaulted rooms need only a fraction of the old triangles. */
export type TerrainMeshBand={bottom:number;top:number};
/** Full-range reference and explicit band mesher share real one-voxel halos. */
export function meshTerrainChunkFull(terrain: FriendsTerrain, cx: number, cy: number, band?:TerrainMeshBand): TerrainMeshData {
  let bottom=band?.bottom??Infinity,top=band?.top??-Infinity;
  if(!band)for(let x=-1;x<=16;x++)for(let y=-1;y<=16;y++){const r=terrain.columnRange(cx*16+x,cy*16+y);bottom=Math.min(bottom,r.bottom);top=Math.max(top,r.top);}
  const size=[16,16,Math.max(1,top-bottom+1)],depth=size[2]+2,cache=new Uint8Array(18*18*depth);cache.fill(255);
  const material=(x:number,y:number,z:number)=>{
    const index=((z+1)*18+y+1)*18+x+1;let value=cache[index];
    if(value===255){value=terrain.exposedMaterial(cx*16+x,cy*16+y,bottom+z);cache[index]=value;}return value;
  };
  const buckets=Array.from({length:14},()=>({p:[] as number[],n:[] as number[],uv:[] as number[],c:[] as number[],g:[] as number[]}));
  const ruins=Array.from({length:256},(_,i)=>islandRuinsAt((cx*16+i%16+.5)*32,(cy*16+Math.floor(i/16)+.5)*32));
  const caveRegion=cx*512<CAVE_BOUNDS.maxX&&(cx+1)*512>CAVE_BOUNDS.minX&&cy*512<CAVE_BOUNDS.maxY&&(cy+1)*512>CAVE_BOUNDS.minY;
  for(let axis=0;axis<3;axis++)for(const direction of [-1,1]){
    const u=(axis+1)%3,v=(axis+2)%3,width=size[u],height=size[v],mask=new Int16Array(width*height);
    const normal=[0,0,0];normal[axis]=direction;
    const shade=axis===2?(direction===1?1:.55):axis===0?.84:.92;
    for(let slice=0;slice<size[axis];slice++){
      mask.fill(0);
      for(let j=0;j<height;j++)for(let i=0;i<width;i++){
        // Scalar coordinates avoid two temporary arrays for every voxel face.
        const ix=axis===0?slice:axis===1?j:i,iy=axis===0?i:axis===1?slice:j,iz=axis===0?j:axis===1?i:slice;
        const m=material(ix,iy,iz);if(!m)continue;
        const qx=ix+(axis===0?direction:0),qy=iy+(axis===1?direction:0),qz=iz+(axis===2?direction:0);
        if(material(qx,qy,qz))continue;
        const surface=axis===2&&direction===1&&(bottom+iz+1)*32===terrain.height(cx*16+ix,cy*16+iy);
        let group=m===1?(surface?0:1):m;
        // Separate underground materials suppress daylight fill without affecting
        // surface grass or the full-map horizon. Point lights still light the rock.
        if(!surface){const px=(cx*16+qx+.5)*32,py=(cy*16+qy+.5)*32,pz=(bottom+qz+.5)*32;
          if(caveRegion&&(bottom+iz)*32<608&&explorationCave(px,py,pz)&&!caveOpenToSky(px,py,pz)||baseTerrainHeight(px,py)>pz+128&&scenicTransitAir(px,py,pz))group+=5;
        }
        const ruin=ruins[iy*16+ix].find(b=>(bottom+iz+.5)*32>=b.z&&(bottom+iz+.5)*32<b.z+b.h);
        if(ruin?.detail==='stair-core')continue;
        if(ruin)group=10+['stone','dark','copper','glow'].indexOf(ruin.tint);
        mask[j*width+i]=group+1;
      }
      for(let j=0;j<height;j++)for(let i=0;i<width;){
        const id=mask[j*width+i];if(!id){i++;continue;}let w=1,h=1;
        while(i+w<width&&mask[j*width+i+w]===id)w++;
        outer:while(j+h<height){for(let k=0;k<w;k++)if(mask[(j+h)*width+i+k]!==id)break outer;h++;}
        const start=[0,0,0];start[axis]=slice+(direction>0?1:0);start[u]=i;start[v]=j;
        const corners=[[...start],[...start],[...start],[...start]];corners[1][u]+=w;corners[2][u]+=w;corners[2][v]+=h;corners[3][v]+=h;
        if(direction<0)corners.reverse();const b=buckets[id-1];
        // Simulation elevation becomes renderer Y, reversing handedness.
        for(const corner of [0,2,1,0,3,2]){const p=corners[corner],x=(cx*16+p[0])*VOXEL_SIZE,y=(cy*16+p[1])*VOXEL_SIZE,z=(bottom+p[2])*VOXEL_SIZE;
          b.p.push(x-cx*TERRAIN_CHUNK,z,y-cy*TERRAIN_CHUNK);b.n.push(normal[0]*127,normal[2]*127,normal[1]*127);b.uv.push((axis===0?y:x)/160,(axis===2?y:z)/160);const bedrockShade=z<-4000?.3:1;b.c.push(Math.round(shade*255*bedrockShade),Math.round(shade*255*bedrockShade),Math.round(shade*255*bedrockShade));b.g.push(...(id>5&&id<=10?caveGlow(x,y,z):[0,0,0]));
        }
        for(let k=0;k<h;k++)mask.fill(0,(j+k)*width+i,(j+k)*width+i+w);i+=w;
      }
    }
  }
  // Exact local positions fit signed shorts. Normal and shade bytes decode on
  // the GPU, cutting per-vertex transfer/storage from 56 to 32 bytes.
  const count=buckets.reduce((n,b)=>n+b.p.length/3,0),positions=new Int16Array(count*3),normals=new Int8Array(count*3),uv=new Float32Array(count*2),colors=new Uint8Array(count*3),glow=new Float32Array(count*3);
  const groups:TerrainMeshData['groups']=[];let offset=0;
  buckets.forEach((b,materialIndex)=>{if(b.p.length)groups.push({start:offset,count:b.p.length/3,materialIndex});positions.set(b.p,offset*3);normals.set(b.n,offset*3);uv.set(b.uv,offset*2);colors.set(b.c,offset*3);glow.set(b.g,offset*3);offset+=b.p.length/3;});
  return {positions,normals,uv,colors,glow,groups};
}

/** Merge every potential exposure band across the 18x18 column halo. Surface
 * cliffs need the whole height span, not just a skin around individual tops. */
export function terrainChunkMeshBands(terrain:FriendsTerrain,cx:number,cy:number):TerrainMeshBand[]{
 let bottom=Infinity,top=-Infinity,surfaceLow=Infinity,surfaceHigh=-Infinity;
 const ranges:[number,number][]=[];
 for(let x=-1;x<=16;x++)for(let y=-1;y<=16;y++){
  const vx=cx*16+x,vy=cy*16+y,r=terrain.columnRange(vx,vy),h=Math.floor(terrain.height(vx,vy)/32);
  bottom=Math.min(bottom,r.bottom);top=Math.max(top,r.top);surfaceLow=Math.min(surfaceLow,h-1);surfaceHigh=Math.max(surfaceHigh,h+1);
  ranges.push(...terrain.columnMeshRanges(vx,vy));
 }
 ranges.push([surfaceLow,surfaceHigh],[bottom,bottom+1]);
 const sorted=ranges.map(([lo,hi])=>({bottom:Math.max(bottom,lo),top:Math.min(top,hi)})).filter(r=>r.bottom<=r.top).sort((a,b)=>a.bottom-b.bottom);
 const bands:TerrainMeshBand[]=[];
 for(const range of sorted){const previous=bands.at(-1);if(previous&&range.bottom<=previous.top+1)previous.top=Math.max(previous.top,range.top);else bands.push({...range});}
 return bands;
}
/** Sparse vertical bands retain every cave level and the exterior surface.
 * The renderer still uploads one mesh with one group per material. */
export function meshTerrainChunk(terrain:FriendsTerrain,cx:number,cy:number):TerrainMeshData{
 if(cx*512>=CAVE_BOUNDS.maxX||(cx+1)*512<=CAVE_BOUNDS.minX||cy*512>=CAVE_BOUNDS.maxY||(cy+1)*512<=CAVE_BOUNDS.minY)return meshTerrainChunkFull(terrain,cx,cy);
 const bands=terrainChunkMeshBands(terrain,cx,cy),parts=bands.map(b=>meshTerrainChunkFull(terrain,cx,cy,b));
 if(parts.length===1)return parts[0];
 const count=parts.reduce((n,p)=>n+p.positions.length/3,0),positions=new Int16Array(count*3),normals=new Int8Array(count*3),uv=new Float32Array(count*2),colors=new Uint8Array(count*3),glow=new Float32Array(count*3),groups:TerrainMeshData['groups']=[];
 let offset=0;
 for(let materialIndex=0;materialIndex<14;materialIndex++){
  const start=offset;
  for(const p of parts)for(const g of p.groups)if(g.materialIndex===materialIndex){
   const end=g.start+g.count;
   positions.set(p.positions.subarray(g.start*3,end*3),offset*3);normals.set(p.normals.subarray(g.start*3,end*3),offset*3);uv.set(p.uv.subarray(g.start*2,end*2),offset*2);colors.set(p.colors.subarray(g.start*3,end*3),offset*3);glow.set(p.glow.subarray(g.start*3,end*3),offset*3);offset+=g.count;
  }
  if(offset>start)groups.push({start,count:offset-start,materialIndex});
 }
 return {positions,normals,uv,colors,glow,groups};
}
