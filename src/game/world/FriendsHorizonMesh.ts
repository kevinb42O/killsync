import { baseTerrainHeight, FRONTIER_SIZE, VOXEL_SIZE } from './FriendsTerrain';
export type HorizonMeshData = { tx: number; ty: number; positions: Int16Array; normals: Int8Array; uv: Float32Array; colors: Uint8Array; indices: Uint32Array }; 

/** Greedy surface-only voxel mesh. All samples use the exact simulation cells:
 * distance changes neither the mountain's height nor its stair-step silhouette. */
export function meshBlockHorizon(tx: number, ty: number, tile = 4096, sampleHeight = baseTerrainHeight): HorizonMeshData {
  const cells = Math.ceil(tile / VOXEL_SIZE), heights = new Int16Array((cells + 2) ** 2), stride = cells + 2;
  const height = (x: number, y: number) => heights[(y + 1) * stride + x + 1];
  for (let y=-1;y<=cells;y++) for(let x=-1;x<=cells;x++) heights[(y+1)*stride+x+1]=sampleHeight(tx+(x+.5)*VOXEL_SIZE,ty+(y+.5)*VOXEL_SIZE);
  const positions:number[]=[],normals:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[];
  function quad(v:number[][],n:number[],wall=false){
    const tint=wall?[.906,.645,.582]:[1,1,1],shade=n[1]===1?1:n[0]!==0?.84:.92;
    const offset=positions.length/3;for(const i of [0,1,2,0,2,3])indices.push(offset+i);
    for(const p of v){positions.push(p[0]-tx,p[1],p[2]-ty);normals.push(n[0]*127,n[1]*127,n[2]*127);uv.push((n[0]?p[2]:p[0])/160,(n[1]?p[2]:p[1])/160);colors.push(Math.round(tint[0]*shade*255),Math.round(tint[1]*shade*255),Math.round(tint[2]*shade*255));}
  }
  const used=new Uint8Array(cells*cells);
  const maxX=Math.min(cells,Math.ceil((FRONTIER_SIZE-tx)/VOXEL_SIZE)),maxY=Math.min(cells,Math.ceil((FRONTIER_SIZE-ty)/VOXEL_SIZE));
  for(let y=0;y<maxY;y++)for(let x=0;x<maxX;x++){
    if(used[y*cells+x])continue;const h=height(x,y);let w=1,d=1;
    while(x+w<maxX&&!used[y*cells+x+w]&&height(x+w,y)===h)w++;
    outer:while(y+d<maxY){for(let k=0;k<w;k++)if(used[(y+d)*cells+x+k]||height(x+k,y+d)!==h)break outer;d++;}
    for(let j=0;j<d;j++)used.fill(1,(y+j)*cells+x,(y+j)*cells+x+w);
    const x0=tx+x*32,x1=x0+w*32,y0=ty+y*32,y1=y0+d*32;
    quad([[x0,h,y0],[x0,h,y1],[x1,h,y1],[x1,h,y0]],[0,1,0]);
  }
  // Coalesce straight cliff sections, including a one-cell halo across tile seams.
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
  return {tx,ty,positions:new Int16Array(positions),normals:new Int8Array(normals),uv:new Float32Array(uv),colors:new Uint8Array(colors),indices:new Uint32Array(indices)};
}
