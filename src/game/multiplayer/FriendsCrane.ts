import type { FriendsBuildPiece } from './FriendsBuilding';
import type { PhysicalCargo, HaulingActor, HaulingEnvironment } from './FriendsHauling';
import { cargoBounds, cargoLocalPoint, cargoWorldPoint } from './FriendsCargoPose';

// Game coordinates use Z as height. The outlet sits below the boom, clear of
// its collider, and well beyond the mounting plate / a 2-block balcony edge.
export const CRANE_OUTLET = { x: 120, y: 0, z: 134 };
export const CRANE_MIN_LENGTH = 12;
export const CRANE_MAX_LENGTH = 6144;
export const CRANE_SPEED = 56;
export type CraneAction = 'crane_hook_connect' | 'crane_hook_release' | 'crane_left' | 'crane_right' | 'crane_stop_arm' | 'crane_stop_all' | 'crane_takeover' | 'crane_heartbeat' | 'crane_connect' | 'crane_raise' | 'crane_lower' | 'crane_hold' | 'crane_release';
export type FriendsCraneState = {
  pieceId: number; x: number; y: number; z: number; rotation: number;
  length: number; mode: 'hold' | 'raise' | 'lower'; blocked: boolean;
  cargoId?: string; anchorX?: number; anchorY?: number; anchorZ?: number;
  operatorId?: string; leaseUntilMs?:number; angle?:number; armMode?:'hold'|'left'|'right'; angularSpeed?:number; outletLocal?:{x:number;y:number;z:number}; winchId?:number; hasWinch?:boolean; blockedReason?:string; memberCount?:number;
};
export function craneOutlet(piece: Pick<FriendsBuildPiece, 'x'|'y'|'z'|'rotation'> & Pick<FriendsCraneState,'angle'|'outletLocal'>,angle=piece.angle??0) {
  const a = piece.rotation * Math.PI / 2+angle,point=piece.outletLocal??CRANE_OUTLET;
  return { x: piece.x + point.x*Math.cos(a)-point.y*Math.sin(a), y: piece.y + point.x*Math.sin(a)+point.y*Math.cos(a), z: piece.z + point.z };
}
export function nearbyCrane(pieces: readonly FriendsBuildPiece[], actor: Pick<HaulingActor,'x'|'y'|'z'|'lifeState'|'friendsDevFlight'>) {
  if (actor.lifeState !== 'alive' || actor.friendsDevFlight) return;
  return pieces.filter(p=>!p.attachment&&!p.assembly&&['crane','crane_joint','crane_winch','crane_console'].includes(p.shape)&&Math.abs(actor.z-p.z)<64)
    .map(p=>{const a=p.rotation*Math.PI/2,offset=p.shape==='crane'?-64:0;return {p,distance:Math.hypot(actor.x-(p.x+offset*Math.cos(a)),actor.y-(p.y+offset*Math.sin(a)))};})
    .filter(p=>p.distance<144).sort((a,b)=>a.distance-b.distance)[0]?.p;
}
export function craneCargoAnchor(cargo: PhysicalCargo, crane: FriendsCraneState) {
  return cargoWorldPoint(cargo,{x:crane.anchorX??0,y:crane.anchorY??0,z:crane.anchorZ??48});
}
export function craneCandidate(crane: FriendsCraneState, cargo: readonly PhysicalCargo[], env: Pick<HaulingEnvironment,'blocked'>, occupied: ReadonlySet<string>) {
  const outlet = craneOutlet(crane), hookZ = outlet.z-crane.length;
  return cargo.filter(c => !c.secured && !occupied.has(c.id) && Math.hypot(c.vx,c.vy,c.vz)<24)
    .map(c => {
      const top = cargoWorldPoint(c,{x:0,y:0,z:48});
      // The rig attaches to a point on the top lifting plate under the cable,
      // preserving position and attitude rather than snapping a load sideways.
      const anchor = cargoLocalPoint(c,{x:outlet.x,y:outlet.y,z:top.z});
      const distance = outlet.z-top.z;
      return {cargo:c,anchor,distance,top};
    }).filter(c => Math.abs(c.anchor.x)<=24 && Math.abs(c.anchor.y)<=18 && Math.abs(c.anchor.z-48)<8
      && c.distance>=CRANE_MIN_LENGTH && c.distance<=CRANE_MAX_LENGTH && Math.abs(hookZ-c.top.z)<80
      && cargoBounds(c.cargo).maxZ<outlet.z-8 && !env.blocked(outlet,{x:outlet.x,y:outlet.y,z:c.top.z}))
    .sort((a,b)=>Math.abs(hookZ-a.top.z)-Math.abs(hookZ-b.top.z))[0];
}

/** Ground crew work at the hook independently of the console's motor lease. */
export function craneHookInteraction(cranes:readonly FriendsCraneState[],cargo:readonly PhysicalCargo[],actor:Pick<HaulingActor,'x'|'y'|'z'|'lifeState'|'friendsDevFlight'>,blocked:HaulingEnvironment['blocked']=()=>false) {
  if(actor.lifeState!=='alive'||actor.friendsDevFlight)return;
  const hand={x:actor.x,y:actor.y,z:actor.z+26},occupied=new Set(cranes.flatMap(c=>c.cargoId?[c.cargoId]:[]));
  return cranes.filter(c=>c.hasWinch!==false).flatMap(crane=>{
    const outlet=craneOutlet(crane),load=cargo.find(c=>c.id===crane.cargoId),hook=load?craneCargoAnchor(load,crane):{...outlet,z:outlet.z-crane.length};
    const distance=Math.hypot(hand.x-hook.x,hand.y-hook.y,hand.z-hook.z);
    if(distance>96||blocked(hand,hook))return [];
    if(load)return [{crane,cargo:load,action:'crane_hook_release' as CraneAction,label:'Disconnect crane hook',distance}];
    const candidate=craneCandidate(crane,cargo,{blocked},occupied);if(!candidate)return [];
    return [{crane,cargo:candidate.cargo,action:'crane_hook_connect' as CraneAction,label:'Connect load to crane hook',distance}];
  }).sort((a,b)=>a.distance-b.distance)[0];
}
