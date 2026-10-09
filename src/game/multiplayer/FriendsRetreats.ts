import { retreatPaths,retreatWorkReserved } from '../world/FriendsRetreatPaths';
import { boxOBB,overlapOBB } from './FriendsOrientedBox';
import { RETREAT_SITES, RETREAT_SEATS, RETREAT_BOXES, RETREAT_SWITCH, STILLWATER, isRetreatSeat, insideStillwater, retreatFloor, collideRetreats, retreatLocal, type RetreatState, type RetreatSave, type RetreatPoint } from '../world/FriendsRetreatSites';
import type { ScenicActor } from './FriendsScenicService';
import type { FriendsTerrain } from '../world/FriendsTerrain';
import { friendsShapeBoxes, worldBox, type FriendsBuildPiece } from './FriendsBuilding';

type Actor=ScenicActor&{angle?:number;aimPitch?:number};
export function retreatSwitchPrompt(player:Actor,state:RetreatState|undefined){
  if(!state||player.lifeState!=='alive'||player.friendsSeat||player.friendsDevFlight||!insideStillwater(player,state.active))return;
  const dx=RETREAT_SWITCH.x-player.x,dy=RETREAT_SWITCH.y-player.y,dz=RETREAT_SWITCH.z-player.z-26,d=Math.hypot(dx,dy,dz);
  if(d>38)return;
  const angle=player.angle??0;if((dx*Math.cos(angle)+dy*Math.sin(angle))/Math.max(.001,Math.hypot(dx,dy))<.9)return;
  return {label:state.lightsOn?'Lights off':'Lights on',point:RETREAT_SWITCH};
}
export function retreatSeatPrompt(player:Actor,players:readonly Actor[],state:RetreatState|undefined){
  if(!state||player.lifeState!=='alive'||player.friendsDevFlight)return;
  if(isRetreatSeat(player.friendsSeat))return {label:'Stand up · free walk',seat:player.friendsSeat!};
  if(player.friendsSeat)return;
  let distance=44,result:{label:string;seat:{vehicleId:string;index:number}}|undefined;
  for(const s of RETREAT_SEATS){
    if(!state.active.includes(s.siteId as any)||Math.abs(player.z-s.z+16)>14||players.some(p=>p.friendsSeat?.vehicleId===s.siteId&&p.friendsSeat.index===s.index))continue;
    const d=Math.hypot(player.x-s.x,player.y-s.y);if(d>=distance)continue;
    distance=d;result={label:s.siteId===STILLWATER.id?'Sit on the couch':'Sit · enjoy the view',seat:{vehicleId:s.siteId,index:s.index}};
  }return result;
}
export class FriendsRetreats {
  readonly state:RetreatState;
  constructor(save?:RetreatSave){const selected=save?.version===1&&Array.isArray(save.active)?save.active:undefined;this.state={version:1,active:RETREAT_SITES.filter(s=>!selected||selected.includes(s.id)).map(s=>s.id),lightsOn:save?.lightsOn!==false,switchSerial:0};}
  /** Run once after loading buildings. Existing construction and edits win. */
  configure(pieces:readonly FriendsBuildPiece[],terrain?:FriendsTerrain){
    this.state.active=this.state.active.filter(id=>{
      const site=RETREAT_SITES.find(s=>s.id===id)!;
      for(const p of pieces)if(!p.attachment)for(const box of friendsShapeBoxes(p.shape)){
        const b=worldBox(p,box),q=retreatLocal(site,b),r=Math.hypot(b.w,b.d)/2;
        if(Math.abs(q.u)<site.w/2+r+24&&Math.abs(q.v)<site.d/2+r+32&&b.z<site.z+100&&b.z+b.h>site.z-100)return false;
      }
      const path=retreatPaths().find(p=>p.siteId===id)!;
      if(pieces.some(p=>!p.attachment&&friendsShapeBoxes(p.shape).some(local=>{const b=worldBox(p,local);return path.points.some(q=>Math.hypot(q.x-b.x,q.y-b.y)<Math.hypot(b.w,b.d)/2+24&&b.z<q.z+64&&b.z+b.h>q.z-80);})))return false;
      if((terrain?.snapshot().edits??[]).some(([x,y,z])=>retreatWorkReserved({x:(x+.5)*32,y:(y+.5)*32,z:(z+.5)*32},[id])))return false;
      return !(terrain?.snapshot().edits??[]).some(([x,y,z])=>{const q=retreatLocal(site,{x:(x+.5)*32,y:(y+.5)*32});return Math.abs(q.u)<site.w/2+24&&Math.abs(q.v)<site.d/2+24&&Math.abs((z+.5)*32-site.z)<120;});
    });
  }
  constructionConflict(box:{x:number;y:number;z:number;w:number;d:number;h:number}){
    return RETREAT_SITES.some(s=>this.state.active.includes(s.id)&&overlapOBB(boxOBB({...s,kind:'box',w:s.w+32,d:s.d+32,z:s.z-8,h:('height' in s?s.height:48)+24}),boxOBB(box)))||
      retreatPaths().some(path=>this.state.active.includes(path.siteId as any)&&path.points.some(p=>Math.hypot(p.x-box.x,p.y-box.y)<Math.hypot(box.w,box.d)/2+20&&box.z<p.z+64&&box.z+box.h>p.z-16));
  }
  private clear(p:RetreatPoint,players:readonly Actor[],id:string,terrain?:FriendsTerrain){
    const q={x:p.x,y:p.y};if(collideRetreats(q,p.z,13,this.state.active)||Math.hypot(q.x-p.x,q.y-p.y)>.01)return false;
    if(terrain?.collide(q,p.z,13,50,8))return false;
    return !players.some(a=>a.id!==id&&a.lifeState==='alive'&&Math.abs(a.z-p.z)<40&&Math.hypot(a.x-p.x,a.y-p.y)<26);
  }
  stand(player:Actor,players:readonly Actor[],terrain?:FriendsTerrain){
    const s=RETREAT_SEATS.find(s=>s.siteId===player.friendsSeat?.vehicleId&&s.index===player.friendsSeat?.index);
    if(!s){delete player.friendsSeat;player.crouching=false;return true;}
    const candidates=[s.exit,...[-1,1].flatMap(side=>[28,40].map(d=>({x:s.exit.x-Math.sin(s.angle)*side*d,y:s.exit.y+Math.cos(s.angle)*side*d,z:s.exit.z})))];
    for(const candidate of candidates){
      const floor=retreatFloor({...candidate,z:candidate.z+8},this.state.active)??terrain?.floor(candidate.x,candidate.y,candidate.z+8,8);
      if(floor===undefined||Math.abs(floor-s.exit.z)>8)continue;
      const p={...candidate,z:floor};if(!this.clear(p,players,player.id,terrain))continue;
      Object.assign(player,p,{crouching:false,verticalVelocity:0,velocityX:0,velocityY:0});delete player.friendsSeat;return true;
    }return false;
  }
  interact(player:Actor,players:readonly Actor[],terrain?:FriendsTerrain){
    if(isRetreatSeat(player.friendsSeat))return this.stand(player,players,terrain);
    const light=retreatSwitchPrompt(player,this.state);
    if(light){
      const dx=RETREAT_SWITCH.x-player.x,dy=RETREAT_SWITCH.y-player.y,dz=RETREAT_SWITCH.z-player.z-26,d=Math.hypot(dx,dy,dz),pitch=player.aimPitch??0;
      if((Math.cos(player.angle??0)*Math.cos(pitch)*dx+Math.sin(player.angle??0)*Math.cos(pitch)*dy+Math.sin(pitch)*dz)/d<.9)return false;
      this.state.lightsOn=!this.state.lightsOn;this.state.switchSerial++;this.state.switchBy=player.id;return true;
    }
    const prompt=retreatSeatPrompt(player,players,this.state);if(!prompt)return false;
    const s=RETREAT_SEATS.find(s=>s.siteId===prompt.seat.vehicleId&&s.index===prompt.seat.index)!;
    // Never let proximity teleport a player through the house wall or window.
    for(let i=1;i<8;i++){
      const f=i/8,p={x:player.x+(s.x-player.x)*f,y:player.y+(s.y-player.y)*f,z:player.z+26};
      if(RETREAT_BOXES.some(b=>(b.surface==='wall'||b.surface==='glass')&&b.siteId===s.siteId&&p.z>b.z&&p.z<b.z+b.h&&Math.abs(retreatLocal(b,p).u)<b.w/2&&Math.abs(retreatLocal(b,p).v)<b.d/2))return false;
      if(terrain?.material(Math.floor(p.x/32),Math.floor(p.y/32),Math.floor(p.z/32)))return false;
    }
    player.friendsSeat=prompt.seat;Object.assign(player,{x:s.x,y:s.y,z:s.z,angle:s.angle,crouching:true,sprinting:false,sliding:false,jetActive:false,verticalVelocity:0,velocityX:0,velocityY:0});return true;
  }
  update(players:readonly Actor[],jumping:ReadonlySet<string>,terrain?:FriendsTerrain){
    for(const p of players){if(!isRetreatSeat(p.friendsSeat))continue;
      const s=RETREAT_SEATS.find(s=>s.siteId===p.friendsSeat?.vehicleId&&s.index===p.friendsSeat?.index);
      if(!s||p.lifeState!=='alive'||p.friendsDevFlight||!this.state.active.includes(s.siteId as any)){delete p.friendsSeat;p.crouching=false;continue;}
      if(jumping.has(p.id)&&this.stand(p,players,terrain))continue;
      Object.assign(p,{x:s.x,y:s.y,z:s.z,crouching:true,sprinting:false,sliding:false,jetActive:false,verticalVelocity:0,velocityX:0,velocityY:0});
    }
  }
  snapshot():RetreatState{return {...this.state,active:[...this.state.active]};}
  save():RetreatSave{return {version:1,active:[...this.state.active],lightsOn:this.state.lightsOn};}
}
