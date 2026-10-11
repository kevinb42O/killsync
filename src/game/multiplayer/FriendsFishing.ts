import { SHARK_TETHER_RANGE, isGiantShark, sharkFatigue, sharkFight, sharkLanding, sharkWaterPose, sharkWaterStep } from './FriendsGiantShark';
import { fishingCatchSpecies, speciesCatchSize, type FishSpecies } from './FriendsFishSpecies';
import { friendsWaterAt, type FriendsWaterSample } from '../world/FriendsWaterSurface';
import type { MultiplayerInputFrame } from './protocol';
import { isRetreatSeat } from '../world/FriendsRetreatSites';
import { isRowboatSeat } from '../world/FriendsFishingDock';
import { firstPersonEyeZ } from './FirstPersonEye';

export const FISHING_TOOL = 7 as const;
export const FISHING_CHARGE_MS = 1200;
const FISHING_GRAVITY = 230;
export const fishingCastPower = (heldMs:number) => Math.max(0,Math.min(1,heldMs/FISHING_CHARGE_MS));
export const FISHING_REEL_MS = 2800;
export const fishingFishReelMs = (size:number) => FISHING_REEL_MS+Math.max(0,size-.5)*1600;
/** Surges give line back, but fade near landing so every held reel finishes. */
export function fishingReelProgress(elapsed:number,duration:number,size:number,empty:boolean) {
  const progress=Math.max(0,Math.min(1,elapsed/duration));
  if(empty||progress>=1)return progress;
  const strength=Math.min(.18,.035+size*.035),envelope=Math.min(1,progress/.15,(1-progress)/.2);
  const surge=Math.max(0,Math.sin(elapsed/2200*Math.PI*2))**2;
  return Math.max(0,progress-strength*envelope*surge);
}
// The line leaves the guides near the end of the forward stroke.
export const FISHING_CAST_RELEASE_MS = 150;
export const fishingEmptyReelMs = (distance:number) => Math.max(1400,Math.min(6500,distance/85*1000));
export const FISHING_BITE_MS = 4000;
export const FISHING_WAIT_MIN_MS = 7000;
export const FISHING_WAIT_MAX_MS = 28000;
export const FISHING_RANGE = 520;
export const LOOSE_FISH_LIMIT = 32;
export const FISH_GROUND_RADIUS = 8;
export const FISH_SIZE_MIN = 0.45;
export const FISH_SIZE_MAX = 4.2;
// The normalized model is 34 world units from nose to tail (2.5 cm per unit).
export const FISH_BASE_LENGTH_CM = 85;
export const fishLengthCm = (size:number) => Math.round(size * FISH_BASE_LENGTH_CM);
export function fishingCatchSize(sample:number) {
  const r=Math.max(0,Math.min(1,sample));
  return r<.985 ? FISH_SIZE_MIN+1.55*(r/.985)**2 : 2+2.2*((r-.985)/.015)**.7;
}
export function fishingSeatAllowed(seat:FishingActor['friendsSeat']) {
  return !seat || isRetreatSeat(seat) || isRowboatSeat(seat);
}
export type FishingPoint = { x:number; y:number; z:number };
export type FishingActor = FishingPoint & { id:string; angle:number; lifeState:string; sliding?:boolean; swimming?:boolean; friendsDevFlight?:boolean; friendsSeat?:{vehicleId:string;index:number} };
export type FishingCast = FishingPoint & { id:number; playerId:string; phase:'casting'|'dry'|'waiting'|'bite'|'reeling'; empty?:boolean; atMs:number; biteAt:number; from:FishingPoint; target:FishingPoint; size:number; species?:FishSpecies; lineLength?:number; velocity?:FishingPoint; flightAt?:number; castAt?:number; castPower?:number; reelDurationMs?:number; reelElapsedMs?:number; reelUpdatedAt?:number; reelActive?:boolean; reelAutomatic?:boolean; sharkAngle?:number; sharkLandingAngle?:number; sharkFatigue?:number; sharkLoad?:number; sharkLanding?:FishingPoint };
export type CaughtFish = FishingPoint & { id:number; size:number; species?:FishSpecies; phase:'held'|'landed'|'air'|'dry'|'swimming'|'fading'; tetheredBy?:string; landedAt?:number; ownerId?:string; caughtBy?:string; atMs:number; angle:number; vx:number; vy:number; vz:number; heldTool?:number; unattendedAt?:number };
export type FishingCharge = { playerId:string; chargeAt:number };
export type FishingSnapshot = { charges?:FishingCharge[]; equipped:string[]; casts:FishingCast[]; fish:CaughtFish[] };
export type FishingEnvironment = {
  water?:(x:number,y:number)=>FriendsWaterSample|undefined;
  floor:(x:number,y:number,z:number,step:number)=>number|undefined;
  blocked:(from:FishingPoint,to:FishingPoint)=>boolean;
  waterObstacle?:(x:number,y:number,margin:number)=>boolean;
  waterClearance?:(x:number,y:number,bottom:number,top:number,radius:number)=>boolean;
  piloting?:(id:string)=>boolean;
  eyeCeiling?:(actor:FishingActor)=>number|undefined;
};
const distance=(a:FishingPoint,b:FishingPoint)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;

