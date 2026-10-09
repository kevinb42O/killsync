import { FRIENDS_CAMPFIRE } from './FriendsRegion';
import { RETREAT_SITES } from './FriendsRetreatSites';

/** Physical flame centres, shared by cooking, sticks and site fuel. Small
 * retreat fires use the same scale as their rendered campfire instance. */
export const COOKING_FIRES=[
  {id:FRIENDS_CAMPFIRE.id,x:FRIENDS_CAMPFIRE.x,y:FRIENDS_CAMPFIRE.y,z:FRIENDS_CAMPFIRE.z,scale:1},
  ...RETREAT_SITES.filter(s=>s.kind==='fire').map(s=>({id:s.id,x:s.x,y:s.y,z:s.z,scale:.27})),
];
export type CookingFire=typeof COOKING_FIRES[number];
export function isRoastingSeat(seat:{vehicleId:string;index:number}|undefined){return Boolean(seat&&COOKING_FIRES.some(f=>f.id===seat.vehicleId));}
export function cookingFireFor(player:{x:number;y:number;z:number;friendsSeat?:{vehicleId:string;index:number}},activeSites?:readonly string[]):CookingFire|undefined{
  let nearest:CookingFire|undefined,distance=Infinity;
  for(const f of COOKING_FIRES){
    if(f.id!==FRIENDS_CAMPFIRE.id&&activeSites&&!activeSites.includes(f.id))continue;
    if(Math.abs(player.z-f.z)>128)continue;
    const d=Math.hypot(player.x-f.x,player.y-f.y,player.z-f.z);
    if(d<(f.scale===1?260:180)&&d<distance){nearest=f;distance=d;}
  }
  return nearest;
}
