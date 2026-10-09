import { resolveFriendsBuildPieces, friendsBuildFloor, type FriendsBuildPiece } from './FriendsBuilding';
import { scenicVehicles, SCENIC_SEATS } from './FriendsScenicService';
import { scenicRailway } from '../world/FriendsScenicRailway';
import { vehicleWorldPoint, vehicleLocalPoint } from './FriendsVehiclePose';
import { friendsVehicleFloor, pointOnGangway, trainGangways, gangwayHeight, type FriendsSnapshot, type FriendsVehicle } from './FriendsExpedition';
import type { CoopGrenadeSnapshot } from '../combat/coopGrenades';
import { securedCargoPose } from './FriendsHauling';
import { interpolateCargoRotation } from './FriendsCargoPose';
import { isRowboatSeat, rowboatSeatPoint } from './FriendsRowboat';
import { CoopEnemySnapshot, CoopPlayerSnapshot, CoopProjectileSnapshot, CoopSnapshot } from './CoopSimulation';

/** Teleports are discontinuities, including a nearby Return Home. */
function redeployedPlayers(previous: CoopSnapshot, current: CoopSnapshot) {
  const oldEvents = new Set(previous.combatEvents.map(event => event.id));
  return new Set(current.combatEvents.filter(event => event.kind === 'player_redeployed' && !oldEvents.has(event.id)).map(event => event.playerId));
}

/**
 * Smooths presentation only. It never feeds values back into the host
 * simulation, so network authority remains unchanged.
 */
export function interpolateCoopSnapshot(previous: CoopSnapshot, current: CoopSnapshot, alpha: number): CoopSnapshot {
  if ((previous.world?.id || 'neon_bastion') !== (current.world?.id || 'neon_bastion')) return current;
  const progress = Math.max(0, Math.min(1, alpha));
  // Once presentation catches up, the authoritative snapshot is already the
  // exact result. Avoid cloning every moving entity on extra display frames.
  if (progress >= 1) return current;
  const redeployed = redeployedPlayers(previous, current);
  const players = interpolateEntities(previous.players, current.players, progress, (old, next) => ({
    ...next,
    x: redeployed.has(next.id) ? next.x : lerp(old.x, next.x, progress), y: redeployed.has(next.id) ? next.y : lerp(old.y, next.y, progress), angle: lerpAngle(old.angle, next.angle, progress),
    health: lerp(old.health, next.health, progress), z: redeployed.has(next.id) ? next.z : lerp(old.z, next.z, progress),
    friendsHands: old.friendsHands && next.friendsHands ? {...next.friendsHands,
      yaw:lerpAngle(old.friendsHands.yaw,next.friendsHands.yaw,progress),
      pitch:lerp(old.friendsHands.pitch,next.friendsHands.pitch,progress)} : next.friendsHands,
    friendsFlashlight: old.friendsFlashlight && next.friendsFlashlight ? {
      pitch: lerp(old.friendsFlashlight.pitch, next.friendsFlashlight.pitch, progress),
      cone: lerp(old.friendsFlashlight.cone, next.friendsFlashlight.cone, progress),
      yaw: lerpAngle(old.friendsFlashlight.yaw??old.angle,next.friendsFlashlight.yaw??next.angle,progress),
    } : next.friendsFlashlight,
  }));
  const enemies = interpolateEntities(previous.enemies, current.enemies, progress, (old, next) => ({
    ...next,
    x: lerp(old.x, next.x, progress), y: lerp(old.y, next.y, progress), health: lerp(old.health, next.health, progress),
  }));
  const projectiles = interpolateEntities(previous.projectiles, current.projectiles, progress, (old, next) => ({
    ...next,
    x: lerp(old.x, next.x, progress), y: lerp(old.y, next.y, progress), angle: lerpAngle(old.angle, next.angle, progress),
    z: lerp(old.z, next.z, progress), pitch: lerp(old.pitch, next.pitch, progress),
  }));
  const gasZone = current.gasZone && previous.gasZone ? {
    ...current.gasZone,
    x: lerp(previous.gasZone.x, current.gasZone.x, progress),
    y: lerp(previous.gasZone.y, current.gasZone.y, progress),
    radius: lerp(previous.gasZone.radius, current.gasZone.radius, progress),
  } : current.gasZone;
  const grenades = current.grenades && interpolateEntities(previous.grenades || [], current.grenades, progress, (old, next) => ({ ...next, x: lerp(old.x, next.x, progress), y: lerp(old.y, next.y, progress), z: lerp(old.z, next.z, progress) }));
  const friends = interpolateFriends(previous.friends, current.friends, progress);
  if (friends && previous.friends && current.friends) interpolatePassengers(previous, current, friends, players, progress);
  return { ...current, players, enemies, projectiles, gasZone, grenades, friends };
}

