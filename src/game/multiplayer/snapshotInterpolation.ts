import { CoopEnemySnapshot, CoopPlayerSnapshot, CoopProjectileSnapshot, CoopSnapshot } from './CoopSimulation';

/**
 * Smooths presentation only. It never feeds values back into the host
 * simulation, so network authority remains unchanged.
 */
export function interpolateCoopSnapshot(previous: CoopSnapshot, current: CoopSnapshot, alpha: number): CoopSnapshot {
  const progress = Math.max(0, Math.min(1, alpha));
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
  return { ...current, players, enemies, projectiles };
}

function interpolateEntities<T extends { id: string | number }>(previous: T[], current: T[], alpha: number, blend: (old: T, next: T) => T): T[] {
  const previousById = new Map(previous.map(entity => [entity.id, entity]));
  return current.map(entity => {
    const old = previousById.get(entity.id);
    return old ? blend(old, entity) : entity;
  });
}

function lerp(start: number, end: number, amount: number) { return start + (end - start) * amount; }
function lerpAngle(start: number, end: number, amount: number) {
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + delta * amount;
}

export type InterpolatedEntity = CoopPlayerSnapshot | CoopEnemySnapshot | CoopProjectileSnapshot;
