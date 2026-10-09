import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import { friendsWaterAt } from '../world/FriendsWaterSurface';
import type { FishingActor, FishingEnvironment, FishingPoint } from './FriendsFishing';
import type { MultiplayerInputFrame } from './protocol';

export const SEEDS_TOOL=9 as const;
export const BIRD_PATIENCE_MS=8000;
export const BIRD_VISIT_CHANCE=.12;
export const GROUND_FEED_MS=20000;
export const GROUND_LINGER_MS=25000;
export const SEED_PATCH_MS=60000;
export function seedsInCampfire(p:FishingPoint){return Math.hypot(p.x-FRIENDS_CAMPFIRE.x,p.y-FRIENDS_CAMPFIRE.y)<65&&Math.abs(p.z-FRIENDS_CAMPFIRE.z)<30;}
export type SeedHand={playerId:string;holding:boolean;holdAt?:number;amount:number;refillAt:number;scatterAt?:number};
export type SeedPatch=FishingPoint & {id:number;atMs:number;amount:number;from:FishingPoint;inFire?:boolean};
export type FriendlyBird=FishingPoint & {id:number;variant:number;phase:'approach'|'feeding'|'perched'|'leaving';atMs:number;from:FishingPoint;target:FishingPoint;ownerId?:string;patchId?:number;angle:number;burningUntil?:number};
export type BirdsSnapshot={equipped:SeedHand[];patches:SeedPatch[];birds:FriendlyBird[]};
type Hand=SeedHand & {fire:number;anchor?:FishingPoint;angle:number;pitch:number;checkAt:number};
export type BirdEnvironment=FishingEnvironment & {outdoors:(p:FishingActor)=>boolean};
const distance=(a:FishingPoint,b:FishingPoint)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export function birdHandPoint(p:FishingActor):FishingPoint{
  return {x:p.x+Math.cos(p.angle)*19-Math.sin(p.angle)*11,y:p.y+Math.sin(p.angle)*19+Math.cos(p.angle)*11,z:p.z+27};
}

