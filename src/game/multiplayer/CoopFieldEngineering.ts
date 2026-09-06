import { isWorldPositionClear } from '../world/WorldLayout';
import { isOnCoopPlatform } from './playerMovement';
import type { CoopSnapshot } from './CoopSimulation';

export type CoopStructureType = 'barricade' | 'arc_fence' | 'recovery_relay' | 'decoy_beacon';
export type CoopStructureState = 'active' | 'damaged' | 'destroying';

export interface CoopStructureDefinition {
  type: CoopStructureType;
  name: string;
  description: string;
  chargeCost: number;
  maxHealth: number;
  width: number;
  depth: number;
  radius: number;
  color: string;
  blocksMovement: boolean;
}

export const COOP_STARTING_FABRICATOR_CHARGES = 2;
export const COOP_MAX_FABRICATOR_CHARGES = 4;
export const COOP_FABRICATOR_RECHARGE_MS = 40_000;
export const COOP_ELITE_SCRAP_ACCELERATION_MS = 14_000;
export const COOP_MAX_STRUCTURES_PER_PLAYER = 2;
export const COOP_MAX_SQUAD_STRUCTURES = 8;
export const COOP_BUILD_RANGE = 430;
export const COOP_BUILD_ZONE_RADIUS = 700;
export const COOP_STRUCTURE_LIFETIME_MS = 120_000;
export const COOP_TACTICAL_STRUCTURE_BONUS_MS = 60_000;
export const COOP_ABANDONED_STRUCTURE_GRACE_MS = 20_000;
export const COOP_STRUCTURE_SQUAD_RANGE = 900;
export const COOP_STRUCTURE_DESTROY_MS = 500;
export const COOP_STRUCTURE_ACTION_RANGE = 300;
export const COOP_STRUCTURE_REPAIR_PER_SECOND = 55;
export const COOP_RECOVERY_RELAY_REVIVE_MULTIPLIER = 1.25;
export const COOP_RECOVERY_RELAY_HEAL_PER_SECOND = 7.5;
export const COOP_RECOVERY_RELAY_SURGE_HEAL = 28;
export const COOP_RECOVERY_RELAY_SURGE_COOLDOWN_MS = 20_000;
export const COOP_ARC_FENCE_OVERCHARGE_MS = 12_000;
export const COOP_DECOY_ATTRACT_RANGE = 760;
export const COOP_ARC_FENCE_PULSE_COOLDOWN_MS = 1_100;
export const COOP_ARC_FENCE_SLOW_MULTIPLIER = .38;

export const COOP_STRUCTURE_DEFINITIONS: Readonly<Record<CoopStructureType, CoopStructureDefinition>> = Object.freeze({
  barricade: {
    type: 'barricade', name: 'Hardlight Barricade',
    description: 'Jumpable cover that redirects the frontline and buys a few seconds.',
    chargeCost: 1, maxHealth: 520, width: 220, depth: 34, radius: 112, color: '#00dcff', blocksMovement: true,
  },
  arc_fence: {
    type: 'arc_fence', name: 'Arc Fence',
    description: 'A soft-control line that shocks and slows enemies crossing it.',
    chargeCost: 1, maxHealth: 280, width: 260, depth: 30, radius: 132, color: '#9b5cff', blocksMovement: false,
  },
  recovery_relay: {
    type: 'recovery_relay', name: 'Recovery Relay',
    description: 'A fragile squad beacon that restores health and accelerates nearby revives.',
    chargeCost: 2, maxHealth: 240, width: 58, depth: 58, radius: 120, color: '#22f59a', blocksMovement: false,
  },
  decoy_beacon: {
    type: 'decoy_beacon', name: 'Specter Decoy',
    description: 'Projects a false operator signature that draws ordinary enemies away from the squad.',
    chargeCost: 1, maxHealth: 190, width: 48, depth: 48, radius: 42, color: '#ff3da7', blocksMovement: false,
  },
});

