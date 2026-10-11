import { islandCoastDistance } from './FriendsIsland';

export type FriendsBreakwater = {id:string;x:number;y:number;c:number;s:number;length:number;bottom:number};
const seeds = [
  ...[7800,9800,12000,14500,17000,19500,22500,29500,33500,37000].map(y=>({axis:'x',fixed:y})),
  ...[6500,9000,11500,14000,19000].map(x=>({axis:'y',fixed:x})),
];
/** Authored beach rows, deterministic coast attachment and outward normals.
 * No terrain imports: host, prediction and renderer share the same geometry. */
export const FRIENDS_BREAKWATERS:readonly FriendsBreakwater[]=seeds.map((seed,i)=>{
  let lo=0,hi=seed.axis==='x'?12000:10000;
  for(let n=0;n<30;n++){const mid=(lo+hi)/2,coast=seed.axis==='x'?islandCoastDistance(mid,seed.fixed):islandCoastDistance(seed.fixed,mid);if(coast<60)lo=mid;else hi=mid;}
  const x=seed.axis==='x'?(lo+hi)/2:seed.fixed,y=seed.axis==='x'?seed.fixed:(lo+hi)/2;
  const dx=islandCoastDistance(x+32,y)-islandCoastDistance(x-32,y),dy=islandCoastDistance(x,y+32)-islandCoastDistance(x,y-32),r=Math.hypot(dx,dy);
  return {id:`golfbreker-${i+1}`,x,y,c:-dx/r,s:-dy/r,length:768+(i%3)*128,bottom:-2048};
});
export const BREAKWATER_HALF_WIDTH=160, BREAKWATER_WALK_HALF_WIDTH=80, BREAKWATER_RAMP=192;
export function breakwaterPoint(b:FriendsBreakwater,along:number,across=0){return {x:b.x+b.c*along-b.s*across,y:b.y+b.s*along+b.c*across};}
export function breakwaterLocal(b:FriendsBreakwater,x:number,y:number){const dx=x-b.x,dy=y-b.y;return {along:dx*b.c+dy*b.s,across:-dx*b.s+dy*b.c};}
export function breakwaterTop(along:number,across=0){return -160+32*Math.min(1,Math.max(0,along/BREAKWATER_RAMP))-.8*Math.max(0,Math.abs(across)-BREAKWATER_WALK_HALF_WIDTH);}
const tiles=new Map<string,FriendsBreakwater[]>();
for(const b of FRIENDS_BREAKWATERS){const corners=[0,b.length].flatMap(a=>[-BREAKWATER_HALF_WIDTH,BREAKWATER_HALF_WIDTH].map(c=>breakwaterPoint(b,a,c)));
  for(let x=Math.floor(Math.min(...corners.map(p=>p.x))/512);x<=Math.floor(Math.max(...corners.map(p=>p.x))/512);x++)for(let y=Math.floor(Math.min(...corners.map(p=>p.y))/512);y<=Math.floor(Math.max(...corners.map(p=>p.y))/512);y++){const key=`${x},${y}`,list=tiles.get(key)??[];list.push(b);tiles.set(key,list);}}
