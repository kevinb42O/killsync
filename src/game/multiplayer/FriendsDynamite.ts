import type { FriendsBuildActor } from './FriendsBuilding';
import type { FishingActor, FishingEnvironment } from './FriendsFishing';
import type { MultiplayerInputFrame } from './protocol';
import { firstPersonEyeZ } from './FirstPersonEye';

export const DYNAMITE_TOOL = 12 as const;
export const DYNAMITE_FUSE_MS = 3000;
export const DYNAMITE_RADIUS = 112;
export const DYNAMITE_PUSH_RADIUS = 240;
export type DynamiteCharge = { id: number; actorId: string; x: number; y: number; z: number; atMs: number; explodeAtMs: number; vx?:number;vy?:number;vz?:number };
export type DynamiteBlast = DynamiteCharge & { destroyed: number; terrainDestroyed?:number };
export type DynamiteHand = { playerId:string; throwAt?:number; readyAt:number };
export type DynamiteSnapshot = { charges: DynamiteCharge[]; blasts: DynamiteBlast[]; equipped?:DynamiteHand[] };
type PushActor = FriendsBuildActor & { velocityX?:number;velocityY?:number;verticalVelocity?:number;grounded?:boolean;friendsSeat?:unknown };

/** Apply a radial impulse through the shared movement velocities, never teleport a player through a wall. */
export function pushDynamitePlayers(center: {x:number;y:number;z:number}, players:readonly PushActor[]) {
  for(const p of players) {
    if(p.lifeState!=='alive' || p.friendsSeat)continue;
    const dx=p.x-center.x,dy=p.y-center.y,distance=Math.hypot(dx,dy,p.z+25-center.z);
    if(distance>=DYNAMITE_PUSH_RADIUS)continue;
    const strength=1-distance/DYNAMITE_PUSH_RADIUS, horizontal=Math.hypot(dx,dy),angle=horizontal>1e-4?Math.atan2(dy,dx):p.id.length*2.39996;
    p.velocityX=(p.velocityX||0)+Math.cos(angle)*((180+360*strength)*strength);
    p.velocityY=(p.velocityY||0)+Math.sin(angle)*((180+360*strength)*strength);
    p.verticalVelocity=Math.max(p.verticalVelocity||0,(140+180*strength)*strength);
    // A small initial lift makes the ordinary movement integrator enter its airborne branch.
    p.z+=3;
  }
}

/** Host-owned throwable toys, fuses and blast events. No transient state is saved. */
export class FriendsDynamite {
  private serial = 0;
  private charges: DynamiteCharge[] = [];
  private blasts: DynamiteBlast[] = [];
  private hands=new Map<string,DynamiteHand & {fire:number}>();
  private equipped:DynamiteHand[]=[];
  update(dt:number,now:number,players:readonly FishingActor[],inputs:ReadonlyMap<string,MultiplayerInputFrame>,env:FishingEnvironment,canThrow:(id:string)=>boolean) {
    this.equipped=[];
    for(const p of players) {
      const input=inputs.get(p.id),fire=input?.fireActionId??0;
      let hand=this.hands.get(p.id);if(!hand){hand={playerId:p.id,readyAt:0,fire:0};this.hands.set(p.id,hand);}
      const pressed=fire>hand.fire;hand.fire=Math.max(hand.fire,fire);
      if(input?.friendsTool!==DYNAMITE_TOOL || p.lifeState!=='alive' || p.swimming || p.friendsSeat || env.piloting?.(p.id) || input.friendsFishingBlocked)continue;
      this.equipped.push({playerId:p.id,readyAt:hand.readyAt,throwAt:hand.throwAt});
      if(!pressed || !canThrow(p.id) || now<hand.readyAt || this.charges.length>=8)continue;
      const angle=input.aimAngle/65535*Math.PI*2,pitch=input.aimPitch/65535*Math.PI*.88-Math.PI*.44,speed=420;
      const origin={x:p.x,y:p.y,z:firstPersonEyeZ(p)-8};
      const charge:DynamiteCharge={...origin,id:++this.serial,actorId:p.id,atMs:now,explodeAtMs:now+DYNAMITE_FUSE_MS,
        vx:Math.cos(angle)*Math.cos(pitch)*speed,vy:Math.sin(angle)*Math.cos(pitch)*speed,vz:Math.sin(pitch)*speed+65};
      // Spawn on the player's side of a wall; small physics steps handle its flight.
      const forward={x:origin.x+Math.cos(angle)*18,y:origin.y+Math.sin(angle)*18,z:origin.z};
      if(!env.blocked(origin,forward))Object.assign(charge,forward);
      this.charges.push(charge);hand.throwAt=now;hand.readyAt=now+750;
      this.equipped[this.equipped.length-1]={playerId:p.id,readyAt:hand.readyAt,throwAt:now};
    }
    const ids=new Set(players.map(p=>p.id));for(const id of this.hands.keys())if(!ids.has(id))this.hands.delete(id);
    const seconds=Math.max(0,Math.min(50,dt))/1000,count=Math.max(1,Math.ceil(seconds*120)),step=seconds/count;
    for(const c of this.charges) {
      if(now>=c.explodeAtMs)continue;
      for(let i=0;i<count;i++) {
        const from={x:c.x,y:c.y,z:c.z};c.vz=(c.vz||0)-300*step;
        const next={x:c.x+(c.vx||0)*step,y:c.y+(c.vy||0)*step,z:c.z+c.vz*step};
        const floor=env.floor(next.x,next.y,Math.max(from.z,next.z)+8,0);
        if(env.blocked(from,next)) {c.vx=(c.vx||0)*-.22;c.vy=(c.vy||0)*-.22;c.vz=Math.max(0,c.vz)*.3;break;}
        if(floor!==undefined&&next.z<=floor+7) {
          c.x=next.x;c.y=next.y;c.z=floor+7;c.vz=Math.abs(c.vz)>45?-c.vz*.25:0;c.vx=(c.vx||0)*.72;c.vy=(c.vy||0)*.72;
        }else Object.assign(c,next);
      }
    }
  }
  tick(now: number, explode: (charge: DynamiteCharge) => {destroyed:number;terrainDestroyed:number}) {
    const due = this.charges.filter(c => now >= c.explodeAtMs);
    this.charges = this.charges.filter(c => now < c.explodeAtMs);
    for (const charge of due) this.blasts.push({ ...charge, ...explode(charge) });
    this.blasts = this.blasts.filter(b => now - b.explodeAtMs < 2500).slice(-16);
  }
  snapshot(): DynamiteSnapshot { return { charges: this.charges.map(c => ({ ...c })), blasts: this.blasts.map(b => ({ ...b })),equipped:this.equipped.map(h=>({...h})) }; }
}
