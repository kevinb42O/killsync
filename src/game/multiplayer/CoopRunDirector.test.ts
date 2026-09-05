import { describe, expect, it } from 'vitest';
import { COOP_INSERTION_DURATION_MS, CoopRunDirector } from './CoopRunDirector';
import { isWorldPositionClear } from '../world/WorldLayout';
import { GAME_WIDTH } from '../../constants';

describe('CoopRunDirector', () => {
  it('places objectives and mini-bosses in clear space near the squad, including map edges', () => {
    for (const centre of [{ x: 6000, y: 6000 }, { x: 20, y: 20 }, { x: GAME_WIDTH - 20, y: GAME_WIDTH - 20 }]) {
      for (const seed of [1, 123, 0xdecafbad]) {
        const director = new CoopRunDirector(seed);
        director.advanceInsertion(COOP_INSERTION_DURATION_MS, centre);
        const objective = director.currentObjective!;
        expect(isWorldPositionClear(objective.x, objective.y, 155)).toBe(true);
        director.addUplinkProgress(100);
        const boss = director.currentBoss!;
        expect(boss.x).toBeGreaterThan(0);
        expect(boss.y).toBeGreaterThan(0);
        expect(isWorldPositionClear(boss.x, boss.y, 170)).toBe(true);
        expect(Math.hypot(boss.x - centre.x, boss.y - centre.y)).toBeLessThan(2200);
      }
    }
  });

  it('pauses contested or empty uplinks and permits a solo operator to complete capture', () => {
    const director = new CoopRunDirector(123);
    director.advanceInsertion(COOP_INSERTION_DURATION_MS, { x: 6000, y: 6000 });
    expect(director.updateUplink(10_000, 1, true)).toBe(false);
    expect(director.currentObjective).toMatchObject({ progress: 0, contested: true, occupants: 1 });
    director.updateUplink(10_000, 0, false);
    expect(director.currentObjective?.progress).toBe(0);
    expect(director.updateUplink(30_000, 1, false)).toBe(true);
  });

  it('tracks the live elite instead of its old spawn point', () => {
    const director = new CoopRunDirector(123);
    const centre = { x: 6000, y: 6000 };
    director.advanceInsertion(COOP_INSERTION_DURATION_MS, centre);
    director.addUplinkProgress(100); director.completeBoss(centre); director.startContract(centre);
    director.setEliteTarget(88);
    director.trackEliteTarget(89, 0, 0);
    director.trackEliteTarget(88, 6300, 6400);
    expect(director.currentObjective).toMatchObject({ x: 6300, y: 6400, targetEnemyId: 88 });
  });
  it('moves deterministically from contracts through bosses to extraction', () => {
    const director = new CoopRunDirector(123);
    const centre = { x: 6000, y: 6000 };
    expect(director.advanceInsertion(COOP_INSERTION_DURATION_MS - 1, centre)).toBe(false);
    expect(director.advanceInsertion(COOP_INSERTION_DURATION_MS, centre)).toBe(true);
    expect(director.currentObjective?.kind).toBe('uplink');
    expect(director.addUplinkProgress(100)).toBe(true);
    expect(director.currentPhase).toBe('mini_boss');
    director.activateBoss(100, 6100, 6100);
    expect(director.completeBoss(centre)).toBe('station');

    director.startContract(centre);
    expect(director.currentObjective?.kind).toBe('elite_hunt');
    director.setEliteTarget(88);
    expect(director.completeEliteTarget(88)).toBe(true);
    director.activateBoss(100, 6100, 6100);
    expect(director.completeBoss(centre)).toBe('station');
    expect(director.startFinalBoss(centre)).toBe(true);
    director.activateBoss(100, 6100, 6100);
    expect(director.completeBoss(centre)).toBe('exfil');
    expect(director.currentPhase).toBe('exfil');
    expect(director.updateExfil(12_000, 2, 2)).toBe('success');
  });

  it('loses extraction when its timer expires', () => {
    const director = new CoopRunDirector(5);
    const centre = { x: 6000, y: 6000 };
    director.advanceInsertion(COOP_INSERTION_DURATION_MS, centre);
    director.addUplinkProgress(100);
    director.activateBoss(100, 6000, 6000);
    director.completeBoss(centre);
    director.startContract(centre);
    director.setEliteTarget(3);
    director.completeEliteTarget(3);
    director.activateBoss(100, 6000, 6000);
    director.completeBoss(centre);
    director.startFinalBoss(centre);
    director.activateBoss(100, 6000, 6000);
    director.completeBoss(centre);
    expect(director.updateExfil(90_000, 0, 2)).toBe('failed');
  });
});
