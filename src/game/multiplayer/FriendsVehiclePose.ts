export type VehiclePoint={x:number;y:number;z:number};
export type VehiclePose=VehiclePoint&{angle:number;pitch?:number};
/** Unbanked rigid pose. Keeping roll zero gives walkers and seats a stable up. */
export function vehicleWorldPoint(v:VehiclePose,p:VehiclePoint):VehiclePoint {
  const c=Math.cos(v.angle),s=Math.sin(v.angle),cp=Math.cos(v.pitch||0),sp=Math.sin(v.pitch||0),forward=p.x*cp-p.z*sp;
  return {x:v.x+forward*c-p.y*s,y:v.y+forward*s+p.y*c,z:v.z+p.x*sp+p.z*cp};
}
export function vehicleLocalPoint(v:VehiclePose,p:VehiclePoint):VehiclePoint {
  const c=Math.cos(v.angle),s=Math.sin(v.angle),cp=Math.cos(v.pitch||0),sp=Math.sin(v.pitch||0),dx=p.x-v.x,dy=p.y-v.y,dz=p.z-v.z,f=dx*c+dy*s;
  return {x:f*cp+dz*sp,y:-dx*s+dy*c,z:-f*sp+dz*cp};
}
export function vehiclePlaneHeight(v:VehiclePose,x:number,y:number,height=0){const forward=(x-v.x)*Math.cos(v.angle)+(y-v.y)*Math.sin(v.angle),cp=Math.cos(v.pitch||0);return v.z+forward*Math.tan(v.pitch||0)+height/cp;}

/** Quaternion in simulation axes, for secured cargo orientation. */
export function vehicleRotation(v:Pick<VehiclePose,'angle'|'pitch'>){
  const a=v.angle/2,p=(v.pitch||0)/2;return {x:Math.sin(a)*Math.sin(p),y:-Math.cos(a)*Math.sin(p),z:Math.sin(a)*Math.cos(p),w:Math.cos(a)*Math.cos(p)};
}
export function composeRotation(a:{x:number;y:number;z:number;w:number},b:{x:number;y:number;z:number;w:number}):[number,number,number,number]{return [a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z];}
