import * as THREE from 'three';
import { retreatLocal, type RetreatBox } from '../world/FriendsRetreatSites';
import { retreatPathSections, type RetreatPath } from '../world/FriendsRetreatPaths';

/** The collision boxes describe volumes. Render their union, not each box's
 * six faces: touching walls, reveals, floor and roof otherwise share pixels. */
export function retreatShellGeometry(site:{x:number;y:number;z:number;angle:number;w:number;d:number;height:number},boxes:readonly RetreatBox[]){
  const snap=(n:number)=>Math.round(n*1e6)/1e6;
  const volumes=boxes.filter(b=>b.surface!=='glass'&&b.surface!=='couch').map(b=>{
    const p=retreatLocal(site,b);
    return {surface:b.surface,min:[snap(p.u-b.w/2),snap(b.z-site.z),snap(p.v-b.d/2)],max:[snap(p.u+b.w/2),snap(b.z-site.z+b.h),snap(p.v+b.d/2)]};
  });
  const axes=[0,1,2].map(axis=>[...new Set(volumes.flatMap(b=>[b.min[axis],b.max[axis]]))].sort((a,b)=>a-b));
  const sizes=axes.map(a=>a.length-1),cells=new Int16Array(sizes[0]*sizes[1]*sizes[2]).fill(-1);
  const index=(x:number,y:number,z:number)=>(x*sizes[1]+y)*sizes[2]+z;
  const cell=(x:number,y:number,z:number)=>x<0||y<0||z<0||x>=sizes[0]||y>=sizes[1]||z>=sizes[2]?-1:cells[index(x,y,z)];
  for(let x=0;x<sizes[0];x++)for(let y=0;y<sizes[1];y++)for(let z=0;z<sizes[2];z++){
    const p=[x,y,z].map((i,a)=>(axes[a][i]+axes[a][i+1])/2);
    cells[index(x,y,z)]=volumes.findIndex(b=>p.every((v,a)=>v>b.min[a]&&v<b.max[a]));
  }
  const positions:number[][]=[[],[],[]],normals:number[][]=[[],[],[]],uvs:number[][]=[[],[],[]];
  for(let x=0;x<sizes[0];x++)for(let y=0;y<sizes[1];y++)for(let z=0;z<sizes[2];z++){
    const source=cell(x,y,z);if(source<0)continue;
    const grid=[x,y,z];
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
      const neighbour=[...grid];neighbour[axis]+=sign;if(cell(...neighbour as [number,number,number])>=0)continue;
      // Cyclic axes keep the face winding consistent with its outward normal.
      const a=(axis+1)%3,b=(axis+2)%3,plane=axes[axis][grid[axis]+(sign>0?1:0)];
      const corners=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>{
        const p=[0,0,0];p[axis]=plane;p[a]=axes[a][grid[a]+u];p[b]=axes[b][grid[b]+v];return p;
      });
      const centre=corners[0].map((v,i)=>(v+corners[2][i])/2),surface=volumes[source].surface;
      // Material order: floor oak, interior plaster, exterior timber.
      const material=surface==='floor'?0:surface==='roof'?(axis===1&&sign<0?1:2):Math.abs(centre[0])>site.w/2||Math.abs(centre[2])>site.d/2?2:1;
      const tile=material===0?20.4:material===1?18:12,n=[0,0,0];n[axis]=sign;
      for(const i of sign>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]){
        const p=corners[i];positions[material].push(...p);normals[material].push(...n);
        uvs[material].push((axis===0?p[2]:p[0])/tile,(axis===1?p[2]:p[1])/tile);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();let start=0;
  for(let material=0;material<3;material++){const count=positions[material].length/3;geometry.addGroup(start,count,material);start+=count;}
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions.flat(),3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals.flat(),3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs.flat(),2));
  return geometry;
}

/** A single joined strip avoids overlapping rectangles at every path bend.
 * The final cross-section meets the landing edge, with no duplicate deck top. */
export function retreatPathGeometry(site:{x:number;y:number;z:number;angle:number},path:RetreatPath){
  const positions:number[]=[],uv:number[]=[],indices:number[]=[],points=path.points,sections=retreatPathSections(path);
  let distance=0;
  for(let i=0;i<points.length;i++){
    const p=points[i],before=points[Math.max(0,i-1)];
    if(i)distance+=Math.hypot(p.x-before.x,p.y-before.y);
    for(const depth of [0,-5])for(const [side,point]of sections[i].entries()){
      const local=retreatLocal(site,point);positions.push(local.u,p.z-site.z+depth,local.v);uv.push((side*2-1)*path.width/40,distance/20);
    }
    if(i){const a=(i-1)*4,b=i*4;indices.push(a,a+1,b,a+1,b+1,b,a+2,b+2,a+3,a+3,b+2,b+3,a,a+2,b,a+2,b+2,b,a+1,b+1,a+3,a+3,b+1,b+3);}
  }
  const last=(points.length-1)*4;indices.push(0,1,2,1,3,2,last,last+2,last+1,last+1,last+2,last+3);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
