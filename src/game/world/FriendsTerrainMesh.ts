import { scenicTransitAir } from './FriendsRailInfrastructure';
import { baseTerrainHeight } from './FriendsTerrain';
import { FriendsTerrain, TERRAIN_CHUNK, VOXEL_SIZE, islandRuinsAt } from './FriendsTerrain';
import { CAVE_BOUNDS, explorationCave, caveGlow, caveOpenToSky } from './FriendsCave';
export type TerrainMeshData = { positions: Int16Array; normals: Int8Array; uv: Float32Array; colors: Uint8Array; glow:Float32Array; groups: { start: number; count: number; materialIndex: number }[] };
/** Greedy volumetric meshing preserves every simulation voxel while merging
 * coplanar faces. Large vaulted rooms need only a fraction of the old triangles. */
export function meshTerrainChunk(terrain: FriendsTerrain, cx: number, cy: number): TerrainMeshData {
  let bottom=Infinity,top=-Infinity;
  for(let x=-1;x<=16;x++)for(let y=-1;y<=16;y++){const r=terrain.columnRange(cx*16+x,cy*16+y);bottom=Math.min(bottom,r.bottom);top=Math.max(top,r.top);}
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
        const p=[0,0,0];p[axis]=slice;p[u]=i;p[v]=j;
        const m=material(p[0],p[1],p[2]);if(!m)continue;
        const q=[...p];q[axis]+=direction;if(material(q[0],q[1],q[2]))continue;
        const surface=axis===2&&direction===1&&(bottom+p[2]+1)*32===terrain.height(cx*16+p[0],cy*16+p[1]);
        let group=m===1?(surface?0:1):m;
        // Separate underground materials suppress daylight fill without affecting
        // surface grass or the full-map horizon. Point lights still light the rock.
        if(!surface){const px=(cx*16+q[0]+.5)*32,py=(cy*16+q[1]+.5)*32,pz=(bottom+q[2]+.5)*32;
          if(caveRegion&&(bottom+p[2])*32<608&&explorationCave(px,py,pz)&&!caveOpenToSky(px,py,pz)||baseTerrainHeight(px,py)>pz+128&&scenicTransitAir(px,py,pz))group+=5;
        }
        const ruin=ruins[p[1]*16+p[0]].find(b=>(bottom+p[2]+.5)*32>=b.z&&(bottom+p[2]+.5)*32<b.z+b.h);
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
          b.p.push(x-cx*TERRAIN_CHUNK,z,y-cy*TERRAIN_CHUNK);b.n.push(normal[0]*127,normal[2]*127,normal[1]*127);b.uv.push((axis===0?y:x)/160,(axis===2?y:z)/160);b.c.push(Math.round(shade*255),Math.round(shade*255),Math.round(shade*255));b.g.push(...(id>5&&id<=10?caveGlow(x,y,z):[0,0,0]));
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
