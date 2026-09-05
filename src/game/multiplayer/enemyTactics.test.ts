import { describe, expect, it } from 'vitest';
import { CoopSimulation } from './CoopSimulation';
import { moveTacticalEnemy } from './enemyTactics';

const setup = () => {
  const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]);
  simulation['spawnEnemy']('ranged', 'host', 1, { x: 6500, y: 6000 });
  return simulation;
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
    const snapshot = simulation.createSnapshot();
    expect(snapshot.hazards).toHaveLength(1);
    expect(snapshot.players[0].health).toBe(100);
    for (let step = 0; step < 19; step++) simulation.tick(50);
    expect(simulation.createSnapshot().players[0].health).toBe(100);
    simulation.tick(50);
    expect(simulation.createSnapshot().players[0].health).toBe(82);
    simulation.tick(50);
    expect(simulation.createSnapshot().players[0].health).toBe(82);

    const dodged = setup(); dodged.tick(50);
    dodged['players'].get('host')!.y += 200;
    for (let step = 0; step < 21; step++) dodged.tick(50);
    expect(dodged.createSnapshot().players[0].health).toBe(100);
  });

  it('cancels a pending strike when its source is killed', () => {
    const simulation = setup(); simulation.tick(50);
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
});