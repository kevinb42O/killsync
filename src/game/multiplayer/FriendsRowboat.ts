import type { FriendsVehicle } from './FriendsExpedition';
import type { MultiplayerInputFrame } from './protocol';
import type { FriendsTerrain } from '../world/FriendsTerrain';
import { friendsWaterAt } from '../world/FriendsWaterSurface';
import { riverWetAt } from '../world/FriendsHydrology';
import { resolveFriendsBuildCollisions, type FriendsBuildPiece } from './FriendsBuilding';
import { vehicleLocalPoint, vehiclePlaneHeight, vehicleWorldPoint } from './FriendsVehiclePose';
import { FRIENDS_FISHING_DOCK, FRIENDS_OPPOSITE_BOAT } from '../world/FriendsFishingDock';

export const ROWBOAT_ID='reedwater-skiff';
export const OPPOSITE_ROWBOAT_ID='deepmere-skiff';
export const ROWBOAT_LENGTH=164,ROWBOAT_WIDTH=82,ROW_STROKE_MS=900;
export type RowStroke={atMs:number;direction:1|-1;playerId?:string};
export type RowingSnapshot={left:RowStroke;right:RowStroke;speed:number};
export type RowboatSave={x:number;y:number;angle:number};
type Rower={id:string;x:number;y:number;z:number;angle?:number;lifeState:string;friendsDevFlight?:boolean;friendsSeat?:{vehicleId:string;index:number};verticalVelocity?:number;crouching?:boolean;platformVelocityX?:number;platformVelocityY?:number;platformVelocityZ?:number};
const MOORING_ACROSS=-130;
const home={
  x:FRIENDS_FISHING_DOCK.x-MOORING_ACROSS*Math.sin(FRIENDS_FISHING_DOCK.angle),
  y:FRIENDS_FISHING_DOCK.y+MOORING_ACROSS*Math.cos(FRIENDS_FISHING_DOCK.angle),
  angle:FRIENDS_FISHING_DOCK.angle,
};
export function isRowboatSeat(seat:{vehicleId:string;index:number}|undefined){return seat?.vehicleId===ROWBOAT_ID||seat?.vehicleId===OPPOSITE_ROWBOAT_ID;}
export function rowboatStrokePhase(stroke:RowStroke,elapsed:number){return Math.max(0,Math.min(1,(elapsed-stroke.atMs)/ROW_STROKE_MS));}
// Keep rowers above the thick inner gunwale and at the same height for local
// prediction, host simulation and interpolated snapshots.
export function rowboatSeatPoint(v:FriendsVehicle,index:number,centered=false){return vehicleWorldPoint(v,{x:8,y:centered?0:index===0?20:-20,z:20});}
/** One shared skiff. Oar impulses are consumed once by the host; a held key
 * never supplies propulsion. It stays moored during play and returns to the
 * Deepmere dock whenever a world is loaded. */
