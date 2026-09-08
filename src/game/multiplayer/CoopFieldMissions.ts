import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import { isWorldPositionClear } from '../world/WorldLayout';
import type { WorldId } from '../world/WorldDefinitions';

export type CoopFieldMissionKind = 'toxic_hunt' | 'demolition' | 'hostage_recovery' | 'signal_hijack' | 'courier_intercept';
export type CoopFieldMissionSiteState = 'available' | 'active' | 'completed';
export type CoopFieldMissionStage = 'eliminate' | 'plant_a' | 'defend_a' | 'plant_b' | 'defend_b' | 'secure' | 'escort' | 'activate' | 'upload' | 'intercept' | 'recover' | 'deliver';

export const COOP_FIELD_MISSION_REWARDS: Readonly<Record<CoopFieldMissionKind, number>> = Object.freeze({
  toxic_hunt: 500,
  demolition: 450,
  hostage_recovery: 550,
  signal_hijack: 400,
  courier_intercept: 425,
});

export const COOP_HOSTAGE_FREE_DURATION_MS = 1_500;
export const COOP_HOSTAGE_RECOVERY_DURATION_MS = 10_000;

export const COOP_FIELD_MISSION_LABELS: Readonly<Record<CoopFieldMissionKind, string>> = Object.freeze({
  toxic_hunt: 'TOXIC HUNT',
  demolition: 'DEMOLITION',
  hostage_recovery: 'HOSTAGE RECOVERY',
  signal_hijack: 'SIGNAL HIJACK',
  courier_intercept: 'COURIER INTERCEPT',
});

export const COOP_FIELD_MISSION_DESCRIPTIONS: Readonly<Record<CoopFieldMissionKind, string>> = Object.freeze({
  toxic_hunt: 'Enter the mobile gas zone and eliminate the Chem Commander.',
  demolition: 'Plant and defend charges at two hostile infrastructure sites.',
  hostage_recovery: 'Secure a hostage, carry them to the recovery beacon, and protect the carrier.',
  signal_hijack: 'Capture a hostile relay and hold the area while its data uploads.',
  courier_intercept: 'Eliminate three couriers, recover their drives, and deliver them to a dead drop.',
});

const MISSION_KINDS = Object.freeze(Object.keys(COOP_FIELD_MISSION_REWARDS) as CoopFieldMissionKind[]);
const SITE_MARGIN = 260;
const SITE_SEPARATION = 1_050;

export interface CoopFieldMissionPoint {
  id: string;
  x: number;
  y: number;
  state: 'locked' | 'available' | 'arming' | 'defending' | 'completed';
}

export interface CoopMissionDriveSnapshot {
  id: number;
  x: number;
  y: number;
  collected: boolean;
}

export interface CoopHostageSnapshot {
  x: number;
  y: number;
  state: 'captive' | 'waiting' | 'carried' | 'secured';
  carrierId?: string;
}

export interface CoopFieldMissionSiteSnapshot {
  id: number;
  kind: CoopFieldMissionKind;
  x: number;
  y: number;
  state: CoopFieldMissionSiteState;
  reward: number;
}

export interface CoopActiveFieldMissionSnapshot {
  id: number;
  kind: CoopFieldMissionKind;
  reward: number;
  stage: CoopFieldMissionStage;
  x: number;
  y: number;
  progress: number;
  required: number;
  timerRemainingMs?: number;
  points: CoopFieldMissionPoint[];
  targetEnemyIds: number[];
  guardEnemyIds: number[];
  courierEnemyIds: number[];
  drives: CoopMissionDriveSnapshot[];
  hostage?: CoopHostageSnapshot;
}

export interface CoopFieldMissionsSnapshot {
  sites: CoopFieldMissionSiteSnapshot[];
  active?: CoopActiveFieldMissionSnapshot;
  completedCount: number;
}

