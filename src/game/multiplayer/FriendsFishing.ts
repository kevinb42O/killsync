import { friendsWaterAt, type FriendsWaterSample } from '../world/FriendsWaterSurface';
import type { MultiplayerInputFrame } from './protocol';

export const FISHING_TOOL = 7 as const;
export const FISHING_CAST_MS = 650;
export const FISHING_REEL_MS = 2800;
export const FISHING_BITE_MS = 4000;
export const FISHING_WAIT_MIN_MS = 7000;
export const FISHING_WAIT_MAX_MS = 28000;
export const FISHING_RANGE = 520;
export const LOOSE_FISH_LIMIT = 32;
export const FISH_GROUND_RADIUS = 8;
export const FISH_SIZE_MIN = 0.45;
export const FISH_SIZE_MAX = 4.2;
export type FishingPoint = { x:number; y:number; z:number };
export type FishingActor = FishingPoint & { id:string; angle:number; lifeState:string; swimming?:boolean; friendsDevFlight?:boolean; friendsSeat?:{vehicleId:string;index:number} };
export type FishingCast = FishingPoint & { id:number; playerId:string; phase:'casting'|'waiting'|'bite'|'reeling'; empty?:boolean; atMs:number; biteAt:number; from:FishingPoint; target:FishingPoint; size:number };
export type CaughtFish = FishingPoint & { id:number; size:number; phase:'held'|'air'|'dry'|'swimming'|'fading'; ownerId?:string; atMs:number; angle:number; vx:number; vy:number; vz:number; heldTool?:number; unattendedAt?:number };
export type FishingSnapshot = { equipped:string[]; casts:FishingCast[]; fish:CaughtFish[] };
export type FishingEnvironment = {
  water?:(x:number,y:number)=>FriendsWaterSample|undefined;
  floor:(x:number,y:number,z:number,step:number)=>number|undefined;
  blocked:(from:FishingPoint,to:FishingPoint)=>boolean;
  piloting?:(id:string)=>boolean;
};
const distance=(a:FishingPoint,b:FishingPoint)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export function fishingCastPoint(c:Pick<FishingCast,'phase'|'atMs'|'from'|'target'>,now:number):FishingPoint {
  const t=Math.max(0,Math.min(1,(now-c.atMs)/FISHING_CAST_MS));
  return {x:mix(c.from.x,c.target.x,t),y:mix(c.from.y,c.target.y,t),z:mix(c.from.z,c.target.z,t)+Math.sin(t*Math.PI)*Math.min(95,distance(c.from,c.target)*.22)};
}

/** Only casts and caught fish exist. Timings/ownership are authoritative; rope
 * particles and skeletal animation never enter network state or durable saves. */
