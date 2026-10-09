import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import { isCampfireSeat } from './FriendsCampfireSeats';
import type { ScenicActor } from './FriendsScenicService';
import type { MultiplayerInputFrame } from './protocol';

export const CAMPFIRE_FUEL_PER_LOG = 30;
export const CAMPFIRE_MAX_FUEL = 180;
export const CAMPFIRE_EAT_MS = 1000;
export const CAMPFIRE_REFILL_MS = 5000;
export const MARSHMALLOW_TOOL = 10 as const;
export type MarshmallowState = { toast:number; heat:number; roasting:boolean; burningMs:number; charred:boolean; serial:number; eatingMs?:number; refillMs?:number };
export type CampfireSnapshot = { equipped?:string[]; fuelSeconds:number; roasts:Record<string,MarshmallowState>; feedback?:Record<string,{message:string;until:number}> };
export type CampfireAction = 'campfire_fuel'|'campfire_fresh'|'campfire_eat';
const fresh=(serial=1):MarshmallowState=>({toast:0,heat:0,roasting:false,burningMs:0,charred:false,serial});
export function campfireNearby(player:ScenicActor){
  return player.lifeState==='alive'&&!player.friendsDevFlight&&Math.abs(player.z-FRIENDS_CAMPFIRE.z)<128&&Math.hypot(player.x-FRIENDS_CAMPFIRE.x,player.y-FRIENDS_CAMPFIRE.y)<260;
}
export function campfireHeat(fuelSeconds:number){return 1+Math.max(0,Math.min(1,fuelSeconds/CAMPFIRE_MAX_FUEL))*.8;}
export function marshmallowLabel(state:MarshmallowState|undefined){
  return !state?'Fresh marshmallow':state.burningMs>0?'On fire!':state.charred?'Burnt to a crisp':state.toast>.78?'Dark brown':state.toast>.4?'Golden brown':state.toast>.12?'Getting toasty':'Fresh marshmallow';
}
export function aimingAtCampfire(player:ScenicActor,angle:number,pitch:number){
  const target=Math.atan2(FRIENDS_CAMPFIRE.y-player.y,FRIENDS_CAMPFIRE.x-player.x);
  return Math.cos(angle-target)>.85&&pitch>-.45&&pitch<.55;
}
export function campfireRoastReach(player:ScenicActor){
  return campfireNearby(player)&&Math.abs(player.z-FRIENDS_CAMPFIRE.z)<64&&Math.hypot(player.x-FRIENDS_CAMPFIRE.x,player.y-FRIENDS_CAMPFIRE.y)<160;
}
export function marshmallowEquipped(player:ScenicActor,tool:number|undefined){
  return tool===MARSHMALLOW_TOOL||(tool===undefined&&isCampfireSeat(player.friendsSeat));
}
/** Host owns timber spending, shared fuel and each player's cooking. Clients
 * only animate the compact state; there are no replicated particles. */
export class FriendsCampfireSimulation {
  fuelSeconds:number;
  private roasts=new Map<string,MarshmallowState>();
  private equipped:string[]=[];
  private tools=new Map<string,number|undefined>();
  private feedback:Record<string,{message:string;until:number}>={};
  notice(id:string,message:string,now:number){this.feedback[id]={message,until:now+4200};}
  constructor(savedFuel=0){this.fuelSeconds=Number.isFinite(savedFuel)?Math.max(0,Math.min(CAMPFIRE_MAX_FUEL,savedFuel)):0;}
  fuelError(player:ScenicActor){
    if(!campfireNearby(player))return 'Stand beside the campfire or sit down to add timber.';
    if(this.fuelSeconds>CAMPFIRE_MAX_FUEL-CAMPFIRE_FUEL_PER_LOG+.001)return 'The fire has plenty of wood. Let it burn down a little.';
  }
  addLog(){this.fuelSeconds=Math.min(CAMPFIRE_MAX_FUEL,this.fuelSeconds+CAMPFIRE_FUEL_PER_LOG);}
  replace(player:ScenicActor,tool=this.tools.get(player.id)){
    if(!marshmallowEquipped(player,tool)||player.lifeState!=='alive'||player.friendsDevFlight)return false;
    const state=this.roasts.get(player.id);if(state?.eatingMs||state?.refillMs)return false;
    this.roasts.set(player.id,fresh((this.roasts.get(player.id)?.serial??0)+1));return true;
  }
  eat(player:ScenicActor,tool=this.tools.get(player.id)){
    if(!marshmallowEquipped(player,tool)||player.lifeState!=='alive'||player.friendsDevFlight)return false;
    const state=this.roasts.get(player.id)??fresh();
    if(state.eatingMs||state.refillMs)return false;
    state.eatingMs=CAMPFIRE_EAT_MS;state.roasting=false;state.burningMs=0;state.heat=0;
    this.roasts.set(player.id,state);return true;
  }
  update(dt:number,players:readonly (ScenicActor & {swimming?:boolean})[],inputs:ReadonlyMap<string,MultiplayerInputFrame>,now=0){
    for(const [id,note]of Object.entries(this.feedback))if(note.until<=now||!players.some(p=>p.id===id))delete this.feedback[id];
    const seconds=Math.max(0,Math.min(100,dt))/1000;
    this.fuelSeconds=Math.max(0,this.fuelSeconds-seconds);
    const active=new Set<string>();
    this.equipped=[];
    for(const player of players){
      if(player.lifeState!=='alive')continue;
      active.add(player.id);
      const input=inputs.get(player.id);this.tools.set(player.id,input?.friendsTool);
      const held=marshmallowEquipped(player,input?.friendsTool)&&!input?.friendsFishingBlocked&&!player.friendsDevFlight&&!player.swimming;
      if(held)this.equipped.push(player.id);
      let state=this.roasts.get(player.id);if(!state&&held){state=fresh();this.roasts.set(player.id,state);}if(!state)continue;
      if(state.refillMs){
        state.refillMs=Math.max(0,state.refillMs-seconds*1000);
        if(!state.refillMs)this.roasts.set(player.id,fresh(state.serial+1));
        continue;
      }
      if(state.eatingMs){
        state.eatingMs=Math.max(0,state.eatingMs-seconds*1000);
        if(!state.eatingMs){delete state.eatingMs;state.refillMs=CAMPFIRE_REFILL_MS;}
        continue;
      }
      state.roasting=Boolean(held&&campfireRoastReach(player)&&input?.firing&&aimingAtCampfire(player,input.aimAngle/65535*Math.PI*2,input.aimPitch/65535*Math.PI*.88-Math.PI*.44));
      if(state.burningMs>0){state.burningMs=Math.max(0,state.burningMs-seconds*1000);if(!state.burningMs)state.charred=true;continue;}
      if(state.charred)continue;
      const target=state.roasting?campfireHeat(this.fuelSeconds):0;
      state.heat+=Math.max(-seconds*.95,Math.min(seconds*.8,target-state.heat));
      state.toast=Math.min(1,state.toast+state.heat*seconds*.055);
      if(state.toast>=1){state.burningMs=5000;state.heat=0;}
    }
    for(const id of this.roasts.keys())if(!active.has(id))this.roasts.delete(id);
    for(const id of this.tools.keys())if(!active.has(id))this.tools.delete(id);
  }
  snapshot():CampfireSnapshot{return {equipped:[...this.equipped],feedback:structuredClone(this.feedback),fuelSeconds:Math.round(this.fuelSeconds*10)/10,roasts:Object.fromEntries([...this.roasts].map(([id,state])=>[id,{...state,toast:Math.round(state.toast*1000)/1000,heat:Math.round(state.heat*1000)/1000}]))};}
}
