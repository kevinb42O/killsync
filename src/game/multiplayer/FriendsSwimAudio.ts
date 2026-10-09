import type { FriendsTerrain } from '../world/FriendsTerrain';
import { friendsLiveWaterAt } from '../world/FriendsFloodWater';
import { friendsWaterAt } from '../world/FriendsWaterSurface';
import { firstPersonEyeZ } from './FirstPersonEye';

/** Listen from the player's head, rather than a dive-button/buoyancy flag.
 * A small entry/exit margin prevents sound chatter at the waterline. */
export function friendsListenerSubmerged(actor:{x:number;y:number;z:number;sliding?:boolean;motion?:{swimming?:boolean}},terrain?:FriendsTerrain,wasSubmerged=false){
 const eye=firstPersonEyeZ(actor),water=terrain?friendsLiveWaterAt(terrain,actor.x,actor.y,eye):friendsWaterAt(actor.x,actor.y);
 return Boolean(water&&water.level-eye>(wasSubmerged?.25:1.5));
}