/** Concise, player-facing copy for the exact current objective. */
export function coopFieldMissionStageLabel(mission: CoopActiveFieldMissionSnapshot): string {
  if (mission.kind === 'toxic_hunt') return 'ELIMINATE THE CHEM COMMANDER';
  if (mission.kind === 'demolition') {
    if (mission.stage === 'plant_a') return 'SITE A · HOLD F TO PLANT CHARGE';
    if (mission.stage === 'defend_a') return 'SITE A ARMED · DEFEND UNTIL DETONATION';
    if (mission.stage === 'plant_b') return 'SITE B · PLANT BEFORE THE WINDOW CLOSES';
    return 'SITE B ARMED · DEFEND UNTIL DETONATION';
  }
  if (mission.kind === 'hostage_recovery') {
    if (mission.stage === 'secure') return `ELIMINATE CAPTORS · ${mission.guardEnemyIds.length} REMAIN`;
    if (mission.hostage?.state === 'carried') return 'ESCORT HOSTAGE · HOLD RECOVERY ZONE';
    return 'HOLD F TO FREE AND CARRY HOSTAGE';
  }
  if (mission.kind === 'signal_hijack') return mission.stage === 'activate' ? 'ACTIVATE THE SIGNAL RELAY' : 'HOLD THE RELAY · UPLOAD ACTIVE';
  if (mission.stage === 'intercept') return `INTERCEPT COURIERS · ${mission.courierEnemyIds.length} REMAIN`;
  if (mission.stage === 'recover') return `RECOVER DRIVES · ${mission.drives.filter(drive => drive.collected).length}/3`;
  return 'DELIVER DRIVES TO THE DEAD DROP';
}

interface CoopMissionNavigationEntity {
  id: number;
  x: number;
  y: number;
  dying?: boolean;
}

/** Resolves the squad's one canonical navigation target for the current mission.
 * Multi-target contracts advance deterministically as couriers or drives are
 * cleared, while moving targets such as the Chem Commander remain tracked. */
export function resolveCoopMissionNavigationTarget(
  mission: CoopActiveFieldMissionSnapshot | undefined,
  enemies: readonly CoopMissionNavigationEntity[] = [],
): { x: number; y: number } | undefined {
  if (!mission) return undefined;
  if (mission.kind === 'toxic_hunt') {
    const commander = mission.targetEnemyIds
      .map(id => enemies.find(enemy => enemy.id === id && !enemy.dying))
      .find((enemy): enemy is CoopMissionNavigationEntity => Boolean(enemy));
    if (commander) return { x: commander.x, y: commander.y };
  }
  if (mission.kind === 'courier_intercept') {
    if (mission.stage === 'intercept') {
      const courier = mission.courierEnemyIds
        .map(id => enemies.find(enemy => enemy.id === id && !enemy.dying))
        .find((enemy): enemy is CoopMissionNavigationEntity => Boolean(enemy));
      if (courier) return { x: courier.x, y: courier.y };
    }
    if (mission.stage === 'recover') {
      const drive = mission.drives.find(candidate => !candidate.collected);
      if (drive) return { x: drive.x, y: drive.y };
    }
  }
  if (mission.kind === 'hostage_recovery' && mission.hostage && mission.hostage.state !== 'carried' && mission.hostage.state !== 'secured') {
    return { x: mission.hostage.x, y: mission.hostage.y };
  }
  return { x: mission.x, y: mission.y };
}

interface ActiveMission extends CoopActiveFieldMissionSnapshot {
  eligiblePlayerIds: string[];
}

interface Point { x: number; y: number }

/** Host-owned optional contract state. Combat entities remain in
 * CoopSimulation, while this director owns deterministic placement, progress,
 * payout eligibility, and exactly-once completion. */
export class CoopFieldMissionDirector {
  private readonly sites: CoopFieldMissionSiteSnapshot[];
  private active?: ActiveMission;
  private completedCount = 0;

  constructor(private readonly seed: number, insertion: Point, exclusions: readonly Point[] = [], private readonly worldId: WorldId = 'neon_bastion') {
    this.sites = generateCoopFieldMissionSites(seed, insertion, exclusions, worldId);
  }

  get current() { return this.active; }
  get completions() { return this.completedCount; }

  /** Permanently removes an unaccepted contract without counting it as a
   * completion or awarding its payout. Used when a world encounter is cleared
   * before the squad takes the matching pickup. */
  removeAvailable(siteId: number): CoopFieldMissionSiteSnapshot | undefined {
    const index = this.sites.findIndex(candidate => candidate.id === siteId && candidate.state === 'available');
    if (index < 0) return undefined;
    return this.sites.splice(index, 1)[0];
  }