export interface CoopStructureSnapshot {
  id: number;
  type: CoopStructureType;
  ownerId: string;
  ownerColor: string;
  x: number;
  y: number;
  angle: number;
  health: number;
  maxHealth: number;
  state: CoopStructureState;
  createdAtMs: number;
  expiresAtMs: number;
  destroyRemainingMs?: number;
  /** Latest authoritative discharge, used for a synchronized visual pulse. */
  pulseAtMs?: number;
  reinforced?: boolean;
  overchargedUntilMs?: number;
  abilityReadyAtMs?: number;
  tacticalBonus?: boolean;
  repairingPlayerId?: string;
  linkedStructureIds?: number[];
}

export type CoopBuildErrorCode =
  | 'alive_required'
  | 'invalid_blueprint'
  | 'charges'
  | 'player_limit'
  | 'squad_limit'
  | 'range'
  | 'build_zone'
  | 'obstructed'
  | 'stale_request';

export interface CoopBuildError { code: CoopBuildErrorCode; amount?: number; }
export interface CoopBuildResult {
  playerId: string;
  requestId: number;
  structureType: CoopStructureType;
  code: 'built' | CoopBuildErrorCode;
  amount?: number;
}

export type CoopDismantleErrorCode = 'alive_required' | 'unknown_structure' | 'not_owner' | 'dismantle_range';
export interface CoopDismantleError { code: CoopDismantleErrorCode; }
export interface CoopDismantleResult {
  playerId: string;
  requestId: number;
  structureId: number;
  code: 'dismantled' | CoopDismantleErrorCode | 'stale_request';
  refundedCharges?: number;
}

export type CoopStructureAction = 'activate' | 'rotate_left' | 'rotate_right' | 'relocate';
export type CoopStructureActionErrorCode = 'alive_required' | 'unknown_structure' | 'action_range' | 'charges' | 'cooldown' | 'already_upgraded' | 'not_owner' | 'obstructed' | 'stale_request';
export interface CoopStructureActionError { code: CoopStructureActionErrorCode; amount?: number; }
export interface CoopStructureActionResult {
  playerId: string;
  requestId: number;
  structureId: number;
  action: CoopStructureAction;
  code: 'activated' | 'rotated' | 'relocated' | CoopStructureActionErrorCode;
  amount?: number;
}

export interface CoopBuildAnchor { x: number; y: number; radius?: number; }
export interface CoopPlacementBody { x: number; y: number; radius: number; }

export function isCoopStructureType(value: unknown): value is CoopStructureType {
  return value === 'barricade' || value === 'arc_fence' || value === 'recovery_relay' || value === 'decoy_beacon';
}

export function isCoopStructureAction(value: unknown): value is CoopStructureAction {
  return value === 'activate' || value === 'rotate_left' || value === 'rotate_right' || value === 'relocate';
}

export function normalizeStructureAngle(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.atan2(Math.sin(value), Math.cos(value)) * 12) / 12;
}

export function structureContainsCircle(
  structure: Pick<CoopStructureSnapshot, 'type' | 'x' | 'y' | 'angle'>,
  x: number,
  y: number,
  radius: number,
  padding = 0,
) {
  const definition = COOP_STRUCTURE_DEFINITIONS[structure.type];
  if (structure.type === 'recovery_relay' || structure.type === 'decoy_beacon') return Math.hypot(x - structure.x, y - structure.y) <= definition.radius + radius + padding;
  const dx = x - structure.x, dy = y - structure.y;
  const cosine = Math.cos(structure.angle), sine = Math.sin(structure.angle);
  const localX = dx * cosine + dy * sine;
  const localY = -dx * sine + dy * cosine;
  return Math.abs(localX) <= definition.width * .5 + radius + padding
    && Math.abs(localY) <= definition.depth * .5 + radius + padding;
}

