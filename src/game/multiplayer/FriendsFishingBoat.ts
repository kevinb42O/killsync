import type { FriendsVehicle } from './FriendsExpedition';
import type { MultiplayerInputFrame } from './protocol';
import type { FriendsTerrain } from '../world/FriendsTerrain';
import { friendsLiveWaterSurface } from '../world/FriendsFloodWater';
import { friendsWaterAt } from '../world/FriendsWaterSurface';
import { friendsCoastalPierSurface } from '../world/FriendsCoastalPier';
import { friendsSeasidePierSurface } from '../world/FriendsSeasidePier';
import { friendsBreakwaterSurface } from '../world/FriendsBreakwaters';
import { craneCollisionPieces, friendsPieceBoxes, type FriendsBuildPiece } from './FriendsBuilding';
import { orientedBuildBox } from './FriendsAssemblyPose';
import { boxOBB, overlapOBB } from './FriendsOrientedBox';
import { vehicleWorldPoint, vehicleLocalPoint } from './FriendsVehiclePose';
import { FISHING_BOAT_ID,FISHING_BOAT_HOME,FISHING_BOAT_LENGTH,FISHING_BOAT_WIDTH,FISHING_BOAT_DECK,fishingBoatHeave,fishingBoatPitch,fishingBoatInteraction } from '../world/FriendsFishingBoat';
import { ISLAND_SEA_LEVEL } from '../world/FriendsWaterBodies';
export type FishingBoatSave={x:number;y:number;angle:number;moored:boolean};
type Sailor={id:string;x:number;y:number;z:number;lifeState:string;angle?:number;friendsDevFlight?:boolean;friendsSeat?:{vehicleId:string;index:number};verticalVelocity?:number;velocityX?:number;velocityY?:number;sliding?:boolean;crouching?:boolean;swimming?:boolean;platformVelocityX?:number;platformVelocityY?:number;platformVelocityZ?:number};
export class FriendsFishingBoat {
  private pose: FishingBoatSave={...FISHING_BOAT_HOME,moored:true};
  private pilotId?:string;
  private speed=0;
  private rudder=0;
  private turnRate=0;
  private pilotLocal={x:62,y:-22,z:0};
  private elapsed=0;
  private clearanceTerrain?:FriendsTerrain;
  private clearanceRevision=-1;
  private clearanceEpoch=-1;
  private clearCells=new Set<number>();
  /** A clear 35-unit circle at a cell centre covers every 12-unit hull probe
   * inside that cell. Cache only clear cells; blocked cells still get the
   * original exact test so tight berths retain their navigation clearance. */
  private terrainBlocked(x:number,y:number){
    const terrain=this.terrain;if(!terrain)return false;
    if(terrain!==this.clearanceTerrain||terrain.revision!==this.clearanceRevision||terrain.waterEpoch!==this.clearanceEpoch){
      this.clearCells.clear();this.clearanceTerrain=terrain;this.clearanceRevision=terrain.revision;this.clearanceEpoch=terrain.waterEpoch;
    }
    const vx=Math.floor(x/32),vy=Math.floor(y/32),key=vx+vy*1500;
    if(this.clearCells.has(key))return false;
    if(!terrain.collide({x:vx*32+16,y:vy*32+16},ISLAND_SEA_LEVEL-40,35,260,0)){
      if(this.clearCells.size>=4096)this.clearCells.clear();this.clearCells.add(key);return false;
    }
    return terrain.collide({x,y},ISLAND_SEA_LEVEL-40,12,260,0);
  }
  // Each new world starts at the authored dock berth. Saved transport still
  // exposes the live pose for replication, but never restores a past trip.
  constructor(private terrain?:FriendsTerrain){}
  save():FishingBoatSave{return {...this.pose};}
  vehicle():FriendsVehicle{
    const {x,y,angle,moored}=this.pose;
    return {id:FISHING_BOAT_ID,kind:'fishingBoat',x,y,z:ISLAND_SEA_LEVEL+FISHING_BOAT_DECK+fishingBoatHeave(x,y,this.elapsed/1000),angle,
      pitch:fishingBoatPitch(this.elapsed/1000),length:FISHING_BOAT_LENGTH,width:FISHING_BOAT_WIDTH,pilotId:this.pilotId,moored,rudder:this.rudder,speed:this.speed};
  }
  release(id:string){if(this.pilotId===id){this.pilotId=undefined;this.speed=0;this.rudder=0;this.turnRate=0;}}
  interact(p:Sailor,players:readonly Sailor[]){
    if(p.lifeState!=='alive'||!fishingBoatInteraction(this.vehicle(),p))return false;
    if(this.pilotId===p.id)this.release(p.id);
    else{
      this.pilotId=p.id;this.pose.moored=false;
      const local=vehicleLocalPoint(this.vehicle(),p);this.pilotLocal={x:local.x,y:local.y,z:0};
    }
    p.verticalVelocity=0;p.velocityX=p.velocityY=0;p.sliding=false;p.crouching=false;p.swimming=false;p.platformVelocityX=p.platformVelocityY=p.platformVelocityZ=0;
    return true;
  }
  private fits(x:number,y:number,angle:number,pieces:readonly FriendsBuildPiece[]=[]){
    const c=Math.cos(angle),s=Math.sin(angle);
    // Continuous build overlap closes gaps between the water/terrain probes.
    const hull=boxOBB({x,y,z:ISLAND_SEA_LEVEL-40,w:FISHING_BOAT_LENGTH,d:FISHING_BOAT_WIDTH,h:260,angle});
    for(const piece of pieces)for(const part of craneCollisionPieces(piece))for(const box of friendsPieceBoxes(part)){
      const collider=orientedBuildBox(part,box);
      if(Math.hypot(collider.x-x,collider.y-y)>Math.hypot(FISHING_BOAT_LENGTH,FISHING_BOAT_WIDTH)/2+Math.hypot(collider.w,collider.d)/2)continue;
      if(overlapOBB(hull,boxOBB(collider),0))return false;
    }
    // Full hull perimeter, not merely its centre: catches shores and quay ends.
    for(const u of [-225,-150,-75,0,75,150,225])for(const w of [-90,0,90]){
      const px=x+u*c-w*s,py=y+u*s+w*c,water=this.terrain?friendsLiveWaterSurface(this.terrain,px,py):friendsWaterAt(px,py);
      if(!water||water.bodyId!=='sea'||water.depth<52)return false;
      if(friendsCoastalPierSurface(px,py)!==undefined||friendsSeasidePierSurface(px,py)!==undefined||friendsBreakwaterSurface(px,py)!==undefined)return false;
      if(this.terrainBlocked(px,py))return false;
    }return true;
  }
  update(dt:number,elapsed:number,players:readonly Sailor[],inputs:ReadonlyMap<string,MultiplayerInputFrame>,terrain?:FriendsTerrain,pieces:readonly FriendsBuildPiece[]=[]){
    this.terrain=terrain??this.terrain;this.elapsed=elapsed;
    const pilot=players.find(p=>p.id===this.pilotId&&p.lifeState==='alive'&&!p.friendsDevFlight);
    if(!pilot){this.pilotId=undefined;this.speed=0;this.rudder=0;this.turnRate=0;return;}
    const input=inputs.get(pilot.id),duration=Math.max(0,Math.min(dt,100)),steps=Math.max(1,Math.ceil(duration/40)),seconds=duration/1000/steps;
    for(let i=0;i<steps;i++){
      const throttle=input?Number(Boolean(input.movement&1))-Number(Boolean(input.movement&2)):0;
      const steer=input?Number(Boolean(input.movement&8))-Number(Boolean(input.movement&4)):0;
      const target=throttle*(throttle<0?85:220);
      this.rudder+=(steer-this.rudder)*(1-Math.exp(-6*seconds));
      this.speed+=(target-this.speed)*(1-Math.exp(-2.4*seconds));
      const targetTurn=this.rudder*.50*Math.min(1,Math.abs(this.speed)/110)*Math.sign(this.speed);
      // Hull yaw has inertia independent of the wheel: soften steering changes
      // and reversals without filtering the helm camera away from its deck.
      this.turnRate+=(targetTurn-this.turnRate)*(1-Math.exp(-3.5*seconds));
      if(Math.abs(this.speed)<.01){this.speed=0;this.turnRate=0;continue;}
      const angle=this.pose.angle+this.turnRate*seconds;
      const x=this.pose.x+Math.cos(angle)*this.speed*seconds,y=this.pose.y+Math.sin(angle)*this.speed*seconds;
      if(this.fits(x,y,angle,pieces))Object.assign(this.pose,{x,y,angle});
      else {
        // Keep a safe fraction of the turn when the stern is close to the
        // berth. Two bounded probes avoid alternating full yaw and zero yaw.
        let partial=false;
        for(const fraction of [.5,.25]){
          const limitedAngle=this.pose.angle+this.turnRate*seconds*fraction;
          const limitedX=this.pose.x+Math.cos(limitedAngle)*this.speed*seconds;
          const limitedY=this.pose.y+Math.sin(limitedAngle)*this.speed*seconds;
          if(this.fits(limitedX,limitedY,limitedAngle,pieces)){
            Object.assign(this.pose,{x:limitedX,y:limitedY,angle:limitedAngle});
            this.turnRate*=fraction;partial=true;break;
          }
        }
        if(!partial){
          const straightX=this.pose.x+Math.cos(this.pose.angle)*this.speed*seconds;
          const straightY=this.pose.y+Math.sin(this.pose.angle)*this.speed*seconds;
          if(this.fits(straightX,straightY,this.pose.angle,pieces))Object.assign(this.pose,{x:straightX,y:straightY});
          else this.speed=0;
          this.turnRate=0;
        }
      }
    }
    Object.assign(pilot,vehicleWorldPoint(this.vehicle(),this.pilotLocal));pilot.angle=this.pose.angle;pilot.verticalVelocity=0;pilot.velocityX=pilot.velocityY=0;pilot.sliding=false;pilot.crouching=false;
  }
}
