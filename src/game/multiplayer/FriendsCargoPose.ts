export type CargoRotation = {x:number;y:number;z:number;w:number};
type CargoPose = {x:number;y:number;z:number;angle:number;orientation?:[number,number,number,number]};
/** Upswept rocker skids: the collision hull and visible shell share this profile. */
export const CARGO_SKID_PROFILE = [[20,16,0],[36,28,24],[36,28,48]] as const;
export function cargoHullPoints(c?:CargoPose){
  return CARGO_SKID_PROFILE.flatMap(([x,y,z])=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy])=>{
    const p={x:x*sx,y:y*sy,z};return c?cargoWorldPoint(c,p):p;
  }));
}
export function cargoRotation(c:Pick<CargoPose,'angle'|'orientation'>):CargoRotation {
  return c.orientation ? {x:c.orientation[0],y:c.orientation[1],z:c.orientation[2],w:c.orientation[3]} : {x:0,y:0,z:Math.sin(c.angle/2),w:Math.cos(c.angle/2)};
}
export function yawCargoOrientation(c:Pick<CargoPose,'angle'|'orientation'>,angle:number):[number,number,number,number]{
  const q=cargoRotation(c),s=Math.sin(angle/2),r=Math.cos(angle/2);return [r*q.x-s*q.y,r*q.y+s*q.x,r*q.z+s*q.w,r*q.w-s*q.z];
}
export function rotateCargoVector(q:CargoRotation,p:{x:number;y:number;z:number}) {
  const tx=2*(q.y*p.z-q.z*p.y),ty=2*(q.z*p.x-q.x*p.z),tz=2*(q.x*p.y-q.y*p.x);
  return {x:p.x+q.w*tx+q.y*tz-q.z*ty,y:p.y+q.w*ty+q.z*tx-q.x*tz,z:p.z+q.w*tz+q.x*ty-q.y*tx};
}
export function cargoLocalPoint(c:CargoPose,p:{x:number;y:number;z:number}) {
  const q=cargoRotation(c);return rotateCargoVector({x:-q.x,y:-q.y,z:-q.z,w:q.w},{x:p.x-c.x,y:p.y-c.y,z:p.z-c.z});
}
export function cargoWorldPoint(c:CargoPose,p:{x:number;y:number;z:number}) {
  const v=rotateCargoVector(cargoRotation(c),p);return {x:c.x+v.x,y:c.y+v.y,z:c.z+v.z};
}
export function cargoBounds(c:CargoPose) {
  const points=cargoHullPoints(c);
  return {minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};
}
export function interpolateCargoRotation(a:CargoPose,b:CargoPose,t:number):[number,number,number,number] {
  const q=cargoRotation(a),r=cargoRotation(b);let dot=q.x*r.x+q.y*r.y+q.z*r.z+q.w*r.w;
  const sign=dot<0?-1:1;dot=Math.abs(dot);
  let u=1-t,v=t;
  if(dot<.9995){const angle=Math.acos(Math.min(1,dot)),s=Math.sin(angle);u=Math.sin((1-t)*angle)/s;v=Math.sin(t*angle)/s;}
  const out={x:q.x*u+r.x*v*sign,y:q.y*u+r.y*v*sign,z:q.z*u+r.z*v*sign,w:q.w*u+r.w*v*sign},n=Math.hypot(out.x,out.y,out.z,out.w);
  return [out.x/n,out.y/n,out.z/n,out.w/n];
}
