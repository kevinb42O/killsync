import { ENEMY_TYPES, type EnemyType } from '../combat/enemyDomain';

export interface EncounterPlayer {
  id: string;
  x: number;
  y: number;
  angle: number;
  health: number;
}

export interface EncounterEnemy {
  type: EnemyType;
  targetPlayerId?: string;
  dying?: boolean;
}

export interface EncounterCluster {
  id: string;
  playerIds: string[];
  x: number;
  y: number;
  activeThreat: number;
}

export interface EncounterOrder {
  packetId: number;
  packId: EncounterPackId;
  clusterId: string;
  targetPlayerId: string;
  type: EnemyType;
  formationIndex: number;
  formationSize: number;
  healthMultiplier: number;
  damageMultiplier: number;
}

export interface EncounterDirectorSnapshot {
  seed: number;
  tick: number;
  nextSpawnAtMs: number;
  phase: EncounterRoundPhase;
  round: number;
  tier: number;
  roundTotal: number;
  spawnedThisRound: number;
  enemiesRemaining: number;
  intermissionRemainingMs: number;
  desiredThreat: number;
  activeThreat: number;
  clusterCount: number;
  packetsIssued: number;
  roundThreatBudget?: number;
  spawnedThreat?: number;
}

export type EncounterRoundPhase = 'insertion' | 'combat' | 'intermission';
export type EncounterRoundEvent = { kind: 'round_started' | 'round_completed'; round: number; tier: number };

const CLUSTER_LINK_DISTANCE = 1_250;
const MAX_ORDERS_PER_TICK = 5;
export const COOP_INTERMISSION_MS = 20_000;
const ROUND_TIERS: readonly EnemyType[] = ['basic', 'fast', 'ranged', 'tank', 'phantom', 'elite'];
export const ENEMY_THREAT_COST: Record<EnemyType, number> = Object.fromEntries(
  (Object.keys(ENEMY_TYPES) as EnemyType[]).map(type => [type, ENEMY_TYPES[type].threat]),
) as Record<EnemyType, number>;

export type EncounterPackId = 'patrol' | 'rush' | 'fireteam' | 'bulwark' | 'crossfire' | 'hunters' | 'command';
type EncounterPack = { id: EncounterPackId; minTier: number; weight: number; members: readonly EnemyType[] };

/** Authored packs keep support units behind a readable frontline instead of
 * drawing each unlocked archetype from one uniform bag. */
export const ENCOUNTER_PACKS: readonly EncounterPack[] = [
  { id: 'patrol', minTier: 1, weight: 5, members: ['basic', 'basic', 'basic'] },
  { id: 'rush', minTier: 2, weight: 4, members: ['fast', 'fast', 'basic'] },
  { id: 'fireteam', minTier: 3, weight: 4, members: ['basic', 'basic', 'ranged'] },
  { id: 'bulwark', minTier: 4, weight: 3, members: ['tank', 'basic', 'basic'] },
  { id: 'crossfire', minTier: 4, weight: 2, members: ['tank', 'ranged', 'ranged'] },
  { id: 'hunters', minTier: 5, weight: 2.5, members: ['phantom', 'fast', 'fast'] },
  { id: 'command', minTier: 6, weight: 1.4, members: ['elite', 'tank', 'ranged', 'basic'] },
] as const;

/**
 * Deterministic, round-based host-side encounter pacing. A round has a finite
 * roster, then the squad gets a real regroup window before the next tier joins
 * the enemy pool. Player positions choose safe spawn destinations only.
 */
export class EncounterDirector {
  private randomState: number;
  private tick = 0;
  private nextSpawnAtMs: number;
  private nextPacketId = 1;
  private packetsIssued = 0;
  private clusterCursor = 0;
  private desiredThreat = 0;
  private activeThreat = 0;
  private activeEnemyCount = 0;
  private lastElapsedMs = 0;
  private phase: EncounterRoundPhase = 'insertion';
  private round = 1;
  private roundTotal = 0;
  private spawnedThisRound = 0;
  private spawnedThreat = 0;
  private roundThreatBudget = 0;
  private intermissionEndsAtMs = 0;
  private readonly roundEvents: EncounterRoundEvent[] = [];

  constructor(readonly seed: number, firstSpawnAtMs: number = 0, private readonly threatMultiplier = 1) {
    this.randomState = (seed ^ 0x9e3779b9) >>> 0;
    this.nextSpawnAtMs = Math.max(0, firstSpawnAtMs);
  }

