import type { FriendsEnvironmentSnapshot } from '../world/FriendsEnvironmentPreview';
import { sampleSoaringAir, soaringAtmosphere, SOARING_UNITS_PER_METRE as U, type SoaringHeight } from '../world/FriendsSoaringWeather';
import type { MultiplayerInputFrame } from './protocol';
import type { PlayerMotionState, PlayerCollisionResolver, PlayerFloorResolver, PlayerMovementEnvironment } from './playerMovement';

export type FriendsSoaringState = {
  phase:'inflating'|'ready'|'flying'|'collapsed'|'landed';
  inflation:number; heading:number; bank:number; airspeed:number; brake:number;
  sink:number; lift:number; climb:number; agl:number; windX:number; windY:number;
  turbulence:number; stall:number; flare:number; recoveryMs?:number; message:string;
};
export type SoaringEnvironment = {
  timeMs:number; worldTimeMs?:number; weather?:FriendsEnvironmentSnapshot;
  height?:SoaringHeight; available?:boolean;
  canopyBlocked?:(x:number,y:number,z:number)=>boolean;
};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const soaringAirborne=(s?:FriendsSoaringState)=>s?.phase==='flying'||s?.phase==='collapsed';
export const soaringSuspended=(s?:FriendsSoaringState)=>soaringAirborne(s)||Boolean(s?.phase==='inflating'&&s.agl>.5);
export function createSoaringState(heading:number):FriendsSoaringState {
  return {phase:'inflating',inflation:0,heading,bank:0,airspeed:0,brake:0,sink:1.05,
    lift:0,climb:0,agl:0,windX:0,windY:0,turbulence:0,stall:0,flare:0,recoveryMs:0,
    message:'Inflating wing · face into wind'};
}

/** Owns airborne movement. Ground preparation uses the ordinary controller
 * with jumping/thrust disabled. Stale inputs leave a trimmed glider flying. */