/** Only casts and caught fish exist. Timings/ownership are authoritative; rope
 * particles and skeletal animation never enter network state or durable saves. */
export class FriendsFishing {
  private serial=0;
  private casts=new Map<string,FishingCast>();
  private charges=new Map<string,number>();
  private fish:CaughtFish[]=[];
  private equipped:string[]=[];
  private landingRetry=new Map<string,number>();
  private observed=new Map<string,{fire:number;alt:number;aim:boolean}>();
  constructor(private random:()=>number=Math.random){}
  held(id:string){return this.fish.find(f=>f.phase==='held'&&f.ownerId===id);}
  landed(id:string){return this.fish.find(f=>f.phase==='landed'&&f.tetheredBy===id);}
  private water(env:FishingEnvironment,x:number,y:number){return (env.water??friendsWaterAt)(x,y);}
  private allowed(p:FishingActor,env:FishingEnvironment){return p.lifeState==='alive'&&!p.swimming&&!p.friendsDevFlight&&fishingSeatAllowed(p.friendsSeat)&&!env.piloting?.(p.id);}
  private start(p:FishingActor,input:MultiplayerInputFrame,now:number,chargeAt:number,env:FishingEnvironment){
    const angle=input.aimAngle/65535*Math.PI*2,pitch=input.aimPitch/65535*Math.PI*.88-Math.PI*.44;
    const power=fishingCastPower(now-chargeAt),speed=140+power*210;
    // Begin in front of the viewpoint, along the released aim. A waist-height
    // origin lies behind the camera when looking up and visibly drops the
    // bobber off the rod. Sweep this short offset so walls cannot be skipped.
    const eye={x:p.x,y:p.y,z:firstPersonEyeZ(p,env.eyeCeiling?.(p))};
    const direction={x:Math.cos(angle)*Math.cos(pitch),y:Math.sin(angle)*Math.cos(pitch),z:Math.sin(pitch)};
    const offset={x:eye.x+direction.x*6,y:eye.y+direction.y*6,z:eye.z+direction.z*6};
    const from=env.blocked(eye,offset)?eye:offset;
    this.casts.set(p.id,{id:++this.serial,playerId:p.id,...from,from,target:{...from},phase:'casting',atMs:now,castAt:now,castPower:power,biteAt:0,size:0,
      velocity:{x:direction.x*speed,y:direction.y*speed,z:direction.z*speed},flightAt:now+FISHING_CAST_RELEASE_MS});
  }
  private wet(c:FishingCast,env:FishingEnvironment){
    const w=this.water(env,c.x,c.y),floor=env.floor(c.x,c.y,c.z+3,0);
    return Boolean(w&&Math.abs(c.z-(w.level+2))<=3&&(floor===undefined||floor<w.level-1));
  }
  private land(c:FishingCast,point:FishingPoint,env:FishingEnvironment,now:number){
    Object.assign(c,point);c.target={...point};c.velocity=undefined;c.flightAt=undefined;
    c.lineLength=distance(c.from,point)+24;c.atMs=now;c.phase=this.wet(c,env)?'waiting':'dry';
    if(c.phase==='waiting')this.wait(c,now);
  }
  private wait(c:FishingCast,now:number){
    c.phase='waiting';c.atMs=now;c.biteAt=now+FISHING_WAIT_MIN_MS+this.random()*(FISHING_WAIT_MAX_MS-FISHING_WAIT_MIN_MS);
  }
  private fly(c:FishingCast,env:FishingEnvironment,now:number,p:FishingActor){
    if(!c.velocity||now<(c.flightAt??c.atMs))return;
    let remaining=Math.max(0,Math.min(8000,now-(c.flightAt??c.atMs)))/1000;
    // Sweep small segments against both floors and obstacles, including bridges.
    while(remaining>1e-7&&c.phase==='casting'){
      const step=Math.min(1/120,remaining),v=c.velocity!,from={x:c.x,y:c.y,z:c.z};remaining-=step;
      const next={x:c.x+v.x*step,y:c.y+v.y*step,z:c.z+v.z*step-FISHING_GRAVITY*step*step/2};v.z-=FISHING_GRAVITY*step;
      const reach=Math.hypot(next.x-c.from.x,next.y-c.from.y);
      if(reach>FISHING_RANGE){next.x=c.from.x+(next.x-c.from.x)*FISHING_RANGE/reach;next.y=c.from.y+(next.y-c.from.y)*FISHING_RANGE/reach;v.x=v.y=0;}
      const w=this.water(env,next.x,next.y),floor=env.floor(next.x,next.y,Math.max(from.z,next.z)+3,0);
      const surface=w&&(floor===undefined||floor<w.level-1)?w.level:floor;
      let end=next,landed=false;
      if(surface!==undefined&&from.z>=surface+2&&next.z<=surface+2){
        const t=Math.max(0,Math.min(1,(from.z-surface-2)/(from.z-next.z||1)));
        end={x:mix(from.x,next.x,t),y:mix(from.y,next.y,t),z:surface+2};landed=true;
      }
      // Stop on the near side of the first wall; never reject the cast outright.
      const length=distance(from,end),probe=!landed&&length>.001?{
        x:end.x+(end.x-from.x)*2/length,y:end.y+(end.y-from.y)*2/length,z:end.z+(end.z-from.z)*2/length
      }:end;
      if(env.blocked(from,probe)){
        let lo=0,hi=1;
        for(let i=0;i<10;i++){const t=(lo+hi)/2,point={x:mix(from.x,probe.x,t),y:mix(from.y,probe.y,t),z:mix(from.z,probe.z,t)};if(env.blocked(from,point))hi=t;else lo=t;}
        // World raycasts allow a small endpoint margin. Back off far enough
        // to stay outside the solid cell before dropping down its near face.
        const swept=Math.max(.001,distance(from,probe)),safe=Math.max(0,Math.min(length/swept,lo-2/swept));
        end={x:mix(from.x,probe.x,safe),y:mix(from.y,probe.y,safe),z:mix(from.z,probe.z,safe)};
        // A wall hit loses forward motion and drops naturally to a surface.
        v.x=v.y=0;v.z=Math.min(0,v.z);landed=false;
        if(distance(from,end)<.01&&Math.abs(next.z-from.z)>.5&&v.z<0){this.land(c,end,env,now);break;}
      }
      Object.assign(c,end);c.target={...end};
      if(landed)this.land(c,end,env,now);
    }
    if(c.phase==='casting'){
      c.flightAt=now;
      if(now-c.atMs>=8000){this.reel(c,now,true,p,true);}
    }
  }
  private reel(c:FishingCast,now:number,empty:boolean,actor:FishingActor,automatic=false){
    const reach=distance(c,{...actor,z:actor.z+25});
    c.empty=empty;c.phase='reeling';c.atMs=now;c.from={x:c.x,y:c.y,z:c.z};
    c.velocity=undefined;c.flightAt=undefined;
    // Measure from the current player position, including movement since launch.
    c.reelDurationMs=empty?fishingEmptyReelMs(reach):fishingFishReelMs(c.size);
    this.landingRetry.delete(c.playerId);
    c.reelElapsedMs=0;c.reelUpdatedAt=now;c.reelActive=automatic;c.reelAutomatic=automatic;
  }
  private sharkRelease(f:CaughtFish,now:number){
    this.makeRoom(now);f.phase='swimming';f.tetheredBy=undefined;f.ownerId=undefined;f.atMs=now;f.vx=f.vy=f.vz=0;
  }
  private abandonShark(c:FishingCast,now:number){
    this.makeRoom(now);this.fish.push({id:c.id,size:c.size,species:c.species,phase:'swimming',x:c.x,y:c.y,z:c.z,angle:c.sharkAngle??0,atMs:now,vx:0,vy:0,vz:0});
    this.casts.delete(c.playerId);
  }
  private reelShark(c:FishingCast,p:FishingActor,env:FishingEnvironment,now:number,seconds:number){
    const environment={...env,water:(x:number,y:number)=>this.water(env,x,y)};
    const duration=c.reelDurationMs??fishingFishReelMs(c.size),fatigue=sharkFatigue(c.reelElapsedMs??0,duration);
    c.sharkFatigue=fatigue;
    if(c.sharkAngle===undefined){
      if(now<(this.landingRetry.get(p.id)??0))return;
      this.landingRetry.set(p.id,now+500);
      const landing=sharkLanding(environment,p,c.from,c.size);
      if(!landing){c.sharkLoad=0;return;}
      c.sharkAngle=landing.angle;c.sharkLandingAngle=landing.angle;c.sharkLanding=landing.point;
      const dx=landing.point.x-p.x,dy=landing.point.y-p.y,reach=Math.hypot(dx,dy)||1;
      const offset=Math.max(0,Math.min(34*c.size*.75,SHARK_TETHER_RANGE-50-reach));
      const offshore={x:landing.point.x+dx/reach*offset,y:landing.point.y+dy/reach*offset,z:landing.point.z};
      const start=sharkWaterPose(environment,c.from,c.size,landing.angle)
        ??sharkWaterStep(environment,landing.point,offshore,c.size,landing.angle)??landing.point;
      Object.assign(c,start);c.from={...start};
    }
    let landing=c.sharkLanding!;
    if((!sharkWaterPose(environment,landing,c.size,c.sharkAngle)||Math.hypot(p.x-landing.x,p.y-landing.y)>SHARK_TETHER_RANGE-200)&&now>=(this.landingRetry.get(p.id)??0)){
      this.landingRetry.set(p.id,now+500);
      // Stay at the last safe water point if shore/boat movement blocks landing.
      const candidate=sharkLanding(environment,p,c.from,c.size);
      if(candidate&&sharkWaterPose(environment,c,c.size,candidate.angle)){c.sharkLanding=candidate.point;c.sharkAngle=candidate.angle;c.sharkLandingAngle=candidate.angle;landing=candidate.point;}
    }
    if(Math.hypot(p.x-c.x,p.y-c.y)>SHARK_TETHER_RANGE){this.abandonShark(c,now);return;}
    const fight=sharkFight(fatigue,now-c.atMs,c.id);c.sharkLoad=fight.load;
    const t=fatigue*fatigue*(3-2*fatigue),dx=landing.x-p.x,dy=landing.y-p.y,reach=Math.hypot(dx,dy)||1;
    const run=34*c.size*.22*fight.run,side=34*c.size*.10*fight.side;
    const desired={x:mix(c.from.x,landing.x,t)+dx/reach*run-dy/reach*side,y:mix(c.from.y,landing.y,t)+dy/reach*run+dx/reach*side,z:c.z};
    const distance=Math.hypot(desired.x-c.x,desired.y-c.y),step=Math.min(1,(65+45*fatigue)*seconds/Math.max(.001,distance));
    const next={x:mix(c.x,desired.x,step),y:mix(c.y,desired.y,step),z:c.z};
    const heading=fatigue<.75&&distance>1?Math.atan2(desired.y-c.y,desired.x-c.x):c.sharkLandingAngle!;
    const turn=Math.atan2(Math.sin(heading-c.sharkAngle),Math.cos(heading-c.sharkAngle));
    const angle=c.sharkAngle+Math.max(-seconds*.8,Math.min(seconds*.8,turn));
    if(sharkWaterPose(environment,c,c.size,angle))c.sharkAngle=angle;
    const safe=sharkWaterStep(environment,c,next,c.size,c.sharkAngle);if(safe)Object.assign(c,safe);
    c.lineLength=Math.hypot(p.x-c.x,p.y-c.y,p.z+26-c.z)+2;
    if(fatigue>=1&&Math.hypot(c.x-landing.x,c.y-landing.y)<4&&sharkWaterPose(environment,c,c.size,c.sharkAngle)){
      this.fish.push({id:c.id,size:c.size,species:c.species,phase:'landed',tetheredBy:p.id,caughtBy:p.id,landedAt:now,atMs:now,x:c.x,y:c.y,z:c.z,angle:c.sharkAngle,vx:0,vy:0,vz:0});this.casts.delete(p.id);
    }
  }
  private release(f:CaughtFish,p:FishingActor|undefined,input:MultiplayerInputFrame|undefined,now:number,throwing:boolean,env:FishingEnvironment){
    this.makeRoom(now);
    const angle=input?input.aimAngle/65535*Math.PI*2:p?.angle??f.angle;
    const pitch=input?input.aimPitch/65535*Math.PI*.88-Math.PI*.44:0;
    // Large catches must clear the ground before their first physics step.
    if(p){
      const origin={x:p.x,y:p.y,z:p.z+22+FISH_GROUND_RADIUS*f.size};
      let position=origin;
      for(let d=3;d<=18;d+=3){const next={x:origin.x+Math.cos(angle)*d,y:origin.y+Math.sin(angle)*d,z:origin.z};if(env.blocked(position,next))break;position=next;}
      Object.assign(f,position);
    }
    f.phase='air';f.ownerId=undefined;f.heldTool=undefined;f.atMs=now;f.angle=angle;f.unattendedAt=undefined;
    const speed=throwing?210:12;f.vx=Math.cos(angle)*Math.cos(pitch)*speed;f.vy=Math.sin(angle)*Math.cos(pitch)*speed;f.vz=throwing?Math.sin(pitch)*speed+70:5;
  }
  pickup(p:FishingActor,tool:number,now:number,env?:Pick<FishingEnvironment,'blocked'>){
    if(p.lifeState!=='alive'||p.swimming||p.friendsSeat||p.friendsDevFlight||(tool!==6&&tool!==7)||this.held(p.id)||this.landed(p.id)||this.casts.has(p.id)||this.charges.has(p.id))return false;
    const fish=this.fish.filter(f=>f.phase==='dry'&&!isGiantShark(f)&&distance(f,{...p,z:p.z+8})<55+FISH_GROUND_RADIUS*f.size&&!env?.blocked({...p,z:p.z+26},f)).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    if(!fish)return false;
    fish.phase='held';fish.ownerId=p.id;fish.heldTool=tool;fish.atMs=now;fish.unattendedAt=undefined;return true;
  }
  private makeRoom(now:number){
    const loose=this.fish.filter(f=>f.phase!=='held'&&f.phase!=='landed'&&f.phase!=='fading');
    if(loose.length>=LOOSE_FISH_LIMIT){const oldest=loose.reduce((a,b)=>a.atMs<b.atMs?a:b);oldest.phase='fading';oldest.atMs=now;}
  }
  update(dt:number,now:number,players:readonly FishingActor[],inputs:ReadonlyMap<string,MultiplayerInputFrame>,env:FishingEnvironment){
    const seconds=Math.max(0,Math.min(50,dt))/1000,ids=new Set(players.map(p=>p.id));this.equipped=[];
    for(const p of players){
      const input=inputs.get(p.id),fire=input?.fireActionId??0,alt=input?.altFireActionId??0,last=this.observed.get(p.id)??{fire:0,alt:0,aim:false};
      const primary=fire>last.fire,secondary=alt>last.alt||Boolean(input?.aiming&&!last.aim);
      this.observed.set(p.id,{fire:Math.max(fire,last.fire),alt:Math.max(alt,last.alt),aim:Boolean(input?.aiming)});
      const active=Boolean(input&&!input.friendsFishingBlocked&&this.allowed(p,env));
      const landed=this.landed(p.id);
      if(landed){
        if(!active||input!.friendsTool!==FISHING_TOOL||Math.hypot(p.x-landed.x,p.y-landed.y)>SHARK_TETHER_RANGE||primary||secondary)this.sharkRelease(landed,now);
        else this.equipped.push(p.id);
        // A release click cannot also charge a new cast.
        continue;
      }
      const held=this.held(p.id);
      if(held){
        if(!active||input!.friendsTool!==held.heldTool)this.release(held,p,input,now,false,env);
        else if(primary||secondary)this.release(held,p,input,now,primary,env);
        else {held.x=p.x;held.y=p.y;held.z=p.z+22;held.angle=p.angle;}
        // The click that throws cannot also cast.
        continue;
      }
      if(!active||input!.friendsTool!==FISHING_TOOL){const old=this.casts.get(p.id);if(old?.phase==='reeling'&&isGiantShark(old)&&old.sharkAngle!==undefined)this.abandonShark(old,now);this.casts.delete(p.id);this.charges.delete(p.id);continue;}
      this.equipped.push(p.id);
      let c=this.casts.get(p.id);
      if(c&&(c.phase==='waiting'||c.phase==='bite')&&!this.wet(c,env)){c.phase='dry';c.biteAt=0;}
      if(c&&(c.phase==='waiting'||c.phase==='bite'||c.phase==='dry')){
        const anchor={x:p.x,y:p.y,z:p.z+26},reach=c.lineLength??distance(c.from,c.target)+24;
        const horizontal=Math.hypot(anchor.x-c.x,anchor.y-c.y),available=Math.sqrt(Math.max(1,reach*reach-(anchor.z-c.z)**2));
        // A fixed amount of paid-out line: walking back draws the float toward
        // the bank; walking closer leaves slack rather than creating more line.
        if(horizontal>available){
          const pull=Math.min(horizontal-available,85*seconds),next={x:c.x+(anchor.x-c.x)/horizontal*pull,y:c.y+(anchor.y-c.y)/horizontal*pull,z:c.z},water=this.water(env,next.x,next.y);
          const floor=env.floor(next.x,next.y,c.z+6,0);
          const wet=Boolean(water&&(floor===undefined||floor<water.level-1));
          const surface=wet?water!.level:floor;
          // Movement only drags the paid-out line. Banks and walls must never
          // start a reel or remove the cast; stop at an impassable ledge.
          if(surface!==undefined&&Math.abs(surface+2-c.z)<=6){
            next.z=surface+2;
            if(!env.blocked(c,next)){
              Object.assign(c,next);c.target={...next};
              if(!wet){c.phase='dry';c.biteAt=0;}
              else if(c.phase==='dry')this.wait(c,now);
            }
          }
        }
      }
      if(secondary&&c?.phase==='reeling'&&!c.empty&&isGiantShark(c)){this.abandonShark(c,now);continue;}
      if(secondary)this.charges.delete(p.id);
      if(secondary&&c&&c.phase!=='reeling'){this.reel(c,now,true,p,true);}
      if(secondary&&c?.phase!=='reeling')continue;
      if(primary){
        if(!c&&!this.charges.has(p.id))this.charges.set(p.id,now);
        else if(c?.phase==='bite'&&this.wet(c,env)){c.species=fishingCatchSpecies(this.water(env,c.x,c.y)!.bodyId,this.random());c.size=speciesCatchSize(c.species,this.random());this.reel(c,now,false,p);}
        else if(c&&(c.phase==='waiting'||c.phase==='dry'||c.phase==='casting')){this.reel(c,now,true,p);}
      }
      const chargeAt=this.charges.get(p.id);
      if(chargeAt!==undefined&&!input!.firing){this.charges.delete(p.id);this.start(p,input!,now,chargeAt,env);}
      c=this.casts.get(p.id);if(!c)continue;
      if(c.phase==='casting'){
        this.fly(c,env,now,p);
      }else if(c.phase==='waiting'&&now>=c.biteAt){c.phase='bite';c.atMs=now;}
      else if(c.phase==='bite'&&now-c.atMs>=FISHING_BITE_MS){c.phase='waiting';c.atMs=now;c.biteAt=now+4000+this.random()*10000;}
      else if(c.phase==='reeling'){
        c.reelActive=Boolean(input!.firing||c.reelAutomatic);
        const elapsed=Math.max(0,now-(c.reelUpdatedAt??now));c.reelUpdatedAt=now;
        if(c.reelActive)c.reelElapsedMs=(c.reelElapsedMs??0)+elapsed;
        if(!c.empty&&isGiantShark(c)){this.reelShark(c,p,env,now,seconds);continue;}
        if(!c.reelActive)continue;
        const progress=fishingReelProgress(c.reelElapsedMs,c.reelDurationMs??FISHING_REEL_MS,c.size,Boolean(c.empty)),t=progress*progress*(3-2*progress),end={x:p.x+Math.cos(p.angle)*16,y:p.y+Math.sin(p.angle)*16,z:p.z+25};
        c.x=mix(c.from.x,end.x,t);c.y=mix(c.from.y,end.y,t);c.z=mix(c.from.z,end.z,t)+Math.sin(Math.PI*t)*(c.empty?2:30);
        c.lineLength=distance(c,end)+2;
        if(c.empty){const floor=env.floor(c.x,c.y,c.z+3,0);if(floor!==undefined)c.z=Math.max(c.z,floor+2);}
        if(t>=1){if(!c.empty){this.fish.push({id:c.id,size:c.size,species:c.species,phase:'held',ownerId:p.id,caughtBy:p.id,heldTool:FISHING_TOOL,atMs:now,...end,angle:p.angle,vx:0,vy:0,vz:0});}this.casts.delete(p.id);}
      }
    }
    for(const [id]of this.charges)if(!ids.has(id))this.charges.delete(id);
    for(const [id,c]of this.casts)if(!ids.has(id)){if(c.phase==='reeling'&&isGiantShark(c)&&c.sharkAngle!==undefined)this.abandonShark(c,now);else this.casts.delete(id);}
    for(const [id]of this.observed)if(!ids.has(id))this.observed.delete(id);
    for(const [id]of this.landingRetry)if(!this.casts.has(id))this.landingRetry.delete(id);
    for(const f of this.fish){
      if(f.phase==='held'){if(!ids.has(f.ownerId!))this.release(f,undefined,undefined,now,false,env);else continue;}
      if(f.phase==='landed'){
        const environment={...env,water:(x:number,y:number)=>this.water(env,x,y)};
        if(!ids.has(f.tetheredBy!)||!sharkWaterPose(environment,f,f.size,f.angle))this.sharkRelease(f,now);
        else continue;
      }
      if(f.phase==='fading')continue;
      const w=this.water(env,f.x,f.y),floor=env.floor(f.x,f.y,f.z+3,0);
      if(f.phase!=='swimming'&&w&&f.z<=w.level+FISH_GROUND_RADIUS*f.size&&(floor===undefined||floor<w.level-1)){
        f.phase='swimming';f.atMs=now;f.vx=Math.cos(f.angle)*50;f.vy=Math.sin(f.angle)*50;f.vz=0;f.z=w.level+3*f.size;
      }
      if(f.phase==='swimming'){
        if(isGiantShark(f)){
          const age=now-f.atMs,speed=12+Math.min(48,age/100),environment={...env,water:(x:number,y:number)=>this.water(env,x,y)};
          const next={x:f.x+Math.cos(f.angle)*speed*seconds,y:f.y+Math.sin(f.angle)*speed*seconds,z:f.z};
          const dive=Math.min(50,Math.max(0,age-1800)/100),currentDive=Math.max(0,(this.water(env,f.x,f.y)?.level??f.z)-34*f.size*.25-f.z);
          const safe=sharkWaterStep(environment,f,next,f.size,f.angle,dive)
            ??(dive>currentDive?sharkWaterStep(environment,f,next,f.size,f.angle,currentDive):undefined);
          if(safe)Object.assign(f,safe);else{const angle=f.angle+.25*seconds;if(sharkWaterPose(environment,f,f.size,angle,currentDive))f.angle=angle;}
          if(age>8000){f.phase='fading';f.atMs=now;}continue;
        }
        const nx=f.x+f.vx*seconds,ny=f.y+f.vy*seconds,next=this.water(env,nx,ny);
        // Show the fish swimming at the surface first, then diving away. A
        // deep-water material should not hide the release immediately.
        const nz=next?Math.max(next.level-next.depth*.6,next.level+(3-Math.max(0,now-f.atMs)/220)*f.size):f.z;
        if(next&&!env.blocked(f,{x:nx,y:ny,z:nz})){f.x=nx;f.y=ny;f.z=nz;}else{f.angle+=Math.PI*.65;f.vx=Math.cos(f.angle)*40;f.vy=Math.sin(f.angle)*40;}
        if(now-f.atMs>4200){f.phase='fading';f.atMs=now;}continue;
      }
      if(f.phase==='air'){
        f.vz-=230*seconds;const next={x:f.x+f.vx*seconds,y:f.y+f.vy*seconds,z:f.z+f.vz*seconds};
        const ground=env.floor(next.x,next.y,Math.max(f.z,next.z)+3,0),blocked=env.blocked(f,next);
        if(blocked||(ground!==undefined&&next.z<=ground+FISH_GROUND_RADIUS*f.size)){
          f.phase='dry';f.atMs=now;f.vx=f.vy=f.vz=0;
          // Keep the last clear point on a side impact; land on actual floors.
          if(!blocked&&ground!==undefined&&next.z<=ground+FISH_GROUND_RADIUS*f.size){f.x=next.x;f.y=next.y;f.z=ground+FISH_GROUND_RADIUS*f.size;}
        }else Object.assign(f,next);
      }else if(f.phase==='dry'&&(floor===undefined||floor<f.z-(FISH_GROUND_RADIUS+1)*f.size)){f.phase='air';f.vz=0;}
      const nearby=players.some(p=>distance(p,f)<1000);
      if(nearby)f.unattendedAt=undefined;else f.unattendedAt??=now;
      if(f.unattendedAt!==undefined&&now-f.unattendedAt>90000||f.z< -1000){f.phase='fading';f.atMs=now;}
    }
    this.fish=this.fish.filter(f=>f.phase!=='fading'||now-f.atMs<900);
  }
  snapshot():FishingSnapshot{return {charges:[...this.charges].map(([playerId,chargeAt])=>({playerId,chargeAt})),equipped:[...this.equipped],casts:[...this.casts.values()].map(c=>({...c,from:{...c.from},target:{...c.target},velocity:c.velocity&&{...c.velocity},sharkLanding:c.sharkLanding&&{...c.sharkLanding}})),fish:this.fish.map(f=>({...f}))};}
}
