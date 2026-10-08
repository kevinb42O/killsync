import { craneCargoAnchor, craneOutlet, type FriendsCraneState } from './FriendsCrane';
import type { PhysicalCargo } from './FriendsHauling';
export type CraneCameraOptions={mode:'load'|'overview';orbit:number;distance:number;light?:boolean};
export const DEFAULT_CRANE_CAMERA:CraneCameraOptions={mode:'load',orbit:Math.PI/4,distance:280,light:true};
export function craneCameraPose(crane:FriendsCraneState,cargo:PhysicalCargo|undefined,options:CraneCameraOptions,occlusion?:(target:{x:number;y:number;z:number},eye:{x:number;y:number;z:number})=>number|undefined) {
  const outlet=craneOutlet(crane),hook=cargo?craneCargoAnchor(cargo,crane):{...outlet,z:outlet.z-crane.length};
  const load={x:hook.x,y:hook.y,z:hook.z-(cargo?20:8)};
  const target=options.mode==='load'?load:{x:(crane.x+load.x)/2,y:(crane.y+load.y)/2,z:(outlet.z+load.z)/2};
  const span=options.mode==='overview'?Math.hypot(outlet.x-crane.x,outlet.y-crane.y,outlet.z-load.z):0;
  const distance=Math.max(160,Math.min(6000,Math.max(options.distance,span*1.5+140)));
  // World-relative orbit stays steady while the boom slews. Keeping the full
  // load plus landing context visible is more useful than a hook-mounted view.
  let best={target,eye:{x:target.x+Math.cos(options.orbit)*distance,y:target.y+Math.sin(options.orbit)*distance,z:target.z+distance*.65},distance},bestClearance=-1;
  for(const offset of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI]){
    const a=options.orbit+offset,eye={x:target.x+Math.cos(a)*distance,y:target.y+Math.sin(a)*distance,z:target.z+distance*.65};
    const hit=occlusion?.(target,eye);if(hit===undefined)return {target,eye,distance};
    if(hit>bestClearance){const factor=Math.max(.06,(hit-12)/Math.hypot(eye.x-target.x,eye.y-target.y,eye.z-target.z));best={target,eye:{x:target.x+(eye.x-target.x)*factor,y:target.y+(eye.y-target.y)*factor,z:target.z+(eye.z-target.z)*factor},distance:distance*factor};bestClearance=hit;}
  }
  return best;
}