/** Small flocks find scattered seeds; an arm visit remains an occasional surprise. */
export class FriendsBirds {
  private serial=0;
  private hands=new Map<string,Hand>();
  private patches:SeedPatch[]=[];
  private birds:FriendlyBird[]=[];
  private equipped:SeedHand[]=[];
  constructor(private random:()=>number=Math.random){}
  private spawn(target:FishingPoint,now:number,ownerId?:string,patchId?:number){
    if(this.birds.length>=12)return;
    const angle=this.random()*Math.PI*2,d=180+this.random()*100,from={x:target.x+Math.cos(angle)*d,y:target.y+Math.sin(angle)*d,z:target.z+80+this.random()*60};
    this.birds.push({id:++this.serial,variant:Math.floor(this.random()*3),...from,from,target:{x:target.x,y:target.y,z:target.z},phase:'approach',atMs:now,ownerId,patchId,angle:angle+Math.PI});
  }
  private flee(bird:FriendlyBird,now:number){
    if(bird.phase==='leaving')return;
    bird.phase='leaving';bird.atMs=now;bird.from={x:bird.x,y:bird.y,z:bird.z};
    bird.target={x:bird.x+Math.cos(bird.angle)*300,y:bird.y+Math.sin(bird.angle)*300,z:bird.z+160};
  }
  update(_dt:number,now:number,players:readonly FishingActor[],inputs:ReadonlyMap<string,MultiplayerInputFrame>,env:BirdEnvironment){
    const ids=new Set(players.map(p=>p.id));this.equipped=[];
    for(const p of players){
      const input=inputs.get(p.id),fire=input?.fireActionId??0;
      let h=this.hands.get(p.id);if(!h){h={playerId:p.id,holding:false,amount:1,refillAt:0,fire:0,angle:p.angle,pitch:0,checkAt:0};this.hands.set(p.id,h);}
      const primary=fire>h.fire;h.fire=Math.max(h.fire,fire);
      const allowed=input?.friendsTool===SEEDS_TOOL&&!input.friendsFishingBlocked&&p.lifeState==='alive'&&!p.swimming&&!p.friendsDevFlight&&!env.piloting?.(p.id);
      if(!allowed){h.holding=false;h.holdAt=undefined;h.anchor=undefined;continue;}
      const visitor=this.birds.some(b=>b.ownerId===p.id&&b.phase!=='leaving');
      if(h.amount<=0&&!visitor&&now>=h.refillAt){h.amount=1;h.holdAt=undefined;h.anchor=undefined;}
      const pitch=input.aimPitch/65535*Math.PI*.88-Math.PI*.44;
      const still=Boolean(h.anchor&&distance(p,h.anchor)<3&&Math.abs(Math.atan2(Math.sin(p.angle-h.angle),Math.cos(p.angle-h.angle)))<.18&&Math.abs(pitch-h.pitch)<.18);
      h.holding=Boolean(input.aiming&&(h.amount>0||visitor));
      if(!h.holding){h.holdAt=undefined;h.anchor=undefined;}
      else if(!still){h.holdAt=now;h.checkAt=now+BIRD_PATIENCE_MS;h.anchor={x:p.x,y:p.y,z:p.z};h.angle=p.angle;h.pitch=pitch;}
      if(primary&&!h.holding&&h.amount>0&&now>=h.refillAt){
        const angle=input.aimAngle/65535*Math.PI*2,target={x:p.x+Math.cos(angle)*65,y:p.y+Math.sin(angle)*65,z:p.z};
        const floor=env.floor(target.x,target.y,p.z+80,80),water=(env.water??friendsWaterAt)(target.x,target.y);
        if(floor!==undefined&&!water&&env.outdoors(p)&&env.outdoors({...p,...target,z:floor})&&!env.blocked({...p,z:p.z+28},{...target,z:floor+3})){
          const patch={...target,z:floor+1,from:birdHandPoint(p),id:++this.serial,atMs:now,amount:1,inFire:seedsInCampfire({...target,z:floor+1})||undefined};this.patches.push(patch);this.patches=this.patches.slice(-12);
          const count=1+Math.floor(this.random()*3);
          for(let i=0;i<count;i++)this.spawn({...patch,x:patch.x+(this.random()-.5)*24,y:patch.y+(this.random()-.5)*24},now+1200+i*650,undefined,patch.id);
        }
        h.scatterAt=now;h.amount=0;h.refillAt=now+1000;
      }
      // Do not promise a visitor or accumulate chances while walking indoors.
      if(h.holding&&env.outdoors(p)&&now>=h.checkAt&&!this.birds.some(b=>b.ownerId===p.id&&b.phase!=='leaving')){
        h.checkAt=now+3000;
        const target=birdHandPoint(p),approach={...target,z:target.z+90};
        if(this.random()<BIRD_VISIT_CHANCE&&!env.blocked(target,approach))this.spawn(target,now,p.id);
      }
      this.equipped.push({playerId:p.id,holding:h.holding,holdAt:h.holdAt,amount:h.amount,refillAt:h.refillAt,scatterAt:h.scatterAt});
    }
    for(const id of this.hands.keys())if(!ids.has(id))this.hands.delete(id);
    for(const b of this.birds){
      if(now<b.atMs)continue;
      const owner=b.ownerId?players.find(p=>p.id===b.ownerId):undefined,h=b.ownerId?this.hands.get(b.ownerId):undefined,patch=this.patches.find(p=>p.id===b.patchId);
      if(b.phase!=='leaving'){
        if(b.ownerId){
          if(!owner||!h?.holding||!h.anchor||distance(owner,h.anchor)>=3||h.holdAt===now||!env.outdoors(owner))this.flee(b,now);
          else b.target=birdHandPoint(owner);
        }else if(!patch||players.some(p=>distance({...p,z:p.z+3},b.target)<42))this.flee(b,now);
      }
      if(b.phase==='approach'||b.phase==='leaving'){
        const t=Math.max(0,Math.min(1,(now-b.atMs)/(b.phase==='approach'?2200:2500))),smooth=t*t*(3-2*t);
        const next={x:mix(b.from.x,b.target.x,smooth),y:mix(b.from.y,b.target.y,smooth),z:mix(b.from.z,b.target.z,smooth)+Math.sin(t*Math.PI)*20};
        if(b.phase==='approach'&&env.blocked(b,next)){this.flee(b,now);continue;}
        Object.assign(b,next);b.angle=Math.atan2(b.target.y-b.from.y,b.target.x-b.from.x);
        if(t>=1&&b.phase==='approach'){b.phase='feeding';b.atMs=now;Object.assign(b,b.target);}
      }else{
        Object.assign(b,b.target);
        if(patch?.inFire&&b.phase==='feeding'&&now-b.atMs>=400){b.burningUntil=now+4500;this.flee(b,now);continue;}
        if(b.phase==='perched'){
          if(!b.ownerId&&now-b.atMs>=GROUND_LINGER_MS)this.flee(b,now);
          continue;
        }
        const t=(now-b.atMs)/(b.ownerId?6000:GROUND_FEED_MS);
        if(h){h.amount=Math.max(0,1-t);const visible=this.equipped.find(e=>e.playerId===h.playerId);if(visible)visible.amount=h.amount;}
        if(patch)patch.amount=Math.max(0,patch.amount-Math.max(0,Math.min(50,_dt))/GROUND_FEED_MS/Math.max(1,this.birds.filter(other=>other.patchId===patch.id&&other.phase==='feeding').length));
        if(t>=1){if(h){h.amount=0;h.refillAt=now+1500;}b.phase='perched';b.atMs=now;}
      }
    }
    this.birds=this.birds.filter(b=>b.phase!=='leaving'||now-b.atMs<2500);
    this.patches=this.patches.filter(p=>now-p.atMs<SEED_PATCH_MS);
  }
  snapshot():BirdsSnapshot{return {equipped:this.equipped.map(h=>({...h})),patches:this.patches.map(p=>({...p,from:{...p.from}})),birds:this.birds.map(b=>({...b,from:{...b.from},target:{...b.target}}))};}
}