/**
 * Allocation-conscious variant for the realtime presentation loop. Network
 * snapshots remain immutable; only this private renderer-facing frame is
 * updated in place. Consumers must not retain a returned interpolated frame.
 */
export class CoopSnapshotInterpolator {
  private readonly players = new Map<string, CoopPlayerSnapshot>();
  private readonly enemies = new Map<number, CoopEnemySnapshot>();
  private readonly grenades = new Map<number, CoopGrenadeSnapshot>();
  private readonly grenadeFrame: CoopGrenadeSnapshot[] = [];
  private readonly activeGrenadeIds = new Set<number>();
  private readonly projectiles = new Map<number, CoopProjectileSnapshot>();
  private readonly activePlayerIds = new Set<string>();
  private readonly activeEnemyIds = new Set<number>();
  private readonly activeProjectileIds = new Set<number>();
  private readonly playerFrame: CoopPlayerSnapshot[] = [];
  private readonly enemyFrame: CoopEnemySnapshot[] = [];
  private readonly projectileFrame: CoopProjectileSnapshot[] = [];
  private readonly gasFrame: NonNullable<CoopSnapshot['gasZone']> = {} as NonNullable<CoopSnapshot['gasZone']>;
  private frame = {} as CoopSnapshot;

  interpolate(previous: CoopSnapshot, current: CoopSnapshot, alpha: number): CoopSnapshot {
    if ((previous.world?.id || 'neon_bastion') !== (current.world?.id || 'neon_bastion')) { this.reset(); return current; }
    const progress = Math.max(0, Math.min(1, alpha));
    if (progress >= 1) return current;

    this.syncPlayers(previous.players, current.players, progress, redeployedPlayers(previous, current));
    this.syncEnemies(previous.enemies, current.enemies, progress);
    this.syncProjectiles(previous.projectiles, current.projectiles, progress);
    assignExact(this.frame, current);
    this.frame.players = this.playerFrame;
    this.frame.enemies = this.enemyFrame;
    this.frame.projectiles = this.projectileFrame;
    if (current.grenades) { this.syncGrenades(previous.grenades || [], current.grenades, progress); this.frame.grenades = this.grenadeFrame; }
    if (current.gasZone && previous.gasZone) {
      assignExact(this.gasFrame, current.gasZone);
      this.gasFrame.x = lerp(previous.gasZone.x, current.gasZone.x, progress);
      this.gasFrame.y = lerp(previous.gasZone.y, current.gasZone.y, progress);
      this.gasFrame.radius = lerp(previous.gasZone.radius, current.gasZone.radius, progress);
      this.frame.gasZone = this.gasFrame;
    }
    this.frame.friends = interpolateFriends(previous.friends, current.friends, progress);
    if (this.frame.friends && previous.friends && current.friends) interpolatePassengers(previous, current, this.frame.friends, this.playerFrame, progress);
    return this.frame;
  }

  reset() {
    this.players.clear(); this.enemies.clear(); this.projectiles.clear(); this.grenades.clear(); this.grenadeFrame.length = 0;
    this.playerFrame.length = 0; this.enemyFrame.length = 0; this.projectileFrame.length = 0;
    this.frame = {} as CoopSnapshot;
  }