export function resolveBarricadeCollision(
  body: { x: number; y: number },
  radius: number,
  structure: Pick<CoopStructureSnapshot, 'type' | 'x' | 'y' | 'angle'>,
) {
  if (structure.type !== 'barricade') return false;
  const definition = COOP_STRUCTURE_DEFINITIONS.barricade;
  const cosine = Math.cos(structure.angle), sine = Math.sin(structure.angle);
  const dx = body.x - structure.x, dy = body.y - structure.y;
  let localX = dx * cosine + dy * sine;
  let localY = -dx * sine + dy * cosine;
  const halfWidth = definition.width * .5, halfDepth = definition.depth * .5;
  const closestX = Math.max(-halfWidth, Math.min(halfWidth, localX));
  const closestY = Math.max(-halfDepth, Math.min(halfDepth, localY));
  const offsetX = localX - closestX, offsetY = localY - closestY;
  const distanceSquared = offsetX * offsetX + offsetY * offsetY;
  if (distanceSquared >= radius * radius) return false;
  if (distanceSquared > .0001) {
    const distance = Math.sqrt(distanceSquared), push = radius - distance;
    localX += offsetX / distance * push;
    localY += offsetY / distance * push;
  } else {
    const pushX = halfWidth + radius - Math.abs(localX);
    const pushY = halfDepth + radius - Math.abs(localY);
    if (pushX < pushY) localX = (localX < 0 ? -1 : 1) * (halfWidth + radius);
    else localY = (localY < 0 ? -1 : 1) * (halfDepth + radius);
  }
  body.x = structure.x + localX * cosine - localY * sine;
  body.y = structure.y + localX * sine + localY * cosine;
  return true;
}

/** Non-mutating resting-contact query for player wall-jumps. */
export function getBarricadeWallContact(
  body: { x: number; y: number },
  radius: number,
  structure: Pick<CoopStructureSnapshot, 'type' | 'x' | 'y' | 'angle'>,
  tolerance = 3,
) {
  if (structure.type !== 'barricade') return undefined;
  const definition = COOP_STRUCTURE_DEFINITIONS.barricade;
  const cosine = Math.cos(structure.angle), sine = Math.sin(structure.angle);
  const dx = body.x - structure.x, dy = body.y - structure.y;
  const localX = dx * cosine + dy * sine;
  const localY = -dx * sine + dy * cosine;
  const halfWidth = definition.width * .5, halfDepth = definition.depth * .5;
  const closestX = Math.max(-halfWidth, Math.min(halfWidth, localX));
  const closestY = Math.max(-halfDepth, Math.min(halfDepth, localY));
  let normalX = localX - closestX, normalY = localY - closestY;
  const distance = Math.hypot(normalX, normalY);
  if (distance > radius + tolerance) return undefined;
  if (distance > .0001) {
    normalX /= distance; normalY /= distance;
  } else {
    const pushX = halfWidth - Math.abs(localX), pushY = halfDepth - Math.abs(localY);
    if (pushX < pushY) { normalX = localX < 0 ? -1 : 1; normalY = 0; }
    else { normalX = 0; normalY = localY < 0 ? -1 : 1; }
  }
  return {
    normalX: normalX * cosine - normalY * sine,
    normalY: normalX * sine + normalY * cosine,
  };
}

export function isStructurePlacementClear(
  type: CoopStructureType,
  x: number,
  y: number,
  angle: number,
  bodies: readonly CoopPlacementBody[],
  structures: readonly CoopStructureSnapshot[],
) {
  const definition = COOP_STRUCTURE_DEFINITIONS[type];
  const circular = type === 'recovery_relay' || type === 'decoy_beacon';
  const samples = circular
    ? [{ x, y }]
    : [-.42, 0, .42].map(offset => ({ x: x + Math.cos(angle) * definition.width * offset, y: y + Math.sin(angle) * definition.width * offset }));
  if (samples.some(sample => !isWorldPositionClear(sample.x, sample.y, Math.max(24, definition.depth * .5)))) return false;
  if (bodies.some(body => circular
    ? Math.hypot(body.x - x, body.y - y) <= structureRadius(type) + body.radius + 18
    : structureContainsCircle({ type, x, y, angle }, body.x, body.y, body.radius, 18))) return false;
  if (structures.some(structure => structure.state !== 'destroying' && physicalStructuresOverlap({ type, x, y, angle }, structure))) return false;
  return true;
}

