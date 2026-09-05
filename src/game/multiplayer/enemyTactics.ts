import type { CoopEnemySnapshot } from './CoopSimulation';
import { isWorldPositionClear } from '../world/WorldLayout';
import { GAME_WIDTH } from '../../constants';

export function hasClearAttackPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 35);
  for (let step = 1; step < steps; step++) {
    const fraction = step / steps;
    if (!isWorldPositionClear(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction, 5)) return false;
  }
  return true;
}

export function moveTacticalEnemy(enemy: CoopEnemySnapshot, target: { x: number; y: number }, neighbors: readonly CoopEnemySnapshot[], elapsedMs: number, deltaMs: number) {
  const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y);
  const facing = Math.atan2(target.y - enemy.y, target.x - enemy.x);
  const side = enemy.id % 2 === 0 ? 1 : -1;
  let travelAngle = facing;
  let speedMultiplier = 1;
  if (enemy.type === 'ranged' && hasClearAttackPath(enemy, target)) {
    if (distance < 300) travelAngle += Math.PI;
    else if (distance < 520) { travelAngle += side * Math.PI / 2; speedMultiplier = .3; }
  } else if ((enemy.type === 'fast' || enemy.type === 'phantom') && distance > 120) {
    travelAngle += side * (enemy.type === 'phantom' ? .65 + Math.sin(elapsedMs / 500 + enemy.id) * .25 : .48);
  }
  let directionX = Math.cos(travelAngle), directionY = Math.sin(travelAngle);
  for (const neighbor of neighbors) {
    if (neighbor.id === enemy.id || neighbor.dying) continue;
    const dx = enemy.x - neighbor.x, dy = enemy.y - neighbor.y;
    const separation = Math.hypot(dx, dy);
    const spacing = enemy.radius + neighbor.radius + 14;
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