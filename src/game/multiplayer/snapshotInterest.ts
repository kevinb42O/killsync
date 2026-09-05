import type { CoopSnapshot } from './CoopSimulation';

export const SNAPSHOT_INTEREST_RADIUS = 2_600;
export const MAX_VISIBLE_GEMS = 96;

const q = (value: number, precision = 1) => Math.round(value * precision) / precision;

/** Build the replaceable world-state view sent to one peer. Squad, run,
 * objective, encounter, results, and stations remain global; high-volume
 * combat entities are limited to the peer's playable neighbourhood. */
export function createInterestSnapshot(snapshot: CoopSnapshot, playerId?: string): CoopSnapshot {
  const focus = snapshot.players.find(player => player.id === playerId)
    || snapshot.players.find(player => player.lifeState === 'alive')
    || snapshot.players[0];
  if (!focus) return snapshot;
  const interestRadiusSquared = SNAPSHOT_INTEREST_RADIUS * SNAPSHOT_INTEREST_RADIUS;
  const distanceSquared = (entity: { x: number; y: number }) => {
    const dx = entity.x - focus.x, dy = entity.y - focus.y;
    return dx * dx + dy * dy;
  };
  const interested = (entity: { x: number; y: number }) => distanceSquared(entity) <= interestRadiusSquared;
  const objectiveEnemyId = snapshot.run.objective?.kind === 'elite_hunt' ? snapshot.run.objective.targetEnemyId : undefined;
  const boss = snapshot.run.boss;
  const quantizePosition = <T extends { x: number; y: number }>(entity: T): T => ({ ...entity, x: q(entity.x), y: q(entity.y) });

  return {
    ...snapshot,
    players: snapshot.players.map(player => ({ ...player, x: q(player.x), y: q(player.y), z: q(player.z), angle: q(player.angle, 1_000), health: q(player.health, 10), armorHp: q(player.armorHp, 10) })),
    enemies: snapshot.enemies
      .filter(enemy => interested(enemy) || enemy.id === objectiveEnemyId || Boolean(boss && Math.hypot(enemy.x - boss.x, enemy.y - boss.y) <= enemy.radius + 8))
      .map(enemy => ({ ...quantizePosition(enemy), health: q(enemy.health, 10), facingAngle: enemy.facingAngle === undefined ? undefined : q(enemy.facingAngle, 1_000) })),
    projectiles: snapshot.projectiles.filter(projectile => interested(projectile)).map(projectile => ({ ...quantizePosition(projectile), z: q(projectile.z), angle: q(projectile.angle, 1_000), pitch: q(projectile.pitch, 1_000), lifeMs: Math.round(projectile.lifeMs) })),
    gems: snapshot.gems
      .filter(interested)
      .sort((left, right) => distanceSquared(left) - distanceSquared(right))
      .slice(0, MAX_VISIBLE_GEMS)
      .map(entity => quantizePosition(entity)),
    items: snapshot.items.filter(interested).map(entity => quantizePosition(entity)),
    ammoCaches: snapshot.ammoCaches.filter(interested).map(entity => quantizePosition(entity)),
    hazards: (snapshot.hazards || []).filter(interested).map(hazard => ({ ...quantizePosition(hazard), radius: q(hazard.radius) })),
    combatEvents: snapshot.combatEvents.filter(event => interested(event) || event.playerId === playerId || event.killedByPlayerId === playerId),
    pings: snapshot.pings?.map(ping => quantizePosition(ping)),
  };
}