  /** Rolls back an activation that could not create its critical entities. */
  cancelActivation(): number | undefined {
    if (!this.active) return undefined;
    const id = this.active.id;
    const site = this.sites.find(candidate => candidate.id === id);
    if (site) site.state = 'available';
    this.active = undefined;
    return id;
  }

  accept(siteId: number, eligiblePlayerIds: readonly string[], gas: Point): ActiveMission | undefined {
    if (this.active) return undefined;
    const site = this.sites.find(candidate => candidate.id === siteId && candidate.state === 'available');
    if (!site) return undefined;
    site.state = 'active';
    const points = this.buildObjectivePoints(site, gas);
    const primary = points[0] || site;
    const stage: CoopFieldMissionStage = site.kind === 'toxic_hunt' ? 'eliminate'
      : site.kind === 'demolition' ? 'plant_a'
        : site.kind === 'hostage_recovery' ? 'secure'
          : site.kind === 'signal_hijack' ? 'activate'
            : 'intercept';
    this.active = {
      id: site.id,
      kind: site.kind,
      reward: site.reward,
      stage,
      x: primary.x,
      y: primary.y,
      progress: 0,
      required: site.kind === 'demolition' ? 4_000 : site.kind === 'signal_hijack' ? 3_000 : site.kind === 'courier_intercept' ? 3 : 1,
      points,
      targetEnemyIds: [],
      guardEnemyIds: [],
      courierEnemyIds: [],
      drives: [],
      hostage: site.kind === 'hostage_recovery' ? { x: primary.x, y: primary.y, state: 'captive' } : undefined,
      eligiblePlayerIds: [...new Set(eligiblePlayerIds)].sort(),
    };
    return this.active;
  }

  complete(): { id: number; reward: number; eligiblePlayerIds: string[]; kind: CoopFieldMissionKind; x: number; y: number } | undefined {
    if (!this.active) return undefined;
    const active = this.active;
    const site = this.sites.find(candidate => candidate.id === active.id);
    if (site) site.state = 'completed';
    this.completedCount++;
    this.active = undefined;
    return { id: active.id, reward: active.reward, eligiblePlayerIds: [...active.eligiblePlayerIds], kind: active.kind, x: active.x, y: active.y };
  }

  snapshot(): CoopFieldMissionsSnapshot {
    const active = this.active;
    return {
      sites: this.sites.map(site => ({ ...site })),
      active: active ? {
        ...active,
        eligiblePlayerIds: undefined,
        points: active.points.map(point => ({ ...point })),
        targetEnemyIds: [...active.targetEnemyIds], guardEnemyIds: [...active.guardEnemyIds], courierEnemyIds: [...active.courierEnemyIds],
        drives: active.drives.map(drive => ({ ...drive })), hostage: active.hostage && { ...active.hostage },
      } as CoopActiveFieldMissionSnapshot : undefined,
      completedCount: this.completedCount,
    };
  }

  private buildObjectivePoints(site: CoopFieldMissionSiteSnapshot, gas: Point): CoopFieldMissionPoint[] {
    if (site.kind === 'toxic_hunt') return [{ id: 'gas', ...clearMissionPoint(gas, this.seed, site.id * 17, [], this.worldId), state: 'available' }];
    if (site.kind === 'demolition') {
      const a = clearMissionPoint(offsetFrom(site, this.seed, site.id * 19, 700, 1_150), this.seed, site.id * 23, [], this.worldId);
      const b = clearMissionPoint(offsetFrom(a, this.seed, site.id * 29, 900, 1_500), this.seed, site.id * 31, [a], this.worldId);
      return [{ id: 'a', ...a, state: 'available' }, { id: 'b', ...b, state: 'locked' }];
    }
    if (site.kind === 'hostage_recovery') {
      const hostage = clearMissionPoint(offsetFrom(site, this.seed, site.id * 37, 500, 950), this.seed, site.id * 41, [], this.worldId);
      const exfil = clearMissionPoint(offsetFrom(hostage, this.seed, site.id * 43, 900, 1_400), this.seed, site.id * 47, [hostage], this.worldId);
      return [{ id: 'hostage', ...hostage, state: 'available' }, { id: 'recovery', ...exfil, state: 'locked' }];
    }
    if (site.kind === 'signal_hijack') {
      const relay = clearMissionPoint(offsetFrom(site, this.seed, site.id * 53, 550, 1_000), this.seed, site.id * 59, [], this.worldId);
      return [{ id: 'relay', ...relay, state: 'available' }];
    }
    const courierA = clearMissionPoint(offsetFrom(site, this.seed, site.id * 61, 500, 900), this.seed, site.id * 67, [], this.worldId);
    const courierB = clearMissionPoint(offsetFrom(site, this.seed, site.id * 71, 900, 1_350), this.seed, site.id * 73, [courierA], this.worldId);
    const courierC = clearMissionPoint(offsetFrom(site, this.seed, site.id * 79, 1_200, 1_700), this.seed, site.id * 83, [courierA, courierB], this.worldId);
    const deadDrop = clearMissionPoint(offsetFrom(site, this.seed, site.id * 89, 400, 750), this.seed, site.id * 97, [courierA, courierB, courierC], this.worldId);
    return [
      { id: 'courier-a', ...courierA, state: 'available' }, { id: 'courier-b', ...courierB, state: 'available' },
      { id: 'courier-c', ...courierC, state: 'available' }, { id: 'dead-drop', ...deadDrop, state: 'locked' },
    ];
  }
}

