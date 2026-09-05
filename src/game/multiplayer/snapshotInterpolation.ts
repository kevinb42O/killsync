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
function lerpAngle(start: number, end: number, amount: number) {
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + delta * amount;
}

export type InterpolatedEntity = CoopPlayerSnapshot | CoopEnemySnapshot | CoopProjectileSnapshot;
