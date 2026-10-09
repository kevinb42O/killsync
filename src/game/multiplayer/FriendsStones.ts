import { friendsWaterAt } from '../world/FriendsWaterSurface';
import { isRowboatSeat } from '../world/FriendsFishingDock';
import type { FishingActor, FishingEnvironment, FishingPoint } from './FriendsFishing';
import type { MultiplayerInputFrame } from './protocol';

export const STONE_TOOL = 8 as const;
export const STONE_CHARGE_MS = 900;
export const STONE_REFILL_MS = 450;
export type ThrownStone = FishingPoint & { id:number; ownerId:string; vx:number; vy:number; vz:number; atMs:number; skips:number };
export type RestingStone = FishingPoint & { id:number; atMs:number };
export type StoneSplash = FishingPoint & { id:number; atMs:number; skip:number };
export type StoneHand = { playerId:string; chargeAt?:number; readyAt:number; throwAt?:number };
export type StonesSnapshot = { equipped:StoneHand[]; stones:ThrownStone[]; landed:RestingStone[]; splashes:StoneSplash[] };
type Hand = StoneHand & { fire:number };

/** A shallow, fast impact skips; steep throws and slow stones sink. */
export function stoneCanSkip(speed:number, vertical:number, skips:number) {
  return speed >= 180 && vertical < 0 && -vertical / speed < .34 && skips < 10;
}

/** Transient host-owned toys. Hit callbacks are presentation only. */
export class FriendsStones {
  private serial=0;
  private hands=new Map<string,Hand>();
  private stones:ThrownStone[]=[];
  private landed:RestingStone[]=[];
  private splashes:StoneSplash[]=[];
  private equipped:StoneHand[]=[];

  update(dt:number, now:number, players:readonly FishingActor[], inputs:ReadonlyMap<string,MultiplayerInputFrame>, env:FishingEnvironment,
    hit:(playerId:string, point:FishingPoint)=>void) {
    const ids=new Set(players.map(p=>p.id));this.equipped=[];
    for(const p of players){
      const input=inputs.get(p.id),fire=input?.fireActionId??0;
      let hand=this.hands.get(p.id);
      if(!hand){hand={playerId:p.id,readyAt:0,fire:0};this.hands.set(p.id,hand);}
      const pressed=fire>hand.fire;hand.fire=Math.max(hand.fire,fire);
      const allowed=input?.friendsTool===STONE_TOOL&&!input.friendsFishingBlocked&&p.lifeState==='alive'&&!p.swimming&&!p.friendsDevFlight&&!isRowboatSeat(p.friendsSeat)&&!env.piloting?.(p.id);
      if(!allowed){hand.chargeAt=undefined;continue;}
      if(pressed&&now>=hand.readyAt&&hand.chargeAt===undefined)hand.chargeAt=now;
      if(hand.chargeAt!==undefined&&!input.firing){
        const power=Math.min(1,(now-hand.chargeAt)/STONE_CHARGE_MS),speed=360+power*340;
        const angle=input.aimAngle/65535*Math.PI*2,pitch=input.aimPitch/65535*Math.PI*.88-Math.PI*.44;
        const stone:ThrownStone={id:++this.serial,ownerId:p.id,x:p.x+Math.cos(angle)*24,y:p.y+Math.sin(angle)*24,z:p.z+24,
          vx:Math.cos(angle)*Math.cos(pitch)*speed,vy:Math.sin(angle)*Math.cos(pitch)*speed,vz:Math.sin(pitch)*speed,atMs:now,skips:0};
        // The release point cannot reach through nearby walls.
        if(!env.blocked({...p,z:p.z+24},stone)){this.stones.push(stone);if(this.stones.length>40)this.stones.shift();}
        hand.chargeAt=undefined;hand.readyAt=now+STONE_REFILL_MS;hand.throwAt=now;
      }
      this.equipped.push({playerId:p.id,readyAt:hand.readyAt,chargeAt:hand.chargeAt,throwAt:hand.throwAt});
    }
    for(const id of this.hands.keys())if(!ids.has(id))this.hands.delete(id);
    const water=env.water??friendsWaterAt,seconds=Math.max(0,Math.min(50,dt))/1000;
    this.stones=this.stones.filter(stone=>{
      if(now-stone.atMs>6000)return false;
      // Fine steps keep a fast pebble from crossing a bank or a player.
      const count=Math.max(1,Math.ceil(seconds*120)),step=seconds/count;
      for(let i=0;i<count;i++){
        const from={x:stone.x,y:stone.y,z:stone.z};stone.vz-=230*step;
        const next={x:stone.x+stone.vx*step,y:stone.y+stone.vy*step,z:stone.z+stone.vz*step};
        if(env.blocked(from,next)){this.landed.push({...from,id:++this.serial,atMs:now});return false;}
        const dx=next.x-from.x,dy=next.y-from.y,dz=next.z-from.z,length=dx*dx+dy*dy+dz*dz;
        let target:FishingActor|undefined,nearest=Infinity;
        for(const p of players){
          if(p.id===stone.ownerId||p.lifeState!=='alive')continue;
          const t=Math.max(0,Math.min(1,((p.x-from.x)*dx+(p.y-from.y)*dy+(p.z+25-from.z)*dz)/(length||1)));
          const z=from.z+dz*t;
          if(z>=p.z-3&&z<=p.z+53&&Math.hypot(from.x+dx*t-p.x,from.y+dy*t-p.y)<22&&t<nearest){target=p;nearest=t;}
        }
        if(target){hit(target.id,{x:from.x+dx*nearest,y:from.y+dy*nearest,z:from.z+dz*nearest});return false;}
        const wet=water(next.x,next.y),floor=env.floor(next.x,next.y,Math.max(from.z,next.z)+3,0);
        if(wet&&from.z>=wet.level&&next.z<=wet.level&&(floor===undefined||floor<wet.level-1)){
          const t=Math.max(0,Math.min(1,(from.z-wet.level)/(from.z-next.z||1)));
          const point={x:from.x+dx*t,y:from.y+dy*t,z:wet.level};
          const speed=Math.hypot(stone.vx,stone.vy),skip=stoneCanSkip(speed,stone.vz,stone.skips);
          this.splashes.push({...point,id:++this.serial,atMs:now,skip:skip?stone.skips+1:0});
          if(!skip)return false;
          stone.skips++;stone.vx*=.80;stone.vy*=.80;stone.vz=Math.min(58,Math.max(20,-stone.vz*.72));Object.assign(stone,{...point,z:point.z+.6});
        }else if(floor!==undefined&&next.z<=floor+2){this.landed.push({x:next.x,y:next.y,z:floor+1.5,id:++this.serial,atMs:now});return false;}
        else Object.assign(stone,next);
      }
      return stone.z> -1000;
    });
    this.splashes=this.splashes.filter(s=>now-s.atMs<800).slice(-40);
    this.landed=this.landed.filter(s=>now-s.atMs<5000).slice(-40);
  }
  snapshot():StonesSnapshot{return {equipped:this.equipped.map(h=>({...h})),stones:this.stones.map(s=>({...s})),landed:this.landed.map(s=>({...s})),splashes:this.splashes.map(s=>({...s}))};}
}
