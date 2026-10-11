import { FRIENDS_COASTAL_PIER as dock } from './FriendsCoastalPier';
import type { VehiclePose } from '../multiplayer/FriendsVehiclePose';
import { vehicleLocalPoint, vehiclePlaneHeight } from '../multiplayer/FriendsVehiclePose';
export const FISHING_BOAT_ID = 'west-beach-fishing-boat';
export const FISHING_BOAT_HOME = { x: dock.x-dock.sections*dock.sectionLength-120, y:dock.y, angle:-Math.PI/2 };
export const FISHING_BOAT_LENGTH=480, FISHING_BOAT_WIDTH=192, FISHING_BOAT_DECK=27;
/** Shared host/client pose keeps players, the walking floor and model together. */
export function fishingBoatHeave(x:number,y:number,seconds:number){
  x*=1.75;y*=1.75;
  return 5*(Math.sin(x*.0051+y*.0037-seconds*.95)*.60+Math.sin(-x*.0082+y*.0046+seconds*.78)*.28+Math.sin(x*.016+y*.012-seconds*1.7)*.12);
}
export function fishingBoatPitch(seconds:number){return Math.sin(seconds*.78+.6)*.012;}
export function fishingBoatDeckContains(v:VehiclePose,p:{x:number;y:number},margin=0){
  const local=vehicleLocalPoint(v,{...p,z:vehiclePlaneHeight(v,p.x,p.y)});
  // The real bow tapers; do not provide a rectangular invisible platform.
  const halfWidth=local.x>125?66-(local.x-125)*.40:66;
  return local.x>=-198+margin&&local.x<=220-margin&&Math.abs(local.y)<=halfWidth-margin;
}
/** Measured outer wooden posts in the bundled Poly Haven pier, not deck bounds. */
export const FISHING_BOAT_MOORINGS = [
  {dock:{x:1810,y:5988,z:-88},post:{x:1816,y:5988,z:-88},boat:{x:-149,y:71,z:26}},
  {dock:{x:1810,y:5724,z:-88},post:{x:1816,y:5724,z:-88},boat:{x:18,y:77,z:25}},
] as const;
export const FISHING_BOAT_HELM={x:62,y:-22,z:0} as const;
// Walls leave a real 64-unit rear doorway and a usable cabin interior.
export const FISHING_BOAT_COLLIDERS = [
  {x:60,y:-47,hx:68,hy:1.5,h:108}, {x:60,y:47,hx:68,hy:1.5,h:108},
  {x:123,y:0,hx:2,hy:48,h:108},
  {x:-6,y:-40,hx:2,hy:8,h:108}, {x:-6,y:40,hx:2,hy:8,h:108},
  {x:-102,y:0,hx:30,hy:24,h:27}, {x:107,y:-22,hx:13,hy:20,h:28},
] as const;
export function fishingBoatInteraction(v:VehiclePose&{pilotId?:string},p:{id:string;x:number;y:number;z:number;friendsSeat?:unknown;friendsDevFlight?:boolean}){
  if(v.pilotId===p.id)return true;
  if(v.pilotId||p.friendsSeat||p.friendsDevFlight)return false;
  const local=vehicleLocalPoint(v,p);
  return fishingBoatDeckContains(v,p)&&Math.abs(local.z)<8&&local.x>10&&local.x<80&&Math.abs(local.y)<30
    &&Math.hypot(local.x-FISHING_BOAT_HELM.x,local.y-FISHING_BOAT_HELM.y)<52;
}
/** Curved, feathered seabed hollow around the berth. Only lowers the natural
 * shelf; shared by water depth, voxel collision and every terrain mesh LOD. */
export function fishingBoatSeabed(x:number,y:number,height:number){
  const along=y-FISHING_BOAT_HOME.y;
  // Cheap broad phase; the actual boundary is a warped ellipse, never a box.
  if(Math.abs(along)>1080||x<920||x>2060)return height;
  const centre=1496+38*Math.sin(along/420)-22*Math.sin(along/190);
  const across=(x-centre)/432,longitudinal=along/900;
  const radius=Math.hypot(across,longitudinal)*(1+.035*Math.sin(along/230+across*2.4));
  if(radius>=1.14)return height;
  const t=Math.max(0,Math.min(1,(radius-.48)/.66));
  const weight=1-t*t*(3-2*t);
  // A rounded bowl with subtle bed variation, rather than a flat cut floor.
  const bed=-336+76*radius*radius+9*Math.sin(along/180+across*3)+6*Math.cos(along/310-across*2);
  return Math.min(height,height+(bed-height)*weight);
}