export function advanceFriendsSoaring(p:PlayerMotionState,input:MultiplayerInputFrame|undefined,seconds:number,env:PlayerMovementEnvironment,
  collide:PlayerCollisionResolver|undefined,floorAt:PlayerFloorResolver|undefined):boolean {
  if(!env.soaring||seconds<=0)return false;
  if(input&&!input.friendsGlider)delete p.gliderNeedsStow;
  if(p.gliderNeedsStow&&!p.friendsSoaring)return false;
  const floor=floorAt?.(p,19);
  const grounded=floor!==undefined&&Math.abs(p.z-floor)<=.25&&p.verticalVelocity<=0;
  const overhead=env.overhead?.(p)??Infinity;
  const water=env.waterAt?.(p.x,p.y,p.z+20);
  if(p.friendsDevFlight||p.swimming){delete p.friendsSoaring;return false;}
  if(!p.friendsSoaring){
    if(env.soaring.available===false||!input?.friendsGlider)return false;
    if(water&&p.z<water.level+5||overhead-p.z<165)return false;
    if(!grounded&&(floor===undefined||p.z-floor<120))return false;
    p.friendsSoaring=createSoaringState(input.aimAngle/65535*Math.PI*2);
  }
  // A menu, delayed packet or tool change cannot cut a suspended wing.
  if(input&&!input.friendsGlider&&grounded){delete p.friendsSoaring;return false;}
  const s=p.friendsSoaring;
  const air=sampleSoaringAir(p.x,p.y,p.z,env.soaring.timeMs,env.soaring.height,
    soaringAtmosphere(env.soaring.timeMs,env.soaring.worldTimeMs,env.soaring.weather));
  Object.assign(s,{windX:air.x,windY:air.y,lift:air.up,turbulence:air.turbulence,
    agl:Math.max(0,(p.z-(floor??air.ground))/U)});
  if(input)p.angle=input.aimAngle/65535*Math.PI*2;
  if(s.phase==='landed'){
    s.inflation=Math.max(0,s.inflation-seconds);
    s.climb=p.verticalVelocity/U;
    return false;
  }
  if(s.phase==='collapsed'){
    p.jetActive=p.sprinting=p.sliding=p.crouching=false;
    const recoveryClear=!canopyContact(p,s,env)&&overhead-p.z>=165;
    s.recoveryMs=recoveryClear&&!input?.jetHeld?Math.min(1200,(s.recoveryMs??0)+seconds*1000):0;
    s.message=recoveryClear?'Wing contact · release deep brake to recover':'Wing contact · descending until clear of terrain';
    advanceDeployment(p,s,seconds,env,collide,floorAt,true);
    if(s.phase==='collapsed'&&(s.recoveryMs??0)>=1200&&s.agl>=5){
      s.phase='inflating';s.inflation=.15;s.recoveryMs=0;s.message='Recovering wing · keep brakes released';
    }
    return true;
  }
  if(s.phase!=='flying'){
    s.heading=input?p.angle:s.heading;
    if(overhead-p.z<165||canopyContact(p,s,env)){
      s.inflation=0;s.phase='inflating';s.message='Find open ground · wing needs overhead clearance';
      if(!grounded){advanceDeployment(p,s,seconds,env,collide,floorAt,false);return true;}
      return false;
    }
    s.inflation=clamp(s.inflation+seconds/(grounded?1.8:.85),0,1);
    s.phase=s.inflation>=1?'ready':'inflating';
    const along=((p.velocityX??0)/U-air.x)*Math.cos(s.heading)+((p.velocityY??0)/U-air.y)*Math.sin(s.heading);
    s.airspeed=Math.max(0,along);
    const ahead=floorAt?.({x:p.x+Math.cos(s.heading)*90,y:p.y+Math.sin(s.heading)*90,z:p.z},19);
    const downhill=ahead!==undefined&&floor!==undefined&&floor-ahead>=6;
    const headwind=-(air.x*Math.cos(s.heading)+air.y*Math.sin(s.heading));
    s.message=s.phase==='inflating'?'Inflating wing · face into wind':headwind<1?'Turn into wind before running':
      !downhill&&grounded?'Find a clear downhill slope':'Wing ready · run forward downhill';
    const footLaunch=grounded&&downhill&&headwind>=1&&along>=7&&Boolean((input?.movement??0)&1);
    const airLaunch=!grounded&&(s.agl>=10||s.agl>=1&&along>=7);
    if(s.phase==='ready'&&(footLaunch||airLaunch)){
      s.phase='flying';s.airspeed=clamp(Math.max(8,along),8,13.5);s.message='Gliding';
      if(grounded){p.verticalVelocity=0;p.z+=2;}
      p.coyoteMs=p.jumpBufferMs=0;
    }else{
      if(!grounded){advanceDeployment(p,s,seconds,env,collide,floorAt,false);return true;}
      return false;
    }
  }
  p.sprinting=p.sliding=p.crouching=p.jetActive=false;
  p.airborneMs=(p.airborneMs??0)+seconds*1000;p.groundedMs=0;
  const turn=Number(Boolean((input?.movement??0)&8))-Number(Boolean((input?.movement??0)&4));
  const brake=input?.jetHeld?1:((input?.movement??0)&2)?.55:0;
  s.brake+=(brake-s.brake)*(1-Math.exp(-seconds*5));
  s.bank+=(turn*.60-s.bank)*(1-Math.exp(-seconds*2.8));
  s.stall=clamp(s.stall+(s.brake>.87?seconds:-seconds*2),0,4);
  const stalled=s.stall>2.4;
  const target=stalled?4.5:(input?.sprinting?13.5:9.5)-s.brake*3.5;
  const prior=s.airspeed;
  s.airspeed+=(target-s.airspeed)*(1-Math.exp(-seconds*1.25));
  s.heading+=9.81*Math.tan(s.bank)/Math.max(5,s.airspeed)*seconds;
  s.heading=Math.atan2(Math.sin(s.heading),Math.cos(s.heading));
  s.sink=1.05+.045*(s.airspeed-9.5)**2+Math.abs(Math.tan(s.bank))*.85+(stalled?5:0);
  // A flare trades existing speed for reduced sink; it does not grant thrust.
  s.flare=brake>.8&&s.agl<8?Math.max(0,(prior-s.airspeed)/Math.max(.001,seconds))*.45:0;
  p.verticalVelocity+=((air.up-s.sink+s.flare)*U-p.verticalVelocity)*(1-Math.exp(-seconds*2.4));
  s.climb=p.verticalVelocity/U;
  s.message=stalled?'STALL · release brakes':s.agl<8?'Landing approach · hold brake to flare':
    air.up>1.3?'Rising air · stay in lift':air.turbulence>.5?'Lee turbulence · move to windward slope':'Gliding · search for lift';
  p.velocityX=(Math.cos(s.heading)*s.airspeed+air.x)*U;
  p.velocityY=(Math.sin(s.heading)*s.airspeed+air.y)*U;
  moveAirborne(p,s,seconds,env,collide,floorAt,true);
  return true;
}

/** Same banked curved airfoil as the renderer, sampled across span and chord.
 * This catches leading/trailing-edge contacts, not just the pilot and tips. */
