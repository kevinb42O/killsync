import { describe, expect, it } from 'vitest';
import { CoopSimulation } from './CoopSimulation';
import { createInterestSnapshot, MAX_VISIBLE_GEMS, SNAPSHOT_INTEREST_RADIUS } from './snapshotInterest';

describe('per-peer snapshot interest', () => {
  it('keeps global squad/objective state while culling distant combat entities', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#fff' }]);
    const snapshot = simulation.createSnapshot();
    const local = snapshot.players[0];
    snapshot.enemies = [
      { id: 1, x: local.x + 10, y: local.y, health: 1, maxHealth: 1, type: 'basic', color: '#fff', radius: 10, damage: 1, speed: 1, experienceValue: 1, hitFlashMs: 0, slowMultiplier: 1, isHolder: false, dying: false, deathRemainingMs: 0 },
      { id: 2, x: local.x + SNAPSHOT_INTEREST_RADIUS + 100, y: local.y, health: 1, maxHealth: 1, type: 'basic', color: '#fff', radius: 10, damage: 1, speed: 1, experienceValue: 1, hitFlashMs: 0, slowMultiplier: 1, isHolder: false, dying: false, deathRemainingMs: 0 },
    ];
    snapshot.gems = Array.from({ length: MAX_VISIBLE_GEMS + 20 }, (_, id) => ({ id, x: local.x + id, y: local.y, value: 1, color: '#0ff' }));
    const view = createInterestSnapshot(snapshot, 'host');
    expect(view.players).toHaveLength(snapshot.players.length);
    expect(view.run).toEqual(snapshot.run);
    expect(view.enemies.map(enemy => enemy.id)).toEqual([1]);
    expect(view.gems).toHaveLength(MAX_VISIBLE_GEMS);
  });
});
