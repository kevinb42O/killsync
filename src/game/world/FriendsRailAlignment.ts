import { SCENIC_LEVEL_APPROACH } from './FriendsTrainLayout';
/** Simulation coordinates: X/Y horizontal, Z up. No renderer dependencies. */
export type RailVector = { x:number; y:number; z:number };
export type RailKnot = RailVector & { chapter:number; station?:string };
export type RailSample = RailVector & { distance:number; horizontal:number; chapter:number; angle:number; pitch:number; curvature:number; grade:number; speed:number };
export type RailAlignment = { points:RailSample[]; length:number; stations:{id:string;distance:number}[]; tiles:Map<string,number[]>; hash:string };
export const railWrap=(s:number,length:number)=>(s%length+length)%length;
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;

/** Circular fillets preserve the authored corridor and give each corner a
 * measurable radius. The closing knot is implicit, so there is only one seam. */
export function compileRailAlignment(knots:readonly RailKnot[]):RailAlignment {
  if(knots.length<4||knots.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))throw new Error('Invalid rail alignment');
  const n=knots.length,at=(i:number)=>knots[(i+n)%n];
  const raw:RailSample[]=[],stations:RailAlignment['stations']=[];
  const corners=knots.map((p,i)=>{
    const prev=at(i-1),next=at(i+1),before=Math.hypot(p.x-prev.x,p.y-prev.y),after=Math.hypot(next.x-p.x,next.y-p.y);
    const ux=(p.x-prev.x)/before,uy=(p.y-prev.y)/before,vx=(next.x-p.x)/after,vy=(next.y-p.y)/after;
    const turn=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy),tan=Math.tan(Math.abs(turn)/2);
    const cut=Math.abs(turn)<1e-5?0:Math.min(2048*tan,before*.44,after*.44),radius=cut/(tan||1),sign=Math.sign(turn);
    const entry={x:p.x-ux*cut,y:p.y-uy*cut,z:p.z+(prev.z-p.z)*cut/before};
    const exit={x:p.x+vx*cut,y:p.y+vy*cut,z:p.z+(next.z-p.z)*cut/after};
    return {p,entry,exit,turn,radius,cx:entry.x-uy*radius*sign,cy:entry.y+ux*radius*sign};
  });
  const push=(p:RailVector,chapter:number)=>raw.push({...p,distance:0,horizontal:0,chapter,angle:0,pitch:0,curvature:0,grade:0,speed:180});
  for(let i=0;i<n;i++){
    const c=corners[i],prev=corners[(i+n-1)%n],a=prev.exit,b=c.entry,length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(length/8));
    for(let j=0;j<steps;j++){const t=j/steps;push({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t)},prev.p.chapter);}
    if(c.p.station)stations.push({id:c.p.station,distance:raw.length});
    const arc=Math.abs(c.turn)*c.radius,arcSteps=Math.max(1,Math.ceil(arc/8)),angle=Math.atan2(b.y-c.cy,b.x-c.cx);
    for(let j=0;j<arcSteps;j++){const t=j/arcSteps;
      push(c.radius>0?{x:c.cx+c.radius*Math.cos(angle+c.turn*t),y:c.cy+c.radius*Math.sin(angle+c.turn*t),z:lerp(c.entry.z,c.exit.z,t)}:c.entry,c.p.chapter);
    }
  }
  // Smooth the elevation before computing motion. Circular filtering keeps
  // the seam's grade continuous, and never follows voxel height stair steps.
  for(let pass=0;pass<12;pass++){
    const z=raw.map(p=>p.z);
    for(let i=0;i<raw.length;i++)raw[i].z=(z[(i+raw.length-1)%raw.length]+z[i]*2+z[(i+1)%raw.length])/4;
  }
  const count=raw.length,chain=[0];
  for(let i=1;i<count;i++)chain[i]=chain[i-1]+Math.hypot(raw[i].x-raw[i-1].x,raw[i].y-raw[i-1].y);
  const total=chain[count-1]+Math.hypot(raw[0].x-raw[count-1].x,raw[0].y-raw[count-1].y);
  const separation=(a:number,b:number)=>{const d=Math.abs(chain[a]-chain[b]);return Math.min(d,total-d);};
  const levels=stations.map(s=>({index:s.distance,z:knots.find(k=>k.station===s.id)!.z}));
  // Fixed, level platforms constrain both sides of the profile. The lower and
  // upper cones keep them level without introducing a steep seam elsewhere.
  for(let i=0;i<count;i++){
    let low=-Infinity,high=Infinity;
    for(const s of levels){const d=separation(i,s.index),ramp=Math.max(0,d-SCENIC_LEVEL_APPROACH)*.025;low=Math.max(low,s.z-ramp);high=Math.min(high,s.z+ramp);}
    if(low>high+.001)throw new Error('Stations are too close for the calm railway grade');
    raw[i].z=Math.max(low,Math.min(high,raw[i].z));
  }
  // The circular minimum envelope is a true Lipschitz projection. Two full
  // traversals in each direction handle the wrap without a vertical kink.
  for(const direction of [1,-1])for(let j=0;j<count*2;j++){
    const i=direction===1?j%count:count-1-j%count,k=(i+direction+count)%count,limit=Math.hypot(raw[k].x-raw[i].x,raw[k].y-raw[i].y)*.025;
    raw[k].z=Math.min(raw[k].z,raw[i].z+limit);
  }
  let distance=0,horizontal=0;
  for(let i=0;i<count;i++){
    const p=raw[i],a=raw[(i+count-1)%count],b=raw[(i+1)%count];
    if(i){distance+=Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z);horizontal+=Math.hypot(p.x-a.x,p.y-a.y);}
    p.distance=distance;p.horizontal=horizontal;
    p.angle=Math.atan2(b.y-a.y,b.x-a.x);p.grade=(b.z-a.z)/Math.max(.001,Math.hypot(b.x-a.x,b.y-a.y));p.pitch=Math.atan(p.grade);
    const ax=p.x-a.x,ay=p.y-a.y,bx=b.x-p.x,by=b.y-p.y;
    p.curvature=2*Math.abs(ax*by-ay*bx)/Math.max(.001,Math.hypot(ax,ay)*Math.hypot(bx,by)*Math.hypot(b.x-a.x,b.y-a.y));
    p.speed=Math.min(132,Math.sqrt(.3*12/Math.max(p.curvature,1e-9)),p.chapter===5||p.chapter===6||p.chapter===12||p.chapter===17?84:132);
  }
  distance+=Math.hypot(raw[0].x-raw.at(-1)!.x,raw[0].y-raw.at(-1)!.y,raw[0].z-raw.at(-1)!.z);
  for(const stop of stations)stop.distance=raw[stop.distance].distance;
  const tiles=new Map<string,number[]>();
  for(let i=0;i<count;i+=4){
    const p=raw[i],b=raw[Math.min(i+4,count)%count],r=320;
    for(let x=Math.floor((Math.min(p.x,b.x)-r)/512);x<=Math.floor((Math.max(p.x,b.x)+r)/512);x++)for(let y=Math.floor((Math.min(p.y,b.y)-r)/512);y<=Math.floor((Math.max(p.y,b.y)+r)/512);y++){
      const key=`${x},${y}`,list=tiles.get(key)||[];list.push(i);tiles.set(key,list);
    }
  }
  let hash=2166136261;for(const p of knots)for(const v of [p.x,p.y,p.z,p.chapter])hash=Math.imul(hash^Math.round(v*100),16777619);
  return {points:raw,length:distance,stations,tiles,hash:(hash>>>0).toString(16)};
}
export function sampleRailAlignment(route:RailAlignment,distance:number):RailSample {
  const s=railWrap(distance,route.length),points=route.points;
  let lo=0,hi=points.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(points[mid].distance<=s)lo=mid;else hi=mid-1;}
  const a=points[lo],b=points[(lo+1)%points.length],end=lo===points.length-1?route.length:b.distance,t=(s-a.distance)/Math.max(.001,end-a.distance);
  return {...a,x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t),distance:s,angle:a.angle+Math.atan2(Math.sin(b.angle-a.angle),Math.cos(b.angle-a.angle))*t,pitch:lerp(a.pitch,b.pitch,t),grade:lerp(a.grade,b.grade,t),curvature:lerp(a.curvature,b.curvature,t),speed:Math.min(a.speed,b.speed)};
}
/** All nearby tiers, rather than only the nearest XY tier. */
export function railColumns(route:RailAlignment,x:number,y:number,radius=256){
  let entries=route.tiles.get(`${Math.floor(x/512)},${Math.floor(y/512)}`)||[];
  if(radius>320){const indices=new Set<number>();
    for(let tx=Math.floor((x-radius)/512);tx<=Math.floor((x+radius)/512);tx++)for(let ty=Math.floor((y-radius)/512);ty<=Math.floor((y+radius)/512);ty++)for(const i of route.tiles.get(`${tx},${ty}`)||[])indices.add(i);
    entries=[...indices];
  }
  const result:{distance:number;side:number;z:number;sample:RailSample}[]=[];
  for(const i of entries){const a=route.points[i],b=route.points[Math.min(i+4,route.points.length)%route.points.length],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1))),side=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
    if(side>radius)continue;
    const end=i+4>=route.points.length?route.length:b.distance;
    result.push({distance:a.distance+(end-a.distance)*t,side,z:lerp(a.z,b.z,t),sample:a});
  }
  // One nearest projection per continuous run. Keeping neighbouring segment
  // endpoints would create phantom higher floors alongside an inclined deck.
  result.sort((a,b)=>a.distance-b.distance);
  const tiers:typeof result=[];let previous=-Infinity;
  for(const p of result){if(p.distance-previous<128&&tiers.length){if(p.side<tiers.at(-1)!.side)tiers[tiers.length-1]=p;}else tiers.push(p);previous=p.distance;}
  if(tiers.length>1&&tiers[0].distance+route.length-tiers.at(-1)!.distance<128){const last=tiers.pop()!;if(last.side<tiers[0].side)tiers[0]=last;}
  return tiers;
}
