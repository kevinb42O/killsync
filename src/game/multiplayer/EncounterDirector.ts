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
  clusterId: string;
  targetPlayerId: string;
  type: EnemyType;
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
}

export type EncounterRoundPhase = 'insertion' | 'combat' | 'intermission';
export type EncounterRoundEvent = { kind: 'round_started' | 'round_completed'; round: number; tier: number };

const CLUSTER_LINK_DISTANCE = 1_250;
const MAX_ORDERS_PER_TICK = 3;
export const COOP_INTERMISSION_MS = 20_000;
const ROUND_TIERS: readonly EnemyType[] = ['basic', 'fast', 'ranged', 'tank', 'phantom', 'elite'];
const THREAT_COST: Record<EnemyType, number> = {
  basic: 1,
  fast: 1.25,
  ranged: 1.6,
  tank: 3.5,
  phantom: 2.4,
  elite: 6,
  titan: 15,
};

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
  private intermissionEndsAtMs = 0;
  private readonly roundEvents: EncounterRoundEvent[] = [];

  constructor(readonly seed: number, firstSpawnAtMs: number = 0) {
    this.randomState = (seed ^ 0x9e3779b9) >>> 0;
    this.nextSpawnAtMs = Math.max(0, firstSpawnAtMs);
  }

  schedule(elapsedMs: number, activeEnemies: readonly EncounterEnemy[], players: readonly EncounterPlayer[], capacity: number): EncounterOrder[] {
    this.tick++;
    this.lastElapsedMs = elapsedMs;
    const clusters = buildEncounterClusters(players, activeEnemies);
    this.activeThreat = activeEnemies.filter(enemy => !enemy.dying).reduce((sum, enemy) => sum + THREAT_COST[enemy.type], 0);
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

    const orders: EncounterOrder[] = [];
    const batchSize = Math.min(MAX_ORDERS_PER_TICK, capacity, this.roundTotal - this.spawnedThisRound);
    while (orders.length < batchSize) {
      const cluster = this.chooseCluster(clusters);
      if (!cluster) break;
      // Each new round visibly introduces its new tier at the first spawn,
      // then mixes every previously introduced tier for the rest of the wave.
      const type = this.spawnedThisRound === 0 ? ROUND_TIERS[this.tier - 1] : this.chooseRoundEnemyType();
      const targetPlayerId = cluster.playerIds[Math.floor(this.random() * cluster.playerIds.length)];
      orders.push(this.order(cluster, targetPlayerId, type));
      this.activeThreat += THREAT_COST[type];
      this.activeEnemyCount++;
      this.spawnedThisRound++;
    }
    this.nextSpawnAtMs = elapsedMs + spawnCadenceMs(this.round);
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
    };
  }

  get tier() { return Math.min(this.round, ROUND_TIERS.length); }

  private beginRound(elapsedMs: number, playerCount: number) {
    this.phase = 'combat';
    this.roundTotal = Math.min(64, 8 + this.round * 4 + Math.max(0, playerCount - 1) * 4);
    this.spawnedThisRound = 0;
    this.desiredThreat = this.roundTotal;
    this.nextSpawnAtMs = elapsedMs;
    this.roundEvents.push({ kind: 'round_started', round: this.round, tier: this.tier });
  }

  private order(cluster: EncounterCluster, targetPlayerId: string, type: EnemyType): EncounterOrder {
    this.packetsIssued++;
    return { packetId: this.nextPacketId++, clusterId: cluster.id, targetPlayerId, type };
  }

  private chooseCluster(clusters: readonly EncounterCluster[]): EncounterCluster | undefined {
    const ordered = [...clusters].sort((left, right) => (left.activeThreat / left.playerIds.length) - (right.activeThreat / right.playerIds.length) || left.id.localeCompare(right.id));
    const leastThreat = ordered[0]?.activeThreat / ordered[0]?.playerIds.length;
    const eligible = ordered.filter(cluster => cluster.activeThreat / cluster.playerIds.length <= (leastThreat ?? 0) + 1.25);
    const cluster = eligible[this.clusterCursor % eligible.length] || ordered[0];
    this.clusterCursor++;
    return cluster;
  }

  private chooseRoundEnemyType(): EnemyType {
    const available = ROUND_TIERS.slice(0, this.tier);
    return available[Math.floor(this.random() * available.length)];
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
      .reduce((sum, enemy) => sum + THREAT_COST[enemy.type], 0);
    clusters.push({
      id: playerIds.join('+'), playerIds,
      x: members.reduce((sum, member) => sum + member.x, 0) / members.length,
      y: members.reduce((sum, member) => sum + member.y, 0) / members.length,
      activeThreat,
    });
  }
  return clusters;
}

export function enemyThreat(type: EnemyType) { return THREAT_COST[type]; }

function spawnCadenceMs(round: number) {
  return Math.max(420, 1_050 - round * 55);
}

function round2(value: number) { return Math.round(value * 100) / 100; }
