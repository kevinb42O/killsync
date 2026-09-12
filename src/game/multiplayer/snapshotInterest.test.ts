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
    snapshot.combatEvents = [
      { id: 10, tick: 1, atMs: 0, kind: 'artifact_cast', x: local.x + SNAPSHOT_INTEREST_RADIUS + 100, y: local.y, targetX: local.x, targetY: local.y, weaponId: 'shatter_lance' },
      { id: 11, tick: 1, atMs: 0, kind: 'enemy_hit', x: local.x + SNAPSHOT_INTEREST_RADIUS + 100, y: local.y },
    ];
    const view = createInterestSnapshot(snapshot, 'host');
    expect(view.players).toHaveLength(snapshot.players.length);
    expect(view.run).toEqual(snapshot.run);
    expect(view.enemies.map(enemy => enemy.id)).toEqual([1]);
    expect(view.gems).toHaveLength(MAX_VISIBLE_GEMS);
    expect(view.combatEvents.map(event => event.id)).toEqual([10]);
  });

  it('keeps every living teammate neighbourhood available while downed or spectating', () => {
    const simulation = new CoopSimulation([
      { id: 'downed', label: 'Downed', color: '#fff' },
      { id: 'alpha', label: 'Alpha', color: '#0ff' },
      { id: 'bravo', label: 'Bravo', color: '#f0f' },
    ]);
    const snapshot = simulation.createSnapshot();
    Object.assign(snapshot.players.find(player => player.id === 'downed')!, { x: 1_000, y: 1_000, lifeState: 'downed' });
    Object.assign(snapshot.players.find(player => player.id === 'alpha')!, { x: 4_000, y: 4_000, lifeState: 'alive' });
    Object.assign(snapshot.players.find(player => player.id === 'bravo')!, { x: 9_000, y: 9_000, lifeState: 'alive' });
    const enemy = (id: number, x: number, y: number) => ({ id, x, y, health: 1, maxHealth: 1, type: 'basic' as const, color: '#fff', radius: 10, damage: 1, speed: 1, experienceValue: 1, hitFlashMs: 0, slowMultiplier: 1, isHolder: false, dying: false, deathRemainingMs: 0 });
    snapshot.enemies = [enemy(1, 4_010, 4_000), enemy(2, 9_010, 9_000), enemy(3, 1_010, 1_000)];

    expect(createInterestSnapshot(snapshot, 'downed').enemies.map(candidate => candidate.id)).toEqual([1, 2]);
    expect(createInterestSnapshot(snapshot).enemies.map(candidate => candidate.id)).toEqual([1, 2]);
    expect(createInterestSnapshot(snapshot, 'alpha').enemies.map(candidate => candidate.id)).toEqual([1]);
  });

  it('never lets a horde event burst grow a presentation snapshot without bound', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#fff' }]);
    const snapshot = simulation.createSnapshot();
    const local = snapshot.players[0];
    snapshot.combatEvents = Array.from({ length: 240 }, (_, index) => ({
      id: index + 1, tick: 1, atMs: index, kind: index % 2 ? 'enemy_killed' as const : 'mission_stage' as const,
      x: local.x, y: local.y, playerId: 'host', enemyId: index, weaponId: 'plasma_gun', amount: 1,
    }));

    const view = createInterestSnapshot(snapshot, 'host');
    expect(view.combatEvents.length).toBeLessThanOrEqual(48);
    expect(view.combatEvents.at(-1)?.id).toBe(239);
  });
});