  private syncGrenades(previous: CoopGrenadeSnapshot[], current: CoopGrenadeSnapshot[], progress: number) {
    const previousById = indexEntities(previous);
    this.grenadeFrame.length = 0; this.activeGrenadeIds.clear();
    for (const next of current) {
      this.activeGrenadeIds.add(next.id);
      let target = this.grenades.get(next.id);
      if (!target) { target = { ...next }; this.grenades.set(next.id, target); } else assignExact(target, next);
      const old = previousById.get(next.id);
      if (old) { target.x = lerp(old.x, next.x, progress); target.y = lerp(old.y, next.y, progress); target.z = lerp(old.z, next.z, progress); }
      this.grenadeFrame.push(target);
    }
    for (const id of this.grenades.keys()) if (!this.activeGrenadeIds.has(id)) this.grenades.delete(id);
  }

  private syncPlayers(previous: CoopPlayerSnapshot[], current: CoopPlayerSnapshot[], progress: number, redeployed: ReadonlySet<string>) {
    const previousById = indexEntities(previous);
    this.playerFrame.length = 0; this.activePlayerIds.clear();
    for (const next of current) {
      this.activePlayerIds.add(next.id);
      let target = this.players.get(next.id);
      if (!target) { target = { ...next }; this.players.set(next.id, target); }
      else assignExact(target, next);
      const old = previousById.get(next.id);
      if (old && !redeployed.has(next.id)) {
        target.x = lerp(old.x, next.x, progress); target.y = lerp(old.y, next.y, progress);
        target.angle = lerpAngle(old.angle, next.angle, progress);
        target.health = lerp(old.health, next.health, progress); target.z = lerp(old.z, next.z, progress);
        if(old.friendsHands && next.friendsHands) target.friendsHands = {...next.friendsHands,
          yaw:lerpAngle(old.friendsHands.yaw,next.friendsHands.yaw,progress),
          pitch:lerp(old.friendsHands.pitch,next.friendsHands.pitch,progress)};
        if(old.friendsFlashlight && next.friendsFlashlight) target.friendsFlashlight = {
          pitch: lerp(old.friendsFlashlight.pitch, next.friendsFlashlight.pitch, progress),
          cone: lerp(old.friendsFlashlight.cone, next.friendsFlashlight.cone, progress),
          yaw: lerpAngle(old.friendsFlashlight.yaw??old.angle,next.friendsFlashlight.yaw??next.angle,progress),
        };
      }
      this.playerFrame.push(target);
    }
    for (const id of this.players.keys()) if (!this.activePlayerIds.has(id)) this.players.delete(id);
  }

  private syncEnemies(previous: CoopEnemySnapshot[], current: CoopEnemySnapshot[], progress: number) {
    const previousById = indexEntities(previous);
    this.enemyFrame.length = 0; this.activeEnemyIds.clear();
    for (const next of current) {
      this.activeEnemyIds.add(next.id);
      let target = this.enemies.get(next.id);
      if (!target) { target = { ...next }; this.enemies.set(next.id, target); }
      else assignExact(target, next);
      const old = previousById.get(next.id);
      if (old) {
        target.x = lerp(old.x, next.x, progress); target.y = lerp(old.y, next.y, progress);
        target.health = lerp(old.health, next.health, progress);
      }
      this.enemyFrame.push(target);
    }
    for (const id of this.enemies.keys()) if (!this.activeEnemyIds.has(id)) this.enemies.delete(id);
  }

  private syncProjectiles(previous: CoopProjectileSnapshot[], current: CoopProjectileSnapshot[], progress: number) {
    const previousById = indexEntities(previous);
    this.projectileFrame.length = 0; this.activeProjectileIds.clear();
    for (const next of current) {
      this.activeProjectileIds.add(next.id);
      let target = this.projectiles.get(next.id);
      if (!target) { target = { ...next }; this.projectiles.set(next.id, target); }
      else assignExact(target, next);
      const old = previousById.get(next.id);
      if (old) {
        target.x = lerp(old.x, next.x, progress); target.y = lerp(old.y, next.y, progress);
        target.angle = lerpAngle(old.angle, next.angle, progress); target.z = lerp(old.z, next.z, progress);
        target.pitch = lerp(old.pitch, next.pitch, progress);
      }
      this.projectileFrame.push(target);
    }
    for (const id of this.projectiles.keys()) if (!this.activeProjectileIds.has(id)) this.projectiles.delete(id);
  }
}

