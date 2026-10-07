import { scenicCargoWagon } from '../world/FriendsTrainLayout';
import { vehicleLocalPoint, vehicleWorldPoint, vehicleRotation, composeRotation } from './FriendsVehiclePose';
import { FRIENDS_DELIVERY_BAY } from '../world/FriendsHaulingGoal';
import { FRIENDS_HAULING_PLATFORM } from '../world/FriendsTerrain';
import type { FriendsVehicle } from './FriendsExpedition';
import type { MultiplayerInputFrame } from './protocol';
import { FriendsCargoPhysics, type CargoStaticCollider, type CargoPhysicsRegion } from './FriendsCargoPhysics';
import { cargoBounds, cargoHullPoints, cargoLocalPoint, cargoRotation, cargoWorldPoint, rotateCargoVector, yawCargoOrientation } from './FriendsCargoPose';

export const SALVAGE_CORE_SPAWN = { x: FRIENDS_HAULING_PLATFORM.x, y: FRIENDS_HAULING_PLATFORM.y, z: FRIENDS_HAULING_PLATFORM.top };
const HAULING_SPAWN_REVISION = 2;
export const CARGO_WIDTH = 72, CARGO_DEPTH = 56, CARGO_HEIGHT = 48;
export const ROPE_REACH = 480, ROPE_MAX_PULL = 1600;
export const ROPE_WINCH_PULL=2640;
export const ROPE_MIN_LENGTH=24;
const STEP = 8;
type Point = { x: number; y: number; z: number };
export type HaulingActor = Point & { id: string; lifeState: string; friendsDevFlight?: boolean; velocityX?: number; velocityY?: number; verticalVelocity?: number };
export type PhysicalCargo = Point & {
  id: string; angle: number; vx: number; vy: number; vz: number; spin: number;
  orientation?:[number,number,number,number]; angularVelocityX?:number; angularVelocityY?:number;
  secured?: { vehicleId: string; x: number; y: number; angle: number; z?:number; orientation?:[number,number,number,number] };
};
export type CargoRope = { id: string; cargoId: string; anchorX: number; anchorY: number; anchorZ: number; length: number; tension: number; blocked: boolean; bends?:Point[] };
export type HaulingSave = { version: 1; spawnRevision?: number; cargo: PhysicalCargo[]; delivered: boolean };
export type HaulingSnapshot = HaulingSave & { ropes: CargoRope[]; feedback: Record<string, { message: string; until: number }> };
export type HaulingEnvironment = {
  revision: string;
  floor: (x: number, y: number, z: number, step: number) => number | undefined;
  collide: (point: { x: number; y: number }, z: number, radius: number, height: number, step: number) => boolean;
  blocked: (from: Point, to: Point) => boolean;
  vehicles: readonly FriendsVehicle[];
  solid?: (vx:number,vy:number,vz:number)=>boolean;
  colliders?: (region:CargoPhysicsRegion)=>CargoStaticCollider[];
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
  const b=cargoBounds(cargo),g=FRIENDS_DELIVERY_BAY;
  return !cargo.secured && b.minX>=g.x-g.width/2 && b.maxX<=g.x+g.width/2 &&
    b.minY>=g.y-g.depth/2 && b.maxY<=g.y+g.depth/2 && Math.abs(b.minZ-g.z)<=STEP;
}
export function cargoDeliveryReady(cargo: PhysicalCargo) {
  return cargoInDeliveryBay(cargo) && Math.hypot(cargo.vx,cargo.vy,cargo.vz)<=20 &&
    Math.hypot(cargo.spin,cargo.angularVelocityX??0,cargo.angularVelocityY??0)<=.35;
}
export function haulingInteraction(cargo: readonly PhysicalCargo[], player: Point, vehicles: readonly FriendsVehicle[], delivered: boolean) {
  const nearby = cargo.filter(c => {const p=cargoWorldPoint(c,{x:0,y:0,z:24});return Math.hypot(p.x-player.x,p.y-player.y,p.z-player.z-26)<135;})
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
  if (!nearby) return;
  if (nearby.secured) return { cargo: nearby, label: 'Release salvage core' };
  if (!delivered && cargoInDeliveryBay(nearby)) return { cargo: nearby, label: cargoDeliveryReady(nearby) ? 'Deliver core · Delivery Bay' : 'Let the core settle to deliver' };
  const v = vehicles.find(v => cargoFitsVehicle(nearby, v) && Math.abs(Math.min(...cargoHullPoints(nearby).map(p=>vehicleLocalPoint(v,p).z))) <= 3);
  return { cargo: nearby, label: v ? `Secure core aboard ${v.scenic?'Grand Traverse':v.kind === 'train' ? 'Sunline' : 'Sunskiff'}` : delivered ? 'Delivery complete · core remains movable' : 'Haul the core into the green Delivery Bay', vehicle: v };
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
export class FriendsHauling {
  private cargo: PhysicalCargo[];
  private ropes = new Map<string, CargoRope>();
  private feedback: HaulingSnapshot['feedback'] = {};
  private delivered = false;
  private previousVehicles: FriendsVehicle[] = [];
  private restRevision = '';
  private physics=new Map<string,FriendsCargoPhysics>();
  private physicsRemainder=0;
  constructor(saved?: HaulingSave, floor?: HaulingEnvironment['floor'], resetAtStart=false) {
    const initial: PhysicalCargo = { id: 'lantern-core', ...SALVAGE_CORE_SPAWN, angle: 0, vx: 0, vy: 0, vz: 0, spin: 0 };
    // Look down from above the world, not from an outdated spawn elevation:
    // searching inside a solid column can otherwise return no surface at all.
    if (floor) initial.z = Math.max(...footprintPoints(initial).map(p => floor(p.x, p.y, 6000, 0) ?? initial.z));
    this.cargo = [initial];
    this.delivered = saved?.version === 1 && saved.delivered === true;
    if(resetAtStart){initial.z=SALVAGE_CORE_SPAWN.z;this.delivered=false;return;}
    // Relocate pre-fix worlds once. Subsequent saves retain the crew's new cargo
    // position, rotation and transport attachments normally.
    if (floor && saved?.spawnRevision !== HAULING_SPAWN_REVISION) return;
    // Dimensions, identity and mass are defined by the game, never by imported saves.
    const c = saved?.version === 1 && Array.isArray(saved.cargo) ? saved.cargo.find(c => c?.id === initial.id) : undefined;
    if (c && [c.x, c.y, c.z, c.angle].every(Number.isFinite) && c.x >= 128 && c.x <= 47872 && c.y >= 128 && c.y <= 47872 && c.z >= -512 && c.z <= 6000) {
      const a = c.secured;
      const secured = a && typeof a.vehicleId === 'string' && ['sunskiff', 'sunline-0', 'sunline-1', 'sunline-2', 'grand-0', 'grand-1', 'grand-2'].includes(a.vehicleId) && [a.x, a.y, a.angle].every(Number.isFinite) && Math.abs(a.x) < 140 && Math.abs(a.y) < 80 ? {vehicleId:a.vehicleId,x:a.x,y:a.y,angle:a.angle,z:Number.isFinite(a.z)&&Math.abs(a.z!)<=100?a.z:undefined,orientation:Array.isArray(a.orientation)&&a.orientation.length===4&&a.orientation.every(Number.isFinite)&&Math.abs(Math.hypot(...a.orientation)-1)<.01?[...a.orientation] as [number,number,number,number]:undefined} : undefined;
      const q=c.orientation,n=Array.isArray(q)&&q.length===4?Math.hypot(...q):0;
      const orientation=Array.isArray(q)&&q.every(Number.isFinite)&&n>.001?q.map(v=>v/n) as [number,number,number,number]:undefined;
      this.cargo = [{ ...initial, x: c.x, y: c.y, z: c.z, angle: c.angle, orientation, secured }]; this.delivered = saved.delivered === true;
    }
  }
  getCargo() { return this.cargo; }
  hasSecuredTrainCargo() { return this.cargo.some(c => c.secured?.vehicleId.startsWith('sunline')); }
  movementScale(id: string) { const rope = this.ropes.get(id); return rope && !rope.blocked ? 1 - .65 * rope.tension : 1; }
  detach(id: string) { this.ropes.delete(id); }
  private tell(id: string, message: string, elapsed: number) { this.feedback[id] = { message, until: elapsed + 4000 }; }
  shoot(player: HaulingActor, direction: Point, env: HaulingEnvironment, elapsed: number) {
    if (this.ropes.delete(player.id)) { this.tell(player.id, 'Rope released.', elapsed); return; }
    if (player.lifeState !== 'alive' || player.friendsDevFlight || env.vehicles.some(v => v.pilotId === player.id)) return;
    const origin = { x: player.x, y: player.y, z: player.z + 26 };
    const hits = this.cargo.map(cargo => ({ cargo, hit: rayCargo(cargo, origin, direction) })).filter(h => h.hit).sort((a, b) => a.hit!.distance - b.hit!.distance);
    const h = hits[0];
    if (!h || env.blocked(origin, { x: origin.x + direction.x * h.hit!.distance, y: origin.y + direction.y * h.hit!.distance, z: origin.z + direction.z * h.hit!.distance })) { this.tell(player.id, 'Aim at the salvage core within 40m, with a clear rope path.', elapsed); return; }
    if (h.cargo.secured) { this.tell(player.id, 'Release the cargo straps with F before towing.', elapsed); return; }
    const a = h.hit!.anchor;
    this.ropes.set(player.id, { id: player.id, cargoId: h.cargo.id, anchorX: a.x, anchorY: a.y, anchorZ: a.z, length: Math.max(ROPE_MIN_LENGTH, h.hit!.distance + 8), tension: 0, blocked: false });
    this.tell(player.id, 'Attached. Walk to pull · hold aim to reel · crouch + aim feeds rope · primary action releases.', elapsed);
  }
  interact(player: HaulingActor, env: HaulingEnvironment, elapsed: number) {
    const target = haulingInteraction(this.cargo, player, env.vehicles, this.delivered);
    if (!target || env.blocked({ x: player.x, y: player.y, z: player.z + 26 }, cargoWorldPoint(target.cargo,{x:0,y:0,z:24}))) return false;
    const c = target.cargo;
    if (c.secured) { c.secured = undefined; this.tell(player.id, 'Straps released. The core can be hauled off the deck.', elapsed); }
    else if (Math.hypot(c.vx, c.vy, c.vz) > 20 || Math.hypot(c.spin,c.angularVelocityX??0,c.angularVelocityY??0)>.35) this.tell(player.id, 'Let the core settle before securing or delivering it.', elapsed);
    else if (!this.delivered && cargoInDeliveryBay(c)) {
      const surface=env.floor(c.x,c.y,6000,0);
      if(surface===undefined || Math.abs(surface-FRIENDS_DELIVERY_BAY.z)>STEP || Math.abs(cargoBounds(c).minZ-surface)>STEP) this.tell(player.id,'Rest the whole core on the green Delivery Bay to finish.',elapsed);
      else { this.delivered = true; this.tell(player.id, 'DELIVERY COMPLETE! Your crew hauled the Lantern core to the Delivery Bay.', elapsed); }
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
    for (const id of Object.keys(this.feedback)) if (this.feedback[id].until <= elapsed || !players.some(p => p.id === id)) delete this.feedback[id];
    const actorById = new Map(players.map(p => [p.id, p]));
    for (const [id, rope] of this.ropes) {
      const p = actorById.get(id), input = inputs.get(id);
      if (!p || p.lifeState !== 'alive' || p.friendsDevFlight || !input || input.friendsTool !== 5 || env.vehicles.some(v => v.pilotId === id)) { this.ropes.delete(id); continue; }
      if (input.aiming) rope.length = clamp(rope.length+Math.max(0,Math.min(100,dt))*(input.sliding?.06:-.045),ROPE_MIN_LENGTH,ROPE_REACH);
    }
    const seconds=1/120;
    this.physicsRemainder+=Math.max(0,Math.min(100,dt))/1000;
    const steps=Math.min(12,Math.floor((this.physicsRemainder+1e-9)/seconds));this.physicsRemainder-=steps*seconds;
    for(const cargo of this.cargo){
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
      if(!ropes.length&&!oldDeck&&this.restRevision===env.revision&&Math.hypot(cargo.vx,cargo.vy,cargo.vz,cargo.spin,cargo.angularVelocityX??0,cargo.angularVelocityY??0)===0)continue;
      let physics=this.physics.get(cargo.id);if(!physics){physics=new FriendsCargoPhysics();this.physics.set(cargo.id,physics);}physics.prepare(cargo,env);
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
          const force=rope.blocked||stretch===0?0:clamp(stretch*140-(velocity.x*dx+velocity.y*dy+velocity.z*dz)/Math.max(1,leg)*9,0,maxPull*traction);
          rope.tension=force/maxPull;
          physics.applyPull({x:dx/Math.max(1,leg)*force,y:dy/Math.max(1,leg)*force,z:dz/Math.max(1,leg)*force},anchor);
        }
        physics.step(seconds,cargo);
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
          const allowed=Math.sqrt(Math.max(0,Math.max(0,rope.length+24-used)**2-dz**2)),distance=Math.hypot(dx,dy);
          if(distance>allowed&&distance>.001){
            const point={x:anchor.x+dx/distance*allowed,y:anchor.y+dy/distance*allowed};
            env.collide(point,p.z,18,50,8);collidePhysicalCargo(this.cargo,point,p.z,18);p.x=point.x;p.y=point.y;p.velocityX=cargo.vx;p.velocityY=cargo.vy;
          }
        }
      }
      cargo.x=clamp(cargo.x,168,47832);cargo.y=clamp(cargo.y,168,47832);
      // A world-boundary fall is recovered at the existing salvage spawn, not frozen in midair.
      if(cargoBounds(cargo).maxZ < -640 || ![cargo.x,cargo.y,cargo.z,cargo.vx,cargo.vy,cargo.vz].every(Number.isFinite)){
        Object.assign(cargo,SALVAGE_CORE_SPAWN,{angle:0,orientation:undefined,vx:0,vy:0,vz:0,spin:0,angularVelocityX:0,angularVelocityY:0});
        for(const rope of ropes)this.detach(rope.id);physics.sync(cargo);
      }
    }
    this.previousVehicles = env.vehicles.map(v => ({ ...v })); this.restRevision = env.revision;
  }
  save(): HaulingSave { return { version: 1, spawnRevision: HAULING_SPAWN_REVISION, delivered: this.delivered, cargo: this.cargo.map(c => ({ ...c, orientation:c.orientation ? [...c.orientation] as [number,number,number,number]:undefined, secured: c.secured ? { ...c.secured,orientation:c.secured.orientation?[...c.secured.orientation] as [number,number,number,number]:undefined } : undefined })) }; }
  snapshot(): HaulingSnapshot { return { ...this.save(), ropes: [...this.ropes.values()].map(r => ({ ...r,bends:r.bends?.map(p=>({...p})) })), feedback: Object.fromEntries(Object.entries(this.feedback).map(([id, f]) => [id, { ...f }])) }; }
}
