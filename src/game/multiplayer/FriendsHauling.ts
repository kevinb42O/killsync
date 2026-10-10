import { AIRCRAFT_WINCH_MIN_LENGTH, AIRCRAFT_WINCH_MAX_LENGTH, AIRCRAFT_WINCH_SPEED, AIRCRAFT_WINCH_RELEASE_MS, aircraftWinchPose, createAircraftWinch, aircraftWinchDirection, type AircraftWinchState, type AircraftHookAction } from './FriendsAircraftWinch';
import { craneCableDrop, stepCraneSway, type CraneSway } from './FriendsCraneSway';
import { CRANE_MAX_MAST_EXTENSION, CRANE_MAX_BOOM_EXTENSION, CRANE_EXTENSION_SPEED } from './FriendsTelescopicCrane';
import { sweepTelescopicCrane, cargoOBB, intersectsCraneWorld } from './FriendsCraneSweep';
import { firstPersonEyeZ } from './FirstPersonEye';
import { sweepCrane } from './FriendsCraneSweep';
import { FriendsPlayerCarry, rayCarryPlayer, type PlayerCarryRope } from './FriendsPlayerCarry';
import { CRANE_MIN_LENGTH, CRANE_MAX_LENGTH, CRANE_SPEED, craneOutlet, craneHookInteraction, nearbyCrane, craneCandidate, craneCargoAnchor, craneCableDistance, type FriendsCraneState, type CraneAction } from './FriendsCrane';
import type { FriendsBuildPiece } from './FriendsBuilding';
import { scenicCargoWagon } from '../world/FriendsTrainLayout';
import { vehicleLocalPoint, vehicleWorldPoint, vehicleRotation, composeRotation } from './FriendsVehiclePose';
import { FRIENDS_HAULING_JOBS, haulingGoal, haulingJob, haulingPickup, cargoDelivered } from '../world/FriendsHaulingGoal';
import { FRIENDS_HAULING_PLATFORM } from '../world/FriendsTerrain';
import type { FriendsVehicle } from './FriendsExpedition';
import type { MultiplayerInputFrame } from './protocol';
import { FriendsCargoPhysics, type CargoStaticCollider, type CargoPhysicsRegion } from './FriendsCargoPhysics';
import { cargoBounds, cargoHullPoints, cargoLocalPoint, cargoRotation, cargoWorldPoint, rotateCargoVector, yawCargoOrientation } from './FriendsCargoPose';

