import { isQuietSeat } from '../world/FriendsRetreatSites';
import { SCENIC_WAGONS, SCENIC_CAR_LENGTH, SCENIC_CAR_SPACING, SCENIC_TAIL_DISTANCE, SCENIC_STOP_OFFSET, SCENIC_MAX_KMH, SCENIC_CONTROL } from '../world/FriendsTrainLayout';
import { scenicRailway, scenicStationPoses, SCENIC_ROUTE_ID, SCENIC_CHAPTERS } from '../world/FriendsScenicRailway';
import { railWrap, sampleRailAlignment } from '../world/FriendsRailAlignment';
import { vehicleLocalPoint, vehicleWorldPoint } from './FriendsVehiclePose';
import type { FriendsVehicle } from './FriendsExpedition';
export type ScenicSeat={vehicleId:string;index:number};
export type ScenicActor={id:string;x:number;y:number;z:number;lifeState:string;friendsDevFlight?:boolean;friendsSeat?:ScenicSeat;verticalVelocity?:number;velocityX?:number;velocityY?:number;crouching?:boolean};
export type ScenicServiceState={routeId:string;hash:string;distance:number;speed:number;nextStop:number;dwell:number;held:boolean;targetSpeed?:number;autoStops?:boolean};
/** Legacy saves may contain a journey; new games deliberately ignore it. */
export type ScenicServiceSave=ScenicServiceState;
export type ScenicServiceSnapshot=ScenicServiceState&{chapter:string;nextStation:string;etaSeconds:number;blocked:boolean;seats:{playerId:string;vehicleId:string;index:number}[]};
export const SCENIC_SEATS=[{x:-50,y:-38,z:13},{x:-50,y:38,z:13},{x:20,y:-38,z:13},{x:20,y:38,z:13}];
export function scenicVehicles(distance:number):FriendsVehicle[]{
  const route=scenicRailway();
  return Array.from({length:SCENIC_WAGONS.length+1},(_,i)=>{
    const d=distance-i*SCENIC_CAR_SPACING,a=sampleRailAlignment(route,d-64),b=sampleRailAlignment(route,d+64),angle=Math.atan2(b.y-a.y,b.x-a.x),pitch=Math.atan2(b.z-a.z,Math.hypot(b.x-a.x,b.y-a.y));
    return {id:i===0?'grand-engine':`grand-${i-1}`,kind:'train',x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2+14,angle,pitch,closed:i===0,length:i===0?180:SCENIC_CAR_LENGTH,width:112,wagonKind:i===0?undefined:SCENIC_WAGONS[i-1],scenic:true,routeDistance:railWrap(d,route.length)};
  });
}
export function scenicSeatPrompt(player:ScenicActor,vehicles:readonly FriendsVehicle[],occupied:readonly {playerId:string;vehicleId:string;index:number}[]=[]){
  if(player.friendsSeat&&!isQuietSeat(player.friendsSeat))return {label:'Stand up · free walk',seat:player.friendsSeat};
  if(isQuietSeat(player.friendsSeat))return;
  let best=76,result:{label:string;seat:ScenicSeat}|undefined;
  for(const v of vehicles)if(v.scenic&&!v.closed&&(!v.wagonKind||v.wagonKind==='touring')){const p=vehicleLocalPoint(v,player);
    if(Math.abs(p.z)>35)continue;
    for(let i=0;i<SCENIC_SEATS.length;i++){
      if(occupied.some(s=>s.vehicleId===v.id&&s.index===i))continue;
      const seat=SCENIC_SEATS[i],d=Math.hypot(p.x-seat.x,p.y-seat.y);
      if(d<best){best=d;result={label:'Sit · enjoy the Grand Traverse',seat:{vehicleId:v.id,index:i}};}
    }
  }
  return result;
}
export function scenicControlNearby(player:ScenicActor,vehicles:readonly FriendsVehicle[]){
  if(player.lifeState!=='alive'||player.friendsDevFlight||player.friendsSeat)return false;
  const car=vehicles.find(v=>v.id==='grand-0');if(!car)return false;
  const p=vehicleLocalPoint(car,player);return Math.abs(p.z)<22&&Math.hypot(p.x-SCENIC_CONTROL.x,p.y-SCENIC_CONTROL.y)<48;
}
export class FriendsScenicService {
  distance:number;speed=0;nextStop=1;dwell=45000;held=true;blocked=false;
  private awaitingDriver=true;
  get waitingForDriver(){return this.awaitingDriver;}
  targetSpeed=132;autoStops=true;
  private acceleration=0;private brakeScale=1;
  brakingDistance(){const scale=Math.max(1,this.targetSpeed/132,this.brakeScale);return this.speed*this.speed/(2*10.8*scale)+this.speed*1.8+128;}
  control(speedKmh:number,autoStops:boolean){
    if(!Number.isFinite(speedKmh)||speedKmh<6||speedKmh>SCENIC_MAX_KMH||typeof autoStops!=='boolean')return false;
    this.brakeScale=Math.max(this.brakeScale,this.targetSpeed/132,this.speed/132);this.targetSpeed=speedKmh/3.6*12;
    // Re-enable stops at the next station ahead, including after continuous running.
    if(autoStops&&!this.autoStops){const r=scenicRailway();this.nextStop=scenicStationPoses().map((s,i)=>({i,gap:railWrap(s.distance+SCENIC_STOP_OFFSET-this.distance,r.length)})).sort((a,b)=>a.gap-b.gap)[0].i;}
    this.autoStops=autoStops;if(this.awaitingDriver)this.depart();return true;
  }
  depart(){this.awaitingDriver=false;this.held=false;this.dwell=0;}
  constructor(_legacyJourney?:ScenicServiceSave){
    const home=scenicStationPoses()[0];this.distance=home.distance+SCENIC_STOP_OFFSET;
  }
  vehicles(){return scenicVehicles(this.distance);}
  isSeated(player:ScenicActor){return Boolean(player.friendsSeat);}
  interact(player:ScenicActor,players:readonly ScenicActor[]){
    if(isQuietSeat(player.friendsSeat))return false;
    if(player.lifeState!=='alive'||player.friendsDevFlight)return false;
    if(player.friendsSeat){this.stand(player);return true;}
    const prompt=scenicSeatPrompt(player,this.vehicles(),players.flatMap(p=>p.friendsSeat?[{playerId:p.id,...p.friendsSeat}]:[]));
    if(!prompt)return false;player.friendsSeat=prompt.seat;this.attach(player);return true;
  }
  private attach(player:ScenicActor){
    const a=player.friendsSeat,v=a&&this.vehicles().find(v=>v.id===a.vehicleId),seat=a&&SCENIC_SEATS[a.index];
    if(!v||!seat||player.lifeState!=='alive'||player.friendsDevFlight){delete player.friendsSeat;return;}
    Object.assign(player,vehicleWorldPoint(v,seat));player.crouching=true;player.verticalVelocity=0;player.velocityX=0;player.velocityY=0;
  }
  stand(player:ScenicActor){
    const v=this.vehicles().find(v=>v.id===player.friendsSeat?.vehicleId);
    if(v)Object.assign(player,vehicleWorldPoint(v,{x:0,y:0,z:0}));
    delete player.friendsSeat;player.crouching=false;player.verticalVelocity=0;
  }
  update(dt:number,players:readonly ScenicActor[],jumping:ReadonlySet<string>,blocked:(distance:number)=>boolean=()=>false){
    const r=scenicRailway(),stops=scenicStationPoses();this.blocked=blocked(this.distance);
    // Small integration steps keep high-speed braking independent of host tick size.
    for(let remaining=Math.max(0,Math.min(dt,2000));remaining>0&&!(this.held&&this.speed===0);){
      const ms=Math.min(remaining,50),seconds=ms/1000;remaining-=ms;
      const stop=stops[this.nextStop],gap=railWrap(stop.distance+SCENIC_STOP_OFFSET-this.distance,r.length);
      if(this.dwell>0&&!this.held&&!this.blocked)this.dwell=Math.max(0,this.dwell-ms);
      const scale=Math.max(1,this.targetSpeed/132);if(this.speed<=this.targetSpeed+.1&&Math.abs(this.acceleration)<=10.8*scale)this.brakeScale=scale;
      const brake=10.8*Math.max(scale,this.brakeScale),margin=this.speed*1.8+128;
      let target=this.targetSpeed;
      for(let d=-SCENIC_TAIL_DISTANCE;d<=Math.max(3000,this.brakingDistance()+768);d+=128){
        const p=sampleRailAlignment(r,this.distance+d),cap=p.speed*scale*(1+Math.max(0,scale-1)*.15);
        target=Math.min(target,Math.sqrt(cap*cap+2*brake*Math.max(0,d-margin)));
      }
      if(this.autoStops)target=Math.min(target,Math.sqrt(2*brake*Math.max(0,gap-this.speed*1.8-1)));
      if(this.dwell>0||this.held||this.blocked)target=0;
      const desired=Math.max(-brake,Math.min(8.4*scale,(target-this.speed)*.8)),jerk=6*Math.max(scale,this.brakeScale)*seconds;
      this.acceleration+=Math.max(-jerk,Math.min(jerk,desired-this.acceleration));
      const previous=this.speed;this.speed=Math.max(0,Math.min(SCENIC_MAX_KMH/3.6*12,this.speed+this.acceleration*seconds));
      if(target===0&&this.speed<.15){this.speed=0;this.acceleration=0;}
      let travel=(previous+this.speed)*.5*seconds;
      if(this.autoStops&&this.dwell===0&&gap<=Math.max(travel,1)&&!this.held&&!this.blocked){travel=gap;this.speed=0;this.acceleration=0;this.dwell=stop.dwell;this.nextStop=(this.nextStop+1)%stops.length;}
      if(!this.autoStops&&this.dwell===0&&gap<=Math.max(travel,1))this.nextStop=(this.nextStop+1)%stops.length;
      this.distance=railWrap(this.distance+travel,r.length);
    }
    for(const p of players){if(isQuietSeat(p.friendsSeat))continue;if(jumping.has(p.id)&&p.friendsSeat)this.stand(p);else if(p.friendsSeat)this.attach(p);}
  }
  private state():ScenicServiceState{return {routeId:SCENIC_ROUTE_ID,hash:scenicRailway().hash,distance:this.distance,speed:this.speed,nextStop:this.nextStop,dwell:this.dwell,held:this.held,targetSpeed:this.targetSpeed,autoStops:this.autoStops};}
  snapshot(players:readonly ScenicActor[]=[]):ScenicServiceSnapshot{
    const r=scenicRailway(),p=sampleRailAlignment(r,this.distance),station=scenicStationPoses()[this.nextStop];
    return {...this.state(),chapter:SCENIC_CHAPTERS[p.chapter-1],nextStation:station.name,etaSeconds:Math.ceil(railWrap(station.distance+SCENIC_STOP_OFFSET-this.distance,r.length)/Math.max(20,this.targetSpeed*.8)+this.dwell/1000),blocked:this.blocked,seats:players.flatMap(p=>p.friendsSeat&&!isQuietSeat(p.friendsSeat)?[{playerId:p.id,...p.friendsSeat}]:[])};
  }
}