function interpolateEntities<T extends { id: string | number }>(previous: T[], current: T[], alpha: number, blend: (old: T, next: T) => T): T[] {
  const previousById = indexEntities(previous);
  return current.map(entity => {
    const old = previousById.get(entity.id);
    return old ? blend(old, entity) : entity;
  });
}

const entityIndexes = new WeakMap<readonly object[], Map<string | number, object>>();
function indexEntities<T extends { id: string | number }>(entities: readonly T[]): Map<string | number, T> {
  const cached = entityIndexes.get(entities) as Map<string | number, T> | undefined;
  if (cached) return cached;
  const index = new Map<string | number, T>();
  for (const entity of entities) index.set(entity.id, entity);
  entityIndexes.set(entities, index as Map<string | number, object>);
  return index;
}

function lerp(start: number, end: number, amount: number) { return start + (end - start) * amount; }
function assignExact<T extends object>(target: T, source: T) {
  for (const key in target) if (!(key in source)) delete target[key];
  Object.assign(target, source);
}
function lerpAngle(start: number, end: number, amount: number) {
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + delta * amount;
}

export type InterpolatedEntity = CoopPlayerSnapshot | CoopEnemySnapshot | CoopProjectileSnapshot;

function interpolateFriends(previous: FriendsSnapshot | undefined, current: FriendsSnapshot | undefined, alpha: number): FriendsSnapshot | undefined {
  if (!current || !previous) return current;
  const vehicles = interpolateEntities(previous.vehicles, current.vehicles, alpha, (old, next) => {
    if(next.scenic && old.scenic && old.routeDistance!==undefined && next.routeDistance!==undefined){
      const length=scenicRailway().length,delta=(next.routeDistance-old.routeDistance+length*1.5)%length-length*.5;
      // Large teleports (restore or developer travel) are snapped, ordinary motion follows the curve.
      return Math.abs(delta)>900?next:{...next,...((pose)=>({x:pose.x,y:pose.y,z:pose.z,angle:pose.angle,pitch:pose.pitch,routeDistance:pose.routeDistance}))(scenicVehicles(old.routeDistance+delta*alpha)[0])};
    }
    return {...next,x:lerp(old.x,next.x,alpha),y:lerp(old.y,next.y,alpha),z:lerp(old.z,next.z,alpha),angle:lerpAngle(old.angle,next.angle,alpha),pitch:lerp(old.pitch||0,next.pitch||0,alpha)};
  });
  const hauling = current.hauling && previous.hauling ? { ...current.hauling,
    cargo: interpolateEntities(previous.hauling.cargo, current.hauling.cargo, alpha, (old,next) => next.secured ? securedCargoPose(next,vehicles) : old.secured ? next : ({ ...next, x:lerp(old.x,next.x,alpha), y:lerp(old.y,next.y,alpha), z:lerp(old.z,next.z,alpha), angle:lerpAngle(old.angle,next.angle,alpha), orientation:interpolateCargoRotation(old,next,alpha) })),
    cranes: current.hauling.cranes?.map(next=>{const old=previous.hauling?.cranes?.find(c=>c.pieceId===next.pieceId);return old && old.cargoId===next.cargoId ? {...next,length:lerp(old.length,next.length,alpha),angle:old.angle!==undefined&&next.angle!==undefined?lerpAngle(old.angle,next.angle,alpha):next.angle} : next;}),
    ropes: interpolateEntities(previous.hauling.ropes, current.hauling.ropes, alpha, (old,next) => ({...next, tension:lerp(old.tension,next.tension,alpha), length:lerp(old.length,next.length,alpha)})),
  } : current.hauling;
  const fishing=current.fishing&&previous.fishing?{...current.fishing,
    casts:interpolateEntities(previous.fishing.casts,current.fishing.casts,alpha,(old,next)=>old.phase===next.phase?{...next,x:lerp(old.x,next.x,alpha),y:lerp(old.y,next.y,alpha),z:lerp(old.z,next.z,alpha)}:next),
    fish:interpolateEntities(previous.fishing.fish,current.fishing.fish,alpha,(old,next)=>old.phase===next.phase&&old.ownerId===next.ownerId?{...next,x:lerp(old.x,next.x,alpha),y:lerp(old.y,next.y,alpha),z:lerp(old.z,next.z,alpha),angle:lerpAngle(old.angle,next.angle,alpha)}:next),
  }:current.fishing;
  const stones=current.stones&&previous.stones?{...current.stones,stones:interpolateEntities(previous.stones.stones,current.stones.stones,alpha,(old,next)=>old.skips===next.skips?{...next,x:lerp(old.x,next.x,alpha),y:lerp(old.y,next.y,alpha),z:lerp(old.z,next.z,alpha)}:next)}:current.stones;
  const birds=current.birds&&previous.birds?{...current.birds,birds:interpolateEntities(previous.birds.birds,current.birds.birds,alpha,(old,next)=>old.phase===next.phase?{...next,x:lerp(old.x,next.x,alpha),y:lerp(old.y,next.y,alpha),z:lerp(old.z,next.z,alpha),angle:lerpAngle(old.angle,next.angle,alpha)}:next)}:current.birds;
  return { ...current, vehicles, hauling, fishing, stones, birds, building:current.building&&{...current.building,pieces:resolveFriendsBuildPieces(current.building.pieces,vehicles,new Map((hauling?.cranes??[]).filter(c=>c.angle!==undefined).map(c=>[c.pieceId,c.angle!])))} };
}
function passengerAnchor(vehicles: FriendsVehicle[], player: CoopPlayerSnapshot,pieces:readonly FriendsBuildPiece[]=[]) {
  if (player.friendsDevFlight) return undefined;
  if(player.friendsSeat)return vehicles.find(v=>v.id===player.friendsSeat!.vehicleId);
  const load=pieces.find(p=>p.attachment&&Math.abs((friendsBuildFloor([p],player.x,player.y,player.z,0)??Infinity)-player.z)<2);
  if(load)return vehicles.find(v=>v.id===load.attachment!.vehicleId);
  const vehicle = vehicles.find(v => { const floor = friendsVehicleFloor([v], player.x, player.y, player.z); return floor !== undefined && Math.abs(player.z - floor) < 2; });
  return vehicle || trainGangways(vehicles).find(link => Math.abs(player.z - gangwayHeight(link,player.x,player.y)) < 2 && pointOnGangway(link, player.x, player.y))?.from;
}
function interpolatePassengers(previous: CoopSnapshot, current: CoopSnapshot, friends: FriendsSnapshot, players: CoopPlayerSnapshot[], alpha: number) {
  const oldPlayers = indexEntities(previous.players);
  for (const target of players) {
    if (friends.hauling?.playerRopes?.some(r => r.playerId === target.id)) continue;
    const old = oldPlayers.get(target.id), next = current.players.find(p => p.id === target.id);
    if (!old || !next) continue;
    if (Math.hypot(next.x - old.x, next.y - old.y, next.z - old.z) > 900) { target.x = next.x; target.y = next.y; target.z = next.z; continue; }
    const before = passengerAnchor(previous.friends!.vehicles, old,previous.friends!.building?.pieces), after = passengerAnchor(current.friends!.vehicles, next,current.friends!.building?.pieces);
    if (!before || !after || before.id !== after.id) continue;
    const frame = friends.vehicles.find(v => v.id === after.id)!;
    if(isRowboatSeat(next.friendsSeat)){
      const crew=current.players.filter(player=>player.friendsSeat?.vehicleId===next.friendsSeat!.vehicleId&&player.lifeState==='alive').length;
      Object.assign(target,rowboatSeatPoint(frame,next.friendsSeat!.index,crew===1));target.angle=frame.angle+Math.PI;
      continue;
    }
    if(next.friendsSeat){
      const seat=SCENIC_SEATS[next.friendsSeat.index];if(seat)Object.assign(target,vehicleWorldPoint(frame,seat));
      continue;
    }
    const a=vehicleLocalPoint(before,old),b=vehicleLocalPoint(after,next);
    Object.assign(target,vehicleWorldPoint(frame,{x:lerp(a.x,b.x,alpha),y:lerp(a.y,b.y,alpha),z:lerp(a.z,b.z,alpha)}));
  }
}