  schedule(elapsedMs: number, activeEnemies: readonly EncounterEnemy[], players: readonly EncounterPlayer[], capacity: number): EncounterOrder[] {
    this.tick++;
    this.lastElapsedMs = elapsedMs;
    const clusters = buildEncounterClusters(players, activeEnemies);
    this.activeThreat = activeEnemies.filter(enemy => !enemy.dying).reduce((sum, enemy) => sum + ENEMY_THREAT_COST[enemy.type], 0);
    this.activeEnemyCount = activeEnemies.filter(enemy => !enemy.dying).length;
    if (clusters.length === 0) return [];

    if (this.phase === 'insertion') {
      if (elapsedMs < this.nextSpawnAtMs) return [];
      this.beginRound(elapsedMs, players.length);
    } else if (this.phase === 'intermission') {
      if (elapsedMs < this.intermissionEndsAtMs) return [];
      this.round++;
      this.beginRound(elapsedMs, players.length);
    }

    if (this.spawnedThisRound >= this.roundTotal && this.activeThreat <= 0) {
      this.phase = 'intermission';
      this.intermissionEndsAtMs = elapsedMs + COOP_INTERMISSION_MS;
      this.roundEvents.push({ kind: 'round_completed', round: this.round, tier: this.tier });
      return [];
    }
    if (capacity <= 0 || elapsedMs < this.nextSpawnAtMs || this.spawnedThisRound >= this.roundTotal) return [];

    const remaining = Math.min(capacity, this.roundTotal - this.spawnedThisRound, MAX_ORDERS_PER_TICK);
    const pack = this.choosePack(remaining);
    if (!pack) return [];
    const packThreat = pack.members.reduce((sum, type) => sum + ENEMY_THREAT_COST[type], 0);
    // Threat is a real concurrency gate now. Allow the opening packet through
    // so a round cannot deadlock on fractional budget arithmetic.
    if (this.spawnedThisRound > 0 && this.activeThreat + packThreat > this.desiredThreat + 1.5) {
      this.nextSpawnAtMs = elapsedMs + 240;
      return [];
    }
    const cluster = this.chooseCluster(clusters);
    if (!cluster) return [];
    const packetId = this.nextPacketId++;
    const healthMultiplier = encounterHealthMultiplier(this.round, players.length);
    const damageMultiplier = encounterDamageMultiplier(this.round);
    const orders = pack.members.map((type, formationIndex) => {
      const targetPlayerId = cluster.playerIds[Math.floor(this.random() * cluster.playerIds.length)];
      return this.order(packetId, pack.id, cluster, targetPlayerId, type, formationIndex, pack.members.length, healthMultiplier, damageMultiplier);
    });
    this.activeThreat += packThreat;
    this.activeEnemyCount += orders.length;
    this.spawnedThisRound += orders.length;
    this.spawnedThreat += packThreat;
    this.nextSpawnAtMs = elapsedMs + spawnCadenceMs(this.round) / Math.sqrt(Math.max(1, this.threatMultiplier));
    return orders;
  }

  drainRoundEvents() { return this.roundEvents.splice(0); }

  snapshot(clusterCount: number): EncounterDirectorSnapshot {
    return {
      seed: this.seed,
      tick: this.tick,
      nextSpawnAtMs: Math.round(this.nextSpawnAtMs),
      phase: this.phase,
      round: this.round,
      tier: this.tier,
      roundTotal: this.roundTotal,
      spawnedThisRound: this.spawnedThisRound,
      enemiesRemaining: Math.max(0, this.roundTotal - this.spawnedThisRound) + this.activeEnemyCount,
      intermissionRemainingMs: this.phase === 'intermission' ? Math.max(0, Math.round(this.intermissionEndsAtMs - this.lastElapsedMs)) : 0,
      desiredThreat: round2(this.desiredThreat),
      activeThreat: round2(this.activeThreat),
      clusterCount,
      packetsIssued: this.packetsIssued,
      roundThreatBudget: round2(this.roundThreatBudget),
      spawnedThreat: round2(this.spawnedThreat),
    };
  }

  get tier() { return Math.min(this.round, ROUND_TIERS.length); }

  private beginRound(elapsedMs: number, playerCount: number) {
    this.phase = 'combat';
    this.roundTotal = Math.min(114, Math.round((10 + this.round * 5 + Math.max(0, playerCount - 1) * 6) * Math.max(1, this.threatMultiplier)));
    this.spawnedThisRound = 0;
    this.spawnedThreat = 0;
    this.roundThreatBudget = round2(this.roundTotal * (1 + (this.tier - 1) * .16));
    this.desiredThreat = round2(Math.min(56, (6 + this.round * 2.4) * Math.max(1, this.threatMultiplier)) * (1 + Math.max(0, playerCount - 1) * .45));
    this.nextSpawnAtMs = elapsedMs;
    this.roundEvents.push({ kind: 'round_started', round: this.round, tier: this.tier });
  }

  private order(packetId: number, packId: EncounterPackId, cluster: EncounterCluster, targetPlayerId: string, type: EnemyType, formationIndex: number, formationSize: number, healthMultiplier: number, damageMultiplier: number): EncounterOrder {
    this.packetsIssued++;
    return { packetId, packId, clusterId: cluster.id, targetPlayerId, type, formationIndex, formationSize, healthMultiplier, damageMultiplier };
  }

