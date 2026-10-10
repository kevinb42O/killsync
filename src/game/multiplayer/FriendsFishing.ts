import { friendsWaterAt, type FriendsWaterSample } from '../world/FriendsWaterSurface';
import type { MultiplayerInputFrame } from './protocol';
import { isRetreatSeat } from '../world/FriendsRetreatSites';
import { isRowboatSeat } from '../world/FriendsFishingDock';

export const FISHING_TOOL = 7 as const;
export const FISHING_CHARGE_MS = 1200;
const FISHING_GRAVITY = 230;
export const fishingCastPower = (heldMs:number) => Math.max(0,Math.min(1,heldMs/FISHING_CHARGE_MS));
export const FISHING_REEL_MS = 2800;
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
export type FishingActor = FishingPoint & { id:string; angle:number; lifeState:string; swimming?:boolean; friendsDevFlight?:boolean; friendsSeat?:{vehicleId:string;index:number} };
export type FishingCast = FishingPoint & { id:number; playerId:string; phase:'casting'|'dry'|'waiting'|'bite'|'reeling'; empty?:boolean; atMs:number; biteAt:number; from:FishingPoint; target:FishingPoint; size:number; lineLength?:number; velocity?:FishingPoint; flightAt?:number; castAt?:number; castPower?:number; reelDurationMs?:number };
export type CaughtFish = FishingPoint & { id:number; size:number; phase:'held'|'air'|'dry'|'swimming'|'fading'; ownerId?:string; caughtBy?:string; atMs:number; angle:number; vx:number; vy:number; vz:number; heldTool?:number; unattendedAt?:number };
export type FishingCharge = { playerId:string; chargeAt:number };
export type FishingSnapshot = { charges?:FishingCharge[]; equipped:string[]; casts:FishingCast[]; fish:CaughtFish[] };
export type FishingEnvironment = {
  water?:(x:number,y:number)=>FriendsWaterSample|undefined;
  floor:(x:number,y:number,z:number,step:number)=>number|undefined;
  blocked:(from:FishingPoint,to:FishingPoint)=>boolean;
  piloting?:(id:string)=>boolean;
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
  private observed=new Map<string,{fire:number;alt:number;aim:boolean}>();
  constructor(private random:()=>number=Math.random){}
  held(id:string){return this.fish.find(f=>f.phase==='held'&&f.ownerId===id);}
  private water(env:FishingEnvironment,x:number,y:number){return (env.water??friendsWaterAt)(x,y);}
  private allowed(p:FishingActor,env:FishingEnvironment){return p.lifeState==='alive'&&!p.swimming&&!p.friendsDevFlight&&fishingSeatAllowed(p.friendsSeat)&&!env.piloting?.(p.id);}
  private start(p:FishingActor,input:MultiplayerInputFrame,now:number,chargeAt:number){
    const angle=input.aimAngle/65535*Math.PI*2,pitch=input.aimPitch/65535*Math.PI*.88-Math.PI*.44;
    const power=fishingCastPower(now-chargeAt),speed=140+power*210;
    // Launch at the hand so a nearby wall cannot be skipped by an offset origin.
    const from={x:p.x,y:p.y,z:p.z+26};
    this.casts.set(p.id,{id:++this.serial,playerId:p.id,...from,from,target:{...from},phase:'casting',atMs:now,castAt:now,castPower:power,biteAt:0,size:0,
      velocity:{x:Math.cos(angle)*Math.cos(pitch)*speed,y:Math.sin(angle)*Math.cos(pitch)*speed,z:Math.sin(pitch)*speed+75+power*100},flightAt:now+FISHING_CAST_RELEASE_MS});
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
      if(now-c.atMs>=8000){this.reel(c,now,true,p);}
    }
  }
  private reel(c:FishingCast,now:number,empty:boolean,actor:FishingActor){
    const reach=distance(c,{...actor,z:actor.z+25});
    c.empty=empty;c.phase='reeling';c.atMs=now;c.from={x:c.x,y:c.y,z:c.z};
    c.velocity=undefined;c.flightAt=undefined;
    // Measure from the current player position, including movement since launch.
    c.reelDurationMs=empty?fishingEmptyReelMs(reach):FISHING_REEL_MS;
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
    if(p.lifeState!=='alive'||p.swimming||p.friendsSeat||p.friendsDevFlight||(tool!==6&&tool!==7)||this.held(p.id)||this.casts.has(p.id)||this.charges.has(p.id))return false;
    const fish=this.fish.filter(f=>f.phase==='dry'&&distance(f,{...p,z:p.z+8})<55&&!env?.blocked({...p,z:p.z+26},f)).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    if(!fish)return false;
    fish.phase='held';fish.ownerId=p.id;fish.heldTool=tool;fish.atMs=now;fish.unattendedAt=undefined;return true;
  }
  private makeRoom(now:number){
    const loose=this.fish.filter(f=>f.phase!=='held'&&f.phase!=='fading');
    if(loose.length>=LOOSE_FISH_LIMIT){const oldest=loose.reduce((a,b)=>a.atMs<b.atMs?a:b);oldest.phase='fading';oldest.atMs=now;}
  }
  update(dt:number,now:number,players:readonly FishingActor[],inputs:ReadonlyMap<string,MultiplayerInputFrame>,env:FishingEnvironment){
    const seconds=Math.max(0,Math.min(50,dt))/1000,ids=new Set(players.map(p=>p.id));this.equipped=[];
    for(const p of players){
      const input=inputs.get(p.id),fire=input?.fireActionId??0,alt=input?.altFireActionId??0,last=this.observed.get(p.id)??{fire:0,alt:0,aim:false};
      const primary=fire>last.fire,secondary=alt>last.alt||Boolean(input?.aiming&&!last.aim);
      this.observed.set(p.id,{fire:Math.max(fire,last.fire),alt:Math.max(alt,last.alt),aim:Boolean(input?.aiming)});
      const active=Boolean(input&&!input.friendsFishingBlocked&&this.allowed(p,env));
      const held=this.held(p.id);
      if(held){
        if(!active||input!.friendsTool!==held.heldTool)this.release(held,p,input,now,false,env);
        else if(primary||secondary)this.release(held,p,input,now,primary,env);
        else {held.x=p.x;held.y=p.y;held.z=p.z+22;held.angle=p.angle;}
        // The click that throws cannot also cast.
        continue;
      }
      if(!active||input!.friendsTool!==FISHING_TOOL){this.casts.delete(p.id);this.charges.delete(p.id);continue;}
      this.equipped.push(p.id);
      let c=this.casts.get(p.id);
      if(c&&distance(p,c.target)>FISHING_RANGE+100){this.casts.delete(p.id);c=undefined;}
      if(c&&(c.phase==='waiting'||c.phase==='bite')&&!this.wet(c,env)){c.phase='dry';c.biteAt=0;}
      if(c&&(c.phase==='waiting'||c.phase==='bite')){
        const anchor={x:p.x,y:p.y,z:p.z+26},reach=c.lineLength??distance(c.from,c.target)+24;
        const horizontal=Math.hypot(anchor.x-c.x,anchor.y-c.y),available=Math.sqrt(Math.max(1,reach*reach-(anchor.z-c.z)**2));
        // A fixed amount of paid-out line: walking back draws the float toward
        // the bank; walking closer leaves slack rather than creating more line.
        if(horizontal>available){
          const pull=Math.min(horizontal-available,85*seconds),next={x:c.x+(anchor.x-c.x)/horizontal*pull,y:c.y+(anchor.y-c.y)/horizontal*pull,z:c.z},water=this.water(env,next.x,next.y);
          const floor=env.floor(next.x,next.y,c.z+6,0);
          if(!water||floor!==undefined&&floor>=water.level-1||env.blocked(c,next)){this.reel(c,now,true,p);}
          else {next.z=water.level+2;Object.assign(c,next);c.target={...next};}
        }
      }
      if(secondary)this.charges.delete(p.id);
      if(secondary&&c&&c.phase!=='reeling'){this.reel(c,now,true,p);}
      if(secondary)continue;
      if(primary){
        if(!c&&!this.charges.has(p.id))this.charges.set(p.id,now);
        else if(c?.phase==='bite'&&this.wet(c,env)){c.size=fishingCatchSize(this.random());this.reel(c,now,false,p);}
        else if(c&&(c.phase==='waiting'||c.phase==='dry'||c.phase==='casting')){this.reel(c,now,true,p);}
      }
      const chargeAt=this.charges.get(p.id);
      if(chargeAt!==undefined&&!input!.firing){this.charges.delete(p.id);this.start(p,input!,now,chargeAt);}
      c=this.casts.get(p.id);if(!c)continue;
      if(c.phase==='casting'){
        this.fly(c,env,now,p);
      }else if(c.phase==='waiting'&&now>=c.biteAt){c.phase='bite';c.atMs=now;}
      else if(c.phase==='bite'&&now-c.atMs>=FISHING_BITE_MS){c.phase='waiting';c.atMs=now;c.biteAt=now+4000+this.random()*10000;}
      else if(c.phase==='reeling'){
        const progress=Math.max(0,Math.min(1,(now-c.atMs)/(c.reelDurationMs??FISHING_REEL_MS))),t=progress*progress*(3-2*progress),end={x:p.x+Math.cos(p.angle)*16,y:p.y+Math.sin(p.angle)*16,z:p.z+25};
        c.x=mix(c.from.x,end.x,t);c.y=mix(c.from.y,end.y,t);c.z=mix(c.from.z,end.z,t)+Math.sin(Math.PI*t)*(c.empty?2:30);
        if(c.empty){const floor=env.floor(c.x,c.y,c.z+3,0);if(floor!==undefined)c.z=Math.max(c.z,floor+2);}
        if(t>=1){if(!c.empty){this.fish.push({id:c.id,size:c.size,phase:'held',ownerId:p.id,caughtBy:p.id,heldTool:FISHING_TOOL,atMs:now,...end,angle:p.angle,vx:0,vy:0,vz:0});}this.casts.delete(p.id);}
      }
    }
    for(const [id]of this.charges)if(!ids.has(id))this.charges.delete(id);
    for(const [id]of this.casts)if(!ids.has(id))this.casts.delete(id);
    for(const [id]of this.observed)if(!ids.has(id))this.observed.delete(id);
    for(const f of this.fish){
      if(f.phase==='held'){if(!ids.has(f.ownerId!))this.release(f,undefined,undefined,now,false,env);else continue;}
      if(f.phase==='fading')continue;
      const w=this.water(env,f.x,f.y),floor=env.floor(f.x,f.y,f.z+3,0);
      if(f.phase!=='swimming'&&w&&f.z<=w.level+FISH_GROUND_RADIUS*f.size&&(floor===undefined||floor<w.level-1)){
        f.phase='swimming';f.atMs=now;f.vx=Math.cos(f.angle)*50;f.vy=Math.sin(f.angle)*50;f.vz=0;f.z=w.level+3*f.size;
      }
      if(f.phase==='swimming'){
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
  snapshot():FishingSnapshot{return {charges:[...this.charges].map(([playerId,chargeAt])=>({playerId,chargeAt})),equipped:[...this.equipped],casts:[...this.casts.values()].map(c=>({...c,from:{...c.from},target:{...c.target},velocity:c.velocity&&{...c.velocity}})),fish:this.fish.map(f=>({...f}))};}
}
