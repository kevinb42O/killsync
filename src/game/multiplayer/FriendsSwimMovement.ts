import { FRIENDS_TERRAIN_BOTTOM } from '../world/FriendsTerrainLimits';
import type { MultiplayerInputFrame } from './protocol';
import type { PlayerMotionState, PlayerCollisionResolver, PlayerFloorResolver, PlayerMovementEnvironment } from './playerMovement';
import { friendsWaterLevel } from '../world/FriendsWaterSurface';
import { riverWetAt } from '../world/FriendsHydrology';

/** Shared fixed-step controller: neutral buoyancy below the surface, bounded
 * surface buoyancy, camera-directed swimming and real floor/ceiling contacts. */
export function advanceFriendsSwimming(p:PlayerMotionState,input:MultiplayerInputFrame|undefined,seconds:number,
  collision:PlayerCollisionResolver|undefined,floor:PlayerFloorResolver|undefined,environment:PlayerMovementEnvironment){
  const water=environment.waterAt?environment.waterAt(p.x,p.y,p.z+10)?.level:friendsWaterLevel(p.x,p.y),ground=floor?.(p,19);
  if(water===undefined||p.z>=water-10||(ground!==undefined&&ground>=water-24)){
    p.swimming=false;p.swimSubmerged=false;return false;
  }
  if(!p.swimming&&p.verticalVelocity>180)return false;
  const entering=!p.swimming;p.swimming=true;
  if(entering){p.swimSubmerged=p.z<water-35;p.verticalVelocity=Math.max(-120,Math.min(120,p.verticalVelocity));}
  p.sliding=p.crouching=p.jetActive=p.slideHeld=false;
  p.platformVelocityX=p.platformVelocityY=p.platformVelocityZ=0;
  p.airborneMs=p.groundedMs=p.coyoteMs=p.jumpBufferMs=0;
  p.fallPeakZ=undefined;
  p.airActionConsumedSinceGrounded=false;p.jetIgnitedThisAirTime=false;
  p.jetFuel=Math.min(100,(p.jetFuel??100)+50*seconds);
  const down=Boolean(input?.friendsDevFlightDown||input?.sliding),up=Boolean(input?.jetHeld);
  const freshJump=Boolean(input?.jumpPressed&&input.sequence!==p.lastJumpInputSequence);
  if(freshJump){p.lastJumpInputSequence=input!.sequence;p.lastJumpSequence=input!.sequence;}
  if(freshJump&&!down&&p.z>water-26){
    p.swimming=false;p.airActionConsumedSinceGrounded=true;p.verticalVelocity=420;return false;
  }
  const yaw=input?input.aimAngle/65535*Math.PI*2:p.angle;
  const pitch=input?input.aimPitch/65535*(Math.PI*.88)-Math.PI*.44:0;
  const forward=(input?.movement&&input.movement&1?1:0)-(input?.movement&&input.movement&2?1:0);
  const strafe=(input?.movement&&input.movement&8?1:0)-(input?.movement&&input.movement&4?1:0);
  const n=Math.max(1,Math.hypot(forward,strafe)),speed=input?.sprinting?150:110;
  if(down||(forward*Math.sin(pitch)<-.2))p.swimSubmerged=true;
  const cp=p.swimSubmerged?Math.cos(pitch):1;
  const current=riverWetAt(p.x,p.y),drift=current?8+current.roughness*12:0;
  const vx=(Math.cos(yaw)*forward*cp-Math.sin(yaw)*strafe)/n*speed+(current?.tx??0)*drift;
  const vy=(Math.sin(yaw)*forward*cp+Math.cos(yaw)*strafe)/n*speed+(current?.ty??0)*drift;
  const next={x:p.x+vx*seconds,y:p.y+vy*seconds};collision?.(next,19);
  p.velocityX=(next.x-p.x)/seconds;p.velocityY=(next.y-p.y)/seconds;p.x=next.x;p.y=next.y;p.angle=yaw;
  const destination=(environment.waterAt?environment.waterAt(p.x,p.y,p.z+10)?.level:friendsWaterLevel(p.x,p.y))??water;
  let target=down?-95:up?110:p.swimSubmerged?forward*Math.sin(pitch)/n*speed:Math.max(-90,Math.min(90,(destination-18-p.z)*10));
  if(up&&down)target=0;
  p.verticalVelocity+=(target-p.verticalVelocity)*(1-Math.exp(-10*seconds));
  const nextZ=p.z+p.verticalVelocity*seconds;
  const bed=floor?.({...p,z:nextZ},19),ceiling=environment.overhead?.(p);
  p.z=Math.max(bed??FRIENDS_TERRAIN_BOTTOM,Math.min(nextZ,ceiling===undefined?Infinity:ceiling-50,destination-18));
  if(p.z!==nextZ)p.verticalVelocity=0;
  if(p.z>=destination-19&&!down){p.swimSubmerged=false;}
  p.sprinting=Boolean(input?.sprinting);
  return true;
}
