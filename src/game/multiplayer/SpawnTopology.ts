import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import { isWorldPositionClear } from '../world/WorldLayout';
import type { EncounterCluster, EncounterPlayer } from './EncounterDirector';
import type { WorldId } from '../world/WorldDefinitions';

export interface SpawnNode { id: number; x: number; y: number; }
export interface SpawnCandidate extends SpawnNode { score: number; }

const GRID_STEP = 240;
const MAP_MARGIN = 160;
const MIN_REACTION_DISTANCE = 560;
const MIN_CLUSTER_DISTANCE = 720;
const MAX_CLUSTER_DISTANCE = 1_300;
const RECENT_NODE_COOLDOWN = 12;

/** Deterministic combat-corridor catalogue shared by every co-op host. */
export class SpawnTopology {
  private readonly nodes: SpawnNode[];
  private recentNodes: number[] = [];

  constructor(private readonly worldId: WorldId = 'neon_bastion') {
    const nodes: SpawnNode[] = [];
    let id = 1;
    for (let y = MAP_MARGIN; y <= GAME_HEIGHT - MAP_MARGIN; y += GRID_STEP) {
      for (let x = MAP_MARGIN; x <= GAME_WIDTH - MAP_MARGIN; x += GRID_STEP) {
        if (isWorldPositionClear(x, y, 42, worldId)) nodes.push({ id: id++, x, y });
      }
    }
    this.nodes = nodes;
  }

  find(cluster: EncounterCluster, allPlayers: readonly EncounterPlayer[], radius: number, occupied: readonly { x: number; y: number; radius: number }[]): SpawnNode | undefined {
    const candidates: SpawnCandidate[] = [];
    for (const node of this.nodes) {
      if (this.recentNodes.includes(node.id) || !this.isEligible(node, cluster, allPlayers, radius, occupied)) continue;
      candidates.push({ ...node, score: this.score(node, cluster, allPlayers) });
    }
    candidates.sort((left, right) => right.score - left.score || left.id - right.id);
    const selected = candidates[0];
    if (selected) this.remember(selected.id);
    return selected;
  }

  private isEligible(node: SpawnNode, cluster: EncounterCluster, players: readonly EncounterPlayer[], radius: number, occupied: readonly { x: number; y: number; radius: number }[]) {
    const clusterDistance = Math.hypot(node.x - cluster.x, node.y - cluster.y);
    if (clusterDistance < MIN_CLUSTER_DISTANCE || clusterDistance > MAX_CLUSTER_DISTANCE || !isWorldPositionClear(node.x, node.y, radius + 10, this.worldId)) return false;
    if (!straightPathIsClear(node, cluster, radius, this.worldId)) return false;
    for (const player of players) {
      const dx = node.x - player.x;
      const dy = node.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance < MIN_REACTION_DISTANCE || (distance < 1_080 && isInPlayerView(dx, dy, player.angle))) return false;
    }
    return !occupied.some(entity => Math.hypot(entity.x - node.x, entity.y - node.y) < entity.radius + radius + 55);
  }

  private score(node: SpawnNode, cluster: EncounterCluster, players: readonly EncounterPlayer[]) {
    const distance = Math.hypot(node.x - cluster.x, node.y - cluster.y);
    const travelScore = 1 - Math.abs(distance - 950) / 550;
    const playerDistance = Math.min(...players.map(player => Math.hypot(node.x - player.x, node.y - player.y)));
    const flankScore = Math.min(1, playerDistance / 1_300);
    // Stable coordinates resolve otherwise identical choices, avoiding a random
    // per-input target selection and keeping replay results reproducible.
    return travelScore * 100 + flankScore * 30 - node.id * 0.00001;
  }

  private remember(id: number) {
    this.recentNodes.push(id);
    if (this.recentNodes.length > RECENT_NODE_COOLDOWN) this.recentNodes.shift();
  }
}

function isInPlayerView(dx: number, dy: number, angle: number) {
  const length = Math.hypot(dx, dy) || 1;
  return (Math.cos(angle) * dx + Math.sin(angle) * dy) / length > Math.cos(1.02);
}

function straightPathIsClear(node: SpawnNode, cluster: EncounterCluster, radius: number, worldId: WorldId) {
  const distance = Math.hypot(cluster.x - node.x, cluster.y - node.y);
  const steps = Math.max(1, Math.ceil(distance / 90));
  for (let step = 1; step < steps; step++) {
    const progress = step / steps;
    const x = node.x + (cluster.x - node.x) * progress;
    const y = node.y + (cluster.y - node.y) * progress;
    if (!isWorldPositionClear(x, y, Math.max(16, radius), worldId)) return false;
  }
  return true;
}
