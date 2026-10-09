import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import { cookingFireFor,isRoastingSeat,COOKING_FIRES,type CookingFire } from '../world/FriendsCookingFires';
import type { ScenicActor } from './FriendsScenicService';
import type { MultiplayerInputFrame } from './protocol';
import { firstPersonEyeZ } from './FirstPersonEye';

export const CAMPFIRE_FUEL_PER_LOG = 30;
export const CAMPFIRE_MAX_FUEL = 180;
export const CAMPFIRE_EAT_MS = 1000;
export const CAMPFIRE_REFILL_MS = 5000;
export const MARSHMALLOW_TOOL = 10 as const;
const CAMPFIRE_ROAST_REACH = 260;
const CAMPFIRE_ROAST_RAY_LENGTH = 300;
const CAMPFIRE_ROAST_HIT_RADIUS = 54;
export const MARSHMALLOW_FORWARD_REACH = 124;
export type MarshmallowTip = { x:number; y:number; z:number };
export type MarshmallowState = { toast:number; heat:number; roasting:boolean; burningMs:number; charred:boolean; serial:number; eatingMs?:number; refillMs?:number; reach?:MarshmallowTip };
export type CampfireSnapshot = { equipped?:string[]; fuelSeconds:number; siteFuelSeconds?:Record<string,number>; roasts:Record<string,MarshmallowState>; feedback?:Record<string,{message:string;until:number}> };
export type CampfireAction = 'campfire_fuel'|'campfire_fresh'|'campfire_eat';
const fresh=(serial=1):MarshmallowState=>({toast:0,heat:0,roasting:false,burningMs:0,charred:false,serial});
export function campfireNearby(player:ScenicActor,fire=cookingFireFor(player)){
  return player.lifeState==='alive'&&!player.friendsDevFlight&&Boolean(fire);
}
export function campfireHeat(fuelSeconds:number){return 1+Math.max(0,Math.min(1,fuelSeconds/CAMPFIRE_MAX_FUEL))*.8;}
export function marshmallowLabel(state:MarshmallowState|undefined){
  return !state?'Fresh marshmallow':state.burningMs>0?'On fire!':state.charred?'Burnt to a crisp':state.toast>.78?'Dark brown':state.toast>.4?'Golden brown':state.toast>.12?'Getting toasty':'Fresh marshmallow';
}
export function aimingAtCampfire(player:ScenicActor,angle:number,pitch:number,fire=cookingFireFor(player)){
  if(!fire)return false;
  const hitRadius=fire.scale===1?CAMPFIRE_ROAST_HIT_RADIUS:20;
  if(!Number.isFinite(angle)||!Number.isFinite(pitch))return false;
  if(!isRoastingSeat(player.friendsSeat)){
    const tip=marshmallowReachTip(player,angle,pitch);
    return Math.hypot(tip.x-fire.x,tip.y-fire.y,tip.z-(fire.z+48*fire.scale))<=hitRadius;
  }
  // Preserve the seated aim-ray tolerance and its established roasting pose.
  const dx=Math.cos(angle)*Math.cos(pitch),dy=Math.sin(angle)*Math.cos(pitch),dz=Math.sin(pitch);
  const ox=player.x,oy=player.y,oz=player.z+45;
  const tx=fire.x,ty=fire.y,tz=fire.z+42*fire.scale;
  const along=(tx-ox)*dx+(ty-oy)*dy+(tz-oz)*dz;
  if(along<=0||along>CAMPFIRE_ROAST_RAY_LENGTH)return false;
  const missX=ox+dx*along-tx,missY=oy+dy*along-ty,missZ=oz+dz*along-tz;
  return missX*missX+missY*missY+missZ*missZ<=hitRadius*hitRadius;
}
/** Standing sticks follow the look direction at a finite reach. Rendering and
 * cooking use this same tip, so looking at a distant fire cannot stretch it. */
export function marshmallowReachTip(player:ScenicActor,angle:number,pitch:number):MarshmallowTip{
  const horizontal=Math.cos(pitch)*MARSHMALLOW_FORWARD_REACH;
  return {x:player.x+Math.cos(angle)*horizontal,y:player.y+Math.sin(angle)*horizontal,z:firstPersonEyeZ(player)+Math.sin(pitch)*MARSHMALLOW_FORWARD_REACH};
}
export function campfireRoastReach(player:ScenicActor,fire=cookingFireFor(player)){
  return campfireNearby(player,fire)&&Boolean(fire&&Math.abs(player.z-fire.z)<64&&Math.hypot(player.x-fire.x,player.y-fire.y)<CAMPFIRE_ROAST_REACH);
}
export function marshmallowEquipped(player:ScenicActor,tool:number|undefined){
  return tool===MARSHMALLOW_TOOL||(tool===undefined&&isRoastingSeat(player.friendsSeat));
}
/** Host owns timber spending, shared fuel and each player's cooking. Clients
 * only animate the compact state; there are no replicated particles. */