  private chooseCluster(clusters: readonly EncounterCluster[]): EncounterCluster | undefined {
    const ordered = [...clusters].sort((left, right) => (left.activeThreat / left.playerIds.length) - (right.activeThreat / right.playerIds.length) || left.id.localeCompare(right.id));
    const leastThreat = ordered[0]?.activeThreat / ordered[0]?.playerIds.length;
    const eligible = ordered.filter(cluster => cluster.activeThreat / cluster.playerIds.length <= (leastThreat ?? 0) + 1.25);
    const cluster = eligible[this.clusterCursor % eligible.length] || ordered[0];
    this.clusterCursor++;
    return cluster;
  }

  private choosePack(remaining: number): EncounterPack | undefined {
    if (remaining <= 0) return undefined;
    if (this.spawnedThisRound === 0) {
      const introduced = ROUND_TIERS[this.tier - 1];
      const members = [introduced, ...Array(Math.min(2, remaining - 1)).fill('basic')] as EnemyType[];
      return { id: this.tier === 1 ? 'patrol' : this.tier === 2 ? 'rush' : this.tier === 3 ? 'fireteam' : this.tier === 4 ? 'bulwark' : this.tier === 5 ? 'hunters' : 'command', minTier: this.tier, weight: 1, members };
    }
    const available = ENCOUNTER_PACKS.filter(pack =>
      pack.minTier <= this.tier
      && pack.members.length <= remaining
      && this.packFitsRoundBudget(pack, remaining),
    );
    if (available.length === 0) return { id: 'patrol', minTier: 1, weight: 1, members: ['basic'] };
    const totalWeight = available.reduce((sum, pack) => sum + pack.weight, 0);
    let roll = this.random() * totalWeight;
    for (const pack of available) { roll -= pack.weight; if (roll <= 0) return pack; }
    return available[available.length - 1];
  }

  /** Reserve one baseline threat point for every roster slot after this pack.
   * This makes roundThreatBudget an actual composition constraint instead of
   * diagnostic-only metadata, while always leaving a Drone fallback. */
  private packFitsRoundBudget(pack: Pick<EncounterPack, 'members'>, remaining: number) {
    const packThreat = pack.members.reduce((sum, type) => sum + ENEMY_THREAT_COST[type], 0);
    const futureBaseline = Math.max(0, remaining - pack.members.length);
    return this.spawnedThreat + packThreat + futureBaseline <= this.roundThreatBudget + .001;
  }

  private random(): number {
    this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
    return this.randomState / 0x1_0000_0000;
  }
}

export function buildEncounterClusters(players: readonly EncounterPlayer[], enemies: readonly EncounterEnemy[]): EncounterCluster[] {
  const living = [...players].filter(player => player.health > 0).sort((left, right) => left.id.localeCompare(right.id));
  const visited = new Set<string>();
  const clusters: EncounterCluster[] = [];
  for (const root of living) {
    if (visited.has(root.id)) continue;
    const members: EncounterPlayer[] = [];
    const queue = [root];
    visited.add(root.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      members.push(current);
      for (const candidate of living) {
        if (visited.has(candidate.id) || Math.hypot(candidate.x - current.x, candidate.y - current.y) > CLUSTER_LINK_DISTANCE) continue;
        visited.add(candidate.id);
        queue.push(candidate);
      }
    }
    const playerIds = members.map(member => member.id).sort();
    const activeThreat = enemies.filter(enemy => !enemy.dying && enemy.targetPlayerId !== undefined && playerIds.includes(enemy.targetPlayerId))
      .reduce((sum, enemy) => sum + ENEMY_THREAT_COST[enemy.type], 0);
    clusters.push({
      id: playerIds.join('+'), playerIds,
      x: members.reduce((sum, member) => sum + member.x, 0) / members.length,
      y: members.reduce((sum, member) => sum + member.y, 0) / members.length,
      activeThreat,
    });
  }
  return clusters;
}

export function enemyThreat(type: EnemyType) { return ENEMY_THREAT_COST[type]; }

/** Co-op gains most difficulty through composition and count. Modest health
 * scaling preserves weapon feedback; damage never scales with party size. */
export function encounterHealthMultiplier(round: number, playerCount: number) {
  return round2(Math.min(1.85, 1 + Math.max(0, round - 1) * .065 + Math.max(0, playerCount - 1) * .10));
}

export function encounterDamageMultiplier(round: number) {
  return round2(Math.min(1.45, 1 + Math.max(0, round - 1) * .035));
}

function spawnCadenceMs(round: number) {
  return Math.max(480, 1_000 - round * 45);
}

function round2(value: number) { return Math.round(value * 100) / 100; }
