import { describe, expect, it } from 'vitest';
import { CoopSimulation } from './CoopSimulation';
import { moveTacticalEnemy } from './enemyTactics';
import { ENEMY_ATTACK_PROFILES, type EnemyType } from '../combat/enemyDomain';

const setup = (type: EnemyType = 'ranged', distance = 500) => {
  const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]);
  const player = simulation.createSnapshot().players[0];
  simulation['spawnEnemy'](type, 'host', 1, { x: player.x + distance, y: player.y });
  return simulation;
};
const advanceUntilHazard = (simulation: CoopSimulation) => {
  for (let step = 0; step < 80 && simulation.createSnapshot().hazards!.length === 0; step++) simulation.tick(50);
};

describe('tactical enemies', () => {
  it('keeps ranged units away from melee range', () => {
    const enemy = setup().createSnapshot().enemies[0];
    const target = { x: enemy.x - 100, y: enemy.y };
    const before = Math.hypot(enemy.x - target.x, enemy.y - target.y);
    moveTacticalEnemy(enemy, target, [], 0, 50);
    expect(Math.hypot(enemy.x - target.x, enemy.y - target.y)).toBeGreaterThan(before);
  });

  it('telegraphs ranged damage, resolves once, and lets the player dodge', () => {
    const simulation = setup();
    simulation.tick(50);
    expect(simulation.createSnapshot().hazards).toHaveLength(0);
    advanceUntilHazard(simulation);
    const snapshot = simulation.createSnapshot();
    expect(snapshot.hazards).toHaveLength(1);
    expect(snapshot.players[0].health).toBe(100);
    for (let step = 0; step < 19; step++) simulation.tick(50);
    expect(simulation.createSnapshot().players[0].health).toBe(100);
    simulation.tick(50);
    expect(simulation.createSnapshot().players[0].health).toBe(82);
    simulation.tick(50);
    expect(simulation.createSnapshot().players[0].health).toBe(82);

    const dodged = setup(); advanceUntilHazard(dodged);
    dodged['players'].get('host')!.y += 200;
    for (let step = 0; step < 21; step++) dodged.tick(50);
    expect(dodged.createSnapshot().players[0].health).toBe(100);
  });

  it('cancels a pending strike when its source is killed', () => {
    const simulation = setup(); advanceUntilHazard(simulation);
    simulation['enemies'][0].dying = true;
    simulation.tick(50);
    expect(simulation.createSnapshot().hazards).toHaveLength(0);
  });

  it('gives scouts a flank instead of the basic straight-line chase', () => {
    const enemy = setup().createSnapshot().enemies[0]; enemy.type = 'fast';
    const initialY = enemy.y;
    moveTacticalEnemy(enemy, { x: enemy.x - 400, y: enemy.y }, [], 0, 50);
    expect(enemy.y).not.toBe(initialY);
  });

  it('telegraphs and completes the phantom relocation attack', () => {
    const simulation = setup('phantom', 420);
    advanceUntilHazard(simulation);
    const warning = simulation.createSnapshot().hazards?.[0];
    expect(warning).toMatchObject({ kind: 'ambush', radius: ENEMY_ATTACK_PROFILES.phantom!.radius });
    const healthBefore = simulation.createSnapshot().players[0].health;
    for (let elapsed = 0; elapsed < ENEMY_ATTACK_PROFILES.phantom!.windupMs; elapsed += 50) simulation.tick(50);
    const snapshot = simulation.createSnapshot();
    expect(snapshot.players[0].health).toBeLessThan(healthBefore);
    expect(Math.hypot(snapshot.enemies[0].x - warning!.x, snapshot.enemies[0].y - warning!.y)).toBeLessThan(1);
  });

  it('makes the Goliath shockwave jumpable during its full warning window', () => {
    const simulation = setup('tank', 130);
    advanceUntilHazard(simulation);
    const warning = simulation.createSnapshot().hazards?.[0];
    expect(warning).toMatchObject({ kind: 'shockwave', radius: ENEMY_ATTACK_PROFILES.tank!.radius });
    for (let elapsed = 50; elapsed < ENEMY_ATTACK_PROFILES.tank!.windupMs; elapsed += 50) simulation.tick(50);
    simulation['players'].get('host')!.z = 60;
    simulation.tick(50);
    expect(simulation.createSnapshot().players[0].health).toBe(100);
  });
});
