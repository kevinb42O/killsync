import type { CargoStaticCollider } from './FriendsCargoPhysics';
export type Point={x:number;y:number;z:number};
export type OBB={centre:Point;axes:Point[];half:number[]};
export const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y+a.z*b.z;
export const cross=(a:Point,b:Point)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
export function boxOBB(b:CargoStaticCollider):OBB {
  const c=Math.cos(b.angle??0),s=Math.sin(b.angle??0);
  return {centre:{x:b.x,y:b.y,z:b.z+b.h/2},axes:[{x:c,y:s,z:0},{x:-s,y:c,z:0},{x:0,y:0,z:1}],half:[b.w/2,b.d/2,b.h/2]};
}
export function overlapOBB(a:OBB,b:OBB,margin=.2) {
  const d={x:b.centre.x-a.centre.x,y:b.centre.y-a.centre.y,z:b.centre.z-a.centre.z};
  const axes=[...a.axes,...b.axes,...a.axes.flatMap(v=>b.axes.map(w=>cross(v,w)))];
  for(const axis of axes){const n=Math.hypot(axis.x,axis.y,axis.z);if(n<1e-7)continue;
    const extent=a.axes.reduce((sum,v,i)=>sum+Math.abs(dot(axis,v))*a.half[i],0)+b.axes.reduce((sum,v,i)=>sum+Math.abs(dot(axis,v))*b.half[i],0);
    if(Math.abs(dot(d,axis))>=extent-margin*n)return false;
  }
  return true;
}
