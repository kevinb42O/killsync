import type { CoopSnapshot } from './CoopSimulation';

export const SNAPSHOT_INTEREST_RADIUS = 2_600;
export const MAX_VISIBLE_GEMS = 96;
// Combat events are presentation cues, not gameplay state.  A horde can emit
// hundreds of hit, number and loot-pop events per second; forwarding every
// one over a phone-hosted mesh makes cosmetic feedback more expensive than
// the actual simulation.  Keep meaningful state transitions in full and
// coalesce repeated sparks/sounds into short perceptual windows.
const TRANSIENT_EVENT_WINDOW_MS: Partial<Record<CoopSnapshot['combatEvents'][number]['kind'], number>> = {
  enemy_hit: 100,
  damage_number: 125,
  drop_spawned: 250,
  projectile_impact: 100,
  weapon_fired: 125,
  reload_shell_loaded: 150,
  mask_damaged: 250,
  gas_damaged: 250,
  structure_damaged: 120,
};
const MAX_COMBAT_EVENTS_PER_SNAPSHOT = 48;

const q = (value: number, precision = 1) => Math.round(value * precision) / precision;

/** Build the replaceable world-state view sent to one peer. Squad, run,
 * objective, encounter, results, and stations remain global; high-volume
 * combat entities are limited to the peer's playable neighbourhood. */
export function createInterestSnapshot(snapshot: CoopSnapshot, playerId?: string): CoopSnapshot {
  const viewer = snapshot.players.find(player => player.id === playerId);
  // A downed/eliminated player can cycle through every living squadmate, and a
  // dedicated spectator has no player mapping at all. Send those peers the
  // union of the living squad's neighbourhoods so changing camera target never
  // reveals an empty, incorrectly culled fight.
  const livingPlayers = snapshot.players.filter(player => player.lifeState === 'alive');
  const focuses = !viewer || viewer.lifeState !== 'alive'
    ? livingPlayers
    : [viewer];
  if (!focuses.length) return snapshot;
  const interestRadiusSquared = SNAPSHOT_INTEREST_RADIUS * SNAPSHOT_INTEREST_RADIUS;
  const distanceSquaredFrom = (entity: { x: number; y: number }, focus: { x: number; y: number }) => {
    const dx = entity.x - focus.x, dy = entity.y - focus.y;
    return dx * dx + dy * dy;
  };
  const nearestDistanceSquared = (entity: { x: number; y: number }) => Math.min(...focuses.map(focus => distanceSquaredFrom(entity, focus)));
  const interested = (entity: { x: number; y: number }) => nearestDistanceSquared(entity) <= interestRadiusSquared;
  const objectiveEnemyId = snapshot.run.objective?.kind === 'elite_hunt' ? snapshot.run.objective.targetEnemyId : undefined;
  const boss = snapshot.run.boss;
  const quantizePosition = <T extends { x: number; y: number }>(entity: T): T => ({ ...entity, x: q(entity.x), y: q(entity.y) });
  const isRelevantEvent = (event: CoopSnapshot['combatEvents'][number]) => event.kind === 'station_online' || event.kind === 'foundry_online' || event.kind === 'arc_beam' || event.kind === 'arc_chain' || event.kind === 'artifact_cast' || interested(event) || event.playerId === playerId || event.killedByPlayerId === playerId;

  return {
    ...snapshot,
    players: snapshot.players.map(player => ({ ...player, x: q(player.x), y: q(player.y), z: q(player.z), angle: q(player.angle, 1_000), health: q(player.health, 10), armorHp: q(player.armorHp, 10) })),
    enemies: snapshot.enemies
      .filter(enemy => interested(enemy) || enemy.id === objectiveEnemyId || Boolean(boss && Math.hypot(enemy.x - boss.x, enemy.y - boss.y) <= enemy.radius + 8))
      .map(enemy => ({ ...quantizePosition(enemy), health: q(enemy.health, 10), facingAngle: enemy.facingAngle === undefined ? undefined : q(enemy.facingAngle, 1_000) })),
    projectiles: snapshot.projectiles.filter(projectile => interested(projectile)).map(projectile => ({ ...quantizePosition(projectile), z: q(projectile.z), angle: q(projectile.angle, 1_000), pitch: q(projectile.pitch, 1_000), lifeMs: Math.round(projectile.lifeMs) })),
    gems: snapshot.gems
      .filter(interested)
      .sort((left, right) => nearestDistanceSquared(left) - nearestDistanceSquared(right))
      .slice(0, MAX_VISIBLE_GEMS)
      .map(entity => quantizePosition(entity)),
    items: snapshot.items.filter(interested).map(entity => quantizePosition(entity)),
    ammoCaches: snapshot.ammoCaches.filter(interested).map(entity => quantizePosition(entity)),
    hazards: (snapshot.hazards || []).filter(interested).map(hazard => ({ ...quantizePosition(hazard), radius: q(hazard.radius) })),
    combatEvents: coalesceCombatEvents(snapshot.combatEvents.filter(isRelevantEvent)),
    pings: snapshot.pings?.map(ping => quantizePosition(ping)),
    structures: snapshot.structures?.filter(interested).map(structure => ({ ...quantizePosition(structure), angle: q(structure.angle, 1_000), health: q(structure.health, 10) })),
  };
}

function coalesceCombatEvents(events: CoopSnapshot['combatEvents']): CoopSnapshot['combatEvents'] {
  const critical: CoopSnapshot['combatEvents'] = [];
  const transient = new Map<string, CoopSnapshot['combatEvents'][number]>();
  for (const event of events) {
    const windowMs = TRANSIENT_EVENT_WINDOW_MS[event.kind];
    // Keep all non-transient gameplay/UI milestones. For transient effects,
    // retain the first event in a visual window: that makes its id stable as
    // later hits arrive, so a delta does not resend a new particle every tick.
    if (windowMs === undefined) {
      critical.push(event);
      continue;
    }
    const key = `${event.kind}:${event.playerId || ''}:${event.weaponId || ''}:${event.structureId || ''}:${Math.floor(event.atMs / windowMs)}`;
    if (!transient.has(key)) transient.set(key, event);
  }
  // Critical UI/gameplay transitions are never dropped. The ceiling applies
  // only to the optional particles and sounds, even under pathological load.
  const visualBudget = Math.max(0, MAX_COMBAT_EVENTS_PER_SNAPSHOT - critical.length);
  const visuals = [...transient.values()].slice(-visualBudget);
  return [...critical, ...visuals].sort((left, right) => left.id - right.id);
}