function canopyContact(p:PlayerMotionState,s:FriendsSoaringState,env:PlayerMovementEnvironment){
  const blocked=env.soaring?.canopyBlocked;
  if(!blocked)return false;
  const bank=s.phase==='flying'?s.bank*.75:0,c=Math.cos(bank),sn=Math.sin(bank);
  const fx=Math.cos(s.heading),fy=Math.sin(s.heading);
  for(let i=-3;i<=3;i++)for(const chord of [-18,18]){
    const u=i/3,x=chord-Math.abs(u)*12,z=u*82,h=121+Math.sqrt(Math.max(0,1-u*u))*29;
    const side=z*c+h*sn,height=h*c-z*sn;
    if(blocked(p.x+fx*x-fy*side,p.y+fy*x+fx*side,p.z+height))return true;
  }
  return false;
}
function advanceDeployment(p:PlayerMotionState,s:FriendsSoaringState,seconds:number,env:PlayerMovementEnvironment,
  collide:PlayerCollisionResolver|undefined,floorAt:PlayerFloorResolver|undefined,collapsed:boolean){
  p.jetActive=p.sprinting=p.sliding=p.crouching=false;
  p.coyoteMs=p.jumpBufferMs=0;p.airborneMs=(p.airborneMs??0)+seconds*1000;p.groundedMs=0;
  p.verticalVelocity-=9.81*U*seconds;
  const terminal=(s.lift-(collapsed?12:8))*U,drag=collapsed?1.3:s.inflation*4;
  if(p.verticalVelocity<terminal)p.verticalVelocity+=(terminal-p.verticalVelocity)*(1-Math.exp(-seconds*drag));
  if(collapsed){p.velocityX=(p.velocityX??0)*Math.exp(-seconds*.7);p.velocityY=(p.velocityY??0)*Math.exp(-seconds*.7);}
  moveAirborne(p,s,seconds,env,collide,floorAt,false);
  if(s.phase!=='landed'){
    s.airspeed=Math.hypot((p.velocityX??0)/U-s.windX,(p.velocityY??0)/U-s.windY);
    s.sink=Math.max(0,s.lift-s.climb);
  }
}
/** Bounded segments prevent both horizontal and vertical tunnelling. */
function moveAirborne(p:PlayerMotionState,s:FriendsSoaringState,seconds:number,env:PlayerMovementEnvironment,
  collide:PlayerCollisionResolver|undefined,floorAt:PlayerFloorResolver|undefined,inflated:boolean){
  const speed=Math.max(Math.hypot(p.velocityX??0,p.velocityY??0),Math.abs(p.verticalVelocity));
  const steps=Math.max(1,Math.ceil(speed*seconds/8));
  for(let i=0;i<steps;i++){
    const dt=seconds/steps,oldX=p.x,oldY=p.y;
    p.x+=(p.velocityX??0)*dt;p.y+=(p.velocityY??0)*dt;
    if(collide?.(p,19)){
      p.x=oldX;p.y=oldY;p.velocityX=p.velocityY=0;
      if(inflated){collapseWing(p,s,'Wing caught terrain · release brakes to recover');break;}
      if(s.phase!=='collapsed')collapseWing(p,s,'Deployment interrupted · release brakes to recover');
    }
    const bottom=floorAt?.(p,19),nextZ=p.z+p.verticalVelocity*dt;
    const roof=env.overhead?.(p)??Infinity;
    if(inflated&&(roof-p.z<120||canopyContact(p,s,env))){collapseWing(p,s,'Wing contact · release brakes to recover');break;}
    const water=env.waterAt?.(p.x,p.y,nextZ+20);
    if(bottom!==undefined&&nextZ<=bottom&&(!water||bottom>=water.level)){
      p.z=bottom;finishLanding(p,s,env);return;
    }
    if(water&&nextZ<=water.level){
      p.z=water.level;finishLanding(p,s,env);delete p.friendsSoaring;p.gliderNeedsStow=true;return;
    }
    // An existing high position may descend naturally, never snap to a cap.
    if(nextZ>env.ceiling&&nextZ>p.z){p.z=Math.max(p.z,env.ceiling);p.verticalVelocity=0;}
    else p.z=nextZ;
    if(p.z+50>roof){p.z=Math.min(p.z,roof-50);p.verticalVelocity=Math.min(0,p.verticalVelocity);}
  }
  s.climb=p.verticalVelocity/U;
  const floor=floorAt?.(p,19);
  if(floor!==undefined)s.agl=Math.max(0,(p.z-floor)/U);
}
function collapseWing(p:PlayerMotionState,s:FriendsSoaringState,message:string){
  s.phase='collapsed';s.inflation=0;s.bank=0;s.stall=0;s.flare=0;s.recoveryMs=0;s.message=message;
  p.verticalVelocity=Math.min(-6,p.verticalVelocity);p.jetActive=false;
  p.coyoteMs=p.jumpBufferMs=0;
}
function finishLanding(p:PlayerMotionState,s:FriendsSoaringState,env:PlayerMovementEnvironment){
  const impact=Math.abs(p.verticalVelocity);
  s.phase='landed';s.message=impact>36?'Hard landing · wing down':'Landed · jump or walk freely';
  s.climb=s.bank=s.agl=s.airspeed=0;s.recoveryMs=0;
  p.verticalVelocity=p.velocityX=p.velocityY=0;p.fallPeakZ=p.z;
  p.airborneMs=p.groundedMs=p.jumpBufferMs=p.coyoteMs=0;
  if(impact>36)env.onLanding?.(impact);
}
export function interpolateSoaringState(a:FriendsSoaringState|undefined,b:FriendsSoaringState|undefined,t:number){
  if(!a||!b||a.phase!==b.phase)return b;
  return {...b,heading:a.heading+Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading))*t,
    bank:a.bank+(b.bank-a.bank)*t,inflation:a.inflation+(b.inflation-a.inflation)*t,
    airspeed:a.airspeed+(b.airspeed-a.airspeed)*t,climb:a.climb+(b.climb-a.climb)*t,
    brake:a.brake+(b.brake-a.brake)*t};
}