export const SALVAGE_CORE_SPAWN = { x: FRIENDS_HAULING_PLATFORM.x, y: FRIENDS_HAULING_PLATFORM.y, z: FRIENDS_HAULING_PLATFORM.top };
const HAULING_SPAWN_REVISION = 3;
export const CARGO_WIDTH = 72, CARGO_DEPTH = 56, CARGO_HEIGHT = 48;
export const ROPE_REACH = 480, ROPE_MAX_PULL = 2400;
export const ROPE_WINCH_PULL=3600;
// Keep the operator outside the rotating shell when the reel bottoms out.
// A shorter cable forces player/cargo depenetration into a powered feedback loop.
export const ROPE_MIN_LENGTH=32;
// Rope reaction is swept in the same small time steps as cargo. It must never
// teleport a player to an anchor or inject a rigid-body contact impulse.
export const ROPE_OPERATOR_SPEED=160;
const STEP = 8;
type Point = { x: number; y: number; z: number };
export type HaulingActor = Point & { id: string; lifeState: string; friendsDevFlight?: boolean; sliding?: boolean; swimming?: boolean; velocityX?: number; velocityY?: number; verticalVelocity?: number };
export type PhysicalCargo = Point & {
  id: string; angle: number; vx: number; vy: number; vz: number; spin: number;
  orientation?:[number,number,number,number]; angularVelocityX?:number; angularVelocityY?:number;
  secured?: { vehicleId: string; x: number; y: number; angle: number; z?:number; orientation?:[number,number,number,number] };
};
export type CargoRope = { id: string; cargoId: string; anchorX: number; anchorY: number; anchorZ: number; length: number; tension: number; blocked: boolean; bends?:Point[] };
export type HaulingSave = { version: 1; spawnRevision?: number; cargo: PhysicalCargo[]; delivered: boolean; completedCargoIds?: string[] };
export type HaulingSnapshot = HaulingSave & { aircraftWinch?: AircraftWinchState; cranes?: FriendsCraneState[]; ropes: CargoRope[]; playerRopes?: PlayerCarryRope[]; feedback: Record<string, { message: string; until: number }> };
export type HaulingEnvironment = {
  revision: string;
  floor: (x: number, y: number, z: number, step: number) => number | undefined;
  operatorFloor?: HaulingEnvironment['floor'];
  collide: (point: { x: number; y: number }, z: number, radius: number, height: number, step: number) => boolean;
  blocked: (from: Point, to: Point, ignoreBuildId?:number) => boolean;
  eyeCeiling?: (actor: Point) => number | undefined;
  vehicles: readonly FriendsVehicle[];
  builds?: readonly FriendsBuildPiece[];
  craneAccess?:(playerId:string)=>boolean;
  releasePassenger?: (playerId: string) => void;
  solid?: (vx:number,vy:number,vz:number)=>boolean;
  colliders?: (region:CargoPhysicsRegion)=>CargoStaticCollider[];
  dynamicColliders?: (region:CargoPhysicsRegion)=>CargoStaticCollider[];
  routeRope?: (hand:Point,anchor:Point,previous:readonly Point[])=>Point[]|undefined;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const local = (p: Point & { angle: number }, q: Point) => {
  const c = Math.cos(p.angle), s = Math.sin(p.angle), dx = q.x - p.x, dy = q.y - p.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c, z: q.z - p.z };
};
export function cargoAnchor(cargo: PhysicalCargo, rope: CargoRope): Point {
  return cargoWorldPoint(cargo,{x:rope.anchorX,y:rope.anchorY,z:rope.anchorZ});
}
export function securedCargoPose(cargo: PhysicalCargo, vehicles: readonly FriendsVehicle[]): PhysicalCargo {
  const a = cargo.secured, v = a && vehicles.find(v => v.id === a.vehicleId);
  if (!a || !v) return cargo;
  const angle=v.angle+a.angle;
  return { ...cargo, ...vehicleWorldPoint(v,{x:a.x,y:a.y,z:a.z??0}), angle, orientation:composeRotation(vehicleRotation(v),cargoRotation({angle:a.angle,orientation:a.orientation})),angularVelocityX:0,angularVelocityY:0,spin:0 };
}
export function cargoFitsVehicle(cargo: PhysicalCargo, v: FriendsVehicle) {
  if (v.closed || (v.scenic&&!scenicCargoWagon(v))) return false;
  const points=cargoHullPoints(cargo).map(p=>vehicleLocalPoint(v,p));
  // Keep the helicopter's cockpit and entrance clear.
  return points.every(p=>Math.abs(p.x)<=v.length/2-8+.001&&Math.abs(p.y)<=v.width/2-8+.001&&(!scenicCargoWagon(v)||p.z>=-.01&&p.z<=96)&&(v.kind!=='aircraft'||p.x<60));
}
export function cargoInDeliveryBay(cargo: PhysicalCargo) {
  const b=cargoBounds(cargo),g=haulingGoal(cargo);
  return !cargo.secured && b.minX>=g.x-g.width/2 && b.maxX<=g.x+g.width/2 &&
    b.minY>=g.y-g.depth/2 && b.maxY<=g.y+g.depth/2 && Math.abs(b.minZ-g.z)<=STEP;
}
export function cargoDeliveryReady(cargo: PhysicalCargo) {
  return cargoInDeliveryBay(cargo) && Math.hypot(cargo.vx,cargo.vy,cargo.vz)<=20 &&
    Math.hypot(cargo.spin,cargo.angularVelocityX??0,cargo.angularVelocityY??0)<=.35;
}
export function haulingInteraction(cargo: readonly PhysicalCargo[], player: Point, vehicles: readonly FriendsVehicle[], delivered: boolean, completedCargoIds: readonly string[] = []) {
  const nearby = cargo.filter(c => {const p=cargoWorldPoint(c,{x:0,y:0,z:24});return Math.hypot(p.x-player.x,p.y-player.y,p.z-player.z-26)<135;})
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
  if (!nearby) return;
  if (nearby.secured) return { cargo: nearby, label: 'Release salvage core' };
  const complete=cargoDelivered({delivered,completedCargoIds},nearby),goal=haulingGoal(nearby);
  if (!complete && cargoInDeliveryBay(nearby)) return { cargo: nearby, label: cargoDeliveryReady(nearby) ? `Deliver core · ${nearby.id==='lantern-core'?'Delivery Bay':goal.name}` : 'Let the core settle to deliver' };
  const v = vehicles.find(v => cargoFitsVehicle(nearby, v) && Math.abs(Math.min(...cargoHullPoints(nearby).map(p=>vehicleLocalPoint(v,p).z))) <= 3);
  return { cargo: nearby, label: v ? `Secure core aboard ${v.scenic?'Grand Traverse':v.kind === 'train' ? 'Sunline' : 'Sunskiff'}` : complete ? 'Delivery complete · core remains movable' : `Haul ${haulingJob(nearby).name} to ${goal.name}`, vehicle: v };
}
/** Circle-vs-oriented-box collision shared by host and client prediction. */
export function collidePhysicalCargo(cargo: readonly PhysicalCargo[], point: { x: number; y: number }, z: number, radius: number) {
  let hit = false;
  for (const body of cargo) {
    const bounds=cargoBounds(body),tilted=body.orientation&&Math.hypot(body.orientation[0],body.orientation[1])>.01;
    if (z >= bounds.maxZ || z + 50 <= bounds.minZ) continue;
    const pose=tilted?{x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2,z:bounds.minZ,angle:0}:body;
    const p = local(pose, { ...point, z }), hx = tilted?(bounds.maxX-bounds.minX)/2:CARGO_WIDTH / 2, hy = tilted?(bounds.maxY-bounds.minY)/2:CARGO_DEPTH / 2;
    const dx = p.x - clamp(p.x, -hx, hx), dy = p.y - clamp(p.y, -hy, hy), dist = Math.hypot(dx, dy);
    if (dist >= radius) continue;
    if (dist > .0001) { p.x += dx / dist * (radius - dist); p.y += dy / dist * (radius - dist); }
    else if (hx + radius - Math.abs(p.x) < hy + radius - Math.abs(p.y)) p.x = (p.x < 0 ? -1 : 1) * (hx + radius);
    else p.y = (p.y < 0 ? -1 : 1) * (hy + radius);
    const c = Math.cos(pose.angle), s = Math.sin(pose.angle);
    point.x = pose.x + p.x * c - p.y * s; point.y = pose.y + p.x * s + p.y * c; hit = true;
  }
  return hit;
}
export function physicalCargoBuildBodies(cargo: readonly PhysicalCargo[] = []) {
  return cargo.map(c => {const b=cargoBounds(c);return {id:`cargo:${c.id}`,x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2,z:b.minZ,lifeState:'alive',bodyHeight:b.maxZ-b.minZ,bodyWidth:b.maxX-b.minX,bodyDepth:b.maxY-b.minY};});
}
function rayCargo(cargo: PhysicalCargo, origin: Point, direction: Point) {
  const a = cargoLocalPoint(cargo, origin),q=cargoRotation(cargo),v=rotateCargoVector({x:-q.x,y:-q.y,z:-q.z,w:q.w},direction);
  const d = [v.x,v.y,v.z];
  const o = [a.x, a.y, a.z];
  const planes=[[1,0,0,36],[-1,0,0,36],[0,1,0,28],[0,-1,0,28],[0,0,-1,0],[0,0,1,48],
    [1,0,-2/3,20],[-1,0,-2/3,20],[0,1,-.5,16],[0,-1,-.5,16]];
  let enter = 0, exit = ROPE_REACH;
  for (const [nx,ny,nz,limit] of planes) {
    const denominator=nx*d[0]+ny*d[1]+nz*d[2],numerator=limit-nx*o[0]-ny*o[1]-nz*o[2];
    if(Math.abs(denominator)<1e-8){if(numerator<0)return;continue;}
    const t=numerator/denominator;if(denominator<0)enter=Math.max(enter,t);else exit=Math.min(exit,t);
    if (enter > exit) return;
  }
  return { distance: enter, anchor: { x: a.x + d[0] * enter, y: a.y + d[1] * enter, z: a.z + d[2] * enter } };
}
const footprint = [[0, 0], [-36, -28], [-36, 28], [36, -28], [36, 28], [-36, 0], [36, 0], [0, -28], [0, 28]];
function footprintPoints(cargo: PhysicalCargo) {
  const c = Math.cos(cargo.angle), s = Math.sin(cargo.angle);
  return footprint.map(([x, y]) => ({ x: cargo.x + x * c - y * s, y: cargo.y + x * s + y * c }));
}
function validCargoState(c:PhysicalCargo){
  return [c.x,c.y,c.z,c.vx,c.vy,c.vz,c.angle,c.spin,c.angularVelocityX??0,c.angularVelocityY??0,...(c.orientation??[])].every(Number.isFinite)
    &&(!c.orientation||Math.abs(Math.hypot(...c.orientation)-1)<.01);
}
export class FriendsHauling {
  readonly playerCarry = new FriendsPlayerCarry();
  private cargo: PhysicalCargo[];
  private ropes = new Map<string, CargoRope>();
  private feedback: HaulingSnapshot['feedback'] = {};
  private delivered = false;
  private completedCargoIds = new Set<string>();
  private previousVehicles: FriendsVehicle[] = [];
  private restRevision = '';
  private physics=new Map<string,FriendsCargoPhysics>();
  private physicsRemainder=0;
  private craneBuilds?:readonly FriendsBuildPiece[];
  private craneRevision='';
  private sway = new Map<number,CraneSway & {tip:Point; tipVX:number; tipVY:number; tipVZ:number}>();
  private aircraftWinch?:AircraftWinchState;
  private aircraftHookHeld=false;
  private aircraftHookConsumed=false;
  private aircraftReleaseMs=0;
  private aircraftPilotId?:string;
  private aircraftInputArmed=false;
  private cranes = new Map<number,FriendsCraneState>();
  constructor(saved?: HaulingSave, floor?: HaulingEnvironment['floor'], resetAtStart=false) {
    const initial=FRIENDS_HAULING_JOBS.map(job=>({id:job.id,...haulingPickup(job),angle:0,vx:0,vy:0,vz:0,spin:0} satisfies PhysicalCargo));
    if(floor)for(const c of initial)c.z=Math.max(...footprintPoints(c).map(p=>floor(p.x,p.y,6000,0)??c.z));
    this.cargo=initial;
    if(resetAtStart)return;
    if(floor&&saved?.spawnRevision!==HAULING_SPAWN_REVISION)return;
    // Existing single-load saves remain valid; new sessions always start all jobs.
    if(saved?.version===1&&Array.isArray(saved.cargo)){
      const restored:PhysicalCargo[]=[];
      for(const base of initial){
        const c=saved.cargo.find(c=>c?.id===base.id);
        if(!c||![c.x,c.y,c.z,c.angle].every(Number.isFinite)||c.x<128||c.x>47872||c.y<128||c.y>47872||c.z< -512||c.z>6000)continue;
        const a=c.secured;
        const secured=a&&typeof a.vehicleId==='string'&&['sunskiff','sunline-0','sunline-1','sunline-2','grand-0','grand-1','grand-2'].includes(a.vehicleId)&&[a.x,a.y,a.angle].every(Number.isFinite)&&Math.abs(a.x)<140&&Math.abs(a.y)<80?{vehicleId:a.vehicleId,x:a.x,y:a.y,angle:a.angle,z:Number.isFinite(a.z)&&Math.abs(a.z!)<=100?a.z:undefined,orientation:Array.isArray(a.orientation)&&a.orientation.length===4&&a.orientation.every(Number.isFinite)&&Math.abs(Math.hypot(...a.orientation)-1)<.01?[...a.orientation] as [number,number,number,number]:undefined}:undefined;
        const q=c.orientation,n=Array.isArray(q)&&q.length===4?Math.hypot(...q):0;
        const orientation=Array.isArray(q)&&q.every(Number.isFinite)&&n>.001?q.map(v=>v/n) as [number,number,number,number]:undefined;
        restored.push({...base,x:c.x,y:c.y,z:c.z,angle:c.angle,orientation,secured});
      }
      if(restored.length)this.cargo=restored;
      this.completedCargoIds=new Set(this.cargo.filter(c=>saved.delivered||saved.completedCargoIds?.includes(c.id)).map(c=>c.id));
      this.delivered=this.cargo.every(c=>this.completedCargoIds.has(c.id));
    }
  }
  syncCranes(env: HaulingEnvironment) {
    if(this.craneBuilds===env.builds && this.craneRevision===env.revision)return;
    this.craneBuilds=env.builds;this.craneRevision=env.revision;
    const pieces=(env.builds??[]).filter(p=>['crane','crane_joint','crane_winch'].includes(p.shape)&&!p.attachment&&!p.assembly),byId=new Map(pieces.map(p=>[p.id,p]));
    for(const [id,state] of this.cranes) {
      const p=byId.get(id);
      if(!p || p.x!==state.x || p.y!==state.y || p.z!==state.z || p.rotation!==state.rotation) {this.cranes.delete(id);this.sway.delete(id);this.restRevision='';}
    }
    for(const p of pieces) {
      const winch=p.shape==='crane_joint'?env.builds?.find(q=>q.shape==='crane_winch'&&q.assembly?.rootId===p.id):p;
      const local=p.shape==='crane_joint'?winch?.assembly&&{x:winch.assembly.x,y:winch.assembly.y,z:winch.assembly.z-4}:p.shape==='crane_winch'?{x:0,y:0,z:-4}:undefined;
      const existing=this.cranes.get(p.id);
      if(existing){
        if(existing.winchId!==winch?.id){delete existing.cargoId;existing.mode='hold';existing.armMode='hold';const out=craneOutlet({...existing,outletLocal:local});existing.length=clamp(out.z-(env.floor(out.x,out.y,out.z-12,0)??out.z-240)-32,CRANE_MIN_LENGTH,CRANE_MAX_LENGTH);this.restRevision='';}
        existing.winchId=winch?.id;existing.hasWinch=Boolean(winch);existing.outletLocal=local;existing.memberCount=env.builds?.filter(q=>q.assembly?.rootId===p.id).length??0;
        continue;
      }
      const angle=['crane_joint','crane'].includes(p.shape)?p.craneAngle??0:undefined,dimensions=p.shape==='crane'?{mastExtension:p.mastExtension??0,boomExtension:p.boomExtension??0,mastMode:'hold' as const,boomMode:'hold' as const}:{},outlet=craneOutlet({...p,...dimensions,angle,outletLocal:local}),floor=env.floor(outlet.x,outlet.y,outlet.z-12,0);
      const length=clamp(outlet.z-(floor??outlet.z-240)-32,CRANE_MIN_LENGTH,CRANE_MAX_LENGTH);
      this.cranes.set(p.id,{pieceId:p.id,x:p.x,y:p.y,z:p.z,rotation:p.rotation,length,mode:'hold',blocked:false,...dimensions,angle,armMode:angle!==undefined?'hold':undefined,outletLocal:local,winchId:winch?.id,hasWinch:Boolean(winch),memberCount:env.builds?.filter(q=>q.assembly?.rootId===p.id).length??0});
    }
  }
  getCraneStates():readonly FriendsCraneState[]{return [...this.cranes.values()];}
  getCraneAngles(){return new Map([...this.cranes.values()].filter(c=>c.angle!==undefined).map(c=>[c.pieceId,c.angle!]));}
  craneArmIsMoving(id:number){const c=this.cranes.get(id);return Boolean(c&&(c.armMode&&c.armMode!=='hold'||c.mastMode&&c.mastMode!=='hold'||c.boomMode&&c.boomMode!=='hold'));}
  craneIsMoving(id:number){const c=this.cranes.get(id);return Boolean(c&&(c.mode!=='hold'||this.craneArmIsMoving(id)));}
  hasCraneCargo() { return [...this.cranes.values()].some(c=>c.cargoId); }
  craneHasCargo(id:number) { return Boolean(this.cranes.get(id)?.cargoId); }
  controlCrane(player: HaulingActor, pieceId:number, action:CraneAction, env:HaulingEnvironment, canOperate=true,elapsed=0) {
    const result=(ok:boolean,message:string)=>({ok,message});
    this.syncCranes(env);
    const controlPiece=env.builds?.find(p=>p.id===pieceId),rootId=controlPiece?.craneRootId??controlPiece?.assembly?.rootId??pieceId;
    const piece=env.builds?.find(p=>p.id===rootId),state=this.cranes.get(rootId);
    const ground=action==='crane_hook_connect'||action==='crane_hook_release';
    if(ground){const target=craneHookInteraction([...this.cranes.values()],this.cargo,player,env.blocked);
      if(!state||target?.crane.pieceId!==rootId||target.action!==action||env.vehicles.some(v=>v.pilotId===player.id))return result(false,'Stand beside the hook and core with a clear path to attach or detach it.');
      action=action==='crane_hook_connect'?'crane_connect':'crane_release';
    }
    if(!ground&&!canOperate)return result(false,'To operate cranes, ask the host to press C and enable Friends can build.');
    if(!piece || !state || !ground && !nearbyCrane((env.builds??[]).filter(p=>p.id===rootId||p.craneRootId===rootId),player) || env.vehicles.some(v=>v.pilotId===player.id))return result(false,'Stand beside the freight crane base to use its controls.');
    if(action==='crane_heartbeat') {
      if(state.operatorId!==player.id)return result(false,'Another crew member has the controls.');
      state.leaseUntilMs=elapsed+3000;return result(true,'');
    }
    const stopping=['crane_stop_all','crane_stop_arm','crane_hold','crane_stop_mast','crane_stop_boom'].includes(action);
    if(!ground && !stopping && action!=='crane_takeover' && state.operatorId && state.operatorId!==player.id && (state.leaseUntilMs??0)>elapsed)return result(false,'A crew member is operating this crane. Use Take controls or Stop all.');
    if(!ground&&(!stopping||!state.operatorId||state.operatorId===player.id)){state.operatorId=player.id;state.leaseUntilMs=elapsed+3000;}
    if(action==='crane_takeover'||action==='crane_stop_all'){state.mode='hold';state.armMode=state.angle!==undefined?'hold':undefined;this.brakeExtensions(state);state.angularSpeed=0;const c=this.cargo.find(c=>c.id===state.cargoId);if(c)state.length=clamp(craneCableDistance(c,state),CRANE_MIN_LENGTH,CRANE_MAX_LENGTH);return result(true,action==='crane_takeover'?'You have the crane controls. Motors braked.':'All crane motors braked.');}
    if(action==='crane_stabilize'){state.antiSway=!state.antiSway;return result(true,state.antiSway?'Anti-sway enabled · gently settling the load.':'Natural load swing enabled.');}
    if(action==='crane_precision'){state.precision=!state.precision;return result(true,state.precision?'Precision speed enabled.':'Standard speed enabled.');}
    if(action==='crane_left'||action==='crane_right'||action==='crane_stop_arm'){
      if(state.angle===undefined)return result(false,'This winch has no rotating pivot.');
      if(action==='crane_left'&&state.armMode==='right'||action==='crane_right'&&state.armMode==='left')state.angularSpeed=0;
      state.armMode=action==='crane_left'?'left':action==='crane_right'?'right':'hold';state.blocked=false;state.blockedReason=undefined;
      if(state.armMode==='hold')state.angularSpeed=0;
      return result(true,state.armMode==='hold'?'Arm braked.':state.armMode==='left'?'Rotating arm left.':'Rotating arm right.');
    }
    if(['crane_mast_up','crane_mast_down','crane_stop_mast','crane_extend','crane_retract','crane_stop_boom'].includes(action)) {
      if(state.mastExtension===undefined)return result(false,'This crane has no telescopic mast or boom.');
      if(action.startsWith('crane_mast')||action==='crane_stop_mast'){const mode=action==='crane_mast_up'?'up':action==='crane_mast_down'?'down':'hold';if(mode!==state.mastMode||mode==='hold')state.mastSpeed=0;state.mastMode=mode;}
      else {const mode=action==='crane_extend'?'extend':action==='crane_retract'?'retract':'hold';if(mode!==state.boomMode||mode==='hold')state.boomSpeed=0;state.boomMode=mode;}
      state.blocked=false;state.blockedReason=undefined;
      return result(true,action==='crane_stop_mast'?'Mast braked.':action==='crane_stop_boom'?'Boom braked.':'Telescopic motor running.');
    }
    if(state.hasWinch===false)return result(false,'Snap a freight winch to the free end of the arm first.');
    const outlet=craneOutlet(state),cargo=this.cargo.find(c=>c.id===state.cargoId);
    if(action==='crane_connect') {
      if(cargo)return result(false,'This crane already has a load.');
      const occupied=new Set([...this.cranes.values()].flatMap(c=>c.cargoId?[c.cargoId]:[]));if(this.aircraftWinch?.cargoId)occupied.add(this.aircraftWinch.cargoId);
      const candidate=craneCandidate(state,this.cargo,env,occupied);
      if(!candidate)return result(false,'Lower the hook beside a settled, unstrapped core directly beneath the boom.');
      Object.assign(state,{cargoId:candidate.cargo.id,anchorX:candidate.anchor.x,anchorY:candidate.anchor.y,anchorZ:candidate.anchor.z,length:candidate.distance,mode:'hold',blocked:false});
      if(!ground)state.operatorId=player.id;else{state.armMode=state.angle!==undefined?'hold':undefined;state.angularSpeed=0;this.brakeExtensions(state);}
      this.sway.set(state.pieceId,{x:0,y:0,vx:0,vy:0,tip:outlet,tipVX:0,tipVY:0,tipVZ:0});state.swayAngle=0;
      return result(true,'Load connected. Raise or lower it; the brake holds it when stopped.');
    }
    if(action==='crane_release') {
      if(!cargo)return result(false,'The hook is already free.');
      state.length=clamp(craneCableDistance(cargo,state),CRANE_MIN_LENGTH,CRANE_MAX_LENGTH);
      const swing=this.sway.get(state.pieceId);
      if(swing){cargo.vx=swing.vx+swing.tipVX;cargo.vy=swing.vy+swing.tipVY;cargo.vz=clamp(cargo.vz+swing.tipVZ+(swing.x*swing.vx+swing.y*swing.vy)/craneCableDrop(state.length,swing.x,swing.y),-280,280);}
      this.restRevision='';const physics=this.physics.get(cargo.id);physics?.setCraneGuide(false);physics?.sync(cargo);
      this.sway.delete(state.pieceId);state.swayAngle=0;
      delete state.cargoId;delete state.anchorX;delete state.anchorY;delete state.anchorZ;
      state.mode='hold';state.blocked=false;if(!ground)state.operatorId=player.id;else{state.armMode=state.angle!==undefined?'hold':undefined;state.angularSpeed=0;this.brakeExtensions(state);}
      return result(true,'Load released. Unsupported cargo falls under gravity.');
    }
    if(action==='crane_hold' && cargo)state.length=clamp(craneCableDistance(cargo,state),CRANE_MIN_LENGTH,CRANE_MAX_LENGTH);
    state.mode=action==='crane_raise'?'raise':action==='crane_lower'?'lower':'hold';
    state.blocked=false;state.blockedReason=undefined;
    return result(true,state.mode==='raise'?'Winch raising.':state.mode==='lower'?'Winch lowering.':'Brake engaged.');
  }
  private brakeExtensions(c:FriendsCraneState){if(c.mastMode)c.mastMode='hold';if(c.boomMode)c.boomMode='hold';c.mastSpeed=c.boomSpeed=0;}
  /** Keep the existing vertical/contact solver; sweep the horizontal pendulum
   * separately so a swinging load cannot tunnel through terrain or a teammate. */
  private updateCraneSway(crane:FriendsCraneState,cargo:PhysicalCargo,dt:number,env:HaulingEnvironment,players:readonly HaulingActor[]) {
    if(crane.mastExtension===undefined&&!crane.vehicleId)return;
    const out=craneOutlet(crane),anchor=craneCargoAnchor(cargo,crane),seconds=Math.min(.1,Math.max(0,dt/1000));
    if(!seconds)return;
    let previous=this.sway.get(crane.pieceId);
    if(!previous){previous={x:anchor.x-out.x,y:anchor.y-out.y,vx:0,vy:0,tip:out,tipVX:0,tipVY:0,tipVZ:0};this.sway.set(crane.pieceId,previous);}
    const tipVX=(out.x-previous.tip.x)/seconds,tipVY=(out.y-previous.tip.y)/seconds,tipVZ=(out.z-previous.tip.z)/seconds;
    const old={x:anchor.x-out.x,y:anchor.y-out.y,vx:previous.vx,vy:previous.vy};
    if(old.x===0&&old.y===0&&old.vx===0&&old.vy===0&&tipVX===0&&tipVY===0&&previous.tipVX===0&&previous.tipVY===0){
      Object.assign(previous,{tip:out,tipVX,tipVY,tipVZ});crane.swayAngle=0;return;
    }
    const floor=env.floor(cargo.x,cargo.y,cargo.z+1,0),grounded=floor!==undefined&&cargo.z<=floor+.5;
    const next=grounded?{...old,vx:0,vy:0}:stepCraneSway(old,crane.length,seconds,Boolean(crane.antiSway),tipVX-previous.tipVX,tipVY-previous.tipVY);
    const shift={x:next.x-old.x,y:next.y-old.y,z:craneCableDrop(crane.length,old.x,old.y)-craneCableDrop(crane.length,next.x,next.y)};
    const moving=Math.hypot(shift.x,shift.y,shift.z)>.0001;
    let blocked:string|undefined;
    if(moving){
      const count=Math.max(1,Math.ceil(Math.hypot(shift.x,shift.y,shift.z)/3)),ignore=new Set<number>();
      for(let i=1;i<=count;i++){
        const offset={x:shift.x*i/count,y:shift.y*i/count,z:shift.z*i/count};
        blocked=intersectsCraneWorld(cargoOBB(cargo,offset),env,ignore,players,this.cargo,cargo.id);
        if(!blocked&&env.blocked(out,{x:anchor.x+offset.x,y:anchor.y+offset.y,z:anchor.z+offset.z},crane.pieceId))blocked='Cable obstruction';
        if(blocked)break;
      }
      if(!blocked){const physics=this.physics.get(cargo.id);if(physics)physics.translateCrane(cargo,shift.x,shift.y,shift.z);else{cargo.x+=shift.x;cargo.y+=shift.y;cargo.z+=shift.z;}this.restRevision='';}
    }
    if(blocked){next.x=old.x;next.y=old.y;next.vx=next.vy=0;crane.blocked=true;crane.blockedReason=blocked;crane.mode='hold';if(crane.armMode)crane.armMode='hold';crane.angularSpeed=0;this.brakeExtensions(crane);}
    Object.assign(previous,next,{tip:out,tipVX,tipVY,tipVZ});
    crane.swayAngle=Math.asin(Math.min(1,Math.hypot(next.x,next.y)/Math.max(1,crane.length)))*180/Math.PI;
  }
  getAircraftWinch(){return this.aircraftWinch;}
  private ensureAircraftWinch(env:HaulingEnvironment){
    const v=env.vehicles.find(v=>v.kind==='aircraft');if(!v)return;
    if(!this.aircraftWinch)this.aircraftWinch=createAircraftWinch(v);
    return this.aircraftWinch;
  }
  private releaseAircraftLoad(){
    const state=this.aircraftWinch;if(!state)return;
    const cargo=this.cargo.find(c=>c.id===state.cargoId),swing=this.sway.get(state.pieceId);
    if(cargo){
      if(swing){cargo.vx=clamp(swing.vx+swing.tipVX,-650,650);cargo.vy=clamp(swing.vy+swing.tipVY,-650,650);cargo.vz=clamp(cargo.vz+swing.tipVZ+(swing.x*swing.vx+swing.y*swing.vy)/craneCableDrop(state.length,swing.x,swing.y),-280,280);}
      const physics=this.physics.get(cargo.id);physics?.setCraneGuide(false);physics?.sync(cargo);this.restRevision='';
    }
    delete state.cargoId;delete state.anchorX;delete state.anchorY;delete state.anchorZ;
    this.sway.delete(state.pieceId);state.swayAngle=0;state.releaseProgress=0;state.mode='hold';state.winchSpeed=0;
  }
  resetAircraftWinch(){this.releaseAircraftLoad();this.aircraftWinch=undefined;this.aircraftHookHeld=false;this.aircraftHookConsumed=false;this.aircraftReleaseMs=0;this.aircraftPilotId=undefined;this.aircraftInputArmed=false;}
  private connectAircraftLoad(env:HaulingEnvironment){
    const state=this.ensureAircraftWinch(env);if(!state||state.cargoId||state.length<AIRCRAFT_WINCH_MIN_LENGTH)return false;
    const occupied=new Set([...this.cranes.values()].flatMap(c=>c.cargoId?[c.cargoId]:[]));
    const candidate=craneCandidate(state,this.cargo,env,occupied);if(!candidate||candidate.distance<AIRCRAFT_WINCH_MIN_LENGTH||Math.abs(candidate.distance-state.length)>24)return false;
    Object.assign(state,{cargoId:candidate.cargo.id,anchorX:candidate.anchor.x,anchorY:candidate.anchor.y,anchorZ:candidate.anchor.z,length:candidate.distance,mode:'hold',winchSpeed:0,blocked:false,blockedReason:undefined});
    this.sway.set(state.pieceId,{x:0,y:0,vx:0,vy:0,tip:craneOutlet(state),tipVX:0,tipVY:0,tipVZ:0});state.swayAngle=0;this.restRevision='';return true;
  }
  controlAircraftHook(player:HaulingActor,action:AircraftHookAction,env:HaulingEnvironment){
    const state=this.ensureAircraftWinch(env),target=state&&craneHookInteraction([state],this.cargo,player,env.blocked);
    if(!state||env.vehicles.some(v=>v.pilotId===player.id)||!target||target.action!==(action==='airwinch_hook_connect'?'crane_hook_connect':'crane_hook_release'))return {ok:false,message:'Stand beside the helicopter hook with a clear path to the load.'};
    if(action==='airwinch_hook_release'){this.releaseAircraftLoad();return {ok:true,message:'Helicopter load released.'};}
    return this.connectAircraftLoad(env)?{ok:true,message:'Helicopter load connected.'}:{ok:false,message:'Lower the hook beside a settled, unstrapped core.'};
  }
  /** Validate flight before moving passengers, cargo or a deployed empty cable.
   * Stowed winches use the original aircraft update without this extra sweep. */
  allowAircraftFlight(from:FriendsVehicle,to:FriendsVehicle,env:HaulingEnvironment,players:readonly HaulingActor[]){
    const state=this.aircraftWinch,cargo=this.cargo.find(c=>c.id===state?.cargoId);if(!state||(!cargo&&state.length===0))return true;
    const old=craneOutlet({...state,...aircraftWinchPose(from)}),out=craneOutlet({...state,...aircraftWinchPose(to)}),shift={x:out.x-old.x,y:out.y-old.y,z:out.z-old.z};
    const travel=Math.hypot(shift.x,shift.y,shift.z);if(travel<.0001)return true;
    const count=Math.ceil(travel/3);if(count>40){state.blocked=true;state.blockedReason='Load travel limit';state.mode='hold';state.winchSpeed=0;return false;}
    const anchor=cargo?craneCargoAnchor(cargo,state):{...old,z:old.z-state.length},ignore=new Set<number>(),world={...env,vehicles:env.vehicles.filter(v=>v.id!==state.vehicleId)};
    for(let i=1;i<=count;i++){
      const t=i/count,offset={x:shift.x*t,y:shift.y*t,z:shift.z*t},tip={x:old.x+offset.x,y:old.y+offset.y,z:old.z+offset.z};
      const reason=(cargo&&intersectsCraneWorld(cargoOBB(cargo,offset),world,ignore,players,this.cargo,cargo.id))|| (env.blocked(tip,{x:anchor.x+offset.x,y:anchor.y+offset.y,z:anchor.z+offset.z})?'Cable obstruction':undefined);
      if(reason){state.blocked=true;state.blockedReason=reason;state.mode='hold';state.winchSpeed=0;return false;}
    }
    state.blocked=false;state.blockedReason=undefined;return true;
  }
  private updateAircraftWinch(dt:number,players:readonly HaulingActor[],inputs:ReadonlyMap<string,MultiplayerInputFrame>,env:HaulingEnvironment,elapsed:number){
    const vehicle=env.vehicles.find(v=>v.kind==='aircraft'),state=this.ensureAircraftWinch(env);if(!vehicle||!state){this.resetAircraftWinch();return;}
    const before=craneOutlet(state);Object.assign(state,aircraftWinchPose(vehicle));const out=craneOutlet(state),load=this.cargo.find(c=>c.id===state.cargoId);
    if(load){const shift={x:out.x-before.x,y:out.y-before.y,z:out.z-before.z},physics=this.physics.get(load.id);if(physics)physics.translateCrane(load,shift.x,shift.y,shift.z);else{load.x+=shift.x;load.y+=shift.y;load.z+=shift.z;}if(shift.x||shift.y||shift.z)this.restRevision='';}
    const pilot=players.find(p=>p.id===vehicle.pilotId&&p.lifeState==='alive'&&!p.friendsDevFlight),input=pilot&&inputs.get(pilot.id),seconds=Math.max(0,Math.min(100,dt))/1000;
    const pilotChanged=this.aircraftPilotId!==pilot?.id;if(pilotChanged){this.aircraftInputArmed=false;this.aircraftPilotId=pilot?.id;this.aircraftHookHeld=Boolean(input?.friendsAircraftHookHeld);this.aircraftHookConsumed=this.aircraftHookHeld;this.aircraftReleaseMs=0;}
    state.operatorId=pilot?.id;
    const requestedDirection=input?aircraftWinchDirection(input.friendsAircraftWinch):0;
    if(!requestedDirection&&!input?.friendsAircraftHookHeld)this.aircraftInputArmed=Boolean(input);
    const direction=this.aircraftInputArmed?requestedDirection:0,nextMode=direction===-1?'raise':direction===1?'lower':'hold';
    if(nextMode!==state.mode)state.winchSpeed=0;
    state.mode=nextMode;state.winchSpeed=direction?Math.min(AIRCRAFT_WINCH_SPEED,(state.winchSpeed??0)+180*seconds):0;
    if(direction){state.blocked=false;state.blockedReason=undefined;}
    const held=Boolean(input?.friendsAircraftHookHeld);
    if(!held){this.aircraftHookConsumed=false;this.aircraftReleaseMs=0;}
    else if(!this.aircraftHookConsumed){
      if(!state.cargoId){this.aircraftHookConsumed=true;const connected=this.connectAircraftLoad(env);if(pilot)this.tell(pilot.id,connected?'Helicopter load connected.':'Hover with the hook beside a settled core, then press V.',elapsed);}
      else {this.aircraftReleaseMs+=seconds*1000;if(this.aircraftReleaseMs>=AIRCRAFT_WINCH_RELEASE_MS){this.releaseAircraftLoad();this.aircraftHookConsumed=true;if(pilot)this.tell(pilot.id,'Load released with its current momentum.',elapsed);}}
    }
    this.aircraftHookHeld=held;state.releaseProgress=state.cargoId?Math.min(1,this.aircraftReleaseMs/AIRCRAFT_WINCH_RELEASE_MS):0;
    if(!state.cargoId){
      if(state.length===0&&!direction)return; // Stowed winches need no terrain or cable queries.
      const floor=env.floor(out.x,out.y,out.z,0),maximum=Math.max(0,Math.min(AIRCRAFT_WINCH_MAX_LENGTH,out.z-(floor??-512)-8));
      const length=clamp(state.length+direction*(state.winchSpeed??0)*seconds,0,maximum);
      if(length>0&&env.blocked(out,{...out,z:out.z-length})){state.blocked=true;state.blockedReason='Cable obstruction';state.mode='hold';state.winchSpeed=0;}
      else state.length=length;
      if(length===0||length===maximum){state.mode='hold';state.winchSpeed=0;}
    }
  }
  getCargo() { return this.cargo; }
  hasSecuredTrainCargo() { return this.cargo.some(c => c.secured?.vehicleId.startsWith('sunline')); }
  movementScale(id: string) { const rope = this.ropes.get(id); return rope && !rope.blocked ? 1 - .65 * rope.tension : 1; }
  detach(id: string) { this.ropes.delete(id); this.playerCarry.release(id); }
  private recoverCargo(cargo:PhysicalCargo,physics?:FriendsCargoPhysics){
    // Release first: recovery must never drag an attached player to a pickup.
    for(const [id,rope]of this.ropes)if(rope.cargoId===cargo.id)this.detach(id);
    for(const crane of [...this.cranes.values(),...(this.aircraftWinch?[this.aircraftWinch]:[])])if(crane.cargoId===cargo.id){delete crane.cargoId;crane.mode='hold';this.sway.delete(crane.pieceId);crane.swayAngle=0;}
    Object.assign(cargo,haulingPickup(cargo),{angle:0,orientation:undefined,secured:undefined,vx:0,vy:0,vz:0,spin:0,angularVelocityX:0,angularVelocityY:0});
    physics?.sync(cargo);
  }
  private tell(id: string, message: string, elapsed: number) { this.feedback[id] = { message, until: elapsed + 4000 }; }
  shoot(player: HaulingActor, direction: Point, env: HaulingEnvironment, elapsed: number, players: readonly HaulingActor[] = []) {
    if (this.playerCarry.release(player.id)) return;
    if (this.ropes.delete(player.id)) { this.tell(player.id, 'Rope released.', elapsed); return; }
    if (player.lifeState !== 'alive') return;
    const origin = { x: player.x, y: player.y, z: firstPersonEyeZ(player, env.eyeCeiling?.(player)) };
    const hits = this.cargo.map(cargo => ({ cargo, hit: rayCargo(cargo, origin, direction) })).filter(h => h.hit).sort((a, b) => a.hit!.distance - b.hit!.distance);
    const h = hits[0];
    const teammate = players.filter(p => p.id !== player.id && p.lifeState === 'alive')
      .map(p => ({ player: p, distance: rayCarryPlayer(origin, direction, p, ROPE_REACH) }))
      .filter((p): p is { player: HaulingActor; distance: number } => p.distance !== undefined)
      .sort((a, b) => a.distance - b.distance)[0];
    if (teammate && (!h || teammate.distance < h.hit!.distance)) {
      const hit = { x: origin.x + direction.x * teammate.distance, y: origin.y + direction.y * teammate.distance, z: origin.z + direction.z * teammate.distance };
      if (env.blocked(origin, hit)) return;
      if (!this.playerCarry.canAttach(player, teammate.player)) return;
      env.releasePassenger?.(teammate.player.id);
      this.detach(teammate.player.id);
      delete this.feedback[player.id]; delete this.feedback[teammate.player.id];
      this.playerCarry.attach(player, teammate.player);
      return;
    }
    if (player.friendsDevFlight || env.vehicles.some(v => v.pilotId === player.id)) return;
    if (!h || env.blocked(origin, { x: origin.x + direction.x * h.hit!.distance, y: origin.y + direction.y * h.hit!.distance, z: origin.z + direction.z * h.hit!.distance })) { this.tell(player.id, 'Aim at the salvage core within 40m, with a clear rope path.', elapsed); return; }
    if (h.cargo.secured) { this.tell(player.id, 'Release the cargo straps with F before towing.', elapsed); return; }
    const a = h.hit!.anchor, attachment = cargoWorldPoint(h.cargo, a);
    this.ropes.set(player.id, { id: player.id, cargoId: h.cargo.id, anchorX: a.x, anchorY: a.y, anchorZ: a.z, length: Math.max(ROPE_MIN_LENGTH, Math.hypot(player.x - attachment.x, player.y - attachment.y, player.z + 26 - attachment.z) + 8), tension: 0, blocked: false });
    this.tell(player.id, 'Attached. Walk to pull · hold aim to reel · crouch + aim feeds rope · primary action releases.', elapsed);
  }
  interact(player: HaulingActor, env: HaulingEnvironment, elapsed: number) {
    const target = haulingInteraction(this.cargo, player, env.vehicles, this.delivered, [...this.completedCargoIds]);
    if (!target || env.blocked({ x: player.x, y: player.y, z: player.z + 26 }, cargoWorldPoint(target.cargo,{x:0,y:0,z:24}))) return false;
    const c = target.cargo;
    if(this.aircraftWinch?.cargoId===c.id||[...this.cranes.values()].some(crane=>crane.cargoId===c.id)){this.tell(player.id,'Release the crane hook before securing or delivering the load.',elapsed);return true;}
    if (c.secured) { c.secured = undefined; this.tell(player.id, 'Straps released. The core can be hauled off the deck.', elapsed); }
    else if (Math.hypot(c.vx, c.vy, c.vz) > 20 || Math.hypot(c.spin,c.angularVelocityX??0,c.angularVelocityY??0)>.35) this.tell(player.id, 'Let the core settle before securing or delivering it.', elapsed);
    else if (!this.completedCargoIds.has(c.id) && cargoInDeliveryBay(c)) {
      const goal=haulingGoal(c);
      const surface=env.floor(c.x,c.y,cargoBounds(c).minZ+STEP,0);
      if(surface===undefined || Math.abs(surface-goal.z)>STEP || Math.abs(cargoBounds(c).minZ-surface)>STEP) this.tell(player.id,`Rest the whole core on ${goal.name} to finish.`,elapsed);
      else {
        this.completedCargoIds.add(c.id);this.delivered=this.cargo.every(c=>this.completedCargoIds.has(c.id));
        this.tell(player.id, `DELIVERY COMPLETE! ${haulingJob(c).name} delivered to ${goal.name} · ${this.completedCargoIds.size}/${this.cargo.length} loads delivered.`, elapsed);
      }
    }
    else if (target.vehicle) {
      const p = local(target.vehicle, c);
      c.secured = { vehicleId: target.vehicle.id, x: p.x, y: p.y, z:c.z-target.vehicle.z,angle: c.angle - target.vehicle.angle,orientation:yawCargoOrientation(c,-target.vehicle.angle) };
      c.vx = c.vy = c.vz = c.spin = 0;c.angularVelocityX=c.angularVelocityY=0;
      for (const [id, rope] of this.ropes) if (rope.cargoId === c.id) this.ropes.delete(id);
      this.tell(player.id, `Core secured aboard ${target.vehicle.kind === 'train' ? 'Sunline' : 'Sunskiff'}.`, elapsed);
    } else this.tell(player.id, target.label, elapsed);
    return true;
  }
  update(dt: number, elapsed: number, players: readonly HaulingActor[], inputs: ReadonlyMap<string, MultiplayerInputFrame>, env: HaulingEnvironment) {
    this.syncCranes(env);
    this.updateAircraftWinch(dt,players,inputs,env,elapsed);
    for (const id of Object.keys(this.feedback)) if (this.feedback[id].until <= elapsed || !players.some(p => p.id === id)) delete this.feedback[id];
    const actorById = new Map(players.map(p => [p.id, p]));
    for (const [id, rope] of this.ropes) {
      const p = actorById.get(id), input = inputs.get(id);
      if (!p || p.lifeState !== 'alive' || p.friendsDevFlight || !input || input.friendsTool !== 5 || env.vehicles.some(v => v.pilotId === id)) { this.ropes.delete(id); continue; }
      if (input.aiming) rope.length = clamp(rope.length+Math.max(0,Math.min(100,dt))*(input.sliding?.06:-.045),ROPE_MIN_LENGTH,ROPE_REACH);
    }
    // The last nearby operator owns motion, but anyone beside the controller can
    // brake or take over. Walking away / disconnecting engages the brake.
    const cranePieces=new Map((env.builds??[]).filter(p=>['crane','crane_joint','crane_winch'].includes(p.shape)&&!p.assembly).map(p=>[p.id,p]));
    for(const crane of this.cranes.values()) {
      const piece=cranePieces.get(crane.pieceId),operator=actorById.get(crane.operatorId??'');
      if((crane.mode!=='hold'||this.craneArmIsMoving(crane.pieceId)) && (!piece || !operator || !nearbyCrane((env.builds??[]).filter(p=>p.id===crane.pieceId||p.craneRootId===crane.pieceId),operator)||env.craneAccess?.(operator.id)===false || crane.angle!==undefined && (crane.leaseUntilMs??0)<elapsed)) {
        const load=this.cargo.find(c=>c.id===crane.cargoId);
        if(load)crane.length=clamp(craneCableDistance(load,crane),CRANE_MIN_LENGTH,CRANE_MAX_LENGTH);
        crane.mode='hold';if(crane.armMode)crane.armMode='hold';crane.angularSpeed=0;this.brakeExtensions(crane);delete crane.operatorId;crane.leaseUntilMs=0;
      }
      if(crane.mode==='hold'&&!this.craneArmIsMoving(crane.pieceId)&&(crane.leaseUntilMs??Infinity)<elapsed){delete crane.operatorId;crane.leaseUntilMs=0;}
      if(crane.mastExtension!==undefined && this.craneArmIsMoving(crane.pieceId)) {
        const seconds=Math.min(100,Math.max(0,dt))/1000,radius=184+(crane.boomExtension??0),scale=crane.precision?.2:1,maxAngular=Math.min(Math.PI/12,112/radius)*scale;
        crane.angularSpeed=crane.armMode==='hold'?0:Math.min(maxAngular,(crane.angularSpeed??0)+seconds*.4);
        crane.mastSpeed=crane.mastMode==='hold'?0:Math.min(CRANE_EXTENSION_SPEED*scale,(crane.mastSpeed??0)+seconds*360);
        crane.boomSpeed=crane.boomMode==='hold'?0:Math.min(CRANE_EXTENSION_SPEED*scale,(crane.boomSpeed??0)+seconds*360);
        const next={...crane,angle:(crane.angle??0)+(crane.armMode==='left'?1:crane.armMode==='right'?-1:0)*crane.angularSpeed*seconds,
          mastExtension:clamp(crane.mastExtension+(crane.mastMode==='up'?1:crane.mastMode==='down'?-1:0)*crane.mastSpeed*seconds,0,CRANE_MAX_MAST_EXTENSION),
          boomExtension:clamp((crane.boomExtension??0)+(crane.boomMode==='extend'?1:crane.boomMode==='retract'?-1:0)*crane.boomSpeed*seconds,0,CRANE_MAX_BOOM_EXTENSION)};
        const load=this.cargo.find(c=>c.id===crane.cargoId),reason=sweepTelescopicCrane(crane,next,env,players,this.cargo,load);
        if(reason){crane.blocked=true;crane.blockedReason=reason;crane.mode='hold';crane.armMode='hold';crane.angularSpeed=0;this.brakeExtensions(crane);}
        else {
          const before=craneOutlet(crane),after=craneOutlet(next);Object.assign(crane,{angle:Math.atan2(Math.sin(next.angle),Math.cos(next.angle)),mastExtension:next.mastExtension,boomExtension:next.boomExtension});
          if(load){const dx=after.x-before.x,dy=after.y-before.y,dz=after.z-before.z,physics=this.physics.get(load.id);if(physics)physics.translateCrane(load,dx,dy,dz);else{load.x+=dx;load.y+=dy;load.z+=dz;}this.restRevision='';}
          if(next.mastExtension===0||next.mastExtension===CRANE_MAX_MAST_EXTENSION){crane.mastMode='hold';crane.mastSpeed=0;}
          if(next.boomExtension===0||next.boomExtension===CRANE_MAX_BOOM_EXTENSION){crane.boomMode='hold';crane.boomSpeed=0;}
        }
      }
      if(crane.mastExtension===undefined && crane.angle!==undefined && crane.armMode && crane.armMode!=='hold') {
        const radius=Math.max(64,Math.hypot(crane.outletLocal?.x??0,crane.outletLocal?.y??0)),speed=Math.min(Math.PI/15,CRANE_SPEED/radius);
        crane.angularSpeed=Math.min(speed,(crane.angularSpeed??0)+Math.max(0,Math.min(100,dt))/1000*.35);
        const next=crane.angle+(crane.armMode==='left'?1:-1)*crane.angularSpeed*Math.min(100,Math.max(0,dt))/1000,load=this.cargo.find(c=>c.id===crane.cargoId);
        const reason=sweepCrane(env.builds??[],crane.pieceId,crane.angle,next,a=>craneOutlet(crane,a),env,players,this.cargo,load,crane.hasWinch!==false?crane.length:undefined);
        if(reason){crane.blocked=true;crane.blockedReason=reason;crane.mode='hold';crane.armMode='hold';crane.angularSpeed=0;this.brakeExtensions(crane);if(load)crane.length=clamp(craneCableDistance(load,crane),CRANE_MIN_LENGTH,CRANE_MAX_LENGTH);}
        else {const old=craneOutlet(crane),outlet=craneOutlet(crane,next);crane.angle=Math.atan2(Math.sin(next),Math.cos(next));if(load){const dx=outlet.x-old.x,dy=outlet.y-old.y,physics=this.physics.get(load.id);if(physics)physics.translateCrane(load,dx,dy);else{load.x+=dx;load.y+=dy;}}}
      }
      if(!crane.cargoId && crane.hasWinch!==false) {
        const outlet=craneOutlet(crane),direction=crane.mode==='raise'?-1:crane.mode==='lower'?1:0;
        const proposed=clamp(crane.length+direction*CRANE_SPEED*Math.min(100,Math.max(0,dt))/1000,CRANE_MIN_LENGTH,CRANE_MAX_LENGTH);
        const floor=env.floor(outlet.x,outlet.y,outlet.z-CRANE_MIN_LENGTH,0),maximum=Math.min(CRANE_MAX_LENGTH,outlet.z-(floor??-512)-32);
        const length=Math.min(proposed,Math.max(CRANE_MIN_LENGTH,maximum));
        const pathBlocked=env.blocked(outlet,{...outlet,z:outlet.z-length},crane.pieceId);
        if(pathBlocked){crane.blocked=true;crane.blockedReason='Cable obstruction';crane.armMode=crane.angle!==undefined?'hold':undefined;crane.angularSpeed=0;this.brakeExtensions(crane);}
        if(!pathBlocked)crane.length=length;
        if(crane.blocked || length===CRANE_MIN_LENGTH || length===maximum || length===CRANE_MAX_LENGTH)crane.mode='hold';
      }
    }
    const seconds=1/120;
    this.physicsRemainder+=Math.max(0,Math.min(100,dt))/1000;
    const steps=Math.min(12,Math.floor((this.physicsRemainder+1e-9)/seconds));this.physicsRemainder-=steps*seconds;
    for(const cargo of this.cargo){
      if(!validCargoState(cargo)||cargoBounds(cargo).maxZ< -640){this.recoverCargo(cargo,this.physics.get(cargo.id));continue;}
      if(cargo.secured){
        const v=env.vehicles.find(v=>v.id===cargo.secured!.vehicleId),pose=v&&securedCargoPose(cargo,[v]);
        if(v&&pose&&cargoFitsVehicle(pose,v)){Object.assign(cargo,pose);continue;}
        cargo.secured=undefined;
      }
      const oldDeck=this.previousVehicles.find(v=>Math.abs(cargoBounds(cargo).minZ-v.z)<2&&cargoFitsVehicle(cargo,v));
      const newDeck=oldDeck&&env.vehicles.find(v=>v.id===oldDeck.id);
      if(oldDeck&&newDeck){
        const p=vehicleLocalPoint(oldDeck,cargo),angle=cargo.angle-oldDeck.angle;
        const delta=newDeck.angle-oldDeck.angle,c=Math.cos(delta),s=Math.sin(delta);
        const motion={vx:c*cargo.vx-s*cargo.vy,vy:s*cargo.vx+c*cargo.vy,vz:cargo.vz,spin:cargo.spin,angularVelocityX:c*(cargo.angularVelocityX??0)-s*(cargo.angularVelocityY??0),angularVelocityY:s*(cargo.angularVelocityX??0)+c*(cargo.angularVelocityY??0)};
        Object.assign(cargo,securedCargoPose({...cargo,secured:{vehicleId:newDeck.id,x:p.x,y:p.y,z:p.z,orientation:yawCargoOrientation(cargo,-oldDeck.angle),angle}},[newDeck]),{secured:undefined,...motion});
      }
      const ropes=[...this.ropes.values()].filter(r=>r.cargoId===cargo.id);
      const crane=[...this.cranes.values()].find(c=>c.cargoId===cargo.id)??(this.aircraftWinch?.cargoId===cargo.id?this.aircraftWinch:undefined);
      if(crane)this.updateCraneSway(crane,cargo,dt,env,players);
      if(!crane&&!ropes.length&&!oldDeck&&this.restRevision===env.revision&&Math.hypot(cargo.vx,cargo.vy,cargo.vz,cargo.spin,cargo.angularVelocityX??0,cargo.angularVelocityY??0)===0)continue;
      if(crane?.mode==='hold' && (crane.swayAngle??0)===0 && Math.hypot(this.sway.get(crane.pieceId)?.vx??0,this.sway.get(crane.pieceId)?.vy??0)===0 && !this.craneArmIsMoving(crane.pieceId) && !ropes.length && this.restRevision===env.revision && Math.abs(craneOutlet(crane).z-crane.length-craneCargoAnchor(cargo,crane).z)<.02 && Math.abs(cargo.vz)<.02){cargo.vx=cargo.vy=cargo.vz=cargo.spin=0;cargo.angularVelocityX=cargo.angularVelocityY=0;continue;}
      const cranePathBlocked=Boolean(crane && env.blocked(craneOutlet(crane),craneCargoAnchor(cargo,crane),crane.pieceId));
      let physics=this.physics.get(cargo.id);if(!physics){physics=new FriendsCargoPhysics();this.physics.set(cargo.id,physics);}physics.prepare(cargo,crane?{...env,dynamicColliders:region=>[
        ...(env.dynamicColliders?.(region)??[]),
        ...players.filter(p=>p.lifeState==='alive'&&!p.friendsDevFlight&&p.x+19>=region.minX&&p.x-19<=region.maxX&&p.y+19>=region.minY&&p.y-19<=region.maxY&&p.z+50>=region.minZ&&p.z<=region.maxZ).map(p=>({x:p.x,y:p.y,z:p.z,w:38,d:38,h:50})),
      ]}:env,this.cargo);physics.setTowing(ropes.length>0 || Boolean(crane));physics.setCraneGuide(Boolean(crane));
      for(const rope of ropes){
        const p=actorById.get(rope.id)!,hand={x:p.x,y:p.y,z:p.z+26},anchor=cargoAnchor(cargo,rope);
        const route=env.routeRope?.(hand,anchor,rope.bends??[]);
        rope.bends=route??[];rope.blocked=route===undefined&&env.blocked(hand,anchor);
        // The motor stalls/slips under overload instead of storing unlimited
        // elastic stretch while an operator reels against an immovable wall.
        const input=inputs.get(rope.id);
        if(input?.aiming&&!input.sliding){
          const points=[hand,...rope.bends,anchor];let distance=0;
          for(let i=1;i<points.length;i++)distance+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y,points[i].z-points[i-1].z);
          rope.length=Math.max(rope.length,Math.min(ROPE_REACH,distance-24));
        }
      }
      for(let step=0;step<steps;step++){
        if(crane) {
          const outlet=craneOutlet(crane),anchor=craneCargoAnchor(cargo,crane),actual=craneCableDistance(cargo,crane);
          const pathBlocked=cranePathBlocked;
          crane.blocked=pathBlocked || crane.mode==='hold' && crane.blocked;
          if(pathBlocked){crane.armMode=crane.angle!==undefined?'hold':undefined;crane.angularSpeed=0;this.brakeExtensions(crane);crane.mode='hold';crane.length=clamp(actual,CRANE_MIN_LENGTH,CRANE_MAX_LENGTH);}
          const direction=crane.mode==='raise'?-1:crane.mode==='lower'?1:0;
          // Limit stored error to one short motor travel. A collision stalls the
          // reel instead of accumulating energy or bypassing the cargo solver.
          crane.length=clamp(crane.length+direction*(crane.vehicleId?this.aircraftWinch?.winchSpeed??0:CRANE_SPEED)*seconds,Math.max(crane.vehicleId?AIRCRAFT_WINCH_MIN_LENGTH:CRANE_MIN_LENGTH,actual-8),Math.min(CRANE_MAX_LENGTH,actual+8));
          if(crane.length===(crane.vehicleId?AIRCRAFT_WINCH_MIN_LENGTH:CRANE_MIN_LENGTH) || crane.length===CRANE_MAX_LENGTH){crane.mode='hold';if(crane.vehicleId&&this.aircraftWinch)this.aircraftWinch.winchSpeed=0;}
          physics.driveCrane(outlet.z-craneCableDrop(crane.length,anchor.x-outlet.x,anchor.y-outlet.y)-anchor.z,CRANE_SPEED);
        }
        for(const rope of ropes){
          if(!this.ropes.has(rope.id))continue;
          const p=actorById.get(rope.id)!,anchor=cargoAnchor(cargo,rope),hand={x:p.x,y:p.y,z:p.z+26};
          const points=[hand,...(rope.bends??[]),anchor],pull=points[points.length-2];
          const dx=pull.x-anchor.x,dy=pull.y-anchor.y,dz=pull.z-anchor.z,leg=Math.hypot(dx,dy,dz);
          let distance=0;for(let i=1;i<points.length;i++)distance+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y,points[i].z-points[i-1].z);
          if(distance>ROPE_REACH+80){this.detach(p.id);rope.tension=0;this.tell(p.id,'Rope released: move closer to the core.',elapsed);continue;}
          const traction=Math.abs(p.verticalVelocity??0)>40?.35:1,velocity=physics.anchorVelocity(anchor);
          const input=inputs.get(p.id),maxPull=input?.aiming&&!input.sliding?ROPE_WINCH_PULL:ROPE_MAX_PULL;
          const stretch=Math.max(0,distance-rope.length);
          const force=rope.blocked||stretch===0?0:clamp(stretch*280-(velocity.x*dx+velocity.y*dy+velocity.z*dz)/Math.max(1,leg)*28,0,maxPull*traction);
          rope.tension=force/maxPull;
          physics.applyPull({x:dx/Math.max(1,leg)*force,y:dy/Math.max(1,leg)*force,z:dz/Math.max(1,leg)*force},anchor);
        }
        physics.step(seconds,cargo);
        // Validate a contact result before any operator sees its anchor.
        if(!validCargoState(cargo)||cargoBounds(cargo).maxZ< -640){this.recoverCargo(cargo,physics);if(crane){crane.mode='hold';crane.armMode=crane.armMode?'hold':undefined;}break;}
        // Keep player strength bounded, while allowing the load to rotate and fall.
        // Vertical overload stretches the rope rather than freezing the falling body.
        for(const rope of ropes)if(this.ropes.has(rope.id)&&!rope.blocked){
          // A grounded, stationary operator can brace the powered reel. Its clutch
          // still caps force; shortening a cable must not teleport the operator off a ledge.
          const input=inputs.get(rope.id),actor=actorById.get(rope.id)!;
          if(input?.aiming&&!input.sliding&&!input.movement&&Math.abs(actor.verticalVelocity??0)<1)continue;
          const p=actorById.get(rope.id)!,end=cargoAnchor(cargo,rope),anchor=rope.bends?.[0]??end,bends=[...(rope.bends??[]),end];
          let used=0;for(let i=1;i<bends.length;i++)used+=Math.hypot(bends[i].x-bends[i-1].x,bends[i].y-bends[i-1].y,bends[i].z-bends[i-1].z);
          const dx=p.x-anchor.x,dy=p.y-anchor.y,dz=p.z+26-anchor.z;
          const remaining=rope.length+24-used,distance=Math.hypot(dx,dy);
          if(remaining<=Math.abs(dz)){
            // A fall or newly wrapped corner can consume the entire cable.
            // There is no valid horizontal constraint in this case. Let the
            // clutch slip; projecting to radius zero snaps the player sideways.
            rope.length=Math.max(rope.length,Math.min(ROPE_REACH,used+Math.hypot(distance,dz)-24));
            continue;
          }
          const allowed=Math.sqrt(remaining**2-dz**2);
          if(distance>allowed&&distance>.001){
            const recoil=Math.min(distance-allowed,ROPE_OPERATOR_SPEED*seconds);
            const point={x:p.x-dx/distance*recoil,y:p.y-dy/distance*recoil};
            // Sweep the cylinder through short displacements; an endpoint-only
            // check can jump over a wall below the cable. Reject depenetrations
            // instead of accepting a second, potentially much larger teleport.
            if(env.collide(point,p.z,18,50,STEP)||collidePhysicalCargo(this.cargo,point,p.z,18))continue;
            if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||Math.hypot(point.x-p.x,point.y-p.y)>recoil+.001)continue;
            let floor:number|undefined;
            if(Math.abs(p.verticalVelocity??0)<1){
              floor=(env.operatorFloor??env.floor)(point.x,point.y,p.z,STEP);
              // A grounded operator's cable slips at a ledge. Walking/jumping
              // can still leave it, but recoil cannot drop them into a cave.
              if(floor===undefined||Math.abs(floor-p.z)>STEP)continue;
            }
            p.x=point.x;p.y=point.y;if(floor!==undefined)p.z=floor;
            const away=(p.velocityX??0)*dx/distance+(p.velocityY??0)*dy/distance;
            if(away>0){p.velocityX=(p.velocityX??0)-dx/distance*away;p.velocityY=(p.velocityY??0)-dy/distance*away;}
          }
        }
      }
      if(crane) {
        const actual=craneCableDistance(cargo,crane);
        if(crane.mode!=='hold' && Math.abs(actual-crane.length)>6 && Math.abs(cargo.vz)<2) {
          crane.blocked=true;crane.mode='hold';crane.armMode=crane.angle!==undefined?'hold':undefined;crane.angularSpeed=0;this.brakeExtensions(crane);crane.length=clamp(actual,CRANE_MIN_LENGTH,CRANE_MAX_LENGTH);
        }
      }
      cargo.x=clamp(cargo.x,168,47832);cargo.y=clamp(cargo.y,168,47832);
    }
    this.playerCarry.update(dt, players, env);
    this.previousVehicles = env.vehicles.map(v => ({ ...v })); this.restRevision = env.revision;
  }
  save(): HaulingSave { return { version: 1, spawnRevision: HAULING_SPAWN_REVISION, delivered: this.delivered, completedCargoIds:[...this.completedCargoIds], cargo: this.cargo.map(c => ({ ...c, orientation:c.orientation ? [...c.orientation] as [number,number,number,number]:undefined, secured: c.secured ? { ...c.secured,orientation:c.secured.orientation?[...c.secured.orientation] as [number,number,number,number]:undefined } : undefined })) }; }
  snapshot(): HaulingSnapshot { return { ...this.save(), playerRopes: this.playerCarry.snapshot(), aircraftWinch:this.aircraftWinch&&{...this.aircraftWinch},cranes:[...this.cranes.values()].map(c=>({...c})), ropes: [...this.ropes.values()].map(r => ({ ...r,bends:r.bends?.map(p=>({...p})) })), feedback: Object.fromEntries(Object.entries(this.feedback).map(([id, f]) => [id, { ...f }])) }; }
}