export function breakwatersAt(x:number,y:number){return tiles.get(`${Math.floor(x/512)},${Math.floor(y/512)}`)??[];}
function breakwatersNear(x:number,y:number,radius:number){
  const xmin=Math.floor((x-radius)/512),xmax=Math.floor((x+radius)/512),ymin=Math.floor((y-radius)/512),ymax=Math.floor((y+radius)/512);
  if(xmin===xmax&&ymin===ymax)return breakwatersAt(x,y);
  const nearby=new Set<FriendsBreakwater>();
  for(let vx=xmin;vx<=xmax;vx++)for(let vy=ymin;vy<=ymax;vy++)for(const b of tiles.get(`${vx},${vy}`)??[])nearby.add(b);
  return nearby;
}
export function friendsBreakwaterSurface(x:number,y:number){
  for(const b of breakwatersAt(x,y)){const p=breakwaterLocal(b,x,y);if(p.along>=-1e-7&&p.along<=b.length+1e-7&&Math.abs(p.across)<=BREAKWATER_HALF_WIDTH+1e-7)return breakwaterTop(p.along,p.across);}
  return undefined;
}
/** Clip a ray against the two convex ramp/body sections, including rubble slopes. */
export function raycastBreakwaters(ray:{x:number;y:number;z:number;dx:number;dy:number;dz:number},maxDistance:number){
  let best: {x:number;y:number;z:number;distance:number;nx:number;ny:number;nz:number}|undefined;
  for(const b of FRIENDS_BREAKWATERS){
    // Cheap broad phase before plane clipping.
    const centre=breakwaterPoint(b,b.length/2);if(Math.hypot(ray.x-centre.x,ray.y-centre.y)>maxDistance+b.length/2+BREAKWATER_HALF_WIDTH)continue;
    const p=breakwaterLocal(b,ray.x,ray.y),da=ray.dx*b.c+ray.dy*b.s,dc=-ray.dx*b.s+ray.dy*b.c;
    for(const [start,end,slope,intercept] of [[0,BREAKWATER_RAMP,1/6,-160],[BREAKWATER_RAMP,b.length,0,-128]]){
      let enter=0,leave=best?.distance??maxDistance,normal=[0,0,1];
      const planes=[[1,0,0,end],[-1,0,0,-start],[0,1,0,BREAKWATER_HALF_WIDTH],[0,-1,0,BREAKWATER_HALF_WIDTH],[0,0,-1,-b.bottom],[-slope,0,1,intercept],[-slope,.8,1,intercept+64],[-slope,-.8,1,intercept+64]];
      for(const [a,c,z,d] of planes){const origin=a*p.along+c*p.across+z*ray.z-d,direction=a*da+c*dc+z*ray.dz;
        if(Math.abs(direction)<1e-10){if(origin>0){leave=-1;break;}continue;}
        const t=-origin/direction;if(direction<0){if(t>enter){enter=t;normal=[a,c,z];}}else leave=Math.min(leave,t);
      }
      if(enter<=leave&&leave>=0){const [a,c,z]=normal,r=Math.hypot(a,c,z);best={x:ray.x+ray.dx*enter,y:ray.y+ray.dy*enter,z:ray.z+ray.dz*enter,distance:enter,nx:(a*b.c-c*b.s)/r,ny:(a*b.s+c*b.c)/r,nz:z/r};}
    }
  }return best;
}
/** Solid sides keep swimmers out; walking above the surface remains unobstructed. */
export function collideBreakwaters(p:{x:number;y:number},z:number,radius:number,height:number,step:number){let hit=false;
  for(const b of breakwatersNear(p.x,p.y,radius)){const q=breakwaterLocal(b,p.x,p.y);if(z+height<=b.bottom||z+step>=breakwaterTop(Math.max(0,Math.min(b.length,q.along)),Math.max(-BREAKWATER_HALF_WIDTH,Math.min(BREAKWATER_HALF_WIDTH,q.across))))continue;
    const a=Math.max(0,Math.min(b.length,q.along)),c=Math.max(-BREAKWATER_HALF_WIDTH,Math.min(BREAKWATER_HALF_WIDTH,q.across)),dx=q.along-a,dy=q.across-c,d=Math.hypot(dx,dy);
    if(d>=radius)continue;
    if(d>0){q.along=a+dx/d*radius;q.across=c+dy/d*radius;}else{
      const gaps=[q.along,b.length-q.along,q.across+BREAKWATER_HALF_WIDTH,BREAKWATER_HALF_WIDTH-q.across],side=gaps.indexOf(Math.min(...gaps));
      if(side===0)q.along=-radius;else if(side===1)q.along=b.length+radius;else q.across=(side===2?-1:1)*(BREAKWATER_HALF_WIDTH+radius);
    }Object.assign(p,breakwaterPoint(b,q.along,q.across));hit=true;
  }return hit;
}
