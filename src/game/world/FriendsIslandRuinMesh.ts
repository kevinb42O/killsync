import { baseTerrainHeight, islandRuinsAt, ISLAND_RUINS, naturalCave } from './FriendsTerrain';
import { islandArchRange, type IslandStoneBox } from './FriendsIsland';

export type RuinMeshData = { positions: Float32Array; normals: Float32Array; uv: Float32Array; groups: {start:number;count:number;materialIndex:number}[] };

/** Emit the boundary of the union, rather than rendering intersecting boxes.
 * Coplanar cells merge into quads. Terrain contacts are hidden, and UVs use
 * world coordinates just like the editable near mesh. */
export function meshIslandRuins(): RuinMeshData {
  type Plane = {axis:number;direction:number;slice:number;tint:number;cells:Set<string>};
  type Column={height:number;arch?:[number,number];boxes:IslandStoneBox[]};
  const planes=new Map<string,Plane>(), solidCache=new Map<number,boolean>(), columns=new Map<number,Column>();
  const column=(vx:number,vy:number)=>{
    const key=vx+vy*2048;let c=columns.get(key);
    if(!c){const x=vx*32+16,y=vy*32+16;c={height:baseTerrainHeight(x,y),arch:islandArchRange(x,y),boxes:islandRuinsAt(x,y).filter(b=>b.detail!=='stair-core')};columns.set(key,c);}return c;
  };
  const solid=(p:number[])=>{
    const key=p[0]+p[2]*2048+(p[1]+32)*4194304;let value=solidCache.get(key);if(value!==undefined)return value;
    const x=p[0]*32+16,y=p[2]*32+16,z=p[1]*32+16;
    const c=column(p[0],p[2]);value=c.boxes.some(b=>z>=b.z&&z<b.z+b.h);
    if(!value&&z<c.height)value=c.arch?!(z>=c.arch[0]&&z<c.arch[1]):z>=608||!naturalCave(x,y,z,c.height-32);
    solidCache.set(key,value);return value;
  };
  // Only authored box faces can appear on the union's boundary. Avoid filling
  // the millions of buried voxels underneath high bridge decks.
  for(const b of ISLAND_RUINS){
    if(b.detail==='stair-core')continue;
    const lo=[(b.x-b.w/2)/32,b.z/32,(b.y-b.d/2)/32],hi=[(b.x+b.w/2)/32,(b.z+b.h)/32,(b.y+b.d/2)/32];
    for(let axis=0;axis<3;axis++)for(const direction of [-1,1]){
      const u=(axis+1)%3,v=(axis+2)%3,slice=direction<0?lo[axis]:hi[axis];
      for(let i=lo[u];i<hi[u];i++)for(let j=lo[v];j<hi[v];j++){
        const p=[0,0,0];p[axis]=slice+(direction<0?-1:0);p[u]=i;p[v]=j;
        if(solid(p))continue;
        const owner=[...p];owner[axis]-=direction;
        // Choose the same first volume/material as the simulation mesher.
        const x=owner[0]*32+16,y=owner[2]*32+16,z=owner[1]*32+16;
        const authored=column(owner[0],owner[2]).boxes.find(b=>z>=b.z&&z<b.z+b.h)!;
        const tint=['stone','dark','copper','glow'].indexOf(authored.tint),key=`${axis}:${direction}:${slice}:${tint}`;
        let plane=planes.get(key);if(!plane){plane={axis,direction,slice,tint,cells:new Set()};planes.set(key,plane);}plane.cells.add(`${i},${j}`);
      }
    }
  }
  const buckets=Array.from({length:4},()=>({p:[]as number[],n:[]as number[],uv:[]as number[]}));
  for(const plane of planes.values()){
    const {axis,direction,slice,cells,tint}=plane,u=(axis+1)%3,v=(axis+2)%3;
    // Decode coordinates once per cell. Parsing both strings in every sort
    // comparison dominated cold world construction for large castle planes.
    const ordered=[...cells].map(key=>{const [i,j]=key.split(',').map(Number);return {key,i,j};}).sort((a,b)=>a.j-b.j||a.i-b.i);
    for(const {key,i,j} of ordered){
      if(!cells.has(key))continue;let w=1,h=1;
      while(cells.has(`${i+w},${j}`))w++;
      outer:while(true){for(let k=0;k<w;k++)if(!cells.has(`${i+k},${j+h}`))break outer;h++;}
      const p=[0,0,0];p[axis]=slice;p[u]=i;p[v]=j;
      const corners=[[...p],[...p],[...p],[...p]];corners[1][u]+=w;corners[2][u]+=w;corners[2][v]+=h;corners[3][v]+=h;
      if(direction<0)corners.reverse();
      const n=[0,0,0];n[axis]=direction;const bucket=buckets[tint];
      for(const corner of [0,1,2,0,2,3]){const point=corners[corner].map(n=>n*32);bucket.p.push(...point);bucket.n.push(...n);bucket.uv.push((axis===0?point[2]:point[0])/160,(axis===1?point[2]:point[1])/160);}
      for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)cells.delete(`${i+dx},${j+dy}`);
    }
  }
  const positions:number[]=[],normals:number[]=[],uv:number[]=[],groups:RuinMeshData['groups']=[];
  buckets.forEach((b,materialIndex)=>{if(b.p.length)groups.push({start:positions.length/3,count:b.p.length/3,materialIndex});positions.push(...b.p);normals.push(...b.n);uv.push(...b.uv);});
  return {positions:new Float32Array(positions),normals:new Float32Array(normals),uv:new Float32Array(uv),groups};
}
