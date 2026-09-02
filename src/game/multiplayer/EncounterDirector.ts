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
  desiredThreat: number;
  activeThreat: number;
  clusterCount: number;
  packetsIssued: number;
}

const CLUSTER_LINK_DISTANCE = 1_250;
const MAX_ORDERS_PER_TICK = 4;
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
 * Deterministic host-side encounter pacing. It has no dependency on movement
 * inputs: player positions only choose a safe destination for an encounter
 * that the match clock has already scheduled.
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

  constructor(readonly seed: number, firstSpawnAtMs: number = 0) {
    this.randomState = (seed ^ 0x9e3779b9) >>> 0;
    this.nextSpawnAtMs = Math.max(0, firstSpawnAtMs);
  }

  createOpeningOrders(players: readonly EncounterPlayer[], count: number): EncounterOrder[] {
    const clusters = buildEncounterClusters(players, []);
    if (clusters.length === 0) return [];
    const orders: EncounterOrder[] = [];
    for (let index = 0; index < count; index++) {
      const cluster = clusters[index % clusters.length];
      const targetPlayerId = cluster.playerIds[index % cluster.playerIds.length];
      orders.push(this.order(cluster, targetPlayerId, 'basic'));
    }
    return orders;
  }

  schedule(elapsedMs: number, activeEnemies: readonly EncounterEnemy[], players: readonly EncounterPlayer[], capacity: number): EncounterOrder[] {
    this.tick++;
    const clusters = buildEncounterClusters(players, activeEnemies);
    this.activeThreat = activeEnemies.filter(enemy => !enemy.dying).reduce((sum, enemy) => sum + THREAT_COST[enemy.type], 0);
    this.desiredThreat = desiredThreatFor(elapsedMs, players.length);
    if (clusters.length === 0 || capacity <= 0 || this.activeThreat >= this.desiredThreat || elapsedMs < this.nextSpawnAtMs) return [];

    const orders: EncounterOrder[] = [];
    while (orders.length < MAX_ORDERS_PER_TICK && orders.length < capacity && this.activeThreat < this.desiredThreat && elapsedMs >= this.nextSpawnAtMs) {
      const cluster = this.chooseCluster(clusters);
      if (!cluster) break;
      const type = this.chooseEnemyType(elapsedMs, this.activeThreat);
      const targetPlayerId = cluster.playerIds[Math.floor(this.random() * cluster.playerIds.length)];
      orders.push(this.order(cluster, targetPlayerId, type));
      this.activeThreat += THREAT_COST[type];
      // This is solely a function of match time. Do not feed movement, kills,
      // or packet timing into the clock; that is the anti-following guarantee.
      this.nextSpawnAtMs += spawnCadenceMs(elapsedMs);
    }
    return orders;
  }

  snapshot(clusterCount: number): EncounterDirectorSnapshot {
    return {
      seed: this.seed,
      tick: this.tick,
      nextSpawnAtMs: Math.round(this.nextSpawnAtMs),
      desiredThreat: round2(this.desiredThreat),
      activeThreat: round2(this.activeThreat),
      clusterCount,
      packetsIssued: this.packetsIssued,
    };
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

  private chooseEnemyType(elapsedMs: number, activeThreat: number): EnemyType {
    const seconds = elapsedMs / 1000;
    const candidates: EnemyType[] = seconds < 25 ? ['basic']
      : seconds < 60 ? ['basic', 'basic', 'fast', 'ranged']
        : ['basic', 'basic', 'fast', 'fast', 'ranged', 'tank', 'phantom', 'elite'];
    if (seconds >= 20 * 60 && activeThreat < this.desiredThreat * 0.7) candidates.push('titan');
    return candidates[Math.floor(this.random() * candidates.length)];
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

function desiredThreatFor(elapsedMs: number, playerCount: number) {
  const minutes = elapsedMs / 60_000;
  const partyMultiplier = 0.8 + Math.max(1, playerCount) * 0.52;
  return Math.min(112, (10 + minutes * 7.5 + Math.sqrt(Math.max(0, elapsedMs) / 1000) * 0.38) * partyMultiplier);
}

function spawnCadenceMs(elapsedMs: number) {
  return Math.max(210, 720 - elapsedMs / 320);
}

function round2(value: number) { return Math.round(value * 100) / 100; }