export function generateCoopFieldMissionSites(seed: number, insertion: Point, exclusions: readonly Point[] = [], worldId: WorldId = 'neon_bastion'): CoopFieldMissionSiteSnapshot[] {
  let state = (seed ^ 0x6d15_51a7) >>> 0;
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  const sites: CoopFieldMissionSiteSnapshot[] = [];
  for (let index = 0; index < MISSION_KINDS.length; index++) {
    const candidates: Point[] = [];
    for (let attempt = 0; attempt < 640; attempt++) candidates.push({
      x: Math.round(SITE_MARGIN + random() * (GAME_WIDTH - SITE_MARGIN * 2)),
      y: Math.round(SITE_MARGIN + random() * (GAME_HEIGHT - SITE_MARGIN * 2)),
    });
    const valid = candidates.filter(point => isWorldPositionClear(point.x, point.y, 90, worldId)
      && Math.hypot(point.x - insertion.x, point.y - insertion.y) >= 850
      && exclusions.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= 620)
      && sites.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= SITE_SEPARATION));
    if (!valid.length) throw new Error(`No field-contract pickup available for seed ${seed} at ${index}`);
    valid.sort((a, b) => Math.hypot(b.x - insertion.x, b.y - insertion.y) - Math.hypot(a.x - insertion.x, a.y - insertion.y) || a.x - b.x || a.y - b.y);
    const point = valid[Math.min(valid.length - 1, index * 5)];
    const kind = MISSION_KINDS[index];
    sites.push({ id: index + 1, kind, ...point, state: 'available', reward: COOP_FIELD_MISSION_REWARDS[kind] });
  }
  return sites;
}

function seededUnit(seed: number, salt: number) {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
}

function offsetFrom(origin: Point, seed: number, salt: number, minimum: number, maximum: number): Point {
  const angle = seededUnit(seed, salt) * Math.PI * 2;
  const distance = minimum + seededUnit(seed, salt + 1) * (maximum - minimum);
  return { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
}

function clearMissionPoint(desired: Point, seed: number, salt: number, exclusions: readonly Point[] = [], worldId: WorldId = 'neon_bastion'): Point {
  const margin = 190;
  const origin = { x: Math.max(margin, Math.min(GAME_WIDTH - margin, desired.x)), y: Math.max(margin, Math.min(GAME_HEIGHT - margin, desired.y)) };
  for (let ring = 0; ring <= 24; ring++) {
    const samples = ring === 0 ? 1 : 16;
    for (let sample = 0; sample < samples; sample++) {
      const angle = sample / samples * Math.PI * 2 + seededUnit(seed, salt) * .25;
      const point = { x: Math.round(origin.x + Math.cos(angle) * ring * 55), y: Math.round(origin.y + Math.sin(angle) * ring * 55) };
      if (point.x < margin || point.y < margin || point.x > GAME_WIDTH - margin || point.y > GAME_HEIGHT - margin) continue;
      if (!isWorldPositionClear(point.x, point.y, 100, worldId)) continue;
      if (exclusions.some(other => Math.hypot(point.x - other.x, point.y - other.y) < 520)) continue;
      return point;
    }
  }
  return { x: Math.round(origin.x), y: Math.round(origin.y) };
}