export class FriendsCampfireSimulation {
  fuelSeconds:number;
  private siteFuel:Record<string,number>={};
  private activeSites:readonly string[]|undefined;
  setActiveSites(active:readonly string[]){this.activeSites=active;}
  private source(player:ScenicActor){return cookingFireFor(player,this.activeSites);}
  private fuelAt(fire:CookingFire){return fire.id===FRIENDS_CAMPFIRE.id?this.fuelSeconds:this.siteFuel[fire.id]??0;}
  private roasts=new Map<string,MarshmallowState>();
  private equipped:string[]=[];
  private tools=new Map<string,number|undefined>();
  private feedback:Record<string,{message:string;until:number}>={};
  notice(id:string,message:string,now:number){this.feedback[id]={message,until:now+4200};}
  constructor(savedFuel=0,savedSiteFuel:Record<string,number>={}){
    for(const fire of COOKING_FIRES)if(fire.id!==FRIENDS_CAMPFIRE.id&&Number.isFinite(savedSiteFuel[fire.id]))this.siteFuel[fire.id]=Math.max(0,Math.min(CAMPFIRE_MAX_FUEL,savedSiteFuel[fire.id]));
    this.fuelSeconds=Number.isFinite(savedFuel)?Math.max(0,Math.min(CAMPFIRE_MAX_FUEL,savedFuel)):0;
  }
  fuelError(player:ScenicActor){
    const fire=this.source(player);
    if(!fire||!campfireNearby(player,fire))return 'Stand beside the campfire or sit down to add timber.';
    if(fire&&this.fuelAt(fire)>CAMPFIRE_MAX_FUEL-CAMPFIRE_FUEL_PER_LOG+.001)return 'The fire has plenty of wood. Let it burn down a little.';
  }
  addLog(player?:ScenicActor){
    const fire=player?this.source(player):COOKING_FIRES[0];if(!fire)return;
    if(fire.id===FRIENDS_CAMPFIRE.id)this.fuelSeconds=Math.min(CAMPFIRE_MAX_FUEL,this.fuelSeconds+CAMPFIRE_FUEL_PER_LOG);
    else this.siteFuel[fire.id]=Math.min(CAMPFIRE_MAX_FUEL,(this.siteFuel[fire.id]??0)+CAMPFIRE_FUEL_PER_LOG);
  }
  replace(player:ScenicActor,tool=this.tools.get(player.id)){
    if(!marshmallowEquipped(player,tool)||player.lifeState!=='alive'||player.friendsDevFlight)return false;
    const state=this.roasts.get(player.id);if(state?.eatingMs||state?.refillMs)return false;
    this.roasts.set(player.id,fresh((this.roasts.get(player.id)?.serial??0)+1));return true;
  }
  eat(player:ScenicActor,tool=this.tools.get(player.id)){
    if(!marshmallowEquipped(player,tool)||player.lifeState!=='alive'||player.friendsDevFlight)return false;
    const state=this.roasts.get(player.id)??fresh();
    if(state.eatingMs||state.refillMs)return false;
    state.eatingMs=CAMPFIRE_EAT_MS;state.roasting=false;state.burningMs=0;state.heat=0;delete state.reach;
    this.roasts.set(player.id,state);return true;
  }
  update(dt:number,players:readonly (ScenicActor & {swimming?:boolean})[],inputs:ReadonlyMap<string,MultiplayerInputFrame>,now=0){
    for(const [id,note]of Object.entries(this.feedback))if(note.until<=now||!players.some(p=>p.id===id))delete this.feedback[id];
    const seconds=Math.max(0,Math.min(100,dt))/1000;
    this.fuelSeconds=Math.max(0,this.fuelSeconds-seconds);
    for(const id of Object.keys(this.siteFuel))this.siteFuel[id]=Math.max(0,this.siteFuel[id]-seconds);
    const active=new Set<string>();
    this.equipped=[];
    for(const player of players){
      if(player.lifeState!=='alive')continue;
      active.add(player.id);
      const input=inputs.get(player.id);this.tools.set(player.id,input?.friendsTool);
      const held=marshmallowEquipped(player,input?.friendsTool)&&!input?.friendsFishingBlocked&&!player.friendsDevFlight&&!player.swimming;
      if(held)this.equipped.push(player.id);
      let state=this.roasts.get(player.id);if(!state&&held){state=fresh();this.roasts.set(player.id,state);}if(!state)continue;
      delete state.reach;
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
      const angle=(input?.aimAngle??0)/65535*Math.PI*2,pitch=(input?.aimPitch??32768)/65535*Math.PI*.88-Math.PI*.44;
      if(held&&input?.firing&&!isRoastingSeat(player.friendsSeat))state.reach=marshmallowReachTip(player,angle,pitch);
      const fire=this.source(player);
      state.roasting=Boolean(held&&fire&&campfireRoastReach(player,fire)&&input?.firing&&aimingAtCampfire(player,angle,pitch,fire));
      if(state.burningMs>0){state.burningMs=Math.max(0,state.burningMs-seconds*1000);if(!state.burningMs)state.charred=true;continue;}
      if(state.charred)continue;
      const target=state.roasting&&fire?campfireHeat(this.fuelAt(fire)):0;
      state.heat+=Math.max(-seconds*.95,Math.min(seconds*.8,target-state.heat));
      state.toast=Math.min(1,state.toast+state.heat*seconds*.055);
      if(state.toast>=1){state.burningMs=5000;state.heat=0;}
    }
    for(const id of this.roasts.keys())if(!active.has(id))this.roasts.delete(id);
    for(const id of this.tools.keys())if(!active.has(id))this.tools.delete(id);
  }
  siteFuelSave(){return {...this.siteFuel};}
  snapshot():CampfireSnapshot{return {siteFuelSeconds:Object.fromEntries(Object.entries(this.siteFuel).map(([id,n])=>[id,Math.round(n*10)/10])),equipped:[...this.equipped],feedback:structuredClone(this.feedback),fuelSeconds:Math.round(this.fuelSeconds*10)/10,roasts:Object.fromEntries([...this.roasts].map(([id,state])=>[id,{...state,toast:Math.round(state.toast*1000)/1000,heat:Math.round(state.heat*1000)/1000}]))};}
}