export class FriendsFishing {
  private serial=0;
  private casts=new Map<string,FishingCast>();
  private fish:CaughtFish[]=[];
  private equipped:string[]=[];
  private obstructionAt=new Map<string,number>();
  private observed=new Map<string,{fire:number;alt:number;aim:boolean}>();
  constructor(private random:()=>number=Math.random){}
  held(id:string){return this.fish.find(f=>f.phase==='held'&&f.ownerId===id);}
  private water(env:FishingEnvironment,x:number,y:number){return (env.water??friendsWaterAt)(x,y);}
  private allowed(p:FishingActor,env:FishingEnvironment){return p.lifeState==='alive'&&!p.swimming&&!p.friendsDevFlight&&!p.friendsSeat&&!env.piloting?.(p.id);}
  private start(p:FishingActor,input:MultiplayerInputFrame,env:FishingEnvironment,now:number){
    const angle=input.aimAngle/65535*Math.PI*2,pitch=Math.min(-.08,input.aimPitch/65535*Math.PI*.88-Math.PI*.44);
    const from={x:p.x+Math.cos(angle)*12,y:p.y+Math.sin(angle)*12,z:p.z+26};
    let target:FishingPoint|undefined;
    // Cross the actual water field, including different river/pool elevations.
    for(let d=12;d<=FISHING_RANGE;d+=8){
      const x=from.x+Math.cos(angle)*Math.cos(pitch)*d,y=from.y+Math.sin(angle)*Math.cos(pitch)*d,z=from.z+Math.sin(pitch)*d,w=this.water(env,x,y);
      if(w&&z<=w.level+2&&from.z>w.level){target={x,y,z:w.level+2};break;}
    }
    if(!target||env.blocked(from,{...target,z:target.z+4}))return;
    const cast:FishingCast={id:++this.serial,playerId:p.id,...from,from,target,phase:'casting',atMs:now,biteAt:now+FISHING_CAST_MS+FISHING_WAIT_MIN_MS+this.random()*(FISHING_WAIT_MAX_MS-FISHING_WAIT_MIN_MS),size:FISH_SIZE_MIN+this.random()*(FISH_SIZE_MAX-FISH_SIZE_MIN)};
    let previous=from;
    for(let i=1;i<=12;i++){const point=fishingCastPoint(cast,now+FISHING_CAST_MS*i/12);if(env.blocked(previous,point))return;previous=point;}
    this.casts.set(p.id,cast);
  }
  private release(f:CaughtFish,p:FishingActor|undefined,input:MultiplayerInputFrame|undefined,now:number,throwing:boolean){
    this.makeRoom(now);
    const angle=input?input.aimAngle/65535*Math.PI*2:p?.angle??f.angle;
    const pitch=input?input.aimPitch/65535*Math.PI*.88-Math.PI*.44:0;
    // Large catches must clear the ground before their first physics step.
    if(p){f.x=p.x+Math.cos(angle)*18;f.y=p.y+Math.sin(angle)*18;f.z=p.z+22+FISH_GROUND_RADIUS*f.size;}
    f.phase='air';f.ownerId=undefined;f.heldTool=undefined;f.atMs=now;f.angle=angle;f.unattendedAt=undefined;
    const speed=throwing?210:12;f.vx=Math.cos(angle)*Math.cos(pitch)*speed;f.vy=Math.sin(angle)*Math.cos(pitch)*speed;f.vz=throwing?Math.sin(pitch)*speed+70:5;
  }
  pickup(p:FishingActor,tool:number,now:number){
    if(p.lifeState!=='alive'||p.swimming||p.friendsSeat||p.friendsDevFlight||(tool!==6&&tool!==7)||this.held(p.id)||this.casts.has(p.id))return false;
    const fish=this.fish.filter(f=>f.phase==='dry'&&distance(f,{...p,z:p.z+8})<55).sort((a,b)=>distance(a,p)-distance(b,p))[0];
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
        if(!active||input!.friendsTool!==held.heldTool)this.release(held,p,input,now,false);
        else if(primary||secondary)this.release(held,p,input,now,primary);
        else {held.x=p.x;held.y=p.y;held.z=p.z+22;held.angle=p.angle;}
        // The click that throws cannot also cast.
        continue;
      }
      if(!active||input!.friendsTool!==FISHING_TOOL){this.casts.delete(p.id);continue;}
      this.equipped.push(p.id);
      let c=this.casts.get(p.id);
      if(c&&(distance(p,c.target)>FISHING_RANGE+100||!this.water(env,c.target.x,c.target.y))){this.casts.delete(p.id);c=undefined;}
      if(c&&c.phase!=='casting'&&now>=(this.obstructionAt.get(p.id)??0)){
        this.obstructionAt.set(p.id,now+250);
        if(env.blocked({x:p.x,y:p.y,z:p.z+30},{...c.target,z:c.target.z+6})){this.casts.delete(p.id);c=undefined;}
      }
      if(secondary&&c&&c.phase!=='reeling'){c.empty=true;c.phase='reeling';c.atMs=now;c.from={x:c.x,y:c.y,z:c.z};}
      if(secondary)continue;
      if(primary){
        if(!c)this.start(p,input!,env,now);
        else if(c.phase==='bite'){c.phase='reeling';c.atMs=now;c.from={x:c.x,y:c.y,z:c.z};}
        else if(c.phase==='waiting'){c.empty=true;c.phase='reeling';c.atMs=now;c.from={x:c.x,y:c.y,z:c.z};}
      }
      c=this.casts.get(p.id);if(!c)continue;
      if(c.phase==='casting'){
        Object.assign(c,fishingCastPoint(c,now));if(now-c.atMs>=FISHING_CAST_MS){c.phase='waiting';c.atMs=now;Object.assign(c,c.target);}
      }else if(c.phase==='waiting'&&now>=c.biteAt){c.phase='bite';c.atMs=now;}
      else if(c.phase==='bite'&&now-c.atMs>=FISHING_BITE_MS){c.phase='waiting';c.atMs=now;c.biteAt=now+4000+this.random()*10000;}
      else if(c.phase==='reeling'){
        const t=Math.min(1,(now-c.atMs)/(c.empty?400:FISHING_REEL_MS)),end={x:p.x+Math.cos(p.angle)*16,y:p.y+Math.sin(p.angle)*16,z:p.z+25};
        c.x=mix(c.from.x,end.x,t);c.y=mix(c.from.y,end.y,t);c.z=mix(c.from.z,end.z,t)+Math.sin(Math.PI*t)*30;
        if(t>=1){if(!c.empty){this.fish.push({id:c.id,size:c.size,phase:'held',ownerId:p.id,heldTool:FISHING_TOOL,atMs:now,...end,angle:p.angle,vx:0,vy:0,vz:0});}this.casts.delete(p.id);}
      }
    }
    for(const [id]of this.casts)if(!ids.has(id))this.casts.delete(id);
    for(const [id]of this.observed)if(!ids.has(id))this.observed.delete(id);
    for(const [id]of this.obstructionAt)if(!ids.has(id))this.obstructionAt.delete(id);
    for(const f of this.fish){
      if(f.phase==='held'){if(!ids.has(f.ownerId!))this.release(f,undefined,undefined,now,false);else continue;}
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
          if(ground!==undefined&&next.z<=ground+FISH_GROUND_RADIUS*f.size){f.x=next.x;f.y=next.y;f.z=ground+FISH_GROUND_RADIUS*f.size;}
        }else Object.assign(f,next);
      }else if(f.phase==='dry'&&(floor===undefined||floor<f.z-(FISH_GROUND_RADIUS+1)*f.size)){f.phase='air';f.vz=0;}
      const nearby=players.some(p=>distance(p,f)<1000);
      if(nearby)f.unattendedAt=undefined;else f.unattendedAt??=now;
      if(f.unattendedAt!==undefined&&now-f.unattendedAt>90000||f.z< -1000){f.phase='fading';f.atMs=now;}
    }
    this.fish=this.fish.filter(f=>f.phase!=='fading'||now-f.atMs<900);
  }
  snapshot():FishingSnapshot{return {equipped:[...this.equipped],casts:[...this.casts.values()].map(c=>({...c,from:{...c.from},target:{...c.target}})),fish:this.fish.map(f=>({...f}))};}
}
