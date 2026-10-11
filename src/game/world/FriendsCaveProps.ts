import {CAVE_DESCENT_ROOMS,caveStairsAt,CAVE_LIFTS,CAVE_LAVA,CAVE_ENTRANCE} from './FriendsCaveDescent';

/** Simulation coordinates: x/y on the map, z at the base. Rendering and
 * physics share these authored props; crystals use the same tapered pentagon. */
export type CaveProp={x:number;y:number;z:number;w:number;d:number;h:number;material:'stone'|'wood'|'bronze'|'crystal';shape:'box'|'crystal';planes?:{nx:number;ny:number;offset:number}[]};
export const CAVE_PROPS:CaveProp[]=[];
function routeClear(x:number,y:number,z:number,w:number,d:number,h:number){
 for(let dx=-w/2-20;dx<=w/2+20;dx+=12)for(let dy=-d/2-20;dy<=d/2+20;dy+=12)if(caveStairsAt(x+dx,y+dy).some(s=>z<s.z+56&&z+h>s.z+8))return false;
 return true;
}
const box=(x:number,z:number,y:number,w:number,h:number,d:number,material:CaveProp['material'])=>{if(routeClear(x,y,z,w,d,h))CAVE_PROPS.push({x,y,z,w,d,h,material,shape:'box'});};
// Keep floor-standing groups clear of stairs, shortcut pads and recovery ledges.
function clearSpot(x:number,y:number,z:number,w:number,d:number){
 if(Math.hypot(x-CAVE_ENTRANCE.x,y-CAVE_ENTRANCE.y)<CAVE_ENTRANCE.radius+Math.max(w,d)/2)return false;
 return ![[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2],[0,0]].some(([dx,dy])=>caveStairsAt(x+dx,y+dy,32).some(s=>Math.abs(s.z-z)<64))
  &&!CAVE_LIFTS.some(l=>Math.abs(l.z-z)<64&&Math.hypot(l.x-x,l.y-y)<80+Math.max(w,d)/2)
  &&!CAVE_LAVA.some(l=>Math.abs(l.safe.z-z)<64&&Math.hypot(l.safe.x-x,l.safe.y-y)<80+Math.max(w,d)/2);
}
for(const r of [{id:'upper-mine',x:6576,y:5008,rx:320,ry:240,floor:352,theme:'mine'},...CAVE_DESCENT_ROOMS]){
 if(r.theme==='mine')for(const dx of [-192,0,192]){
  for(const side of [-1,1])if(clearSpot(r.x+dx,r.y+side*128,r.floor,12,12))box(r.x+dx,r.floor,r.y+side*128,12,224,12,'wood');
  box(r.x+dx-8,r.floor+224,r.y,28,16,272,'wood');
 }
 if(r.theme==='ruins'||r.theme==='vault')for(const dx of [-224,0,224])for(const side of [-1,1]){
  const x=r.x+dx,y=r.y+side*192,h=r.theme==='vault'?320:224;
  if(!clearSpot(x,y,r.floor,48,48))continue;
  box(x,r.floor,y,48,16,48,'stone');box(x,r.floor+16,y,24,h,24,'stone');box(x,r.floor+h+16,y,48,16,48,'stone');
 }
 if(r.theme==='crystal')for(let i=0;i<30;i++){
  const a=i*2.399,x=r.x+Math.cos(a)*r.rx*.68,y=r.y+Math.sin(a)*r.ry*.68,h=48+i%5*20,rx=12+i%3*6,ry=12+i%4*3;
  if(!clearSpot(x,y,r.floor,rx*2,ry*2)||!routeClear(x,y,r.floor,rx*2,ry*2,h))continue;
  const vertices=Array.from({length:5},(_,j)=>({x:Math.sin(j*Math.PI*2/5)*rx,y:Math.cos(j*Math.PI*2/5)*ry}));
  const planes=vertices.map((p,j)=>{const q=vertices[(j+1)%5],nx=-(q.y-p.y),ny=q.x-p.x,n=Math.hypot(nx,ny);return {nx:nx/n,ny:ny/n,offset:(nx*p.x+ny*p.y)/n};});
  CAVE_PROPS.push({x,y,z:r.floor,w:rx*2,d:ry*2,h,material:'crystal',shape:'crystal',planes});
 }
 if(r.theme==='ember')for(const side of [-1,1]){
  const x=r.x+side*240,y=r.y+96;if(!clearSpot(x,y,r.floor,80,80))continue;
  box(x,r.floor,y,64,128,64,'stone');box(x,r.floor+128,y,80,24,80,'bronze');box(x,r.floor+152,y,24,64,24,'bronze');
  if(r.id==='descent-forge')box(x,r.floor+216,y,32,16,320,'bronze');
 }
}
const tiles=new Map<string,CaveProp[]>(),empty:readonly CaveProp[]=[];
for(const p of CAVE_PROPS)for(let x=Math.floor((p.x-p.w/2)/256);x<=Math.floor((p.x+p.w/2)/256);x++)for(let y=Math.floor((p.y-p.d/2)/256);y<=Math.floor((p.y+p.d/2)/256);y++){const key=`${x},${y}`,list=tiles.get(key)||[];list.push(p);tiles.set(key,list);}
export function cavePropsNear(x:number,y:number,radius=0):readonly CaveProp[]{
 if(x+radius<6300||x-radius>17408||y+radius<4352||y-radius>8000)return empty;
 const a=Math.floor((x-radius)/256),b=Math.floor((x+radius)/256),c=Math.floor((y-radius)/256),d=Math.floor((y+radius)/256);
 if(a===b&&c===d)return tiles.get(`${a},${c}`)||empty;
 const result=new Set<CaveProp>();for(let i=a;i<=b;i++)for(let j=c;j<=d;j++)for(const p of tiles.get(`${i},${j}`)||empty)result.add(p);return [...result];
}
function contains(p:CaveProp,x:number,y:number,scale=1){return p.planes?p.planes.every(n=>n.nx*(x-p.x)+n.ny*(y-p.y)<=n.offset*scale+.001):Math.abs(x-p.x)<=p.w/2&&Math.abs(y-p.y)<=p.d/2;}
export function cavePropFloor(x:number,y:number,z:number,step:number){let floor:number|undefined;for(const p of cavePropsNear(x,y)){const top=p.z+p.h;if(top<=z+step+.001&&contains(p,x,y,p.shape==='crystal'?.08:1)&&(floor===undefined||top>floor))floor=top;}return floor;}
export function cavePropCeiling(x:number,y:number,z:number){let ceiling:number|undefined;for(const p of cavePropsNear(x,y))if(p.z>z+.001&&contains(p,x,y)&&(ceiling===undefined||p.z<ceiling))ceiling=p.z;return ceiling;}
export function collideCaveProps(point:{x:number;y:number},z:number,radius:number,height=50,step=8){
 let collided=false;
 for(let pass=0;pass<2;pass++)for(const p of cavePropsNear(point.x,point.y,radius)){
  if(z+height<=p.z+.001||z+step>=p.z+p.h-.001)continue;
  if(p.planes){
   const scale=1-.92*Math.max(0,(z+step-p.z)/p.h),dx=point.x-p.x,dy=point.y-p.y;
   let plane=p.planes[0],gap=-Infinity;
   for(const n of p.planes){const d=n.nx*dx+n.ny*dy-n.offset*scale;if(d>gap){gap=d;plane=n;}}
   if(gap>=radius)continue;
   // Expanded convex faces are a small conservative cylinder approximation
   // at the pentagon's corners, while preserving the visible taper.
   point.x+=plane.nx*(radius-gap);point.y+=plane.ny*(radius-gap);collided=true;continue;
  }
  const nx=Math.max(p.x-p.w/2,Math.min(p.x+p.w/2,point.x)),ny=Math.max(p.y-p.d/2,Math.min(p.y+p.d/2,point.y)),dx=point.x-nx,dy=point.y-ny,d=Math.hypot(dx,dy);
  if(d>=radius)continue;
  if(d>.001){point.x+=dx/d*(radius-d);point.y+=dy/d*(radius-d);}else if(p.w/2+radius-Math.abs(point.x-p.x)<p.d/2+radius-Math.abs(point.y-p.y))point.x=p.x+(point.x<p.x?-1:1)*(p.w/2+radius);else point.y=p.y+(point.y<p.y?-1:1)*(p.d/2+radius);
  collided=true;
 }return collided;
}
export function cavePropOverlaps(b:{x:number;y:number;z:number;w:number;d:number;h:number}){return cavePropsNear(b.x,b.y,Math.max(b.w,b.d)/2).some(p=>Math.abs(b.x-p.x)<(b.w+p.w)/2-.01&&Math.abs(b.y-p.y)<(b.d+p.d)/2-.01&&b.z<p.z+p.h-.01&&b.z+b.h>p.z+.01);}
export function raycastCaveProps(ray:{x:number;y:number;z:number;dx:number;dy:number;dz:number},maxDistance:number){
 let hit:{x:number;y:number;z:number;nx:number;ny:number;nz:number;distance:number}|undefined;
 const endX=ray.x+ray.dx*maxDistance,endY=ray.y+ray.dy*maxDistance,props=new Set<CaveProp>();
 for(let x=Math.floor(Math.min(ray.x,endX)/256);x<=Math.floor(Math.max(ray.x,endX)/256);x++)for(let y=Math.floor(Math.min(ray.y,endY)/256);y<=Math.floor(Math.max(ray.y,endY)/256);y++)for(const p of tiles.get(`${x},${y}`)||empty)props.add(p);
 for(const p of props){
  const planes=p.planes?p.planes.map(n=>({x:n.nx,y:n.ny,z:.92*n.offset/p.h,offset:n.offset})): [{x:1,y:0,z:0,offset:p.w/2},{x:-1,y:0,z:0,offset:p.w/2},{x:0,y:1,z:0,offset:p.d/2},{x:0,y:-1,z:0,offset:p.d/2}];
  planes.push({x:0,y:0,z:-1,offset:0},{x:0,y:0,z:1,offset:p.h});
  let near=0,far=hit?.distance??maxDistance,normal={x:0,y:0,z:1};
  for(const n of planes){const v=n.x*ray.dx+n.y*ray.dy+n.z*ray.dz,d=n.offset-n.x*(ray.x-p.x)-n.y*(ray.y-p.y)-n.z*(ray.z-p.z);if(Math.abs(v)<1e-9){if(d<0){far=-1;break;}continue;}const t=d/v;if(v<0){if(t>near){near=t;normal=n;}}else far=Math.min(far,t);}
  if(near<=far&&far>=0&&near<=(hit?.distance??maxDistance)){const length=Math.hypot(normal.x,normal.y,normal.z);hit={x:ray.x+ray.dx*near,y:ray.y+ray.dy*near,z:ray.z+ray.dz*near,nx:normal.x/length,ny:normal.y/length,nz:normal.z/length,distance:near};}
 }return hit;
}
