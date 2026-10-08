import { useEffect, useRef, useState } from 'react';
import type { HaulingSnapshot } from '../game/multiplayer/FriendsHauling';
import { cargoDelivered } from '../game/world/FriendsHaulingGoal';

export type HaulingBriefing={cargoId:string;kind:'mission'|'complete'};
/** Observe attachment edges, rather than fresh network objects on every tick. */
export class HaulingBriefingTracker{
  private playerId='';
  private previousCargoId?:string;
  private completed=new Set<string>();
  private initialized=false;
  observe(hauling:HaulingSnapshot|undefined,playerId:string):HaulingBriefing|undefined{
    if(!hauling||this.playerId!==playerId){
      this.playerId=playerId;this.previousCargoId=undefined;this.completed.clear();this.initialized=false;
      if(!hauling)return;
    }
    const completed=new Set(hauling.cargo.filter(c=>cargoDelivered(hauling,c)).map(c=>c.id));
    const newlyDelivered=this.initialized?hauling.cargo.find(c=>completed.has(c.id)&&!this.completed.has(c.id)):undefined;
    this.completed=completed;this.initialized=true;
    const cargoId=hauling.ropes.find(r=>r.id===playerId)?.cargoId;
    const attached=cargoId!==this.previousCargoId&&hauling.cargo.some(c=>c.id===cargoId);
    this.previousCargoId=cargoId;
    if(newlyDelivered)return {cargoId:newlyDelivered.id,kind:'complete'};
    if(attached)return {cargoId:cargoId!,kind:completed.has(cargoId!)?'complete':'mission'};
  }
}
export function useFriendsHaulingBriefing(hauling:HaulingSnapshot|undefined,playerId:string,suppressed=false){
  const tracker=useRef(new HaulingBriefingTracker());
  const [briefing,setBriefing]=useState<HaulingBriefing|null>(null);
  useEffect(()=>{
    const event=tracker.current.observe(hauling,playerId);
    if(suppressed)setBriefing(null);
    else if(event)setBriefing(event);
    else if(!hauling)setBriefing(null);
  },[hauling,playerId,suppressed]);
  return {briefing,dismiss:()=>setBriefing(null),show:(cargoId:string)=>{
    const cargo=hauling?.cargo.find(c=>c.id===cargoId);
    if(cargo)setBriefing({cargoId,kind:cargoDelivered(hauling!,cargo)?'complete':'mission'});
  }};
}