function physicalStructuresOverlap(left: Pick<CoopStructureSnapshot, 'type' | 'x' | 'y' | 'angle'>, right: Pick<CoopStructureSnapshot, 'type' | 'x' | 'y' | 'angle'>) {
  const leftCircular = left.type === 'recovery_relay' || left.type === 'decoy_beacon';
  const rightCircular = right.type === 'recovery_relay' || right.type === 'decoy_beacon';
  if (leftCircular && rightCircular) return Math.hypot(left.x - right.x, left.y - right.y) < structureRadius(left.type) + structureRadius(right.type) + 24;
  if (!leftCircular && rightCircular) return structureContainsCircle(left, right.x, right.y, structureRadius(right.type), 16);
  if (leftCircular && !rightCircular) return structureContainsCircle(right, left.x, left.y, structureRadius(left.type), 16);
  return structureContainsCircle(left, right.x, right.y, COOP_STRUCTURE_DEFINITIONS[right.type].depth * .5, 12)
    || structureContainsCircle(right, left.x, left.y, COOP_STRUCTURE_DEFINITIONS[left.type].depth * .5, 12);
}

export function structureRadius(type: CoopStructureType) {
  const definition = COOP_STRUCTURE_DEFINITIONS[type];
  return type === 'recovery_relay' ? 34 : type === 'decoy_beacon' ? 27 : Math.hypot(definition.width * .5, definition.depth * .5);
}

export function structureDamagePerSecond(enemyType: string) {
  if (enemyType === 'titan') return 620;
  if (enemyType === 'tank') return 230;
  if (enemyType === 'elite') return 125;
  if (enemyType === 'phantom') return 0;
  if (enemyType === 'fast') return 72;
  if (enemyType === 'ranged') return 48;
  return 58;
}

export function arcFenceShock(enemyType: string, maxHealth: number) {
  if (enemyType === 'phantom') return { damage: 0, stunMs: 0 };
  if (enemyType === 'titan') return { damage: Math.min(70, 18 + maxHealth * .002), stunMs: 0 };
  if (enemyType === 'elite') return { damage: Math.min(68, 46 + maxHealth * .012), stunMs: 140 };
  if (enemyType === 'tank') return { damage: Math.min(58, 38 + maxHealth * .02), stunMs: 220 };
  if (enemyType === 'fast') return { damage: 34, stunMs: 520 };
  if (enemyType === 'ranged') return { damage: 32, stunMs: 440 };
  return { damage: 28, stunMs: 460 };
}

/** Mirrors host placement rules for truthful hologram feedback. The host still
 * repeats validation when a request arrives; this function grants no authority. */
export function validateCoopBuildPreview(snapshot: CoopSnapshot | null, playerId: string, type: CoopStructureType, x: number, y: number, angle: number): CoopBuildError | undefined {
  const player = snapshot?.players.find(candidate => candidate.id === playerId);
  if (!snapshot || !player || player.lifeState !== 'alive') return { code: 'alive_required' };
  const definition = COOP_STRUCTURE_DEFINITIONS[type];
  const charges = player.fabricatorCharges || 0;
  if (charges < definition.chargeCost) return { code: 'charges', amount: definition.chargeCost - charges };
  const structures = (snapshot.structures || []).filter(structure => structure.state !== 'destroying');
  if (structures.filter(structure => structure.ownerId === playerId).length >= COOP_MAX_STRUCTURES_PER_PLAYER) return { code: 'player_limit' };
  if (structures.length >= COOP_MAX_SQUAD_STRUCTURES) return { code: 'squad_limit' };
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - player.x, y - player.y) > COOP_BUILD_RANGE) return { code: 'range' };
  if (!isOnCoopPlatform(x, y)) return { code: 'obstructed' };
  const bodies = [
    ...snapshot.players.filter(member => member.lifeState !== 'eliminated').map(member => ({ x: member.x, y: member.y, radius: 19 })),
    ...snapshot.enemies.filter(enemy => !enemy.dying).map(enemy => ({ x: enemy.x, y: enemy.y, radius: enemy.radius })),
    ...coopSnapshotProtectedBodies(snapshot),
  ];
  return isStructurePlacementClear(type, x, y, normalizeStructureAngle(angle), bodies, structures) ? undefined : { code: 'obstructed' };
}

