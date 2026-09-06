import { CoopEnemySnapshot, CoopPlayerSnapshot, CoopProjectileSnapshot, CoopSnapshot } from './CoopSimulation';

/**
 * Smooths presentation only. It never feeds values back into the host
 * simulation, so network authority remains unchanged.
 */
export function interpolateCoopSnapshot(previous: CoopSnapshot, current: CoopSnapshot, alpha: number): CoopSnapshot {
  const progress = Math.max(0, Math.min(1, alpha));
  // Once presentation catches up, the authoritative snapshot is already the
  // exact result. Avoid cloning every moving entity on extra display frames.
  if (progress >= 1) return current;
  const players = interpolateEntities(previous.players, current.players, progress, (old, next) => ({
    ...next,
    x: lerp(old.x, next.x, progress), y: lerp(old.y, next.y, progress), angle: lerpAngle(old.angle, next.angle, progress),
    health: lerp(old.health, next.health, progress), z: lerp(old.z, next.z, progress),
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
    radius: lerp(previous.gasZone.radius, current.gasZone.radius, progress),
  } : current.gasZone;
  return { ...current, players, enemies, projectiles, gasZone };
}

/**
 * Allocation-conscious variant for the realtime presentation loop. Network
 * snapshots remain immutable; only this private renderer-facing frame is
 * updated in place. Consumers must not retain a returned interpolated frame.
 */
export class CoopSnapshotInterpolator {
  private readonly players = new Map<string, CoopPlayerSnapshot>();
  private readonly enemies = new Map<number, CoopEnemySnapshot>();
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
    const progress = Math.max(0, Math.min(1, alpha));
    if (progress >= 1) return current;

    this.syncPlayers(previous.players, current.players, progress);
    this.syncEnemies(previous.enemies, current.enemies, progress);
    this.syncProjectiles(previous.projectiles, current.projectiles, progress);
    assignExact(this.frame, current);
    this.frame.players = this.playerFrame;
    this.frame.enemies = this.enemyFrame;
    this.frame.projectiles = this.projectileFrame;
    if (current.gasZone && previous.gasZone) {
      assignExact(this.gasFrame, current.gasZone);
      this.gasFrame.radius = lerp(previous.gasZone.radius, current.gasZone.radius, progress);
      this.frame.gasZone = this.gasFrame;
    }
    return this.frame;
  }

  reset() {
    this.players.clear(); this.enemies.clear(); this.projectiles.clear();
    this.playerFrame.length = 0; this.enemyFrame.length = 0; this.projectileFrame.length = 0;
    this.frame = {} as CoopSnapshot;
  }

  private syncPlayers(previous: CoopPlayerSnapshot[], current: CoopPlayerSnapshot[], progress: number) {
    const previousById = indexEntities(previous);
    this.playerFrame.length = 0; this.activePlayerIds.clear();
    for (const next of current) {
      this.activePlayerIds.add(next.id);
      let target = this.players.get(next.id);
      if (!target) { target = { ...next }; this.players.set(next.id, target); }
      else assignExact(target, next);
      const old = previousById.get(next.id);
      if (old) {
        target.x = lerp(old.x, next.x, progress); target.y = lerp(old.y, next.y, progress);
        target.angle = lerpAngle(old.angle, next.angle, progress);
        target.health = lerp(old.health, next.health, progress); target.z = lerp(old.z, next.z, progress);
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
