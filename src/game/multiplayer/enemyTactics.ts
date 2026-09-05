import type { CoopEnemySnapshot } from './CoopSimulation';
import { isWorldPositionClear } from '../world/WorldLayout';
import { GAME_WIDTH } from '../../constants';

export const ENEMY_TACTIC_PROFILES = {
  basic: { preferredMin: 0, preferredMax: 0, flank: .08, spacing: 12 },
  fast: { preferredMin: 90, preferredMax: 260, flank: .5, spacing: 18 },
  ranged: { preferredMin: 360, preferredMax: 620, flank: .25, spacing: 34 },
  tank: { preferredMin: 0, preferredMax: 150, flank: .04, spacing: 24 },
  phantom: { preferredMin: 180, preferredMax: 460, flank: .8, spacing: 28 },
  elite: { preferredMin: 210, preferredMax: 480, flank: .3, spacing: 38 },
  titan: { preferredMin: 0, preferredMax: 220, flank: 0, spacing: 48 },
} as const;

export function hasClearAttackPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 35);
  for (let step = 1; step < steps; step++) {
    const fraction = step / steps;
    if (!isWorldPositionClear(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction, 5)) return false;
  }
  return true;
}

export function moveTacticalEnemy(enemy: CoopEnemySnapshot, target: { x: number; y: number }, neighbors: readonly CoopEnemySnapshot[], elapsedMs: number, deltaMs: number, cachedClearAttackPath?: boolean) {
  const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y);
  const facing = Math.atan2(target.y - enemy.y, target.x - enemy.x);
  const profile = ENEMY_TACTIC_PROFILES[enemy.type];
  const side = enemy.id % 2 === 0 ? 1 : -1;
  let travelAngle = facing;
  let speedMultiplier = 1;
  if ((enemy.type === 'ranged' || enemy.type === 'elite') && (cachedClearAttackPath ?? hasClearAttackPath(enemy, target))) {
    if (distance < profile.preferredMin) travelAngle += Math.PI;
    else if (distance < profile.preferredMax) { travelAngle += side * Math.PI / 2; speedMultiplier = enemy.type === 'ranged' ? .28 : .42; }
  } else if ((enemy.type === 'fast' || enemy.type === 'phantom') && distance > 120) {
    travelAngle += side * (profile.flank + (enemy.type === 'phantom' ? Math.sin(elapsedMs / 500 + enemy.id) * .25 : 0));
  }
  let directionX = Math.cos(travelAngle), directionY = Math.sin(travelAngle);
  for (const neighbor of neighbors) {
    if (neighbor.id === enemy.id || neighbor.dying) continue;
    const dx = enemy.x - neighbor.x, dy = enemy.y - neighbor.y;
    const separation = Math.hypot(dx, dy);
    const spacing = enemy.radius + neighbor.radius + profile.spacing;
    if (separation >= spacing) continue;
    const weight = (spacing - separation) / spacing;
    directionX += (separation > .01 ? dx / separation : side) * weight;
    directionY += (separation > .01 ? dy / separation : -side) * weight;
  }
  const desiredAngle = Math.atan2(directionY, directionX);
  const stepDistance = enemy.speed * enemy.slowMultiplier * 88 * speedMultiplier * Math.min(50, Math.max(0, deltaMs)) / 1000;
  for (const offset of [0, side * .55, -side * .55, side * 1.1, -side * 1.1, side * Math.PI / 2]) {
    const angle = desiredAngle + offset;
    const probe = stepDistance + 28;
    const probeX = enemy.x + Math.cos(angle) * probe, probeY = enemy.y + Math.sin(angle) * probe;
    if (probeX < enemy.radius || probeY < enemy.radius || probeX > GAME_WIDTH - enemy.radius || probeY > GAME_WIDTH - enemy.radius) continue;
    if (!isWorldPositionClear(probeX, probeY, enemy.radius)) continue;
    enemy.x += Math.cos(angle) * stepDistance;
    enemy.y += Math.sin(angle) * stepDistance;
    break;
  }
  return facing;
}

/** Select a deterministic local waypoint when a direct probe has made no
 * progress. It is intentionally short-lived: this is obstacle recovery, not
 * a second global pathfinding system. */
export function findEnemyDetour(enemy: CoopEnemySnapshot, target: { x: number; y: number }): { x: number; y: number } | undefined {
  const direct = Math.atan2(target.y - enemy.y, target.x - enemy.x);
  const side = enemy.id % 2 === 0 ? 1 : -1;
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  for (const offset of [side * Math.PI / 2, -side * Math.PI / 2, side * .85, -side * .85, Math.PI]) {
    const distance = enemy.radius > 40 ? 360 : 260;
    const x = enemy.x + Math.cos(direct + offset) * distance;
    const y = enemy.y + Math.sin(direct + offset) * distance;
    if (x < enemy.radius || y < enemy.radius || x > GAME_WIDTH - enemy.radius || y > GAME_WIDTH - enemy.radius) continue;
    if (!isWorldPositionClear(x, y, enemy.radius + 5) || !hasClearAttackPath(enemy, { x, y })) continue;
    candidates.push({ x, y, score: Math.hypot(target.x - x, target.y - y) + Math.abs(offset) * 24 });
  }
  candidates.sort((left, right) => left.score - right.score || left.x - right.x || left.y - right.y);
  return candidates[0];
}