export class FriendsRowboat{
  readonly id:string;
  private pose:RowboatSave;
  private home:RowboatSave;
  private terrain?:FriendsTerrain;
  private pieces:readonly FriendsBuildPiece[]=[];
  private vx=0;private vy=0;private turn=0;
  private left:RowStroke={atMs:-10000,direction:1};
  private right:RowStroke={atMs:-10000,direction:1};
  private observed=new Map<string,{fire:number;back:number}>();
  private observedMovement=new Map<string,number>();
  constructor(saved?:RowboatSave,terrain?:FriendsTerrain,id=ROWBOAT_ID,homePose:RowboatSave=home){this.id=id;this.home={...homePose};this.terrain=terrain;this.pose=saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)&&Number.isFinite(saved.angle)&&Math.abs(saved.angle)<1e6&&this.fits(saved.x,saved.y,saved.angle,terrain)?{...saved}:{...this.home};}
  save():RowboatSave{return {...this.pose};}
  vehicle():FriendsVehicle{
    const {x,y,angle}=this.pose,water=friendsWaterAt(x,y)?.level??154.5;
    const a=friendsWaterAt(x+Math.cos(angle)*56,y+Math.sin(angle)*56)?.level??water;
    const b=friendsWaterAt(x-Math.cos(angle)*56,y-Math.sin(angle)*56)?.level??water;
    return {id:this.id,kind:'rowboat',x,y,z:water+5,angle,pitch:Math.atan2(a-b,112),length:ROWBOAT_LENGTH,width:ROWBOAT_WIDTH,
      rowing:{left:{...this.left},right:{...this.right},speed:Math.hypot(this.vx,this.vy)}};
  }
  release(id:string){for(const s of [this.left,this.right])if(s.playerId===id)s.playerId=undefined;this.observed.delete(id);this.observedMovement.delete(id);}
  private fits(x:number,y:number,angle:number,terrain?:FriendsTerrain,pieces:readonly FriendsBuildPiece[]=[]){
    const c=Math.cos(angle),s=Math.sin(angle);
    for(const [u,v]of [[0,0],[-68,0],[68,0],[-38,-27],[-38,27],[38,-27],[38,27]]){
      const px=x+u*c-v*s,py=y+u*s+v*c,water=friendsWaterAt(px,py);
      if(!water||water.depth<22)return false;
      if(terrain){
        const floor=terrain.floor(px,py,water.level,0),roof=terrain.ceiling(px,py,water.level-12);
        if(floor!==undefined&&floor>water.level-20||roof!==undefined&&roof<water.level+66)return false;
        const p={x:px,y:py};if(terrain.collide(p,water.level-12,12,70,0))return false;
      }
      if(pieces.length&&resolveFriendsBuildCollisions(pieces,{x:px,y:py},water.level-12,12,70,0))return false;
    }return true;
  }
  interact(p:Rower,players:readonly Rower[]){
    if(p.friendsSeat?.vehicleId===this.id){
      const index=p.friendsSeat.index,v=this.vehicle();
      // Stand at the bow or stern on the gunwale plane. Dismounting into the
      // surrounding water made the boat feel like a trap instead of a deck.
      const deckSpots=index===0?[[-42,0],[42,0],[0,0],[-52,16],[52,-16],[-52,-16],[52,16]]:[[42,0],[-42,0],[0,0],[52,-16],[-52,16],[52,16],[-52,-16]];
      const exit=deckSpots.map(([u,w])=>{
        const q=vehicleWorldPoint(v,{x:u,y:w,z:0});q.z=vehiclePlaneHeight(v,q.x,q.y,10);
        if(this.terrain?.collide({...q},q.z,19,50,0)||resolveFriendsBuildCollisions(this.pieces,{...q},q.z,19,50,0))return;
        if(players.some(a=>a.id!==p.id&&a.lifeState==='alive'&&Math.hypot(a.x-q.x,a.y-q.y,a.z-q.z)<38))return;
        return q;
      }).find(q=>q!==undefined);
      if(!exit)return false;
      Object.assign(p,exit);p.friendsSeat=undefined;p.crouching=false;p.verticalVelocity=0;p.platformVelocityX=p.platformVelocityY=p.platformVelocityZ=0;
      for(const stroke of [this.left,this.right])if(stroke.playerId===p.id)stroke.playerId=undefined;return true;
    }
    if(p.friendsSeat||p.lifeState!=='alive'||p.friendsDevFlight)return false;
    const v=this.vehicle();if(Math.abs(p.z-v.z)>90||Math.hypot(p.x-v.x,p.y-v.y)>140)return false;
    const local=vehicleLocalPoint(v,p),preferred=local.y>=0?0:1,solo=!players.some(a=>a.id!==p.id&&a.friendsSeat?.vehicleId===this.id&&a.lifeState==='alive');
    const index=[preferred,1-preferred].find(index=>!players.some(a=>a.id!==p.id&&a.friendsSeat?.vehicleId===this.id&&a.friendsSeat.index===index&&a.lifeState==='alive'));
    if(index===undefined)return false;
    this.observed.set(p.id,this.observed.get(p.id)??{fire:0,back:0});
    this.observedMovement.set(p.id,this.observedMovement.get(p.id)??0);
    p.friendsSeat={vehicleId:this.id,index};Object.assign(p,rowboatSeatPoint(v,index,solo));p.angle=v.angle+Math.PI;p.crouching=true;p.verticalVelocity=0;
    const stroke=index===0?this.left:this.right;stroke.playerId=p.id;stroke.atMs=-10000;stroke.direction=1;return true;
  }
  update(dt:number,elapsed:number,players:readonly Rower[],inputs:ReadonlyMap<string,MultiplayerInputFrame>,terrain?:FriendsTerrain,pieces:readonly FriendsBuildPiece[]=[]){
    this.terrain=terrain??this.terrain;this.pieces=pieces;
    for(const stroke of [this.left,this.right])stroke.playerId=undefined;
    const rowers:Rower[]=[],previousActions=new Map<string,{fire:number;back:number}>(),previousMovement=new Map<string,number>();
    for(const p of players){
      const command=inputs.get(p.id),action=command?.fireActionId??0,back=command?.altFireActionId??0,movement=command?.movement??0,last=this.observed.get(p.id)??{fire:action,back},lastMovement=this.observedMovement.get(p.id)??movement;
      previousActions.set(p.id,last);
      previousMovement.set(p.id,lastMovement);
      this.observed.set(p.id,{fire:Math.max(action,last.fire),back:Math.max(back,last.back)});
      this.observedMovement.set(p.id,movement);
      if(p.friendsSeat?.vehicleId!==this.id)continue;
      if(p.lifeState!=='alive'||p.friendsDevFlight||(p.friendsSeat!.index!==0&&p.friendsSeat!.index!==1)){p.friendsSeat=undefined;p.crouching=false;continue;}
      if(command?.jumpPressed){this.interact(p,players);continue;}
      rowers.push(p);
    }
    for(const p of rowers){
      const sideStroke=p.friendsSeat!.index===0?this.left:this.right;
      const command=inputs.get(p.id),action=command?.fireActionId??0,back=command?.altFireActionId??0,previous=previousActions.get(p.id)!,movement=command?.movement??0,previousMove=previousMovement.get(p.id)!;
      const leftEdge=Boolean((movement&4)&&!(previousMove&4)),rightEdge=Boolean((movement&8)&&!(previousMove&8));
      const strokes=rowers.length===1?[this.left,this.right]:[sideStroke];
      for(const stroke of strokes)stroke.playerId=p.id;
      if(rowers.length===1&&(leftEdge||rightEdge)){
        const direction:1|-1=movement&2?-1:1;
        if(leftEdge&&elapsed-this.left.atMs>=ROW_STROKE_MS){this.left.atMs=elapsed;this.left.direction=direction;}
        if(rightEdge&&elapsed-this.right.atMs>=ROW_STROKE_MS){this.right.atMs=elapsed;this.right.direction=direction;}
      }else if(action>previous.fire||back>previous.back){
        const direction:1|-1=back>previous.back?-1:1;
        if(strokes.every(stroke=>elapsed-stroke.atMs>=ROW_STROKE_MS))for(const stroke of strokes){stroke.atMs=elapsed;stroke.direction=direction;}
      }
    }
    if(!rowers.length){this.vx=this.vy=this.turn=0;return;}
    const duration=Math.max(0,Math.min(dt,100)),count=Math.max(1,Math.ceil(duration/(1000/120))),seconds=duration/1000/count;
    for(let step=0;step<count;step++){
      const t=elapsed-duration+(step+1)*seconds*1000;
      const force=(stroke:RowStroke)=>{const phase=rowboatStrokePhase(stroke,t);return stroke.playerId&&phase>.12&&phase<.68?Math.sin((phase-.12)/.56*Math.PI)*stroke.direction:0;};
      const l=force(this.left),r=force(this.right),angle=this.pose.angle,c=Math.cos(angle),s=Math.sin(angle);
      const current=riverWetAt(this.pose.x,this.pose.y),drift=current?8+current.roughness*12:0;
      const drag=1-Math.exp(-1.5*seconds);
      this.vx+=(current?.tx??0)*drift*drag-this.vx*drag+(l+r)*240*c*seconds;
      this.vy+=(current?.ty??0)*drift*drag-this.vy*drag+(l+r)*240*s*seconds;
      // Remove broadside skid while retaining gentle downstream drift.
      const lateral=-this.vx*s+this.vy*c;
      this.vx+=lateral*s*seconds*2;this.vy-=lateral*c*seconds*2;
      const speed=Math.hypot(this.vx,this.vy);if(speed>135){this.vx*=135/speed;this.vy*=135/speed;}
      this.turn+=(r-l)*2.4*seconds;this.turn*=Math.exp(-2.8*seconds);
      const nextAngle=angle+this.turn*seconds,nx=this.pose.x+this.vx*seconds,ny=this.pose.y+this.vy*seconds;
      if(this.fits(nx,ny,nextAngle,terrain,pieces)){this.pose={x:nx,y:ny,angle:nextAngle};}
      else{
        if(this.fits(this.pose.x,this.pose.y,nextAngle,terrain,pieces))this.pose.angle=nextAngle;
        this.vx*=Math.exp(-14*seconds);this.vy*=Math.exp(-14*seconds);this.turn*=Math.exp(-8*seconds);
      }
    }
    const v=this.vehicle();for(const p of rowers){
      Object.assign(p,rowboatSeatPoint(v,p.friendsSeat!.index,rowers.length===1));p.angle=v.angle+Math.PI;p.verticalVelocity=0;p.crouching=true;
    }
  }
}
