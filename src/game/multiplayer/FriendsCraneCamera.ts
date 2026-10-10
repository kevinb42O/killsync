import { craneCargoAnchor, craneOutlet, type FriendsCraneState } from './FriendsCrane';
import type { PhysicalCargo } from './FriendsHauling';
export type CraneCameraOptions={mode:'load'|'overview';orbit:number;elevation?:number;manualOrbit?:boolean;distance:number;light?:boolean};
export const DEFAULT_CRANE_CAMERA:CraneCameraOptions={mode:'load',orbit:Math.PI/4,elevation:Math.atan(.65),distance:280,light:true};
export const CRANE_CAMERA_MIN_ELEVATION=-Math.PI/6,CRANE_CAMERA_MAX_ELEVATION=Math.PI*4/9;
/** Drag the scene horizontally and lift the viewpoint by dragging upwards. */
export function dragCraneCamera(options:CraneCameraOptions,dx:number,dy:number):CraneCameraOptions {
  const orbit=options.orbit-dx*.006;
  return {...options,orbit:Math.atan2(Math.sin(orbit),Math.cos(orbit)),elevation:Math.max(CRANE_CAMERA_MIN_ELEVATION,Math.min(CRANE_CAMERA_MAX_ELEVATION,(options.elevation??Math.atan(.65))-dy*.006)),manualOrbit:true};
}
export function craneCameraPose(crane:FriendsCraneState,cargo:PhysicalCargo|undefined,options:CraneCameraOptions,occlusion?:(target:{x:number;y:number;z:number},eye:{x:number;y:number;z:number})=>number|undefined) {
  const outlet=craneOutlet(crane),hook=cargo?craneCargoAnchor(cargo,crane):{...outlet,z:outlet.z-crane.length};
  const load={x:hook.x,y:hook.y,z:hook.z-(cargo?20:8)};
  const bottom=Math.min(crane.z,load.z),top=outlet.z+32;
  const target=options.mode==='load'?load:{x:(crane.x+outlet.x)/2,y:(crane.y+outlet.y)/2,z:(bottom+top)/2};
  const span=options.mode==='overview'?Math.hypot(outlet.x-crane.x,outlet.y-crane.y,top-bottom):0;
  const distance=Math.max(160,Math.min(12000,Math.max(options.distance,span*1.5+140)));
  // World-relative orbit stays steady while the boom slews. Keeping the full
  // load plus landing context visible is more useful than a hook-mounted view.
  const elevation=Math.max(CRANE_CAMERA_MIN_ELEVATION,Math.min(CRANE_CAMERA_MAX_ELEVATION,options.elevation??Math.atan(.65)));
  const horizontal=distance*Math.cos(elevation)/Math.cos(Math.atan(.65)),height=distance*Math.sin(elevation)/Math.cos(Math.atan(.65));
  let best={target,eye:{x:target.x+Math.cos(options.orbit)*horizontal,y:target.y+Math.sin(options.orbit)*horizontal,z:target.z+height},distance},bestClearance=-1;
  for(const offset of options.manualOrbit?[0]:[0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI]){
    const a=options.orbit+offset,eye={x:target.x+Math.cos(a)*horizontal,y:target.y+Math.sin(a)*horizontal,z:target.z+height};
    const hit=occlusion?.(target,eye);if(hit===undefined)return {target,eye,distance};
    if(hit>bestClearance){const safeDistance=Math.max(.001,hit-Math.min(12,hit*.5)),factor=Math.min(1,safeDistance/Math.hypot(eye.x-target.x,eye.y-target.y,eye.z-target.z));best={target,eye:{x:target.x+(eye.x-target.x)*factor,y:target.y+(eye.y-target.y)*factor,z:target.z+(eye.z-target.z)*factor},distance:distance*factor};bestClearance=hit;}
  }
  return best;
}
