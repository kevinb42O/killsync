import type { FishingEnvironment, FishingPoint } from './FriendsFishing';
import type { FishSpecies } from './FriendsFishSpecies';

export const GIANT_SHARK_LENGTH_CM=600;
export const SHARK_TETHER_RANGE=1600;
export const isGiantShark=(fish:{species?:FishSpecies;size:number})=>fish.species==='shark'&&fish.size*85>=GIANT_SHARK_LENGTH_CM;
export const sharkFatigue=(effort:number,duration:number)=>Math.max(0,Math.min(1,effort/Math.max(1,duration)));
/** Host time animates resistance; only active reeling effort exhausts the fish. */
export function sharkFight(fatigue:number,age:number,id:number){
  const remaining=(1-fatigue)**1.4;
  const run=Math.max(0,Math.sin(age*.0019+id*.73)+.25*Math.sin(age*.0031+id)) / 1.25;
  return {run:run*remaining,side:Math.sin(age*.0011+id)*remaining,load:remaining*(.35+.65*run)};
}
export function sharkWaterPose(env:FishingEnvironment,point:FishingPoint,size:number,angle:number,dive=0):FishingPoint|undefined {
  const water=env.water?.(point.x,point.y);if(!water)return;
  const length=34*size,width=length*.74,depth=length*.62+dive;
  // The imported cartoon shark's fin span is about .72 of its length.
  // Include that span and its submerged belly, not just the body centre.
  // Inflated hull checks cover gaps between the footprint samples.
  const ca=Math.cos(angle),sa=Math.sin(angle),margin=Math.hypot(length/16,width/8);
  for(let i=-4;i<=4;i++)for(let j=-2;j<=2;j++){
    const along=i*length/8,across=j*width/4;
    const x=point.x+ca*along-sa*across,y=point.y+sa*along+ca*across,w=env.water?.(x,y);
    if(!w||Math.abs(w.level-water.level)>1||w.depth<depth||env.waterObstacle?.(x,y,margin))return;
    if(env.waterClearance){
      if(!env.waterClearance(x,y,w.level-depth,w.level+length*.15,margin))return;
    }else{
      const floor=env.floor(x,y,w.level+length*.15,0);
      if(floor!==undefined&&floor>w.level-depth)return;
      if(env.blocked({x:point.x,y:point.y,z:w.level+2},{x,y,z:w.level+2}))return;
    }
  }
  // The belly stays underwater; the dorsal fin remains visible.
  return {x:point.x,y:point.y,z:water.level-length*.25-dive};
}
export function sharkWaterStep(env:FishingEnvironment,from:FishingPoint,to:FishingPoint,size:number,angle:number,dive=0){
  const distance=Math.hypot(to.x-from.x,to.y-from.y),steps=Math.max(1,Math.ceil(distance/12));
  let last: FishingPoint|undefined;
  for(let i=1;i<=steps;i++){
    const t=i/steps,pose=sharkWaterPose(env,{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z},size,angle,dive);
    if(!pose||env.blocked(last??from,pose))return last;
    last=pose;
  }
  return last;
}
/** Prefer water alongside the angler, then progressively farther offshore. */
export function sharkLanding(env:FishingEnvironment,actor:FishingPoint,toward:FishingPoint,size:number){
  const direction=Math.atan2(toward.y-actor.y,toward.x-actor.x),near=Math.max(100,34*size*.55+32);
  for(let reach=near;reach<=SHARK_TETHER_RANGE-200;reach+=32)for(const offset of [0,.25,-.25,.5,-.5]){
    const heading=direction+offset,angle=heading+Math.PI/2;
    const point={x:actor.x+Math.cos(heading)*reach,y:actor.y+Math.sin(heading)*reach,z:0};
    const pose=sharkWaterPose(env,point,size,angle);
    if(pose&&!env.blocked({...actor,z:actor.z+26},{...pose,z:pose.z+34*size*.25+2}))return {point:pose,angle};
  }
}