/** Gentle endpoint snapping for fast, clean barricade/fence runs. */
export function snapCoopStructurePose(type: CoopStructureType, x: number, y: number, angle: number, structures: readonly CoopStructureSnapshot[], enabled = true) {
  if (!enabled || (type !== 'barricade' && type !== 'arc_fence')) return { x, y, angle };
  const width = COOP_STRUCTURE_DEFINITIONS[type].width;
  let best: { x: number; y: number; angle: number; distance: number } | undefined;
  for (const structure of structures) {
    if (structure.state === 'destroying' || (structure.type !== 'barricade' && structure.type !== 'arc_fence')) continue;
    const otherHalf = COOP_STRUCTURE_DEFINITIONS[structure.type].width * .5;
    for (const side of [-1, 1]) {
      const endpointX = structure.x + Math.cos(structure.angle) * otherHalf * side;
      const endpointY = structure.y + Math.sin(structure.angle) * otherHalf * side;
      for (const candidateSide of [-1, 1]) {
        const candidateX = endpointX - Math.cos(angle) * width * .5 * candidateSide;
        const candidateY = endpointY - Math.sin(angle) * width * .5 * candidateSide;
        const distance = Math.hypot(candidateX - x, candidateY - y);
        if (distance <= 76 && (!best || distance < best.distance)) best = { x: candidateX, y: candidateY, angle, distance };
      }
    }
  }
  return best ? { x: Math.round(best.x), y: Math.round(best.y), angle: best.angle } : { x, y, angle };
}

export function coopSnapshotBuildAnchors(snapshot: CoopSnapshot): CoopBuildAnchor[] {
  const anchors: CoopBuildAnchor[] = [];
  if (snapshot.run.objective) anchors.push({ x: snapshot.run.objective.x, y: snapshot.run.objective.y });
  if (snapshot.run.boss) anchors.push({ x: snapshot.run.boss.x, y: snapshot.run.boss.y });
  if (snapshot.run.exfil) anchors.push({ x: snapshot.run.exfil.x, y: snapshot.run.exfil.y });
  for (const station of snapshot.buyStations) if (station.state !== 'locked') anchors.push({ x: station.x, y: station.y });
  if (snapshot.weaponFoundry?.state !== undefined && snapshot.weaponFoundry.state !== 'locked') anchors.push({ x: snapshot.weaponFoundry.x, y: snapshot.weaponFoundry.y });
  if (snapshot.run.phase === 'insertion' || snapshot.encounter?.phase === 'intermission') {
    const living = snapshot.players.filter(player => player.lifeState === 'alive');
    const members = living.length ? living : snapshot.players;
    anchors.push({
      x: members.reduce((sum, member) => sum + member.x, 0) / Math.max(1, members.length),
      y: members.reduce((sum, member) => sum + member.y, 0) / Math.max(1, members.length),
    });
  }
  return anchors;
}

function coopSnapshotProtectedBodies(snapshot: CoopSnapshot) {
  const bodies: CoopPlacementBody[] = [];
  if (snapshot.run.objective) bodies.push({ x: snapshot.run.objective.x, y: snapshot.run.objective.y, radius: 82 });
  if (snapshot.run.exfil) bodies.push({ x: snapshot.run.exfil.x, y: snapshot.run.exfil.y, radius: 96 });
  for (const station of snapshot.buyStations) if (station.state !== 'locked') bodies.push({ x: station.x, y: station.y, radius: 82 });
  if (snapshot.weaponFoundry?.state !== undefined && snapshot.weaponFoundry.state !== 'locked') bodies.push({ x: snapshot.weaponFoundry.x, y: snapshot.weaponFoundry.y, radius: 110 });
  return bodies;
}
